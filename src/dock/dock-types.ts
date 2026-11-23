// dock-types.ts - Unified types for the PTMT Dock Engine (synthesizing lace-ts, dock-spawn-ts, and PTMT)

import type {
    ColumnName,
    GhostTab,
    HiddenTab,
    Orientation,
    ViewOrientationSetting,
    ViewSettings,
} from '../core/types.js';

export const PTMT_DOCK_SCHEMA_VERSION = 1 as const;

export const enum DockFeature {
    None = 0,
    Closable = 1 << 0,
    Movable = 1 << 1,
    Floatable = 1 << 2,
    Pinnable = 1 << 3,
    Maximizable = 1 << 4,
    Collapsible = 1 << 5,
    AllFeatures = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5),
}

export const enum DockConfigFlags {
    None = 0,
    OpaqueSplitterResize = 1 << 0,
    OpaqueUndocking = 1 << 1,
    AlwaysShowTabs = 1 << 2,
    ShowTabCloseButton = 1 << 3,
    ActiveTabHasCloseButton = 1 << 4,
    MiddleMouseButtonClosesTab = 1 << 5,
    DockAreaHasPinButton = 1 << 6,
    DockAreaHasUndockButton = 1 << 7,
    DockAreaHasMaximizeButton = 1 << 8,
    DockAreaHasCloseButton = 1 << 9,
    DockAreaHasTabsMenuButton = 1 << 10,
    DockAreaHasWrapToggleButton = 1 << 11,
    EnableAutoHide = 1 << 12,
    EnableFullscreen = 1 << 13,
    EnableTabGroups = 1 << 14,
    PersistTabGroups = 1 << 15,
    FloatableTabs = 1 << 16,
    PinnableTabs = 1 << 17,
    DefaultConfig = (1 << 0)
        | (1 << 1)
        | (1 << 2)
        | (1 << 5)
        | (1 << 6)
        | (1 << 7)
        | (1 << 8)
        | (1 << 10)
        | (1 << 11)
        | (1 << 12)
        | (1 << 13)
        | (1 << 14)
        | (1 << 15)
        | (1 << 16)
        | (1 << 17),
}

export type DockPlacementState =
    | 'docked'
    | 'floating'
    | 'pinned-hidden'
    | 'pinned-shown'
    | 'hidden'
    | 'unassigned';

export type AutoHideSide = 'left' | 'right' | 'top' | 'bottom';

export const AUTO_HIDE_SIDES: readonly AutoHideSide[] = ['left', 'right', 'top', 'bottom'] as const;

export type DockInnerZone = 'center' | 'left' | 'right' | 'top' | 'bottom';
export type DockOuterZone = 'outer-left' | 'outer-right' | 'outer-top' | 'outer-bottom';
export type DockExistingZone = 'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom';
export type DockZone = DockInnerZone | DockOuterZone | DockExistingZone;

export type DockingSizeStrategy = 'proportional' | 'split-reference' | 'equal-distribution';
export type TabStripOverflowMode = 'scroll' | 'wrap';

export function hasDockFeature(mask: DockFeature, feature: DockFeature): boolean {
    return (mask & feature) === feature;
}

export function hasDockConfigFlag(mask: DockConfigFlags, flag: DockConfigFlags): boolean {
    return (mask & flag) === flag;
}

export function isOuterDockZone(zone: DockZone): zone is DockOuterZone {
    return zone === 'outer-left' || zone === 'outer-right' || zone === 'outer-top' || zone === 'outer-bottom';
}

export function isExistingDockZone(zone: DockZone): zone is DockExistingZone {
    return zone === 'existing-left' || zone === 'existing-right' || zone === 'existing-top' || zone === 'existing-bottom';
}

export function zoneDirection(zone: DockZone): 'left' | 'right' | 'top' | 'bottom' | 'center' {
    switch (zone) {
        case 'left':
        case 'outer-left':
        case 'existing-left':
            return 'left';
        case 'right':
        case 'outer-right':
        case 'existing-right':
            return 'right';
        case 'top':
        case 'outer-top':
        case 'existing-top':
            return 'top';
        case 'bottom':
        case 'outer-bottom':
        case 'existing-bottom':
            return 'bottom';
        default:
            return 'center';
    }
}

export function splitOrientationForZone(zone: DockZone): Orientation {
    const dir = zoneDirection(zone);
    // In PTMT, 'vertical' splits place children side-by-side (left/right) with a vertical splitter bar,
    // and 'horizontal' splits stack children top-to-bottom with a horizontal splitter bar.
    return dir === 'top' || dir === 'bottom' ? 'horizontal' : 'vertical';
}

export function isInsertBeforeZone(zone: DockZone): boolean {
    const dir = zoneDirection(zone);
    return dir === 'left' || dir === 'top';
}

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

export type DockTabPlacementInfo =
    | { kind: 'column'; column: ColumnName; pane: DockPaneState; index: number }
    | { kind: 'floating'; container: DockFloatingContainerModel; pane: DockPaneState; index: number }
    | { kind: 'sidebar'; side: AutoHideSide; entry: DockSidebarEntry; index: number }
    | { kind: 'hidden'; hiddenTab: HiddenTab; index: number };

export interface DockPaneLookupResult {
    containerKind: 'column' | 'floating';
    column?: ColumnName;
    container?: DockFloatingContainerModel;
    pane: DockPaneState;
    parentSplit: DockSplitState | null;
    depth: number;
}
