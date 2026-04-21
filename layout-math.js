// layout-math.js
// Consolidated layout calculation logic for flex basis, sizing, and normalization

import { SELECTORS, LAYOUT } from './constants.js';
import { getRefs, calculateElementMinWidth, readPaneViewSettings, getElementDepth } from './utils.js';

export const pxToPercent = (px, total) => !Number.isFinite(total) || total <= 0 ? 50 : Math.max(0, Math.min(100, (px / total) * 100));


export function parseFlexBasis(flexString) {
    if (!flexString) return null;
    const match = flexString.match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : null;
}


export function getBasis(col, useLastFlex = false) {
    if (!col || col.style.display === 'none') return 0;
    let flexString = col.style.flex;
    if (useLastFlex && col.dataset.isColumnCollapsed === 'true') {
        flexString = col.dataset.lastFlex || flexString;
    }
    if (!useLastFlex && col.dataset.isColumnCollapsed === 'true') return 0;
    return parseFlexBasis(flexString) ?? 0;
}


export function setFlexBasisPercent(elem, percent, grow = 1, shrink = 1) {
    const clampedPercent = Math.max(0, Math.min(100, percent));

    const isResizable = elem?.classList.contains(SELECTORS.PANE.substring(1)) || elem?.classList.contains(SELECTORS.SPLIT.substring(1)) || elem?.classList.contains(SELECTORS.COLUMN.substring(1));
    const isCollapsed = elem?.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || elem?.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1));

    if (isResizable && !isCollapsed) {
        try {
            elem.style.flex = `${grow} ${shrink} ${clampedPercent.toFixed(4)}%`;
        } catch {
            Object.assign(elem.style, {
                flexBasis: `${clampedPercent.toFixed(4)}%`,
                flexGrow: `${grow}`,
                flexShrink: `${shrink}`
            });
        }
    }
}


export function applyIntelligentExpansion(element, newTotalSize, childInfo) {
    if (!element || !childInfo || !childInfo.element) {
        recalculateAllSplitsRecursively(element);
        return;
    }

    const { sizes: initialChildSizes, smallestIndex, element: splitElement } = childInfo;
    const children = Array.from(splitElement.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
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
            setFlexBasisPercent(child, newSmallestChildBasisPercent, 0, 1);
        } else {
            const childsProportion = initialChildSizes[index] / totalBasisForOthers;
            setFlexBasisPercent(child, remainingPercent * childsProportion, 1, 1);
        }
    });
}

/**
 * Pre-compute all bounding rects for splits in a subtree.
 * Batches DOM reads to prevent thrashing during drag operations.
 * Call once at the start of resize to amortize layout reads across the operation.
 * @param {Element} root - Root element to scan for splits
 * @returns {Map<Element, DOMRect>} Cache mapping splits to their bounding rects
 */
export function buildMeasurementCache(root) {
    const cache = new Map();
    try {
        if (!root) return cache;
        const splits = Array.from(root.querySelectorAll(SELECTORS.SPLIT));
        for (const split of splits) {
            cache.set(split, split.getBoundingClientRect());
        }
    } catch (e) {
        console.warn('[PTMT] buildMeasurementCache error:', e);
    }
    return cache;
}

export function recalculateAllSplitsRecursively(root = null) {
    root = root || getRefs().mainBody;
    try {
        if (!root) return;
        const splits = Array.from(root.querySelectorAll(SELECTORS.SPLIT));
        splits.sort((a, b) => getElementDepth(a) - getElementDepth(b));

        // Batch-read all bounding rects once before processing
        const cache = buildMeasurementCache(root);

        for (const split of splits) {
            recalculateSplitSizes(split, null, cache);
        }
    } catch (e) {
        console.warn('[PTMT] recalculateAllSplitsRecursively error:', e);
    }
}

/**
 * Batch recalculate multiple subtrees in a single pass with shared measurement cache.
 * Useful for onDragMove which needs to recalculate both sides of a resize.
 * @param {Element[]} roots - Array of root elements to recalculate
 */
export function recalculateMultipleSubtreesOptimized(roots) {
    try {
        if (!roots || roots.length === 0) return;

        // Collect all splits from all roots in a single pass
        const allSplits = new Set();
        const cache = new Map();

        for (const root of roots) {
            if (!root) continue;
            const splits = Array.from(root.querySelectorAll(SELECTORS.SPLIT));
            for (const split of splits) {
                allSplits.add(split);
                if (!cache.has(split)) {
                    cache.set(split, split.getBoundingClientRect());
                }
            }
        }

        // Sort and recalculate with shared cache
        const sortedSplits = Array.from(allSplits).sort((a, b) => getElementDepth(a) - getElementDepth(b));
        for (const split of sortedSplits) {
            recalculateSplitSizes(split, null, cache);
        }
    } catch (e) {
        console.warn('[PTMT] recalculateMultipleSubtreesOptimized error:', e);
    }
}


export function recalculateSplitSizes(split, actor = null, cache = null) {
    try {
        _recalculateSplitSizesImpl(split, actor, cache);
    } catch (e) {
        console.warn('[PTMT] recalculateSplitSizes error:', e);
    }
}

/**
 * Implementation of split size recalculation.
 * @param {Element} split - The split element to recalculate
 * @param {Element} actor - (Optional) Element driving the resize
 * @param {Map<Element, DOMRect>} cache - (Optional) Pre-computed bounding rects to avoid DOM reads
 */

function _recalculateSplitSizesImpl(split, actor = null, cache = null) {
    if (!split?.classList.contains(SELECTORS.SPLIT.substring(1))) return;

    const children = Array.from(split.children).filter(c =>
        c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1))
    );
    if (children.length === 0) return;

    let activeChildren = children.filter(c => !c.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) && !c.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1)));

    const allCollapsed = activeChildren.length === 0;
    if (allCollapsed) {
        activeChildren = children;
    }

    if (activeChildren.length < children.length) {
        const def = 100 / activeChildren.length;
        const totalOpenFlex = activeChildren.reduce((sum, child) => {
            const flexStr = child.dataset.lastFlex || child.style.flex || '';
            return sum + (parseFlexBasis(flexStr) ?? def);
        }, 0);

        children.forEach(child => {
            if (child.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || child.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1))) {
                child.style.flex = '0 0 auto';
            } else {
                const flexStr = child.dataset.lastFlex || child.style.flex || '';
                const rawBasis = parseFlexBasis(flexStr) ?? def;
                const scaled = totalOpenFlex > 0 ? (rawBasis / totalOpenFlex) * 100 : def;
                setFlexBasisPercent(child, scaled);
            }
        });
        return;
    }

    const isHorizontal = split.classList.contains('horizontal');
    const sizeProp = isHorizontal ? 'height' : 'width';

    // Use cached rect if available, otherwise read from DOM
    const splitRect = cache?.get(split) || split.getBoundingClientRect();
    const totalAvailableSize = splitRect[sizeProp];
    if (totalAvailableSize <= 1) return;

    const resizers = Array.from(split.children).filter(c => c.tagName === 'SPLITTER');
    const totalResizerSize = resizers.length * LAYOUT.RESIZER_WIDTH;
    const contentAvailableSize = Math.max(0, totalAvailableSize - totalResizerSize);

    const childrenInfo = activeChildren.map(child => {
        const flexValue = child.dataset.lastFlex || child.style.flex;
        const flexBasisPercent = parseFlexBasis(flexValue) ?? (100 / activeChildren.length);
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
                donorData.sort((a, b) => Math.abs(a.index - actorIndex) - Math.abs(b.index - actorIndex));
            }

            for (const donor of donorData) {
                const taken = Math.min(deficit, donor.stealable);
                idealSizes[donor.index] -= taken;
                deficit -= taken;
                if (deficit <= 0.01) break;
            }

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


let lastParentWidth = 0;

export function normalizeFlexBasis(activeColumns, targetTotal = 100, actor = null) {
    try {
        _normalizeFlexBasisImpl(activeColumns, targetTotal, actor);
    } catch (e) {
        console.warn('[PTMT] normalizeFlexBasis error:', e);
    }
}

function _normalizeFlexBasisImpl(activeColumns, targetTotal = 100, actor = null) {
    const refs = getRefs();
    if (!refs || !refs.mainBody || activeColumns.length === 0) return;

    const parentRect = refs.mainBody.getBoundingClientRect();
    const parentWidth = parentRect.width;

    if (parentWidth < 100) return;

    const resizerCount = refs.mainBody.querySelectorAll(SELECTORS.COLUMN_RESIZER).length;
    const totalResizerWidth = resizerCount * LAYOUT.RESIZER_WIDTH;

    const availableWidth = Math.max(1, parentWidth - totalResizerWidth);

    let currentTotal = 0;
    let anyChanges = false;
    const columnData = activeColumns.map(col => {
        const content = col.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`);
        const minPx = content ? calculateElementMinWidth(content) : LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;

        const minPercent = Math.min(76, (minPx / availableWidth) * 100);

        let basis = getBasis(col);
        if (basis < minPercent - 0.1) {
            basis = minPercent;
            anyChanges = true;
        }
        currentTotal += basis;
        return { col, minPercent, basis };
    });

    let error = currentTotal - targetTotal;

    if (!anyChanges && Math.abs(error) <= 0.01 && parentWidth === lastParentWidth) return;
    lastParentWidth = parentWidth;

    if (Math.abs(error) > 0.0001) {
        if (error > 0) {
            const actorIndex = actor ? activeColumns.indexOf(actor) : -1;
            const donors = columnData.filter(d => d.col !== actor);

            if (actorIndex !== -1) {
                donors.sort((a, b) => {
                    const distA = Math.abs(activeColumns.indexOf(a.col) - actorIndex);
                    const distB = Math.abs(activeColumns.indexOf(b.col) - actorIndex);
                    return distA - distB;
                });
            } else {
                donors.sort((a, b) => {
                    if (a.col.id === 'ptmt-centerBody') return -1;
                    if (b.col.id === 'ptmt-centerBody') return 1;
                    return 0;
                });
            }

            for (const d of donors) {
                const stealable = Math.max(0, d.basis - d.minPercent);
                if (stealable > 0) {
                    const taken = Math.min(error, stealable);
                    d.basis -= taken;
                    error -= taken;
                }
                if (error <= 0.0001) break;
            }

            if (error > 0.001) {
                const totalBasis = columnData.reduce((sum, d) => sum + d.basis, 0);
                const factor = targetTotal / totalBasis;
                columnData.forEach(d => {
                    d.basis = Math.max(0.001, d.basis * factor);
                });
            }
        } else {
            const sorted = [...columnData].sort((a, b) => b.basis - a.basis);
            if (sorted[0]) sorted[0].basis -= error;
        }
    }

    columnData.forEach(d => {
        d.col.style.flex = `1 1 ${d.basis.toFixed(4)}%`;
    });
}
