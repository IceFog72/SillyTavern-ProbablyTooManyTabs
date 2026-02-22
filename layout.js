import { el, getRefs } from './utils.js'; // getRefs imported from utils
import { createPane, findPreferredDescendentOrientation } from './pane.js';
import { attachColumnResizer, calculateElementMinWidth } from './resizer.js';
import { settings } from './settings.js';

// Export getRefs from here for backward compatibility if other files import it from layout.js,
// OR update all other files to import from utils.js. 
// For safety, we can re-export it:
export { getRefs } from './utils.js';

/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */
/** @typedef {import('./types.js').PaneNode} PaneNode */
/** @typedef {import('./types.js').SplitNode} SplitNode */


export function getBasis(col, useLastFlex = false) {
    if (!col || col.style.display === 'none') return 0;
    let flexString = col.style.flex;
    if (useLastFlex && col.dataset.isColumnCollapsed === 'true') {
        flexString = col.dataset.lastFlex || flexString;
    }
    if (!useLastFlex && col.dataset.isColumnCollapsed === 'true') return 0;
    const basisMatch = flexString.match(/(\d+(?:\.\d+)?)\s*%/);
    return basisMatch ? parseFloat(basisMatch[1]) : 0;
}

let lastParentWidth = 0;
export function normalizeFlexBasis(activeColumns, targetTotal = 100, actor = null) {
    const refs = getRefs();
    if (!refs || !refs.mainBody || activeColumns.length === 0) return;

    const parentRect = refs.mainBody.getBoundingClientRect();
    const parentWidth = parentRect.width;

    // Guard: ignore if container is hidden or too small to meaningfully calculate percentages
    // This often happens during sudden UI reflows or tab switches
    if (parentWidth < 100) return;

    const totalResizerWidth = Array.from(refs.mainBody.querySelectorAll('.ptmt-column-resizer')).reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
    const availableWidth = Math.max(1, parentWidth - totalResizerWidth);

    // Initial pass: fix any negative or starved values
    let currentTotal = 0;
    let anyChanges = false;
    const columnData = activeColumns.map(col => {
        const content = col.querySelector('.ptmt-pane, .ptmt-split');
        const minPx = content ? calculateElementMinWidth(content) : 250;
        // Clamp minPercent to a reasonable range [0.001, 80] to avoid taking whole screen or div by 0
        const minPercent = Math.min(80, (minPx / availableWidth) * 100);

        let basis = getBasis(col);
        // Added 0.1% tolerance to prevent subpixel jitter creep
        if (basis < minPercent - 0.1) {
            basis = minPercent;
            anyChanges = true;
        }
        currentTotal += basis;
        return { col, minPercent, basis };
    });

    let error = currentTotal - targetTotal;

    // Only apply logic if we had a forced bump or if the total error is significant
    // OR if the viewport actually changed.
    if (!anyChanges && Math.abs(error) <= 0.01 && parentWidth === lastParentWidth) return;
    lastParentWidth = parentWidth;

    // Iterative pass to reduce error while respecting minPercent
    if (Math.abs(error) > 0.0001) {
        if (error > 0) {
            const actorIndex = actor ? activeColumns.indexOf(actor) : -1;
            const donors = columnData.filter(d => d.col !== actor);

            if (actorIndex !== -1) {
                // Neighborhood first: Sort donors by distance from actor
                donors.sort((a, b) => {
                    const distA = Math.abs(activeColumns.indexOf(a.col) - actorIndex);
                    const distB = Math.abs(activeColumns.indexOf(b.col) - actorIndex);
                    return distA - distB;
                });
            }

            // Distribute debt to preferred donors first
            for (const d of donors) {
                const stealable = Math.max(0, d.basis - d.minPercent);
                if (stealable > 0) {
                    const taken = Math.min(error, stealable);
                    d.basis -= taken;
                    error -= taken;
                }
                if (error <= 0.0001) break;
            }

            // Final emergency fallback if neighbors were at min
            if (error > 0.001) {
                const totalBasis = columnData.reduce((sum, d) => sum + d.basis, 0);
                const factor = targetTotal / totalBasis;
                columnData.forEach(d => {
                    d.basis = Math.max(0.001, d.basis * factor);
                });
            }
        } else {
            // Error is negative: we have extra space. Add it to the largest column.
            const sorted = [...columnData].sort((a, b) => b.basis - a.basis);
            if (sorted[0]) sorted[0].basis -= error; // error is negative, so this adds
        }
    }

    // Only update lastFlex if it's a reasonably large size to avoid saving 'starved' states
    columnData.forEach(d => {
        d.col.style.flex = `1 1 ${d.basis.toFixed(4)}%`;
        if (d.col.dataset.isColumnCollapsed !== 'true' && d.basis > 5) {
            d.col.dataset.lastFlex = d.col.style.flex;
        }
    });
}

export function createLayoutIfMissing() {
    if (document.getElementById('ptmt-main')) return getRefs();

    const main = el('div', { id: 'ptmt-main' });
    const topBar = el('div', { id: 'ptmt-topBar' });

    const mainBody = el('div', { id: 'ptmt-mainBody', style: { display: 'flex', flex: '1 1 0', minHeight: '0', minWidth: '0', overflow: 'hidden', position: 'relative' } });
    const leftBody = el('div', { id: 'ptmt-leftBody', className: 'ptmt-body-column' });
    const centerBody = el('div', { id: 'ptmt-centerBody', className: 'ptmt-body-column' });
    const rightBody = el('div', { id: 'ptmt-rightBody', className: 'ptmt-body-column' });

    const resizerLeftCenter = el('splitter', { className: 'ptmt-resizer-vertical ptmt-column-resizer' });
    const resizerCenterRight = el('splitter', { className: 'ptmt-resizer-vertical ptmt-column-resizer' });

    mainBody.append(leftBody, resizerLeftCenter, centerBody, resizerCenterRight, rightBody);
    main.append(topBar, mainBody);

    leftBody.appendChild(createPane());
    centerBody.appendChild(createPane());
    rightBody.appendChild(createPane());

    attachColumnResizer(resizerLeftCenter);
    attachColumnResizer(resizerCenterRight);

    document.body.insertBefore(main, document.body.firstChild);

    mainBody.append(
        el('div', { className: 'ptmt-drop-indicator', id: 'ptmt-drop-indicator', style: { display: 'none' } }),
        el('div', { className: 'ptmt-split-overlay', id: 'ptmt-split-overlay', style: { display: 'none' } })
    );
    return getRefs();
}

export function applyColumnVisibility() {
    const refs = getRefs();
    const showLeft = settings.get('showLeftPane');
    const showRight = settings.get('showRightPane');

    const resizers = Array.from(refs.mainBody.querySelectorAll('.ptmt-column-resizer'));
    const resizerLeft = resizers[0];
    const resizerRight = resizers[1];

    if (refs.leftBody.style.display !== (showLeft ? 'flex' : 'none')) {
        refs.leftBody.style.display = showLeft ? 'flex' : 'none';
        if (resizerLeft) resizerLeft.style.display = showLeft ? 'flex' : 'none';
        if (showLeft && !refs.leftBody.querySelector('.ptmt-pane')) {
            refs.leftBody.appendChild(createPane());
        }
    }

    if (refs.rightBody.style.display !== (showRight ? 'flex' : 'none')) {
        refs.rightBody.style.display = showRight ? 'flex' : 'none';
        if (resizerRight) resizerRight.style.display = showRight ? 'flex' : 'none';
        if (showRight && !refs.rightBody.querySelector('.ptmt-pane')) {
            refs.rightBody.appendChild(createPane());
        }
    }

    recalculateColumnSizes();
}


function isColumnContentCollapsed(column) {
    if (!column || column.style.display === 'none') return true;
    const directChildren = Array.from(column.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
    if (directChildren.length === 0) return true;
    return directChildren.every(child =>
        child.classList.contains('view-collapsed') || child.classList.contains('ptmt-container-collapsed')
    );
}

export function recalculateColumnSizes() {
    const refs = getRefs();
    if (!refs || !refs.mainBody) return;

    const MIN_COLLAPSED_PIXELS = 36;
    const columns = [refs.leftBody, refs.centerBody, refs.rightBody];
    const visibleColumns = columns.filter(col => col && col.style.display !== 'none');
    if (visibleColumns.length === 0) return;

    let protectedColumn = null;
    let collapsedColumn = null;


    // Helper to calculate the required width of a collapsed column based on its split structure
    function calculateCollapsedColumnWidth(element) {
        // If it's a pane, it takes up MIN_COLLAPSED_PIXELS
        if (element.classList.contains('ptmt-pane')) {
            return MIN_COLLAPSED_PIXELS;
        }

        // If it's a split...
        if (element.classList.contains('ptmt-split')) {
            const children = Array.from(element.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
            if (children.length === 0) return MIN_COLLAPSED_PIXELS;

            // If forced horizontal (stacked), width is max of children (since they stack)
            const isHorizontal = element.classList.contains('horizontal');

            if (isHorizontal) {
                let maxWidth = 0;
                children.forEach(child => maxWidth = Math.max(maxWidth, calculateCollapsedColumnWidth(child)));
                return maxWidth;
            } else {
                // If vertical (side-by-side), width is sum of children + splitters
                let totalWidth = 0;
                children.forEach(child => totalWidth += calculateCollapsedColumnWidth(child));

                // Add splitters (approx 4px or 6px depending on CSS, using 4px to be safe/tight)
                // Actually resizer logic uses 6px usually? Let's check resizer.js or use a safe constant.
                // resizer.js uses 6px for non-disabled.
                // But for collapsed view, splitters might be hidden? 
                // If the split is vertical, splitters are visible.
                const splitters = Array.from(element.children).filter(c => c.tagName === 'SPLITTER');
                const splitterWidth = splitters.length * 4; // Approximate
                return totalWidth + splitterWidth;
            }
        }
        return MIN_COLLAPSED_PIXELS;
    }

    // Step 1: Update collapsed state for each column based on its content, and detect if a state change occurred.
    visibleColumns.forEach(col => {
        // The Center Body should NEVER collapse to a fixed width (e.g. 36px/76px).
        // It must always fill the remaining space to prevent panels from stacking on the left.
        if (col.id === 'ptmt-centerBody') return;

        const isContentFullyCollapsed = isColumnContentCollapsed(col);
        const wasColumnCollapsed = col.dataset.isColumnCollapsed === 'true';

        if (isContentFullyCollapsed && !wasColumnCollapsed) {
            const minWidth = calculateElementMinWidth(col.querySelector('.ptmt-pane, .ptmt-split'));
            const currentWidth = col.getBoundingClientRect().width;
            const currentFlex = col.style.flex;
            const basisMatch = currentFlex ? currentFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
            const basis = basisMatch ? parseFloat(basisMatch[1]) : 0;

            if (currentWidth < minWidth || basis >= 99.9) {
                const parentWidth = col.parentElement.getBoundingClientRect().width;
                const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                    .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
                const availableWidth = parentWidth - totalResizerWidth;
                if (availableWidth > 0) {
                    const minBasisPercent = (minWidth / availableWidth) * 100;
                    col.dataset.lastFlex = `1 1 ${minBasisPercent.toFixed(4)}%`;
                }
            } else {
                if (currentFlex && currentFlex.includes('%')) {
                    col.dataset.lastFlex = currentFlex;
                } else {
                    const parentWidth = col.parentElement.getBoundingClientRect().width;
                    const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                        .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
                    const availableWidth = parentWidth - totalResizerWidth;
                    if (availableWidth > 0 && currentWidth > 0) {
                        const basisPercent = (currentWidth / availableWidth) * 100;
                        col.dataset.lastFlex = `1 1 ${basisPercent.toFixed(4)}%`;
                    }
                }
            }

            col.dataset.isColumnCollapsed = 'true';
            const preferred = findPreferredDescendentOrientation(col);
            if (preferred === 'horizontal') {
                col.style.flex = col.dataset.lastFlex || '1 1 20%';
            } else {
                // Determine layout content to calculate proper width
                const content = col.querySelector('.ptmt-pane, .ptmt-split'); // helper to find root
                const width = content ? calculateCollapsedColumnWidth(content) : MIN_COLLAPSED_PIXELS;
                col.style.flex = `0 0 ${width}px`;
            }
            collapsedColumn = col; // This column just collapsed.
        } else if (!isContentFullyCollapsed && wasColumnCollapsed) {
            let lastFlex = col.dataset.lastFlex;
            const minWidth = calculateElementMinWidth(col.querySelector('.ptmt-pane, .ptmt-split'));
            const parentWidth = col.parentElement.getBoundingClientRect().width;
            const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
            const availableWidth = parentWidth - totalResizerWidth;

            if (availableWidth > 0) {
                const minBasisPercent = (minWidth / availableWidth) * 100;
                const lastBasisMatch = lastFlex ? lastFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
                const lastBasisPercent = lastBasisMatch ? parseFloat(lastBasisMatch[1]) : 0;

                // Fix: If lastFlex is unreasonably small (less than minBasisPercent or < 5%),
                // it was likely saved incorrectly during collapse - use a sensible default
                const MIN_REASONABLE_PERCENT = 15.0; // Minimum reasonable column width
                if (lastBasisPercent < Math.max(minBasisPercent, MIN_REASONABLE_PERCENT)) {
                    const siblings = visibleColumns.filter(c => c !== col);
                    const totalSiblingLastFlex = siblings.reduce((sum, s) => {
                        if (s.dataset.lastFlex) {
                            const match = s.dataset.lastFlex.match(/(\d+(?:\.\d+)?)\s*%/);
                            return sum + (match ? parseFloat(match[1]) : 0);
                        }
                        return sum;
                    }, 0);

                    if (totalSiblingLastFlex > 0 && totalSiblingLastFlex < 100) {
                        let targetBasis = 100.0 - totalSiblingLastFlex;
                        targetBasis = Math.max(targetBasis, minBasisPercent);
                        lastFlex = `1 1 ${targetBasis.toFixed(4)}%`;
                    } else {
                        // Fallback to equal distribution if no sibling data
                        lastFlex = `1 1 ${100 / visibleColumns.length}%`;
                    }
                }
            }

            col.removeAttribute('data-is-column-collapsed');
            col.style.flex = lastFlex || `1 1 ${100 / visibleColumns.length}%`;
            protectedColumn = col; // This column just re-opened.
        } else if (isContentFullyCollapsed && wasColumnCollapsed) {
            // If already collapsed, ensure the width is correct (in case orientation or content changed)
            const content = col.querySelector('.ptmt-pane, .ptmt-split');
            const width = content ? calculateCollapsedColumnWidth(content) : MIN_COLLAPSED_PIXELS;
            col.style.flex = `0 0 ${width}px`;
        }
    });

    const activeColumns = visibleColumns.filter(col => col.dataset.isColumnCollapsed !== 'true');
    if (activeColumns.length === 0) return;

    const actor = protectedColumn || collapsedColumn;
    normalizeFlexBasis(activeColumns, 100, actor);
}