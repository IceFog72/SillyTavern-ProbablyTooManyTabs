// dock-math.ts - Pure layout math for split ratios, docking size strategies, min-size solver, and preview bounds
import { isExistingDockZone, isInsertBeforeZone, isOuterDockZone, splitOrientationForZone, zoneDirection, } from './dock-types.js';
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function normalizeRatios(values, count) {
    if (count <= 0)
        return [];
    const sanitized = Array.from({ length: count }, (_, i) => {
        const value = Number(values[i] ?? 0);
        return Number.isFinite(value) && value > 0 ? value : 0;
    });
    const sum = sanitized.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
        return Array.from({ length: count }, () => 1 / count);
    }
    return sanitized.map((value) => value / sum);
}
export function ratiosToPercentages(values, count) {
    return normalizeRatios(values, count).map((r) => r * 100);
}
export function parseFlexRatioFromFlexString(flex) {
    if (!flex)
        return null;
    const match = flex.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match)
        return null;
    const pct = parseFloat(match[1]);
    return Number.isFinite(pct) && pct > 0 ? pct / 100 : null;
}
export function formatFlexPercentage(ratio, grow = 1, shrink = 1) {
    const pct = clamp(ratio * 100, 0, 100);
    return `${grow} ${shrink} ${pct.toFixed(4)}%`;
}
/**
 * Pixel-exact cumulative distribution from dock-spawn-ts:
 * allocates every available pixel across `count` children so sizes differ by at most 1px.
 */
export function equalDistributionPixels(totalPx, count, splitterPx = 6) {
    if (count <= 0)
        return [];
    const available = Math.max(0, totalPx - Math.max(0, count - 1) * splitterPx);
    return Array.from({ length: count }, (_, i) => Math.floor((available * (i + 1)) / count) - Math.floor((available * i) / count));
}
/**
 * Inserts a new child ratio into an existing splitter according to the active DockingSizeStrategy:
 * - 'equal-distribution' on outer dock: rebalances all direct children of the root splitter to equal shares (1 / (oldCount + 1)).
 * - 'split-reference' (or 'equal-distribution' on panel-relative dock): divides ONLY the reference child's share
 *   between the reference child and the new child, keeping every other sibling's ratio unchanged!
 * - 'proportional': inserts a candidate weight and scales all existing children proportionally.
 */
export function insertRatioWithStrategy(options) {
    const { ratios, oldCount, insertIndex, referenceIndex, strategy = 'split-reference', isOuterDock = false, customRatio, totalPx = 0, splitterPx = 6, } = options;
    if (oldCount <= 0)
        return [1];
    const old = normalizeRatios(ratios, oldCount);
    const clampedInsert = clamp(insertIndex, 0, old.length);
    const explicitRatio = typeof customRatio === 'number' && Number.isFinite(customRatio) && customRatio > 0 && customRatio < 1
        ? clamp(customRatio, 0.05, 0.95)
        : null;
    // 1. Outer dock with equal-distribution: balance all direct children equally
    if (strategy === 'equal-distribution' && isOuterDock && explicitRatio === null) {
        if (totalPx > (oldCount * splitterPx)) {
            const pxSizes = equalDistributionPixels(totalPx, oldCount + 1, splitterPx);
            return normalizeRatios(pxSizes, oldCount + 1);
        }
        return normalizeRatios([], oldCount + 1);
    }
    // 2. Reference-pane splitting ('split-reference' or panel-relative 'equal-distribution')
    const refIdx = referenceIndex !== undefined ? clamp(referenceIndex, 0, oldCount - 1) : null;
    if ((strategy === 'split-reference' || (strategy === 'equal-distribution' && !isOuterDock)) && refIdx !== null) {
        const refShare = old[refIdx] ?? (1 / oldCount);
        const fraction = explicitRatio ?? 0.5;
        const newChildShare = refShare * fraction;
        const remainingRefShare = Math.max(0.01, refShare - newChildShare);
        const next = [...old];
        next[refIdx] = remainingRefShare;
        next.splice(clampedInsert, 0, newChildShare);
        return normalizeRatios(next, oldCount + 1);
    }
    // 3. Proportional insertion (Lace / classic proportional strategy)
    const before = old[Math.max(0, clampedInsert - 1)] ?? 0;
    const after = old[Math.min(oldCount - 1, clampedInsert)] ?? 0;
    const rawCandidate = explicitRatio
        ?? Math.max(0.05, (before + after) / (before > 0 && after > 0 ? 2 : 1) || (1 / (oldCount + 1)));
    const candidate = Math.min(0.85, rawCandidate);
    const scaled = old.map((v) => v * (1 - candidate));
    const result = [...scaled];
    result.splice(clampedInsert, 0, candidate);
    return normalizeRatios(result, oldCount + 1);
}
export function removeRatiosByIndex(values, oldCount, removedIndices) {
    const old = normalizeRatios(values, oldCount);
    const kept = old.filter((_, index) => !removedIndices.has(index));
    return normalizeRatios(kept, kept.length);
}
/**
 * Enforces minimum pixel sizes per child while stealing deficit from nearest non-actor donors first
 * and assigning any rounding surplus to the largest/center child.
 */
export function solveMinSizeRatios(desiredRatios, minSizesPx, availablePx, actorIndex = -1) {
    const count = desiredRatios.length;
    if (count <= 0)
        return [];
    const normalized = normalizeRatios(desiredRatios, count);
    if (!Number.isFinite(availablePx) || availablePx <= 1)
        return normalized;
    const mins = Array.from({ length: count }, (_, i) => Math.max(0, Number(minSizesPx[i] ?? 0)));
    const totalMin = mins.reduce((a, b) => a + b, 0);
    if (availablePx <= totalMin) {
        return totalMin > 0 ? normalizeRatios(mins, count) : normalizeRatios([], count);
    }
    const idealSizes = normalized.map((r) => availablePx * r);
    let deficit = 0;
    for (let i = 0; i < count; i++) {
        if (idealSizes[i] < mins[i]) {
            deficit += mins[i] - idealSizes[i];
            idealSizes[i] = mins[i];
        }
    }
    if (deficit > 0.01) {
        const donors = idealSizes
            .map((size, index) => ({ index, stealable: Math.max(0, size - mins[index]) }))
            .filter((d) => d.index !== actorIndex && d.stealable > 0);
        if (actorIndex >= 0) {
            donors.sort((a, b) => Math.abs(a.index - actorIndex) - Math.abs(b.index - actorIndex));
        }
        for (const donor of donors) {
            const taken = Math.min(deficit, donor.stealable);
            idealSizes[donor.index] -= taken;
            deficit -= taken;
            if (deficit <= 0.01)
                break;
        }
        if (deficit > 0.01) {
            const stealableTotal = idealSizes.reduce((sum, size, i) => sum + Math.max(0, size - mins[i]), 0);
            if (stealableTotal > 0.1) {
                const factor = deficit / stealableTotal;
                for (let i = 0; i < count; i++) {
                    const s = Math.max(0, idealSizes[i] - mins[i]);
                    idealSizes[i] -= s * factor;
                }
            }
        }
    }
    const currentTotal = idealSizes.reduce((a, b) => a + b, 0);
    const surplus = availablePx - currentTotal;
    if (Math.abs(surplus) > 0.1) {
        let largestIndex = 0;
        for (let i = 1; i < count; i++) {
            if (idealSizes[i] > idealSizes[largestIndex])
                largestIndex = i;
        }
        idealSizes[largestIndex] = Math.max(mins[largestIndex], idealSizes[largestIndex] + surplus);
    }
    return normalizeRatios(idealSizes, count);
}
/**
 * Clamps a floating window's geometry so it always stays reachable inside its host container.
 */
export function clampFloatingGeometry(geometry, hostBounds, minWidth = 220, minHeight = 140) {
    const maxW = hostBounds && hostBounds.width > minWidth ? hostBounds.width : 32000;
    const maxH = hostBounds && hostBounds.height > minHeight ? hostBounds.height : 32000;
    const width = clamp(Math.round(Number.isFinite(geometry.width) ? geometry.width : 480), minWidth, maxW);
    const height = clamp(Math.round(Number.isFinite(geometry.height) ? geometry.height : 340), minHeight, maxH);
    const rawX = Math.round(Number.isFinite(geometry.x) ? geometry.x : 64);
    const rawY = Math.round(Number.isFinite(geometry.y) ? geometry.y : 64);
    if (!hostBounds || hostBounds.width <= 0 || hostBounds.height <= 0) {
        return { x: Math.max(0, rawX), y: Math.max(0, rawY), width, height };
    }
    const x = clamp(rawX, 0, Math.max(0, hostBounds.width - Math.min(width, 80)));
    const y = clamp(rawY, 0, Math.max(0, hostBounds.height - 36));
    return { x, y, width, height };
}
/**
 * Resolves a drop zone from pointer coordinates inside a target rect (and optional outer container rect).
 */
export function computeDockZoneFromPoint(targetRect, clientX, clientY, options = {}) {
    const outerRect = options.outerRect;
    const outerMargin = options.outerMarginPx ?? 24;
    if (outerRect && outerRect.width > 0 && outerRect.height > 0) {
        if (clientX >= outerRect.x && clientX <= outerRect.x + outerMargin)
            return 'outer-left';
        if (clientX <= outerRect.x + outerRect.width && clientX >= outerRect.x + outerRect.width - outerMargin)
            return 'outer-right';
        if (clientY >= outerRect.y && clientY <= outerRect.y + outerMargin)
            return 'outer-top';
        if (clientY <= outerRect.y + outerRect.height && clientY >= outerRect.y + outerRect.height - outerMargin)
            return 'outer-bottom';
    }
    const edge = options.edgeThreshold ?? 0.25;
    const nx = (clientX - targetRect.x) / Math.max(1, targetRect.width);
    const ny = (clientY - targetRect.y) / Math.max(1, targetRect.height);
    if (nx < edge)
        return 'left';
    if (nx > 1 - edge)
        return 'right';
    if (ny < edge)
        return 'top';
    if (ny > 1 - edge)
        return 'bottom';
    return 'center';
}
/**
 * Computes the visual dock preview rectangle for any of the 13 zones,
 * accurately reflecting 'proportional', 'split-reference', or 'equal-distribution' allocations.
 */
export function computeDockPreviewRect(options) {
    const { zone, targetRect, outerRect, existingNeighborRect, strategy = 'split-reference', rootSplitOrientation = null, rootSplitChildCount = 1, splitterPx = 6, splitRatio = 0.5, } = options;
    if (zone === 'center') {
        return { ...targetRect };
    }
    if (isExistingDockZone(zone)) {
        return existingNeighborRect ? { ...existingNeighborRect } : null;
    }
    const dir = zoneDirection(zone);
    const orientation = splitOrientationForZone(zone);
    const before = isInsertBeforeZone(zone);
    const fraction = clamp(splitRatio, 0.1, 0.9);
    if (isOuterDockZone(zone)) {
        const host = outerRect ?? targetRect;
        const sameRootOrientation = rootSplitOrientation === orientation;
        const count = strategy === 'equal-distribution'
            ? (sameRootOrientation ? Math.max(1, rootSplitChildCount) : 1) + 1
            : 2;
        if (orientation === 'vertical') {
            const sizes = strategy === 'equal-distribution'
                ? equalDistributionPixels(host.width, count, splitterPx)
                : [Math.round(host.width * fraction), Math.round(host.width * (1 - fraction))];
            const w = before ? (sizes[0] ?? host.width * 0.5) : (sizes[sizes.length - 1] ?? host.width * 0.5);
            return {
                x: before ? host.x : host.x + host.width - w,
                y: host.y,
                width: w,
                height: host.height,
            };
        }
        else {
            const sizes = strategy === 'equal-distribution'
                ? equalDistributionPixels(host.height, count, splitterPx)
                : [Math.round(host.height * fraction), Math.round(host.height * (1 - fraction))];
            const h = before ? (sizes[0] ?? host.height * 0.5) : (sizes[sizes.length - 1] ?? host.height * 0.5);
            return {
                x: host.x,
                y: before ? host.y : host.y + host.height - h,
                width: host.width,
                height: h,
            };
        }
    }
    // Panel-relative split ('left' | 'right' | 'top' | 'bottom')
    if (orientation === 'vertical') {
        const available = Math.max(0, targetRect.width - splitterPx);
        const w = Math.floor(available * fraction);
        return {
            x: before ? targetRect.x : targetRect.x + targetRect.width - w,
            y: targetRect.y,
            width: Math.max(1, w),
            height: targetRect.height,
        };
    }
    if (dir === 'top' || dir === 'bottom') {
        const available = Math.max(0, targetRect.height - splitterPx);
        const h = Math.floor(available * fraction);
        return {
            x: targetRect.x,
            y: before ? targetRect.y : targetRect.y + targetRect.height - h,
            width: targetRect.width,
            height: Math.max(1, h),
        };
    }
    return null;
}
//# sourceMappingURL=dock-math.js.map