import type { GhostTab, PTMTAPI } from '../core/types.js';
export interface PendingTabInfo extends Partial<GhostTab> {
    title?: string;
    icon?: string;
}
export declare const getTabIdentifier: (tabInfo: PendingTabInfo) => string | null;
export declare function updatePendingTabColumn(tabInfo: PendingTabInfo, newColumn: string): void;
export declare function initPendingTabsManager(allGhostTabs: PendingTabInfo[]): void;
export declare function initDemotionObserver(_api?: PTMTAPI): void;
