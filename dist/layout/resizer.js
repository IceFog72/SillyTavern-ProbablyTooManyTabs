// resizer.ts
import { $$, throttle, debounce, getRefs, invalidateMinWidthCache, calculateElementMinWidth, readPaneViewSettings, trackObserver } from '../core/utils.js';
import { normalizeFlexBasis, setFlexBasisPercent, pxToPercent, applyIntelligentExpansion, recalculateAllSplitsRecursively, recalculateMultipleSubtreesOptimized } from './layout-math.js';
import { setPaneCollapsedView, applyPaneOrientation } from './pane.js';
import { recalculateColumnSizes } from './layout.js';
import { SELECTORS, EVENTS, LAYOUT } from '../core/constants.js';
import { settings } from '../core/settings.js';
export function invalidatePaneTabSizeCache(pane) {
    if (pane && pane.dataset) {
        delete pane.dataset.cachedTabSize;
    }
}
export const resizerControllers = new WeakMap();
export function checkPaneForIconMode(pane) {
    if (!pane || !pane.classList)
        return;
    const showIconsOnly = settings.get('showIconsOnly');
    pane.classList.toggle('ptmt-pane-icons-only', !!showIconsOnly);
}
const throttledCheckPaneForIconMode = throttle(checkPaneForIconMode, 80);
function createResizer(resizer, orientation, config) {
    const isVertical = orientation === 'vertical' || orientation === 'v';
    const sizeProp = isVertical ? 'width' : 'height';
    const clientProp = isVertical ? 'clientX' : 'clientY';
    resizer.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    let pointerId = null;
    let startClient = 0;
    let dragState = null;
    let rafId = null;
    let pendingDelta = null;
    function flushDragMove() {
        rafId = null;
        if (pendingDelta === null || !dragState)
            return;
        const delta = pendingDelta;
        pendingDelta = null;
        config.onDragMove(delta, dragState);
    }
    function onPointerDown(e) {
        // Validate resizer element exists and is valid
        if (!resizer || !resizer.classList) {
            console.warn('[PTMT] Invalid resizer element in onPointerDown');
            return;
        }
        if ((e.button && e.button !== 0) || resizer.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        dragState = config.onDragStart(resizer, { sizeProp, clientProp });
        if (!dragState)
            return;
        e.preventDefault();
        pointerId = e.pointerId;
        try {
            resizer.setPointerCapture(pointerId);
        }
        catch (err) {
            console.warn('[PTMT] Failed to set pointer capture:', err);
        }
        startClient = e[clientProp];
        document.body.classList.add('ptmt-resizer-dragging');
        if (settings.get('hideContentWhileResizing')) {
            document.body.classList.add('ptmt-is-resizing');
        }
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }
    function onPointerMove(e) {
        if (pointerId === null || e.pointerId !== pointerId || !dragState)
            return;
        pendingDelta = e[clientProp] - startClient;
        if (rafId === null) {
            rafId = requestAnimationFrame(flushDragMove);
        }
    }
    function onPointerUp(e) {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (pendingDelta !== null && dragState) {
            const finalDelta = pendingDelta;
            pendingDelta = null;
            config.onDragMove(finalDelta, dragState);
        }
        if (pointerId !== null && e.pointerId === pointerId) {
            try {
                resizer.releasePointerCapture(pointerId);
            }
            catch (err) {
                console.warn('[PTMT] Failed to release pointer capture:', err);
            }
        }
        pointerId = null;
        document.body.style.userSelect = '';
        document.body.classList.remove('ptmt-resizer-dragging');
        if (settings.get('hideContentWhileResizing')) {
            document.body.classList.remove('ptmt-is-resizing');
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        if (dragState && config.onDragEnd) {
            config.onDragEnd(dragState);
        }
        dragState = null;
        try {
            window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'resizeEnd' } }));
        }
        catch (err) {
            console.warn('[PTMT] Failed to dispatch LAYOUT_CHANGED event on resize end:', err);
        }
    }
    resizer.addEventListener('pointerdown', onPointerDown);
    return {
        detach() {
            if (pointerId !== null)
                onPointerUp({ pointerId });
            resizer.removeEventListener('pointerdown', onPointerDown);
        },
    };
}
export function detachResizer(resizer) {
    resizerControllers.get(resizer)?.detach();
    resizerControllers.delete(resizer);
}
export function attachResizer(resizer, orientation = 'vertical') {
    const paneResizeStrategy = {
        onDragStart: (resizerEl, { sizeProp }) => {
            const aElem = resizerEl.previousElementSibling;
            const bElem = resizerEl.nextElementSibling;
            if (!aElem || !bElem || !resizerEl.parentElement)
                return null;
            if (aElem.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || aElem.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1)) || bElem.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || bElem.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1)))
                return null;
            const minSizeA = calculateElementMinWidth(aElem);
            const minSizeB = calculateElementMinWidth(bElem);
            const flexSiblings = Array.from(resizerEl.parentElement.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
            const initialSizes = flexSiblings.map(sibling => sibling.getBoundingClientRect()[sizeProp]);
            const aElemIndex = flexSiblings.indexOf(aElem);
            const bElemIndex = flexSiblings.indexOf(bElem);
            const parentRectAtStart = resizerEl.parentElement.getBoundingClientRect();
            // Cache total resizer size once at drag start — resizer sizes are CSS-constants (6px)
            const totalResizerSize = Array.from(resizerEl.parentElement.children)
                .filter(c => !c.classList.contains(SELECTORS.PANE.substring(1)) && !c.classList.contains(SELECTORS.SPLIT.substring(1)))
                .reduce((sum, r) => sum + r.getBoundingClientRect()[sizeProp], 0);
            const getChildInfo = (elem) => {
                if (!elem.classList.contains(SELECTORS.SPLIT.substring(1)))
                    return { element: null, sizes: null, smallestIndex: -1 };
                const dragIsVertical = sizeProp === 'width';
                const splitIsVertical = !elem.classList.contains('horizontal');
                if (dragIsVertical !== splitIsVertical) {
                    return { element: null, sizes: null, smallestIndex: -1 };
                }
                const children = Array.from(elem.children).filter(c => (c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)))
                    && !c.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1))
                    && !c.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1)));
                if (children.length <= 1)
                    return { element: null, sizes: null, smallestIndex: -1 };
                const sizes = children.map(c => c.getBoundingClientRect()[sizeProp]);
                let smallestIndex = -1, minSize = Infinity;
                sizes.forEach((size, index) => {
                    if (size < minSize) {
                        minSize = size;
                        smallestIndex = index;
                    }
                });
                return { element: elem, sizes, smallestIndex };
            };
            return { flexSiblings, initialSizes, aElemIndex, bElemIndex, minSizeA, minSizeB, parentRectAtStart, totalResizerSize, sizeProp, aChildInfo: getChildInfo(aElem), bChildInfo: getChildInfo(bElem) };
        },
        onDragMove: (delta, state) => {
            // Validate state has all required properties before accessing
            if (!state || !state.flexSiblings || !state.initialSizes ||
                state.aElemIndex < 0 || state.bElemIndex < 0 ||
                state.aElemIndex >= state.flexSiblings.length ||
                state.bElemIndex >= state.flexSiblings.length) {
                console.warn('[PTMT] Invalid drag state in pane resize');
                return;
            }
            const initialSizeA = state.initialSizes[state.aElemIndex] || 0;
            const initialSizeB = state.initialSizes[state.bElemIndex] || 0;
            const minSizeA = Math.min(state.minSizeA || 0, initialSizeA);
            const minSizeB = Math.min(state.minSizeB || 0, initialSizeB);
            let clampedDelta = Math.max(delta, minSizeA - initialSizeA);
            clampedDelta = Math.min(clampedDelta, initialSizeB - minSizeB);
            const aElem = state.flexSiblings[state.aElemIndex];
            const bElem = state.flexSiblings[state.bElemIndex];
            const newSizeA = initialSizeA + clampedDelta;
            const newSizeB = initialSizeB - clampedDelta;
            const totalAvailable = state.parentRectAtStart[state.sizeProp] - (state.totalResizerSize || 0);
            if (totalAvailable <= 0)
                return;
            setFlexBasisPercent(aElem, pxToPercent(newSizeA, totalAvailable));
            setFlexBasisPercent(bElem, pxToPercent(newSizeB, totalAvailable));
            if (clampedDelta > 0) { // aElem is expanding, bElem is shrinking
                if (state.aChildInfo.element)
                    applyIntelligentExpansion(aElem, newSizeA, state.aChildInfo);
                if (bElem.querySelector(SELECTORS.SPLIT))
                    recalculateAllSplitsRecursively(bElem);
            }
            else if (clampedDelta < 0) { // bElem is expanding, aElem is shrinking
                if (aElem.querySelector(SELECTORS.SPLIT))
                    recalculateAllSplitsRecursively(aElem);
                if (state.bChildInfo.element)
                    applyIntelligentExpansion(bElem, newSizeB, state.bChildInfo);
            }
            else { // No change, batch recalculate both with shared cache for perf
                if (aElem.querySelector(SELECTORS.SPLIT) || bElem.querySelector(SELECTORS.SPLIT)) {
                    recalculateMultipleSubtreesOptimized([aElem, bElem]);
                }
            }
            aElem.querySelectorAll(SELECTORS.PANE).forEach(throttledCheckPaneForIconMode);
            bElem.querySelectorAll(SELECTORS.PANE).forEach(throttledCheckPaneForIconMode);
        },
        onDragEnd: (state) => {
            const aElem = state.flexSiblings[state.aElemIndex];
            const bElem = state.flexSiblings[state.bElemIndex];
            if (aElem)
                aElem.dataset.lastFlex = aElem.style.flex;
            if (bElem)
                bElem.dataset.lastFlex = bElem.style.flex;
        },
    };
    // Validate resizer is a valid object before using with WeakMap
    if (!resizer || typeof resizer !== 'object') {
        console.warn('[PTMT] Cannot attach resizer: invalid element');
        return;
    }
    resizerControllers.get(resizer)?.detach();
    resizerControllers.set(resizer, createResizer(resizer, orientation, paneResizeStrategy));
}
export function attachColumnResizer(resizer) {
    const columnResizeStrategy = {
        onDragStart: (resizerEl, { sizeProp }) => {
            const aElem = resizerEl.previousElementSibling;
            const bElem = resizerEl.nextElementSibling;
            if (!aElem || !bElem || !aElem.classList.contains(SELECTORS.COLUMN.substring(1)) || !bElem.classList.contains(SELECTORS.COLUMN.substring(1)))
                return null;
            const refs = getRefs();
            if (!refs.mainBody || !refs.leftBody || !refs.centerBody || !refs.rightBody)
                return null;
            const parentRectAtStart = refs.mainBody.getBoundingClientRect();
            const minWidthA = calculateElementMinWidth(aElem.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
            const minWidthB = calculateElementMinWidth(bElem.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
            const initialSizes = {
                left: refs.leftBody.style.display === 'none' ? 0 : refs.leftBody.getBoundingClientRect()[sizeProp],
                center: refs.centerBody.style.display === 'none' ? 0 : refs.centerBody.getBoundingClientRect()[sizeProp],
                right: refs.rightBody.style.display === 'none' ? 0 : refs.rightBody.getBoundingClientRect()[sizeProp],
            };
            const collapsedCols = {
                left: refs.leftBody.style.display !== 'none' && refs.leftBody.dataset.isColumnCollapsed === 'true',
                center: false,
                right: refs.rightBody.style.display !== 'none' && refs.rightBody.dataset.isColumnCollapsed === 'true',
            };
            const collapsedWidthTotal = (collapsedCols.left ? initialSizes.left : 0) +
                (collapsedCols.right ? initialSizes.right : 0);
            const getChildInfo = (elem) => {
                const content = elem.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`);
                if (!content || !content.classList.contains(SELECTORS.SPLIT.substring(1)))
                    return { element: null, sizes: null, smallestIndex: -1 };
                const dragIsVertical = sizeProp === 'width';
                const splitIsVertical = !content.classList.contains('horizontal');
                if (dragIsVertical !== splitIsVertical)
                    return { element: null, sizes: null, smallestIndex: -1 };
                const grandchildren = Array.from(content.children).filter(c => (c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)))
                    && !c.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1))
                    && !c.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1)));
                if (grandchildren.length <= 1)
                    return { element: null, sizes: null, smallestIndex: -1 };
                const sizes = grandchildren.map(c => c.getBoundingClientRect()[sizeProp]);
                let smallestIndex = -1, minSize = Infinity;
                sizes.forEach((size, index) => {
                    if (size < minSize) {
                        minSize = size;
                        smallestIndex = index;
                    }
                });
                return { element: content, sizes, smallestIndex };
            };
            const aKey = aElem.id.replace('ptmt-', '').replace('Body', '');
            const bKey = bElem.id.replace('ptmt-', '').replace('Body', '');
            // Cache total column resizer size once at drag start
            const totalResizerSize = $$(SELECTORS.COLUMN_RESIZER, refs.mainBody)
                .reduce((sum, r) => sum + (r.style.display === 'none' || r.classList.contains('disabled') ? 0 : r.getBoundingClientRect()[sizeProp]), 0);
            return { refs, initialSizes, collapsedCols, minWidthA, minWidthB, aKey, bKey, parentRectAtStart, totalResizerSize, collapsedWidthTotal, sizeProp, aChildInfo: getChildInfo(aElem), bChildInfo: getChildInfo(bElem) };
        },
        onDragMove: (delta, state) => {
            // Validate state has all required properties
            if (!state || !state.initialSizes || !state.aKey || !state.bKey ||
                !(state.aKey in state.initialSizes) || !(state.bKey in state.initialSizes)) {
                console.warn('[PTMT] Invalid drag state in column resize');
                return;
            }
            const initialSizeA = state.initialSizes[state.aKey] || 0;
            const initialSizeB = state.initialSizes[state.bKey] || 0;
            const minWidthA = Math.min(state.minWidthA || 0, initialSizeA);
            const minWidthB = Math.min(state.minWidthB || 0, initialSizeB);
            let clampedDelta = Math.max(delta, minWidthA - initialSizeA);
            clampedDelta = Math.min(clampedDelta, initialSizeB - minWidthB);
            const newSizes = { ...state.initialSizes };
            newSizes[state.aKey] += clampedDelta;
            newSizes[state.bKey] -= clampedDelta;
            const activeAvailable = state.parentRectAtStart[state.sizeProp] - (state.totalResizerSize || 0) - (state.collapsedWidthTotal || 0);
            if (activeAvailable <= 0)
                return;
            const { leftBody, centerBody, rightBody } = state.refs;
            if (leftBody && leftBody.style.display !== 'none' && !state.collapsedCols.left) {
                setFlexBasisPercent(leftBody, pxToPercent(newSizes.left, activeAvailable));
            }
            if (centerBody && centerBody.style.display !== 'none') {
                setFlexBasisPercent(centerBody, pxToPercent(newSizes.center, activeAvailable));
            }
            if (rightBody && rightBody.style.display !== 'none' && !state.collapsedCols.right) {
                setFlexBasisPercent(rightBody, pxToPercent(newSizes.right, activeAvailable));
            }
            const aElem = state.refs[`${state.aKey}Body`];
            const bElem = state.refs[`${state.bKey}Body`];
            if (clampedDelta > 0) { // aElem column is expanding, bElem is shrinking
                if (state.aChildInfo.element)
                    applyIntelligentExpansion(aElem, newSizes[state.aKey], state.aChildInfo);
                if (bElem?.querySelector(SELECTORS.SPLIT))
                    recalculateAllSplitsRecursively(bElem);
            }
            else if (clampedDelta < 0) { // bElem column is expanding, aElem is shrinking
                if (aElem?.querySelector(SELECTORS.SPLIT))
                    recalculateAllSplitsRecursively(aElem);
                if (state.bChildInfo.element)
                    applyIntelligentExpansion(bElem, newSizes[state.bKey], state.bChildInfo);
            }
            else {
                if (aElem?.querySelector(SELECTORS.SPLIT) || bElem?.querySelector(SELECTORS.SPLIT)) {
                    recalculateMultipleSubtreesOptimized([aElem, bElem]);
                }
            }
            aElem?.querySelectorAll(SELECTORS.PANE).forEach(throttledCheckPaneForIconMode);
            bElem?.querySelectorAll(SELECTORS.PANE).forEach(throttledCheckPaneForIconMode);
        },
        onDragEnd: (state) => {
            // Update lastFlex so it persists through reloads/collapses
            const { leftBody, centerBody, rightBody } = state.refs;
            [leftBody, centerBody, rightBody].forEach(col => {
                if (col && col.style.display !== 'none' && col.style.flex) {
                    if (col.dataset.isColumnCollapsed === 'true')
                        return; // Do not overwrite healthy memory with tiny collapsed flex
                    col.dataset.lastFlex = col.style.flex;
                }
            });
        },
    };
    // Validate resizer is a valid object before using with WeakMap
    if (!resizer || typeof resizer !== 'object') {
        console.warn('[PTMT] Cannot attach column resizer: invalid element');
        return;
    }
    resizerControllers.get(resizer)?.detach();
    const controller = createResizer(resizer, 'vertical', columnResizeStrategy);
    resizerControllers.set(resizer, controller);
}
export function setSplitOrientation(splitElement, newOrientation) {
    if (!splitElement)
        return;
    const isHorizontal = newOrientation === 'horizontal';
    if (splitElement.classList.contains('horizontal') === isHorizontal)
        return;
    splitElement.classList.toggle('horizontal', isHorizontal);
    // Only this split's own splitters; nested splits keep their orientation.
    const resizerSelector = `${SELECTORS.RESIZER_V}, ${SELECTORS.RESIZER_H}`;
    for (const resizer of Array.from(splitElement.children).filter(child => child.matches(resizerSelector))) {
        detachResizer(resizer);
        const disabled = resizer.classList.contains('disabled');
        resizer.className = `ptmt-resizer-${newOrientation}`;
        resizer.classList.toggle('disabled', disabled);
        attachResizer(resizer, newOrientation);
    }
    // After forcing orientation, children panes might need to flip their tabstrips
    const childPanes = splitElement.querySelectorAll(SELECTORS.PANE);
    childPanes.forEach(p => applyPaneOrientation(p));
}
export function updateResizerDisabledStates() {
    try {
        document.querySelectorAll(`${SELECTORS.RESIZER_V}, ${SELECTORS.RESIZER_H}`).forEach(r => {
            const a = r.previousElementSibling;
            const b = r.nextElementSibling;
            if (!a || !b) {
                r.classList.toggle('disabled', true);
                return;
            }
            let isACollapsed, isBCollapsed;
            // Check if it's a column resizer by looking at its siblings.
            if (a.classList.contains(SELECTORS.COLUMN.substring(1)) && b.classList.contains(SELECTORS.COLUMN.substring(1))) {
                isACollapsed = a.dataset.isColumnCollapsed === 'true';
                isBCollapsed = b.dataset.isColumnCollapsed === 'true';
            }
            else { // Otherwise, it's a resizer between panes or splits.
                isACollapsed = a.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || a.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1));
                isBCollapsed = b.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || b.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1));
            }
            const disabled = !!isACollapsed || !!isBCollapsed;
            const wasDisabled = r.classList.contains('disabled');
            r.classList.toggle('disabled', disabled);
            if (wasDisabled !== disabled) {
                invalidateMinWidthCache(r.parentElement);
            }
        });
    }
    catch (e) {
        console.warn('[PTMT] Error updating resizer states:', e);
    }
}
export function validateAndCorrectAllMinSizes(isResize = false) {
    let needsRecalculation = false;
    const allPanes = Array.from(document.querySelectorAll(`${SELECTORS.PANE}:not(${SELECTORS.VIEW_COLLAPSED})`));
    const refs = getRefs();
    if (refs && refs.mainBody) {
        const columns = [refs.leftBody, refs.centerBody, refs.rightBody].filter((c) => Boolean(c && c.style.display !== 'none' && c.dataset.isColumnCollapsed !== 'true'));
        // NEW: Auto-collapse columns if they are smaller than their minimum width during a resize
        if (isResize && columns.length > 1) {
            // Check columns from right to left (excluding center)
            const sideColumns = [];
            if (refs.rightBody && refs.rightBody.style.display !== 'none' && refs.rightBody.dataset.isColumnCollapsed !== 'true')
                sideColumns.push(refs.rightBody);
            if (refs.leftBody && refs.leftBody.style.display !== 'none' && refs.leftBody.dataset.isColumnCollapsed !== 'true')
                sideColumns.push(refs.leftBody);
            for (const col of sideColumns) {
                const colRect = col.getBoundingClientRect();
                const content = col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`);
                const minWidth = content ? calculateElementMinWidth(content) : LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;
                // If the column is smaller than its minimum allowed width, collapse it
                if (colRect.width < minWidth - 5) { // 5px tolerance
                    console.log(`[PTMT] Auto-collapsing ${col.id} due to insufficient space (Width: ${colRect.width.toFixed(1)}px < Min: ${minWidth}px)`);
                    const panes = Array.from(col.querySelectorAll(`${SELECTORS.PANE}:not(${SELECTORS.VIEW_COLLAPSED})`));
                    panes.forEach(pane => setPaneCollapsedView(pane, true));
                    needsRecalculation = true;
                    // Re-filter columns for normalization below
                    const index = columns.indexOf(col);
                    if (index !== -1)
                        columns.splice(index, 1);
                }
            }
        }
        if (columns.length > 0) {
            normalizeFlexBasis(columns);
        }
    }
    for (const pane of allPanes) {
        const vs = readPaneViewSettings(pane);
        const minSize = vs.minimalPanelSize || LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;
        const parent = pane.parentElement;
        if (!parent)
            continue;
        const parentRect = parent.getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();
        let orientation = 'vertical';
        let parentSize = parentRect.width;
        let currentSize = paneRect.width;
        if (parent.classList.contains(SELECTORS.SPLIT.substring(1))) {
            orientation = parent.classList.contains('horizontal') ? 'horizontal' : 'vertical';
        }
        if (orientation === 'horizontal') {
            parentSize = parentRect.height;
            currentSize = paneRect.height;
        }
        if (currentSize < minSize && parentSize > 0) {
            const requiredPercent = (minSize / parentSize) * 100;
            setFlexBasisPercent(pane, requiredPercent);
            needsRecalculation = true;
        }
    }
    if (needsRecalculation) {
        recalculateAllSplitsRecursively();
        recalculateColumnSizes();
    }
}
/**
 * Initializes a ResizeObserver on the main container to detect size changes
 * and trigger layout recalculations. This replaces the window 'resize' listener
 * for better efficiency and to detect internal UI changes.
 */
export function initGlobalResizeObserver() {
    const refs = getRefs();
    if (!refs || !refs.mainBody) {
        console.warn('[PTMT] ResizeObserver failed: mainBody not found.');
        return;
    }
    const debouncedResize = debounce(() => {
        // Clear orientation cache so panes can adapt to new space
        document.querySelectorAll(SELECTORS.PANE).forEach(pane => delete pane.dataset.appliedOrientation);
        recalculateAllSplitsRecursively();
        validateAndCorrectAllMinSizes(true);
        // Notify others that layout has changed due to container resize
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, {
            detail: { reason: 'containerResize' },
        }));
    }, 150);
    const observer = trackObserver(new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (entry.target === refs.mainBody) {
                debouncedResize();
            }
        }
    }));
    observer.observe(refs.mainBody);
    console.log('[PTMT] Global ResizeObserver initialized on mainBody.');
}
//# sourceMappingURL=resizer.js.map