// resizer.js
import { $$, getElementDepth, setFlexBasisPercent, throttle, getRefs } from './utils.js'; // Changed import
import { recalculateColumnSizes, normalizeFlexBasis } from './layout.js';
import { readPaneViewSettings, defaultViewSettings, applyPaneOrientation } from './pane.js';
import { settings } from './settings.js';


export function invalidatePaneTabSizeCache(pane) {
    if (pane && pane.dataset) {
        delete pane.dataset.cachedTabSize;
    }
}

function getOrCalculateFullTabSize(pane) {
    if (pane.dataset.cachedTabSize) {
        return parseFloat(pane.dataset.cachedTabSize);
    }

    const tabStrip = pane._tabStrip;
    const tabs = tabStrip.querySelectorAll('.ptmt-tab');
    if (tabs.length === 0) return 0;

    const wasInIconMode = pane.classList.contains('ptmt-pane-icons-only');
    if (wasInIconMode) {
        pane.classList.remove('ptmt-pane-icons-only');
    }

    const isVertical = tabStrip.classList.contains('vertical');
    let requiredSize = 0;
    tabs.forEach(tab => {
        const tabRect = tab.getBoundingClientRect();
        requiredSize += (isVertical ? tabRect.height : tabRect.width) + (isVertical ? 0 : 4);
    });

    if (wasInIconMode) {
        pane.classList.add('ptmt-pane-icons-only');
    }

    pane.dataset.cachedTabSize = requiredSize;
    return requiredSize;
}

export const resizerControllers = new WeakMap();
const minWidthCache = new WeakMap();

export function invalidateMinWidthCache(element) {
    if (!element) return;
    minWidthCache.delete(element);
    if (element.parentElement) invalidateMinWidthCache(element.parentElement);
}

export function calculateElementMinWidth(element) {
    if (!element) return 0;
    if (minWidthCache.has(element)) return minWidthCache.get(element);

    let minWidth = 0;
    if (element.classList.contains('ptmt-pane')) {
        const vs = readPaneViewSettings(element);
        minWidth = Number(vs.minimalPanelSize) || defaultViewSettings.minimalPanelSize;
    } else if (element.classList.contains('ptmt-split')) {
        const children = Array.from(element.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
        const resizers = Array.from(element.children).filter(c => c.tagName === 'SPLITTER');

        if (element.classList.contains('horizontal')) {
            let maxMinWidth = 0;
            children.forEach(child => maxMinWidth = Math.max(maxMinWidth, calculateElementMinWidth(child)));
            minWidth = maxMinWidth;
        } else {
            let totalMinWidth = 0;
            children.forEach(child => totalMinWidth += calculateElementMinWidth(child));
            resizers.forEach(resizer => {
                const width = resizer.classList.contains('disabled') ? 0 : 6;
                totalMinWidth += width;
            });
            minWidth = totalMinWidth;
        }
    }

    minWidthCache.set(element, minWidth);
    return minWidth;
}

export function checkPaneForIconMode(pane) {
    if (!pane || !pane.classList) return;
    const showIconsOnly = settings.get('showIconsOnly');
    pane.classList.toggle('ptmt-pane-icons-only', !!showIconsOnly);
}

const throttledCheckPaneForIconMode = throttle(checkPaneForIconMode, 80);

const pxToPercent = (px, total) => !Number.isFinite(total) || total <= 0 ? 50 : Math.max(0, Math.min(100, (px / total) * 100));

function createResizer(resizer, orientation, config) {
    const isVertical = orientation === 'vertical' || orientation === 'v';
    const sizeProp = isVertical ? 'width' : 'height';
    const clientProp = isVertical ? 'clientX' : 'clientY';
    resizer.style.cursor = isVertical ? 'col-resize' : 'row-resize';

    let pointerId = null;
    let startClient = 0;
    let dragState = null;

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
        if (!dragState) return;

        e.preventDefault();
        pointerId = e.pointerId;
        try { resizer.setPointerCapture(pointerId); } catch (e) {
            console.warn('[PTMT] Failed to set pointer capture:', e);
        }
        startClient = e[clientProp];

        if (settings.get('hideContentWhileResizing')) {
            document.body.classList.add('ptmt-is-resizing');
        }
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
        if (pointerId === null || e.pointerId !== pointerId || !dragState) return;
        const delta = e[clientProp] - startClient;
        config.onDragMove(delta, dragState);
    }

    function onPointerUp(e) {
        if (pointerId !== null && e.pointerId === pointerId) {
            try { resizer.releasePointerCapture(pointerId); } catch (e) {
                console.warn('[PTMT] Failed :', e);
            }
        }
        pointerId = null;
        document.body.style.userSelect = '';
        if (settings.get('hideContentWhileResizing')) {
            document.body.classList.remove('ptmt-is-resizing');
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        if (dragState && config.onDragEnd) {
            config.onDragEnd(dragState);
        }
        dragState = null;

        try {
            window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'manualResize' } }));
        } catch (e) {
            console.warn('[PTMT] Failed :', e);
        }
    }

    resizer.addEventListener('pointerdown', onPointerDown);
    return {
        detach() {
            resizer.removeEventListener('pointerdown', onPointerDown);
        }
    };
}

/**
 * Applies intelligent expansion logic. If the element contains a split matching the drag
 * orientation, it locks the smallest child's size and lets larger ones grow.
 */
function applyIntelligentExpansion(element, newTotalSize, childInfo) {
    if (!element || !childInfo || !childInfo.element) {
        recalculateAllSplitsRecursively(element);
        return;
    }

    const { sizes: initialChildSizes, smallestIndex, element: splitElement } = childInfo;
    const children = Array.from(splitElement.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
    const smallestChildInitialSize = initialChildSizes[smallestIndex];

    const newSmallestChildBasisPercent = pxToPercent(smallestChildInitialSize, newTotalSize);

    let totalBasisForOthers = 0;
    initialChildSizes.forEach((size, index) => {
        if (index !== smallestIndex) {
            totalBasisForOthers += size;
        }
    });

    if (totalBasisForOthers <= 0) {
        recalculateAllSplitsRecursively(element);
        return;
    }

    const remainingPercent = 100 - newSmallestChildBasisPercent;

    children.forEach((child, index) => {
        if (index === smallestIndex) {
            setFlexBasisPercent(child, newSmallestChildBasisPercent, 0, 1); // grow=0 is key
        } else {
            const childsProportion = initialChildSizes[index] / totalBasisForOthers;
            setFlexBasisPercent(child, remainingPercent * childsProportion, 1, 1);
        }
    });
}

export function attachResizer(resizer, orientation = 'vertical') {
    const paneResizeStrategy = {
        onDragStart: (resizerEl, { sizeProp }) => {
            const aElem = resizerEl.previousElementSibling;
            const bElem = resizerEl.nextElementSibling;
            if (!aElem || !bElem) return null;

            if (aElem.classList.contains('view-collapsed') || aElem.classList.contains('ptmt-container-collapsed') || bElem.classList.contains('view-collapsed') || bElem.classList.contains('ptmt-container-collapsed')) return null;

            const minSizeA = calculateElementMinWidth(aElem);
            const minSizeB = calculateElementMinWidth(bElem);

            const flexSiblings = Array.from(resizerEl.parentElement.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
            const initialSizes = flexSiblings.map(el => el.getBoundingClientRect()[sizeProp]);
            const aElemIndex = flexSiblings.indexOf(aElem);
            const bElemIndex = flexSiblings.indexOf(bElem);
            const parentRectAtStart = resizerEl.parentElement?.getBoundingClientRect();

            const getChildInfo = (elem) => {
                if (!elem.classList.contains('ptmt-split')) return { element: null, sizes: null, smallestIndex: -1 };

                const dragIsVertical = sizeProp === 'width';
                const splitIsVertical = !elem.classList.contains('horizontal');

                if (dragIsVertical !== splitIsVertical) {
                    return { element: null, sizes: null, smallestIndex: -1 };
                }

                const children = Array.from(elem.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
                if (children.length <= 1) return { element: null, sizes: null, smallestIndex: -1 };

                const sizes = children.map(c => c.getBoundingClientRect()[sizeProp]);
                let smallestIndex = -1, minSize = Infinity;
                sizes.forEach((size, index) => {
                    if (size < minSize) { minSize = size; smallestIndex = index; }
                });
                return { element: elem, sizes, smallestIndex };
            };

            return { flexSiblings, initialSizes, aElemIndex, bElemIndex, minSizeA, minSizeB, parentRectAtStart, sizeProp, aChildInfo: getChildInfo(aElem), bChildInfo: getChildInfo(bElem) };
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
            const minSizeA = state.minSizeA || 0;
            const minSizeB = state.minSizeB || 0;

            let clampedDelta = Math.max(delta, minSizeA - initialSizeA);
            clampedDelta = Math.min(clampedDelta, initialSizeB - minSizeB);

            const aElem = state.flexSiblings[state.aElemIndex];
            const bElem = state.flexSiblings[state.bElemIndex];

            const newSizeA = initialSizeA + clampedDelta;
            const newSizeB = initialSizeB - clampedDelta;

            const totalResizerSize = Array.from(state.flexSiblings[0].parentElement.children).filter(c => !c.classList.contains('ptmt-pane') && !c.classList.contains('ptmt-split')).reduce((sum, r) => sum + r.getBoundingClientRect()[state.sizeProp], 0);
            const totalAvailable = state.parentRectAtStart[state.sizeProp] - totalResizerSize;

            if (totalAvailable <= 0) return;

            setFlexBasisPercent(aElem, pxToPercent(newSizeA, totalAvailable));
            setFlexBasisPercent(bElem, pxToPercent(newSizeB, totalAvailable));

            if (clampedDelta > 0) { // aElem is expanding, bElem is shrinking
                applyIntelligentExpansion(aElem, newSizeA, state.aChildInfo);
                recalculateAllSplitsRecursively(bElem);
            } else if (clampedDelta < 0) { // bElem is expanding, aElem is shrinking
                recalculateAllSplitsRecursively(aElem);
                applyIntelligentExpansion(bElem, newSizeB, state.bChildInfo);
            } else { // No change, just recalculate both to be safe
                recalculateAllSplitsRecursively(aElem);
                recalculateAllSplitsRecursively(bElem);
            }

            aElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
            bElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
        },

        onDragEnd: (state) => {
            const aElem = state.flexSiblings[state.aElemIndex];
            const bElem = state.flexSiblings[state.bElemIndex];
            if (aElem) aElem.dataset.lastFlex = aElem.style.flex;
            if (bElem) bElem.dataset.lastFlex = bElem.style.flex;
        }
    };

    // Validate resizer is a valid object before using with WeakMap
    if (!resizer || typeof resizer !== 'object') {
        console.warn('[PTMT] Cannot attach resizer: invalid element');
        return;
    }
    if (resizerControllers.has(resizer)) { resizerControllers.get(resizer).detach(); }
    resizerControllers.set(resizer, createResizer(resizer, orientation, paneResizeStrategy));
}

export function attachColumnResizer(resizer) {
    const columnResizeStrategy = {
        onDragStart: (resizerEl, { sizeProp }) => {
            const aElem = resizerEl.previousElementSibling;
            const bElem = resizerEl.nextElementSibling;
            if (!aElem || !bElem || !aElem.classList.contains('ptmt-body-column') || !bElem.classList.contains('ptmt-body-column')) return null;

            const refs = getRefs();
            const parentRectAtStart = refs.mainBody.getBoundingClientRect();
            const minWidthA = calculateElementMinWidth(aElem.querySelector('.ptmt-pane, .ptmt-split'));
            const minWidthB = calculateElementMinWidth(bElem.querySelector('.ptmt-pane, .ptmt-split'));

            const initialSizes = {
                left: refs.leftBody.style.display === 'none' ? 0 : refs.leftBody.getBoundingClientRect()[sizeProp],
                center: refs.centerBody.style.display === 'none' ? 0 : refs.centerBody.getBoundingClientRect()[sizeProp],
                right: refs.rightBody.style.display === 'none' ? 0 : refs.rightBody.getBoundingClientRect()[sizeProp],
            };

            const getChildInfo = (elem) => {
                const content = elem.querySelector('.ptmt-pane, .ptmt-split');
                if (!content || !content.classList.contains('ptmt-split')) return { element: null, sizes: null, smallestIndex: -1 };

                const dragIsVertical = sizeProp === 'width';
                const splitIsVertical = !content.classList.contains('horizontal');
                if (dragIsVertical !== splitIsVertical) return { element: null, sizes: null, smallestIndex: -1 };

                const grandchildren = Array.from(content.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
                if (grandchildren.length <= 1) return { element: null, sizes: null, smallestIndex: -1 };

                const sizes = grandchildren.map(c => c.getBoundingClientRect()[sizeProp]);
                let smallestIndex = -1, minSize = Infinity;
                sizes.forEach((size, index) => {
                    if (size < minSize) { minSize = size; smallestIndex = index; }
                });
                return { element: content, sizes, smallestIndex };
            };

            const aKey = aElem.id.replace('ptmt-', '').replace('Body', '');
            const bKey = bElem.id.replace('ptmt-', '').replace('Body', '');

            return { refs, initialSizes, minWidthA, minWidthB, aKey, bKey, parentRectAtStart, sizeProp, aChildInfo: getChildInfo(aElem), bChildInfo: getChildInfo(bElem) };
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
            const minWidthA = state.minWidthA || 0;
            const minWidthB = state.minWidthB || 0;

            let clampedDelta = Math.max(delta, minWidthA - initialSizeA);
            clampedDelta = Math.min(clampedDelta, initialSizeB - minWidthB);

            const newSizes = { ...state.initialSizes };
            newSizes[state.aKey] += clampedDelta;
            newSizes[state.bKey] -= clampedDelta;

            const totalResizerSize = $$('.ptmt-column-resizer', state.refs.mainBody).reduce((sum, r) => sum + r.getBoundingClientRect()[state.sizeProp], 0);
            const totalAvailable = state.parentRectAtStart[state.sizeProp] - totalResizerSize;

            if (totalAvailable <= 0) return;

            const { leftBody, centerBody, rightBody } = state.refs;
            if (leftBody.style.display !== 'none') setFlexBasisPercent(leftBody, pxToPercent(newSizes.left, totalAvailable));
            if (centerBody.style.display !== 'none') setFlexBasisPercent(centerBody, pxToPercent(newSizes.center, totalAvailable));
            if (rightBody.style.display !== 'none') setFlexBasisPercent(rightBody, pxToPercent(newSizes.right, totalAvailable));

            const aElem = state.refs[`${state.aKey}Body`];
            const bElem = state.refs[`${state.bKey}Body`];

            if (clampedDelta > 0) { // aElem column is expanding, bElem is shrinking
                applyIntelligentExpansion(aElem, newSizes[state.aKey], state.aChildInfo);
                recalculateAllSplitsRecursively(bElem);
            } else if (clampedDelta < 0) { // bElem column is expanding, aElem is shrinking
                recalculateAllSplitsRecursively(aElem);
                applyIntelligentExpansion(bElem, newSizes[state.bKey], state.bChildInfo);
            } else { // No change
                recalculateAllSplitsRecursively(aElem);
                recalculateAllSplitsRecursively(bElem);
            }

            aElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
            bElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
        },

        onDragEnd: (state) => {
            // Update lastFlex so it persists through reloads/collapses
            const { leftBody, centerBody, rightBody } = state.refs;
            [leftBody, centerBody, rightBody].forEach(col => {
                if (col && col.style.display !== 'none' && col.style.flex) {
                    col.dataset.lastFlex = col.style.flex;
                    console.log(`[PTMT Layout] 📍 Fixated ${col.id} size to ${col.style.flex}`);
                }
            });
        }
    };

    // Validate resizer is a valid object before using with WeakMap
    if (!resizer || typeof resizer !== 'object') {
        console.warn('[PTMT] Cannot attach column resizer: invalid element');
        return;
    }
    if (resizerControllers.has(resizer)) { resizerControllers.get(resizer).detach(); }
    const controller = createResizer(resizer, 'vertical', columnResizeStrategy);
    resizerControllers.set(resizer, controller);
}


export function setSplitOrientation(splitElement, newOrientation) {
    if (!splitElement) return;
    const isHorizontal = newOrientation === 'horizontal';

    if (splitElement.classList.contains('horizontal') === isHorizontal) return;

    splitElement.classList.toggle('horizontal', isHorizontal);

    const resizer = splitElement.querySelector(':scope > .ptmt-resizer-vertical, :scope > .ptmt-resizer-horizontal');
    if (resizer) {
        if (resizerControllers.has(resizer)) {
            resizerControllers.get(resizer).detach();
            resizerControllers.delete(resizer);
        }
        resizer.className = `ptmt-resizer-${newOrientation}`;
        attachResizer(resizer, newOrientation);
    }
}

export function updateResizerDisabledStates() {
    try {
        document.querySelectorAll('.ptmt-resizer-vertical, .ptmt-resizer-horizontal').forEach(r => {
            let a = r.previousElementSibling;
            let b = r.nextElementSibling;
            if (!a || !b) {
                r.classList.toggle('disabled', true);
                return;
            }

            let isACollapsed, isBCollapsed;

            // Check if it's a column resizer by looking at its siblings.
            if (a.classList.contains('ptmt-body-column') && b.classList.contains('ptmt-body-column')) {
                isACollapsed = a.dataset.isColumnCollapsed === 'true';
                isBCollapsed = b.dataset.isColumnCollapsed === 'true';
            } else { // Otherwise, it's a resizer between panes or splits.
                isACollapsed = a.classList.contains('view-collapsed') || a.classList.contains('ptmt-container-collapsed');
                isBCollapsed = b.classList.contains('view-collapsed') || b.classList.contains('ptmt-container-collapsed');
            }

            const disabled = !!isACollapsed || !!isBCollapsed;
            r.classList.toggle('disabled', disabled);
        });
    } catch (e) {
        console.warn("Error updating resizer states:", e);
    }
}



export function recalculateAllSplitsRecursively(root = getRefs().mainBody) {
    try {
        if (!root) return;
        const splits = Array.from(root.querySelectorAll('.ptmt-split'));
        splits.sort((a, b) => getElementDepth(a) - getElementDepth(b));
        for (const split of splits) {
            recalculateSplitSizes(split);
        }
    } catch (e) {
        console.warn('recalculateAllSplitsRecursively error:', e);
    }
}

export function recalculateSplitSizes(split, actor = null) {
    if (!split?.classList.contains('ptmt-split')) return;

    const children = Array.from(split.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
    if (children.length === 0) return;

    let activeChildren = children.filter(c => !c.classList.contains('view-collapsed') && !c.classList.contains('ptmt-container-collapsed'));

    // NEW: If ALL children are collapsed (e.g. inside a collapsed column), they should share the space equally
    // instead of shrinking to '0 0 auto'. This allows correct alignment (e.g. 50/50 split of the 72px column).
    // This also ensures that collapsed panels in the Center Column FILL the center instead of stacking on the left.
    const allCollapsed = activeChildren.length === 0;
    if (allCollapsed) {
        activeChildren = children;
    }

    if (activeChildren.length < children.length) {
        // Normalize open children's flex so they fill the available space,
        // but preserve their existing proportions (lastFlex or current flex) instead
        // of blindly resetting to equal distribution.
        const totalOpenFlex = activeChildren.reduce((sum, child) => {
            const flexStr = child.dataset.lastFlex || child.style.flex || '';
            const m = flexStr.match(/(\d+(?:\.\d+)?)\s*%/);
            return sum + (m ? parseFloat(m[1]) : (100 / activeChildren.length));
        }, 0);

        children.forEach(child => {
            if (child.classList.contains('view-collapsed') || child.classList.contains('ptmt-container-collapsed')) {
                child.style.flex = '0 0 auto';
            } else {
                // Restore the child's last known flex, scaled so all open children sum to 100%
                const flexStr = child.dataset.lastFlex || child.style.flex || '';
                const m = flexStr.match(/(\d+(?:\.\d+)?)\s*%/);
                const rawBasis = m ? parseFloat(m[1]) : (100 / activeChildren.length);
                const scaled = totalOpenFlex > 0 ? (rawBasis / totalOpenFlex) * 100 : (100 / activeChildren.length);
                setFlexBasisPercent(child, scaled);
            }
        });
        return;
    }

    const isHorizontal = split.classList.contains('horizontal');
    const sizeProp = isHorizontal ? 'height' : 'width';
    const splitRect = split.getBoundingClientRect();
    const totalAvailableSize = splitRect[sizeProp];
    if (totalAvailableSize <= 1) return;

    const resizers = Array.from(split.children).filter(c => c.tagName === 'SPLITTER');
    const totalResizerSize = resizers.reduce((sum, r) => sum + r.getBoundingClientRect()[sizeProp], 0);
    const contentAvailableSize = Math.max(0, totalAvailableSize - totalResizerSize);

    const childrenInfo = activeChildren.map(child => {
        const flexValue = child.dataset.lastFlex || child.style.flex;
        const basisMatch = flexValue && flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        const flexBasisPercent = basisMatch ? parseFloat(basisMatch[1]) : (100 / activeChildren.length);
        return {
            el: child,
            minSize: calculateElementMinWidth(child),
            flexBasisPercent
        };
    });

    const totalMinSize = childrenInfo.reduce((sum, info) => sum + info.minSize, 0);
    let finalSizes;

    if (contentAvailableSize < totalMinSize) {
        finalSizes = (totalMinSize > 0) ? childrenInfo.map(info => contentAvailableSize * (info.minSize / totalMinSize)) : childrenInfo.map(() => contentAvailableSize / childrenInfo.length);
    } else {
        let idealSizes = childrenInfo.map(info => contentAvailableSize * (info.flexBasisPercent / 100));
        let deficit = 0;
        idealSizes.forEach((size, i) => {
            const min = childrenInfo[i].minSize;
            if (size < min) { deficit += min - size; idealSizes[i] = min; }
        });

        if (deficit > 0.01) {
            const actorIndex = actor ? activeChildren.indexOf(actor) : -1;
            const donorData = idealSizes.map((size, i) => ({ index: i, stealable: Math.max(0, size - childrenInfo[i].minSize) })).filter(d => d.index !== actorIndex);

            if (actorIndex !== -1) {
                // Neighborhood first
                donorData.sort((a, b) => Math.abs(a.index - actorIndex) - Math.abs(b.index - actorIndex));
            }

            for (const donor of donorData) {
                const taken = Math.min(deficit, donor.stealable);
                idealSizes[donor.index] -= taken;
                deficit -= taken;
                if (deficit <= 0.01) break;
            }

            // Fallback for remaining deficit
            if (deficit > 0.01) {
                const stealableTotal = idealSizes.reduce((sum, size, i) => sum + Math.max(0, size - childrenInfo[i].minSize), 0);
                if (stealableTotal > 0.1) {
                    const factor = deficit / stealableTotal;
                    idealSizes.forEach((size, i) => {
                        const s = Math.max(0, size - childrenInfo[i].minSize);
                        idealSizes[i] -= s * factor;
                    });
                }
            }
        }

        const currentTotalSize = idealSizes.reduce((a, b) => a + b, 0);
        const surplus = contentAvailableSize - currentTotalSize;

        if (Math.abs(surplus) > 0.1) {
            let largestChildIndex = -1, maxSize = -1;
            idealSizes.forEach((size, i) => {
                if (size > maxSize) { maxSize = size; largestChildIndex = i; }
            });
            if (largestChildIndex !== -1) { idealSizes[largestChildIndex] += surplus; }
        }
        finalSizes = idealSizes;
    }

    const totalFinalSize = finalSizes.reduce((sum, size) => sum + size, 0);
    if (totalFinalSize > 0.1) {
        activeChildren.forEach((child, index) => {
            const percentage = pxToPercent(finalSizes[index], totalFinalSize);
            setFlexBasisPercent(child, percentage);
        });
    }
}

export function validateAndCorrectAllMinSizes() {
    let needsRecalculation = false;
    const allPanes = Array.from(document.querySelectorAll('.ptmt-pane:not(.view-collapsed)'));

    const refs = getRefs();
    if (refs && refs.mainBody) {
        const columns = [refs.leftBody, refs.centerBody, refs.rightBody].filter(c => c && c.style.display !== 'none' && c.dataset.isColumnCollapsed !== 'true');
        if (columns.length > 0) {
            normalizeFlexBasis(columns);
        }
    }

    for (const pane of allPanes) {
        const vs = readPaneViewSettings(pane);
        const minSize = vs.minimalPanelSize || 250;
        const parent = pane.parentElement;
        if (!parent) continue;

        const parentRect = parent.getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();

        let orientation = 'vertical';
        let parentSize = parentRect.width;
        let currentSize = paneRect.width;

        if (parent.classList.contains('ptmt-split')) {
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
        console.log('[PTMT] Layout corrected to enforce minimum panel sizes.');
        recalculateAllSplitsRecursively();
        recalculateColumnSizes();
    }
}