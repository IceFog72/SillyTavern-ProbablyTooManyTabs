export interface ChildExpansionInfo {
    element: HTMLElement | null;
    sizes: number[] | null;
    smallestIndex: number;
}
export declare const pxToPercent: (px: number, total: number) => number;
export declare function parseFlexBasis(flexString: string | null | undefined): number | null;
export declare function getBasis(col: HTMLElement | null | undefined, useLastFlex?: boolean): number;
export declare function setFlexBasisPercent(elem: HTMLElement | null | undefined, percent: number, grow?: number, shrink?: number): void;
export declare function applyIntelligentExpansion(element: HTMLElement | null, newTotalSize: number, childInfo: ChildExpansionInfo | null | undefined): void;
/**
 * Pre-compute all bounding rects for splits in a subtree.
 * Batches DOM reads to prevent thrashing during drag operations.
 * Call once at the start of resize to amortize layout reads across the operation.
 */
export declare function buildMeasurementCache(root: Element | null): Map<Element, DOMRect>;
export declare function recalculateAllSplitsRecursively(root?: Element | null): void;
/**
 * Batch recalculate multiple subtrees in a single pass with shared measurement cache.
 * Useful for onDragMove which needs to recalculate both sides of a resize.
 */
export declare function recalculateMultipleSubtreesOptimized(roots: Array<Element | null>): void;
export declare function recalculateSplitSizes(split: HTMLElement | null, actor?: HTMLElement | null, cache?: Map<Element, DOMRect> | null): void;
export declare function normalizeFlexBasis(activeColumns: HTMLElement[], targetTotal?: number, actor?: HTMLElement | null): void;
