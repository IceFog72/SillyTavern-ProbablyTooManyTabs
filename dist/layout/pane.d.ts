import type { Orientation, ViewSettings } from '../core/types.js';
export declare const MAX_PANE_LAYERS: 3;
export declare const NARROW_PANE_THRESHOLD_PX: 120;
export declare function findPreferredDescendentOrientation(element: Element | null | undefined): Orientation | null;
export declare function applySplitOrientation(split: HTMLElement | null | undefined): void;
export declare function createPane(initialSettings?: Partial<ViewSettings>, options?: {
    deferInitialCheck?: boolean;
}): HTMLDivElement;
export declare function getPaneLayerCount(pane: HTMLElement | null | undefined): number;
export declare function getParentSplitOrientation(pane: HTMLElement | null | undefined): Orientation | null;
export declare function applyPaneOrientation(pane: HTMLElement | null | undefined): void;
export declare function setPaneCollapsedView(pane: HTMLElement | null | undefined, collapsed: boolean): void;
export declare function cleanupPaneObservers(pane: HTMLElement | null | undefined): void;
export declare function removePaneIfEmpty(pane: HTMLElement | null | undefined, depth?: number): void;
export declare function splitPaneWithPane(targetPane: HTMLElement | null | undefined, movingPanel: HTMLElement | null | undefined, vertical?: boolean, newFirst?: boolean): void;
export declare function checkAndCollapsePaneIfAllTabsCollapsed(pane: HTMLElement | null | undefined): void;
export declare function updateSplitCollapsedState(split: HTMLElement | null | undefined): void;
export declare function openViewSettingsDialog(pane: HTMLElement | null | undefined): void;
/**
 * Apply or remove icons-only mode visual styling to a pane
 */
export declare function applyIconsOnly(pane: HTMLElement | null | undefined, enabled: boolean): void;
/**
 * Toggle icons-only mode for a pane
 */
export declare function toggleIconsOnly(pane: HTMLElement | null | undefined): void;
