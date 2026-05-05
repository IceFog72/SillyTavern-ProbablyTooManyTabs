import { el, getRefs, calculateElementMinWidth, readPaneViewSettings } from './utils.js';
import { createPane, findPreferredDescendentOrientation } from './pane.js';
import { attachColumnResizer } from './resizer.js';
import { settings } from './settings.js';
import { SELECTORS, EVENTS, LAYOUT } from './constants.js';
import { parseFlexBasis, getBasis, normalizeFlexBasis } from './layout-math.js';

/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */
/** @typedef {import('./types.js').PaneNode} PaneNode */
/** @typedef {import('./types.js').SplitNode} SplitNode */


export function createLayoutIfMissing() {
    if (document.getElementById('ptmt-main')) return getRefs();

    const main = el('div', { id: 'ptmt-main' });
    const topBar = el('div', { id: 'ptmt-topBar' });

    const mainBody = el('div', { id: 'ptmt-mainBody', style: { display: 'flex', flex: '1 1 0', minHeight: '0', minWidth: '0', overflow: 'hidden', position: 'relative' } });
    const leftBody = el('div', { id: 'ptmt-leftBody', className: 'ptmt-body-column' });
    const centerBody = el('div', { id: 'ptmt-centerBody', className: 'ptmt-body-column' });
    const rightBody = el('div', { id: 'ptmt-rightBody', className: 'ptmt-body-column' });

    const resizerLeftCenter = el('splitter', { className: `${SELECTORS.RESIZER_V.substring(1)} ${SELECTORS.COLUMN_RESIZER.substring(1)}` });
    const resizerCenterRight = el('splitter', { className: `${SELECTORS.RESIZER_V.substring(1)} ${SELECTORS.COLUMN_RESIZER.substring(1)}` });

    mainBody.append(leftBody, resizerLeftCenter, centerBody, resizerCenterRight, rightBody);
    main.append(topBar, mainBody);


    leftBody.appendChild(createPane());
    centerBody.appendChild(createPane());
    rightBody.appendChild(createPane());

    attachColumnResizer(resizerLeftCenter);
    attachColumnResizer(resizerCenterRight);

    document.body.insertBefore(main, document.body.firstChild);

    mainBody.append(
        el('div', { className: SELECTORS.DROP_INDICATOR.substring(1), id: SELECTORS.DROP_INDICATOR.substring(1), style: { display: 'none' } }),
        el('div', { className: SELECTORS.SPLIT_OVERLAY.substring(1), id: SELECTORS.SPLIT_OVERLAY.substring(1), style: { display: 'none' } })
    );

    return getRefs();
}

export function applyColumnVisibility() {
    const refs = getRefs();
    const showLeft = settings.get('showLeftPane');
    const showRight = settings.get('showRightPane');

    const resizers = Array.from(refs.mainBody.querySelectorAll(SELECTORS.COLUMN_RESIZER));

    const resizerLeft = resizers[0];
    const resizerRight = resizers[1];

    if (refs.leftBody.style.display !== (showLeft ? 'flex' : 'none')) {
        refs.leftBody.style.display = showLeft ? 'flex' : 'none';
        if (resizerLeft) resizerLeft.style.display = showLeft ? 'flex' : 'none';
        if (showLeft && !refs.leftBody.querySelector(SELECTORS.PANE)) {
            refs.leftBody.appendChild(createPane());
        }

    }

    if (refs.rightBody.style.display !== (showRight ? 'flex' : 'none')) {
        refs.rightBody.style.display = showRight ? 'flex' : 'none';
        if (resizerRight) resizerRight.style.display = showRight ? 'flex' : 'none';
        if (showRight && !refs.rightBody.querySelector(SELECTORS.PANE)) {
            refs.rightBody.appendChild(createPane());
        }

    }

    recalculateColumnSizes();
}


function isColumnContentCollapsed(column) {
    if (!column || column.style.display === 'none') return true;
    const directChildren = Array.from(column.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
    if (directChildren.length === 0) return true;
    return directChildren.every(child =>
        child.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || child.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1))
    );

}

export function recalculateColumnSizes() {
    const refs = getRefs();
    if (!refs || !refs.mainBody) return;

    const columns = [refs.leftBody, refs.centerBody, refs.rightBody];
    const visibleColumns = columns.filter(col => col && col.style.display !== 'none');
    if (visibleColumns.length === 0) return;

    let protectedColumn = null;
    let collapsedColumn = null;


    // Check if a pane is in shy mode (tab strip hidden behind indicator even when collapsed)
    function isPaneShyCollapsed(pane) {
        const vs = readPaneViewSettings(pane);
        const paneMode = vs.tabStripMode || 'normal';
        const globalMode = settings.get('tabStripMode') || 'normal';
        // Legacy fallback
        const effectiveGlobal = (globalMode !== 'normal') ? globalMode : (settings.get('tabStripAutoHide') ? 'auto-hide' : 'normal');
        const mode = (paneMode !== 'normal') ? paneMode : effectiveGlobal;
        return mode === 'shy';
    }

    // Helper to calculate the required width of a collapsed column based on its split structure
    function calculateCollapsedColumnWidth(element) {
        // If it's a pane, check if shy mode → use indicator width
        if (element.classList.contains(SELECTORS.PANE.substring(1))) {
            if (isPaneShyCollapsed(element)) {
                return LAYOUT.SHY_INDICATOR_WIDTH;
            }
            return LAYOUT.MIN_COLLAPSED_PIXELS();
        }

        // If it's a split...
        if (element.classList.contains(SELECTORS.SPLIT.substring(1))) {
            const children = Array.from(element.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
            if (children.length === 0) return LAYOUT.MIN_COLLAPSED_PIXELS();


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

                // Add splitters — CSS defines 6px per splitter (.ptmt-resizer-vertical { flex: 0 0 6px })
                const activeSplitters = Array.from(element.children).filter(c => c.tagName === 'SPLITTER' && !c.classList.contains('disabled'));
                const splitterWidth = activeSplitters.length * LAYOUT.RESIZER_WIDTH;
                return totalWidth + splitterWidth;
            }
        }
        return LAYOUT.MIN_COLLAPSED_PIXELS();
    }

    // Returns { panes, splitterPx } — the pane count and fixed splitter pixels for the
    // expanded shy hover width. CSS multiplies panes * --ptmt-collapsed-width + splitterPx,
    // keeping it theme-responsive regardless of when this is called.
    function calculateExpandedPaneInfo(element) {
        if (element.classList.contains(SELECTORS.PANE.substring(1))) {
            return { panes: 1, splitterPx: 0 };
        }
        if (element.classList.contains(SELECTORS.SPLIT.substring(1))) {
            const children = Array.from(element.children).filter(c =>
                c.classList.contains(SELECTORS.PANE.substring(1)) ||
                c.classList.contains(SELECTORS.SPLIT.substring(1))
            );
            if (children.length === 0) return { panes: 1, splitterPx: 0 };
            const isHorizontal = element.classList.contains('horizontal');
            if (isHorizontal) {
                // Stacked: width is max of children
                let maxPanes = 0, maxSplitter = 0;
                children.forEach(child => {
                    const info = calculateExpandedPaneInfo(child);
                    if (info.panes > maxPanes) { maxPanes = info.panes; maxSplitter = info.splitterPx; }
                });
                return { panes: maxPanes, splitterPx: maxSplitter };
            } else {
                // Side-by-side: sum panes + splitters
                let totalPanes = 0, totalSplitterPx = 0;
                children.forEach(child => {
                    const info = calculateExpandedPaneInfo(child);
                    totalPanes += info.panes;
                    totalSplitterPx += info.splitterPx;
                });
                const activeSplitters = Array.from(element.children).filter(c => c.tagName === 'SPLITTER' && !c.classList.contains('disabled'));
                totalSplitterPx += activeSplitters.length * LAYOUT.RESIZER_WIDTH;
                return { panes: totalPanes, splitterPx: totalSplitterPx };
            }
        }
        return { panes: 1, splitterPx: 0 };
    }

    // Step 1: Update collapsed state for each column based on its content, and detect if a state change occurred.
    visibleColumns.forEach(col => {
        // The Center Body should NEVER collapse to a fixed width (e.g. 36px/76px).
        // It must always fill the remaining space to prevent panels from stacking on the left.
        if (col.id === 'ptmt-centerBody') return;

        const isContentFullyCollapsed = isColumnContentCollapsed(col);
        const wasColumnCollapsed = col.dataset.isColumnCollapsed === 'true';

        if (isContentFullyCollapsed && !wasColumnCollapsed) {
            const minWidth = calculateElementMinWidth(col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
            const currentWidth = col.getBoundingClientRect().width;

            const currentFlex = col.style.flex;
            const basis = parseFlexBasis(currentFlex) ?? 0;

            // Only update lastFlex if it's not already a meaningful expanded value.
            // Don't overwrite a good lastFlex with a tiny/transitional flex value.
            const existingLastFlex = col.dataset.lastFlex;
            const existingBasis = parseFlexBasis(existingLastFlex) ?? 0;
            // Only recalculate lastFlex if the existing one is missing or tiny (<= 5%)
            if (existingBasis <= 5) {
                const parentWidth = col.parentElement.getBoundingClientRect().width;
                const columnResizers = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'));
                const totalResizerWidth = columnResizers.reduce((sum, r) => sum + (r.classList.contains('disabled') ? 0 : LAYOUT.RESIZER_WIDTH), 0);
                const availableWidth = parentWidth - totalResizerWidth;

                if (currentWidth < minWidth || basis >= 99.9) {
                    if (availableWidth > 0) {
                        const minBasisPercent = (minWidth / availableWidth) * 100;
                        col.dataset.lastFlex = `1 1 ${minBasisPercent.toFixed(4)}%`;
                    }
                } else {
                    if (currentFlex && currentFlex.includes('%') && basis > 5) {
                        col.dataset.lastFlex = currentFlex;
                    } else {
                        if (availableWidth > 0 && currentWidth > 5) {
                            const basisPercent = (currentWidth / availableWidth) * 100;
                            col.dataset.lastFlex = `1 1 ${basisPercent.toFixed(4)}%`;
                        }
                    }
                }
            }

            col.dataset.isColumnCollapsed = 'true';
            const preferred = findPreferredDescendentOrientation(col);
            if (preferred === 'horizontal') {
                col.style.flex = col.dataset.lastFlex || '1 1 20%';
            } else {
                // Determine layout content to calculate proper width
                const content = col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`); // helper to find root
                const width = content ? calculateCollapsedColumnWidth(content) : LAYOUT.MIN_COLLAPSED_PIXELS();
                col.style.flex = `0 0 ${width}px`;

                // Set theme-responsive hover-expand info:
                // --ptmt-shy-hover-panes × --ptmt-collapsed-width + --ptmt-shy-hover-splitters
                // CSS computes the actual px so it's always correct for any theme.
                const expandInfo = content ? calculateExpandedPaneInfo(content) : { panes: 1, splitterPx: 0 };
                col.style.setProperty('--ptmt-shy-hover-panes', expandInfo.panes);
                col.style.setProperty('--ptmt-shy-hover-splitters', `${expandInfo.splitterPx}px`);
            }

            collapsedColumn = col; // This column just collapsed.
        } else if (!isContentFullyCollapsed && wasColumnCollapsed) {
            let lastFlex = col.dataset.lastFlex;
            const minWidth = calculateElementMinWidth(col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
            const parentWidth = col.parentElement.getBoundingClientRect().width;
            const columnResizers = Array.from(col.parentElement.querySelectorAll(SELECTORS.COLUMN_RESIZER));
            const totalResizerWidth = columnResizers.reduce((sum, r) => sum + (r.classList.contains('disabled') ? 0 : LAYOUT.RESIZER_WIDTH), 0);
            const availableWidth = parentWidth - totalResizerWidth;


            // Only recalculate if lastFlex is completely missing or unparseable
            if (!lastFlex || !lastFlex.includes('%')) {
                if (availableWidth > 0) {
                    const minBasisPercent = (minWidth / availableWidth) * 100;
                    const siblings = visibleColumns.filter(c => c !== col);
                    const totalSiblingLastFlex = siblings.reduce((sum, s) => {
                        const flexString = s.dataset.lastFlex || s.style.flex;
                        return sum + (parseFlexBasis(flexString) ?? 0);
                    }, 0);

                    if (totalSiblingLastFlex > 0 && totalSiblingLastFlex < 100) {
                        let targetBasis = 100.0 - totalSiblingLastFlex;
                        targetBasis = Math.max(targetBasis, minBasisPercent);
                        lastFlex = `1 1 ${targetBasis.toFixed(4)}%`;
                    } else {
                        lastFlex = `1 1 ${100 / visibleColumns.length}%`;
                    }
                }
            }

            col.removeAttribute('data-is-column-collapsed');
            col.style.flex = lastFlex || `1 1 ${100 / visibleColumns.length}%`;
            protectedColumn = col; // This column just re-opened.
        } else if (isContentFullyCollapsed && wasColumnCollapsed) {
            // If already collapsed, ensure the width is correct (in case orientation or content changed)
            const content = col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`);
            const width = content ? calculateCollapsedColumnWidth(content) : LAYOUT.MIN_COLLAPSED_PIXELS();
            col.style.flex = `0 0 ${width}px`;
        }

    });

    const activeColumns = visibleColumns.filter(col => col.dataset.isColumnCollapsed !== 'true');
    if (activeColumns.length === 0) return;

    const actor = protectedColumn || collapsedColumn;
    normalizeFlexBasis(activeColumns, 100, actor);
}