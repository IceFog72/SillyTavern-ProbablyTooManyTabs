import { Signal } from './signal.js';
import { DockConfigFlags, DockFeature, type AutoHideSide, type DockFloatingGeometry, type DockingSizeStrategy, type DockPaneLookupResult, type DockPaneState, type DockRestoreLocation, type DockRestoreResult, type DockSidebarBehavior, type DockTabDescriptor, type DockTabPlacementInfo, type DockWorkspaceModel, type DockZone, type TabStripOverflowMode } from './dock-types.js';
import type { ColumnName, LayoutSnapshot, ViewSettings } from '../core/types.js';
export declare const DEFAULT_VIEW_SETTINGS: ViewSettings;
export interface DockEngineOptions {
    applicationVersion?: number;
    configFlags?: DockConfigFlags;
    dockingSizeStrategy?: DockingSizeStrategy;
    tabStripOverflowMode?: TabStripOverflowMode;
    autoOpenFirstCenterTab?: boolean;
    maxLayers?: Partial<Record<ColumnName, number>>;
}
export interface DockTabRegistrationInput {
    panelId: string;
    sourceId?: string | null;
    title?: string | null;
    icon?: string | null;
    color?: string | null;
    collapsed?: boolean;
    features?: DockFeature;
    badge?: string | number | null;
    lockedToPane?: string | null;
    isDefault?: boolean;
    customContent?: string | null;
    customData?: Record<string, unknown>;
}
export interface DockOperationOptions {
    index?: number | null;
    ratio?: number;
    column?: ColumnName;
    reuseSameOrientationSplit?: boolean;
    activate?: boolean;
}
export interface DockEngineSignals {
    stateChanged: Signal<readonly [reason: string]>;
    configFlagsChanged: Signal<readonly [flags: DockConfigFlags]>;
    tabRegistered: Signal<readonly [tab: DockTabDescriptor]>;
    tabUnregistered: Signal<readonly [panelId: string]>;
    tabActivated: Signal<readonly [panelId: string, paneId: string]>;
    tabCollapsedChanged: Signal<readonly [panelId: string, collapsed: boolean]>;
    paneCollapsedChanged: Signal<readonly [paneId: string, collapsed: boolean]>;
    paneMaximizedChanged: Signal<readonly [paneId: string | null]>;
    tabFloated: Signal<readonly [panelIds: readonly string[], containerId: string]>;
    containerDocked: Signal<readonly [containerId: string, targetPaneId: string]>;
    containersMerged: Signal<readonly [sourceId: string, targetId: string]>;
    tabPinnedChanged: Signal<readonly [panelId: string, side: AutoHideSide | null]>;
    sidebarActiveChanged: Signal<readonly [side: AutoHideSide, panelId: string | null]>;
    perspectivesChanged: Signal<readonly []>;
    stateRestored: Signal<readonly [result: DockRestoreResult]>;
}
export declare class DockEngine {
    #private;
    readonly signals: DockEngineSignals;
    constructor(options?: DockEngineOptions);
    get configFlags(): DockConfigFlags;
    setConfigFlags(flags: DockConfigFlags): void;
    setConfigFlag(flag: DockConfigFlags, enabled: boolean): void;
    testConfigFlag(flag: DockConfigFlags): boolean;
    get dockingSizeStrategy(): DockingSizeStrategy;
    setDockingSizeStrategy(strategy: DockingSizeStrategy): void;
    get tabStripOverflowMode(): TabStripOverflowMode;
    setTabStripOverflowMode(mode: TabStripOverflowMode, paneId?: string): void;
    get autoOpenFirstCenterTab(): boolean;
    setAutoOpenFirstCenterTab(enabled: boolean): void;
    setColumnMaxLayers(column: ColumnName, maxLayers: number): void;
    batch<T>(reason: string, fn: () => T): T;
    snapshotModel(): DockWorkspaceModel;
    registerTab(input: DockTabRegistrationInput): DockTabDescriptor;
    updateTab(panelId: string, patch: Partial<Omit<DockTabDescriptor, 'panelId'>>): DockTabDescriptor | null;
    unregisterTab(panelId: string): boolean;
    getTab(panelId: string): DockTabDescriptor | null;
    getTabBySourceId(sourceId: string): DockTabDescriptor | null;
    listTabs(): DockTabDescriptor[];
    findTabPlacement(panelId: string): DockTabPlacementInfo | null;
    findPane(paneId: string): DockPaneLookupResult | null;
    findExistingNeighborPanes(paneId: string): Partial<Record<'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom', DockPaneState>>;
    toggleTabSelection(panelId: string, additive?: boolean): string[];
    getSelectedTabs(paneId: string): string[];
    clearTabSelection(paneId?: string): void;
    activateTab(panelId: string): boolean;
    setTabCollapsed(panelId: string, collapsed: boolean): boolean;
    closeTab(panelId: string): boolean;
    setPaneCollapsed(paneId: string, collapsed: boolean): boolean;
    /**
     * Docks a single tab into a target pane or column using any of the 13 DockZones:
     * - 'center': adds/reorders tab inside targetPane
     * - 'left' | 'right' | 'top' | 'bottom': splits targetPane (or inserts into same-orientation parent split)
     * - 'outer-left' | 'outer-right' | 'outer-top' | 'outer-bottom': docks at the root of the column
     * - 'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom': moves into adjacent sibling pane
     */
    dockTab(panelId: string, targetPaneId: string | null, zone?: DockZone, options?: DockOperationOptions): string | null;
    /**
     * Docks one or more tabs together (preserving relative tab order) into a target pane, split, or outer column edge.
     */
    dockTabGroup(panelIds: readonly string[], targetPaneId: string | null, zone?: DockZone, options?: DockOperationOptions & {
        activePanelId?: string;
    }): string | null;
    floatTab(panelId: string, geometry?: Partial<DockFloatingGeometry>): string | null;
    floatTabGroup(panelIds: readonly string[], geometry?: Partial<DockFloatingGeometry>, activePanelId?: string): string | null;
    floatPane(paneId: string, geometry?: Partial<DockFloatingGeometry>): string | null;
    /**
     * Merges `sourceContainerId` into `targetContainerId` (from dock-spawn-ts `mergeDialogs`),
     * combining their tabs and keeping the dragged container's active tab selected.
     */
    mergeFloatingContainers(sourceContainerId: string, targetContainerId: string): boolean;
    /**
     * Docks an entire floating container (single pane, tab group, or nested split tree)
     * back into a column pane or outer column edge (from lace-ts `dockFloatingContainer`).
     */
    dockFloatingContainer(containerId: string, targetPaneId?: string | null, zone?: DockZone, column?: ColumnName): string | null;
    setFloatingGeometry(containerId: string, geometry: Partial<DockFloatingGeometry>, emit?: boolean): boolean;
    setFloatingMaximized(containerId: string, maximized: boolean): boolean;
    bringFloatingToFront(containerId: string): boolean;
    /**
     * Enables or disables floating tab groups at runtime (from dock-spawn-ts `setTabGroupsEnabled`).
     * Disabling splits any multi-tab floating windows into individual floating windows.
     */
    setTabGroupsEnabled(enabled: boolean): void;
    /**
     * Infers the natural auto-hide edge ('left' | 'right' | 'top' | 'bottom') for a panel
     * based on its column and split orientation relative to the center workspace.
     */
    inferAutoHideSide(panelId: string): AutoHideSide;
    /**
     * Captures the ancestor split/pane anchor chain for a panel before pinning to a sidebar
     * (modeled on dock-spawn-ts `AutoHideManager.captureLocations`), allowing `unpinFromSidebar`
     * to reconstruct the exact nested dock position, tab order, and split ratios later.
     */
    captureRestoreLocations(panelId: string): DockRestoreLocation[];
    pinToSidebar(panelId: string, preferredSide?: AutoHideSide, initialSize?: {
        width?: number;
        height?: number;
    }): AutoHideSide | null;
    /**
     * Unpins a panel from its auto-hide sidebar rail and restores it to its previous dock location
     * using anchor-based layout history (`DockRestoreLocation[]`), falling back to surviving tab-group
     * peers or the origin column.
     */
    unpinFromSidebar(panelId: string): string | null;
    floatFromSidebar(panelId: string, geometry?: Partial<DockFloatingGeometry>): string | null;
    activateSidebarPanel(panelId: string | null, toggle?: boolean): void;
    setSidebarOverlaySize(panelId: string, size: {
        width?: number;
        height?: number;
    }): boolean;
    getSidebarBehavior(): DockSidebarBehavior;
    setSidebarBehavior(patch: Partial<DockSidebarBehavior>): void;
    /**
     * Enables or disables auto-hide at runtime (from dock-spawn-ts `setAutoHideEnabled`).
     * Disabling unpins all collapsed sidebar panels back into their docked positions.
     */
    setAutoHideEnabled(enabled: boolean): void;
    get maximizedPaneId(): string | null;
    maximizePane(paneId: string | null): boolean;
    setFullscreenEnabled(enabled: boolean): void;
    setSplitRatios(splitId: string, ratios: readonly number[], emit?: boolean): boolean;
    setColumnRatios(ratios: Partial<Record<ColumnName, number>>, emit?: boolean): void;
    setColumnVisibility(column: ColumnName, visible: boolean): void;
    savePerspective(name: string): void;
    openPerspective(name: string): DockRestoreResult;
    removePerspective(name: string): boolean;
    listPerspectives(): string[];
    toLayoutSnapshot(): LayoutSnapshot;
    fromLayoutSnapshot(snapshot: LayoutSnapshot): DockRestoreResult;
}
