import type { ColumnName, GhostTab, HiddenTab, Orientation, ViewOrientationSetting, ViewSettings } from '../core/types.js';
export declare const PTMT_DOCK_SCHEMA_VERSION: 1;
export declare const enum DockFeature {
    None = 0,
    Closable = 1,
    Movable = 2,
    Floatable = 4,
    Pinnable = 8,
    Maximizable = 16,
    Collapsible = 32,
    AllFeatures = 63
}
export declare const enum DockConfigFlags {
    None = 0,
    OpaqueSplitterResize = 1,
    OpaqueUndocking = 2,
    AlwaysShowTabs = 4,
    ShowTabCloseButton = 8,
    ActiveTabHasCloseButton = 16,
    MiddleMouseButtonClosesTab = 32,
    DockAreaHasPinButton = 64,
    DockAreaHasUndockButton = 128,
    DockAreaHasMaximizeButton = 256,
    DockAreaHasCloseButton = 512,
    DockAreaHasTabsMenuButton = 1024,
    DockAreaHasWrapToggleButton = 2048,
    EnableAutoHide = 4096,
    EnableFullscreen = 8192,
    EnableTabGroups = 16384,
    PersistTabGroups = 32768,
    FloatableTabs = 65536,
    PinnableTabs = 131072,
    DefaultConfig = 261607
}
export type DockPlacementState = 'docked' | 'floating' | 'pinned-hidden' | 'pinned-shown' | 'hidden' | 'unassigned';
export type AutoHideSide = 'left' | 'right' | 'top' | 'bottom';
export declare const AUTO_HIDE_SIDES: readonly AutoHideSide[];
export type DockInnerZone = 'center' | 'left' | 'right' | 'top' | 'bottom';
export type DockOuterZone = 'outer-left' | 'outer-right' | 'outer-top' | 'outer-bottom';
export type DockExistingZone = 'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom';
export type DockZone = DockInnerZone | DockOuterZone | DockExistingZone;
export type DockingSizeStrategy = 'proportional' | 'split-reference' | 'equal-distribution';
export type TabStripOverflowMode = 'scroll' | 'wrap';
export declare function hasDockFeature(mask: DockFeature, feature: DockFeature): boolean;
export declare function hasDockConfigFlag(mask: DockConfigFlags, flag: DockConfigFlags): boolean;
export declare function isOuterDockZone(zone: DockZone): zone is DockOuterZone;
export declare function isExistingDockZone(zone: DockZone): zone is DockExistingZone;
export declare function zoneDirection(zone: DockZone): 'left' | 'right' | 'top' | 'bottom' | 'center';
export declare function splitOrientationForZone(zone: DockZone): Orientation;
export declare function isInsertBeforeZone(zone: DockZone): boolean;
export interface DockTabDescriptor {
    panelId: string;
    sourceId: string | null;
    title: string;
    icon: string | null;
    color: string | null;
    collapsed: boolean;
    features: DockFeature;
    badge: string | number | null;
    lockedToPane: string | null;
    placement: DockPlacementState;
    isDefault?: boolean;
    customContent?: string | null;
    customData?: Record<string, unknown>;
}
export interface DockPaneState {
    type: 'pane';
    id: string;
    tabs: string[];
    activeTabId: string | null;
    selectedTabIds: string[];
    viewSettings: ViewSettings;
    flexRatio: number;
    lastFlexRatio: number | null;
    isCollapsed: boolean;
    overflowMode: TabStripOverflowMode;
    lockedName?: string | null;
    hideFullscreenButton?: boolean;
}
export interface DockSplitState {
    type: 'split';
    id: string;
    orientation: Orientation;
    naturalOrientation: Orientation;
    orientationExpanded: ViewOrientationSetting;
    orientationCollapsed: ViewOrientationSetting;
    children: DockNodeState[];
    ratios: number[];
    flexRatio: number;
    lastFlexRatio: number | null;
    isCollapsed: boolean;
}
export type DockNodeState = DockPaneState | DockSplitState;
export interface DockColumnModel {
    name: ColumnName;
    visible: boolean;
    collapsed: boolean;
    flexRatio: number;
    lastFlexRatio: number | null;
    maxLayers: number;
    root: DockNodeState | null;
    ghostTabs: GhostTab[];
}
export interface DockFloatingGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface DockFloatingContainerModel {
    id: string;
    root: DockNodeState;
    geometry: DockFloatingGeometry;
    zIndex: number;
    windowMaximized: boolean;
    maximizedPaneId: string | null;
    noDocking?: boolean;
    originColumn?: ColumnName;
    originPaneId?: string | null;
    originalViewSettings?: Partial<ViewSettings>;
}
export interface DockRestoreAnchor {
    panelIds: string[];
    sourceIds: string[];
    column: ColumnName;
    isCenter: boolean;
}
export interface DockRestoreLocation {
    kind: 'pane' | 'split';
    orientation?: Orientation;
    column: ColumnName;
    index: number;
    siblings: DockRestoreAnchor[];
    ratios: number[];
}
export interface DockSidebarEntry {
    panelId: string;
    sourceId: string | null;
    side: AutoHideSide;
    width: number;
    height: number;
    returnColumn: ColumnName;
    returnPaneId: string | null;
    tabGroupPeerIds: string[];
    restoreLocations: DockRestoreLocation[];
    expandedTabs?: string[];
}
export interface DockSidebarRailModel {
    side: AutoHideSide;
    entries: DockSidebarEntry[];
    activePanelId: string | null;
}
export interface DockSidebarBehavior {
    autoShowOnHover: boolean;
    keepOpen: boolean;
    animationsEnabled: boolean;
    hoverDelayMs: number;
    hideDelayMs: number;
    switchDelayMs: number;
}
export interface DockWorkspaceModel {
    schemaVersion: number;
    applicationVersion: number;
    configFlags: DockConfigFlags;
    dockingSizeStrategy: DockingSizeStrategy;
    tabStripOverflowMode: TabStripOverflowMode;
    showIconsOnly: boolean;
    autoOpenFirstCenterTab: boolean;
    maximizedPaneId: string | null;
    columns: Record<ColumnName, DockColumnModel>;
    floating: DockFloatingContainerModel[];
    sidebars: Record<AutoHideSide, DockSidebarRailModel>;
    sidebarBehavior: DockSidebarBehavior;
    hiddenTabs: HiddenTab[];
    perspectives: Record<string, string>;
}
export interface DockRestoreResult {
    ok: boolean;
    warnings: string[];
}
export interface SerializedDockExtensionState {
    schemaVersion: number;
    dockingSizeStrategy: DockingSizeStrategy;
    tabStripOverflowMode: TabStripOverflowMode;
    configFlags: number;
    maximizedPaneId: string | null;
    floating: DockFloatingContainerModel[];
    sidebars: Record<AutoHideSide, DockSidebarRailModel>;
    sidebarBehavior: DockSidebarBehavior;
    tabs: Record<string, Omit<DockTabDescriptor, 'placement'>>;
    perspectives: Record<string, string>;
}
export type DockTabPlacementInfo = {
    kind: 'column';
    column: ColumnName;
    pane: DockPaneState;
    index: number;
} | {
    kind: 'floating';
    container: DockFloatingContainerModel;
    pane: DockPaneState;
    index: number;
} | {
    kind: 'sidebar';
    side: AutoHideSide;
    entry: DockSidebarEntry;
    index: number;
} | {
    kind: 'hidden';
    hiddenTab: HiddenTab;
    index: number;
};
export interface DockPaneLookupResult {
    containerKind: 'column' | 'floating';
    column?: ColumnName;
    container?: DockFloatingContainerModel;
    pane: DockPaneState;
    parentSplit: DockSplitState | null;
    depth: number;
}
