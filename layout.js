import { el, getRefs } from './utils.js'; // getRefs imported from utils
import { createPane, findPreferredDescendentOrientation } from './pane.js';
import { attachColumnResizer, calculateElementMinWidth } from './resizer.js';
import { settings } from './settings.js';

// Export getRefs from here for backward compatibility if other files import it from layout.js,
// OR update all other files to import from utils.js. 
// For safety, we can re-export it:
export { getRefs } from './utils.js';

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

                if (Math.abs(lastBasisPercent - minBasisPercent) < 0.1) {
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

    const getBasis = (col, useLastFlex = false) => {
        if (!col || col.style.display === 'none') return 0;
        let flexString = col.style.flex;
        if (useLastFlex && col.dataset.isColumnCollapsed === 'true') {
            flexString = col.dataset.lastFlex || flexString;
        }
        if (!useLastFlex && col.dataset.isColumnCollapsed === 'true') return 0;
        const basisMatch = flexString.match(/(\d+(?:\.\d+)?)\s*%/);
        return basisMatch ? parseFloat(basisMatch[1]) : 0;
    };

    const { leftBody, centerBody, rightBody } = refs;

    // Logic to redistribute space now that we know if a column's state has changed.
    if (protectedColumn || collapsedColumn) {
        if (protectedColumn) { // A column was reopened
            const spaceToTake = getBasis(protectedColumn);
            let donors = [];

            if (protectedColumn === leftBody || protectedColumn === rightBody) {
                if (activeColumns.includes(centerBody)) {
                    donors.push(centerBody);
                } else {
                    const otherSide = (protectedColumn === leftBody) ? rightBody : leftBody;
                    if (activeColumns.includes(otherSide)) donors.push(otherSide);
                }
            } else if (protectedColumn === centerBody) {
                if (activeColumns.includes(leftBody)) donors.push(leftBody);
                if (activeColumns.includes(rightBody)) donors.push(rightBody);
            }

            if (donors.length === 0) {
                donors = activeColumns.filter(c => c !== protectedColumn);
            }

            if (donors.length > 0) {
                const totalDonorBasis = donors.reduce((sum, col) => sum + getBasis(col), 0);
                if (totalDonorBasis > 0) {
                    donors.forEach(col => {
                        const currentBasis = getBasis(col);
                        const reduction = spaceToTake * (currentBasis / totalDonorBasis);
                        col.style.flex = `1 1 ${(currentBasis - reduction).toFixed(4)}%`;
                    });
                }
            }
        } else if (collapsedColumn) { // A column was collapsed
            const spaceFreed = getBasis(collapsedColumn, true);

            let receivers = [];
            if (collapsedColumn === leftBody || collapsedColumn === rightBody) {
                if (activeColumns.includes(centerBody)) {
                    receivers.push(centerBody);
                } else {
                    const otherSide = (collapsedColumn === leftBody) ? rightBody : leftBody;
                    if (activeColumns.includes(otherSide)) receivers.push(otherSide);
                }
            } else if (collapsedColumn === centerBody) {
                if (activeColumns.includes(leftBody)) receivers.push(leftBody);
                if (activeColumns.includes(rightBody)) receivers.push(rightBody);
            }

            if (receivers.length === 0) {
                receivers = activeColumns;
            }

            if (receivers.length > 0) {
                const totalReceiverBasis = receivers.reduce((sum, col) => sum + getBasis(col), 0);
                if (totalReceiverBasis > 0) {
                    receivers.forEach(col => {
                        const currentBasis = getBasis(col);
                        const share = spaceFreed * (currentBasis / totalReceiverBasis);
                        col.style.flex = `1 1 ${(currentBasis + share).toFixed(4)}%`;
                    });
                } else {
                    const equalShare = spaceFreed / receivers.length;
                    receivers.forEach(col => {
                        const currentBasis = getBasis(col); // is 0
                        col.style.flex = `1 1 ${(currentBasis + equalShare).toFixed(4)}%`;
                    });
                }
            }
        }
    }

    // General normalization pass to correct any floating point errors
    const finalTotalBasis = activeColumns.reduce((sum, col) => sum + getBasis(col), 0);
    const finalError = finalTotalBasis - 100.0;

    if (Math.abs(finalError) > 0.01) {
        const colToAdjust = activeColumns.includes(centerBody) ? centerBody : activeColumns[activeColumns.length - 1];
        if (colToAdjust) {
            const basis = getBasis(colToAdjust);
            colToAdjust.style.flex = `1 1 ${(basis - finalError).toFixed(4)}%`;
        }
    }
}