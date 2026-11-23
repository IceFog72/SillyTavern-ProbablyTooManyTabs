import { type DockingSizeStrategy, type DockZone } from './dock-types.js';
import type { Orientation } from '../core/types.js';
export interface RectBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface InsertRatioOptions {
    ratios: readonly number[];
    oldCount: number;
    insertIndex: number;
    referenceIndex?: number;
    strategy?: DockingSizeStrategy;
    isOuterDock?: boolean;
    customRatio?: number;
    totalPx?: number;
    splitterPx?: number;
}
export interface PreviewRectOptions {
    zone: DockZone;
    targetRect: RectBox;
    outerRect?: RectBox;
    existingNeighborRect?: RectBox | null;
    strategy?: DockingSizeStrategy;
    parentSplitOrientation?: Orientation | null;
    parentSplitChildCount?: number;
    rootSplitOrientation?: Orientation | null;
    rootSplitChildCount?: number;
    splitterPx?: number;
    splitRatio?: number;
}
export declare function clamp(value: number, min: number, max: number): number;
export declare function normalizeRatios(values: readonly number[], count: number): number[];
export declare function ratiosToPercentages(values: readonly number[], count: number): number[];
export declare function parseFlexRatioFromFlexString(flex: string | null | undefined): number | null;
export declare function formatFlexPercentage(ratio: number, grow?: number, shrink?: number): string;
/**
 * Pixel-exact cumulative distribution from dock-spawn-ts:
 * allocates every available pixel across `count` children so sizes differ by at most 1px.
 */
export declare function equalDistributionPixels(totalPx: number, count: number, splitterPx?: number): number[];
/**
 * Inserts a new child ratio into an existing splitter according to the active DockingSizeStrategy:
 * - 'equal-distribution' on outer dock: rebalances all direct children of the root splitter to equal shares (1 / (oldCount + 1)).
 * - 'split-reference' (or 'equal-distribution' on panel-relative dock): divides ONLY the reference child's share
 *   between the reference child and the new child, keeping every other sibling's ratio unchanged!
 * - 'proportional': inserts a candidate weight and scales all existing children proportionally.
 */
export declare function insertRatioWithStrategy(options: InsertRatioOptions): number[];
export declare function removeRatiosByIndex(values: readonly number[], oldCount: number, removedIndices: ReadonlySet<number>): number[];
/**
 * Enforces minimum pixel sizes per child while stealing deficit from nearest non-actor donors first
 * and assigning any rounding surplus to the largest/center child.
 */
export declare function solveMinSizeRatios(desiredRatios: readonly number[], minSizesPx: readonly number[], availablePx: number, actorIndex?: number): number[];
/**
 * Clamps a floating window's geometry so it always stays reachable inside its host container.
 */
export declare function clampFloatingGeometry(geometry: Partial<RectBox>, hostBounds?: {
    width: number;
    height: number;
} | null, minWidth?: number, minHeight?: number): RectBox;
/**
 * Resolves a drop zone from pointer coordinates inside a target rect (and optional outer container rect).
 */
export declare function computeDockZoneFromPoint(targetRect: RectBox, clientX: number, clientY: number, options?: {
    edgeThreshold?: number;
    outerRect?: RectBox | null;
    outerMarginPx?: number;
}): DockZone;
/**
 * Computes the visual dock preview rectangle for any of the 13 zones,
 * accurately reflecting 'proportional', 'split-reference', or 'equal-distribution' allocations.
 */
export declare function computeDockPreviewRect(options: PreviewRectOptions): RectBox | null;
