import type { Orientation } from '../core/types.js';
export interface ResizerController {
    detach(): void;
}
export declare function invalidatePaneTabSizeCache(pane: HTMLElement | null | undefined): void;
export declare const resizerControllers: WeakMap<Element, ResizerController>;
export declare function checkPaneForIconMode(pane: Element | null | undefined): void;
export declare function detachResizer(resizer: Element): void;
export declare function attachResizer(resizer: HTMLElement | null | undefined, orientation?: Orientation | 'v' | 'h'): void;
export declare function attachColumnResizer(resizer: HTMLElement | null | undefined): void;
export declare function setSplitOrientation(splitElement: HTMLElement | null | undefined, newOrientation: Orientation): void;
export declare function updateResizerDisabledStates(): void;
export declare function validateAndCorrectAllMinSizes(isResize?: boolean): void;
/**
 * Initializes a ResizeObserver on the main container to detect size changes
 * and trigger layout recalculations. This replaces the window 'resize' listener
 * for better efficiency and to detect internal UI changes.
 */
export declare function initGlobalResizeObserver(): void;
