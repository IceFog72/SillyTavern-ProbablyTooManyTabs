import type { ColumnName } from '../core/types.js';
export interface CreateTabOptions {
    title?: string | null;
    icon?: string | null;
    makeActive?: boolean;
    setAsDefault?: boolean;
    sourceId?: string | null;
    collapsed?: boolean;
    color?: string | null;
}
export interface TabSummary {
    id: string | undefined;
    title: string;
    collapsed: boolean;
    panel: HTMLElement | null;
}
export declare const registerPanelDom: (panelEl: HTMLElement, title?: string) => string;
export declare const getPaneForPanel: (panelEl: Element | null) => HTMLElement | null;
export declare const getActivePane: () => HTMLElement | null;
export declare function createPanelElement(title?: string): HTMLDivElement;
export declare function setTabCollapsed(pid: string | undefined, collapsed: boolean, skipEvent?: boolean): void;
export declare function createTabElement(title: string, pid: string, icon?: string | null, options?: {
    collapsed?: boolean;
    color?: string | null;
}): HTMLDivElement;
export declare function setActivePanelInPane(pane: HTMLElement | null | undefined, pid?: string | null, preserveCollapsedState?: boolean): boolean;
export declare function isTabHidden(sourceId: string | null | undefined): boolean;
export declare function openTab(pid: string | null | undefined): boolean;
export declare function closeTabById(pid: string): boolean;
export declare function destroyTabById(pid: string): boolean;
export declare function createTabFromContent(content: string | HTMLElement, options?: CreateTabOptions, target?: HTMLElement | ColumnName | string | null): HTMLElement | null;
export declare function moveTabIntoPaneAtIndex(panel: HTMLElement, pane: HTMLElement, index: number | null): void;
export declare function listTabs(): TabSummary[];
export declare function moveNodeIntoTab(nodeId: string, targetPanelId: string): boolean;
export declare function setDefaultPanelById(pid: string): void;
