// dock-engine.ts - Pure DOM-free Docking State & Layout Engine for PTMT
// Synthesizes lace-ts (pure model, signals, perspectives, floating trees, sidebars),
// dock-spawn-ts (anchor-based auto-hide restore history, reference/equal sizing strategies,
// tab group moving/merging, fullscreen maximize, scroll/wrap tab strip mode),
// and PTMT (3-column workspace, collapsible panes/splits, viewSettings, ghost/hidden tabs, v28 snapshot bridge).

import { Signal } from './signal.js';
import {
    AUTO_HIDE_SIDES,
    DockConfigFlags,
    DockFeature,
    hasDockConfigFlag,
    hasDockFeature,
    isExistingDockZone,
    isInsertBeforeZone,
    isOuterDockZone,
    PTMT_DOCK_SCHEMA_VERSION,
    splitOrientationForZone,
    zoneDirection,
    type AutoHideSide,
    type DockColumnModel,
    type DockFloatingContainerModel,
    type DockFloatingGeometry,
    type DockingSizeStrategy,
    type DockNodeState,
    type DockPaneLookupResult,
    type DockPaneState,
    type DockPlacementState,
    type DockRestoreAnchor,
    type DockRestoreLocation,
    type DockRestoreResult,
    type DockSidebarBehavior,
    type DockSidebarEntry,
    type DockSidebarRailModel,
    type DockSplitState,
    type DockTabDescriptor,
    type DockTabPlacementInfo,
    type DockWorkspaceModel,
    type DockZone,
    type SerializedDockExtensionState,
    type TabStripOverflowMode,
} from './dock-types.js';
import {
    clamp,
    clampFloatingGeometry,
    formatFlexPercentage,
    insertRatioWithStrategy,
    normalizeRatios,
    parseFlexRatioFromFlexString,
    removeRatiosByIndex,
} from './dock-math.js';
import type {
    ColumnName,
    GhostTab,
    HiddenTab,
    LayoutNode,
    LayoutSnapshot,
    Orientation,
    PaneNode,
    SplitNode,
    TabData,
    ViewOrientationSetting,
    ViewSettings,
} from '../core/types.js';

const COLUMN_NAMES: readonly ColumnName[] = ['left', 'center', 'right'] as const;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
    minimalPanelSize: 100,
    defaultOrientation: 'auto',
    collapsedOrientation: 'auto',
    contentFlow: 'default',
    tabStripMode: 'normal',
    iconOnly: false,
    appliedOrientation: null,
    lastExpandedOrientation: null,
};

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

export class DockEngine {
    readonly signals: DockEngineSignals = {
        stateChanged: new Signal(),
        configFlagsChanged: new Signal(),
        tabRegistered: new Signal(),
        tabUnregistered: new Signal(),
        tabActivated: new Signal(),
        tabCollapsedChanged: new Signal(),
        paneCollapsedChanged: new Signal(),
        paneMaximizedChanged: new Signal(),
        tabFloated: new Signal(),
        containerDocked: new Signal(),
        containersMerged: new Signal(),
        tabPinnedChanged: new Signal(),
        sidebarActiveChanged: new Signal(),
        perspectivesChanged: new Signal(),
        stateRestored: new Signal(),
    };

    readonly #tabs = new Map<string, DockTabDescriptor>();
    #model: DockWorkspaceModel;
    #idCounter = 0;
    #floatingZ = 100;
    #batchDepth = 0;
    #pendingReason: string | null = null;
    #restoring = false;

    constructor(options: DockEngineOptions = {}) {
        const maxLayers = options.maxLayers ?? {};
        this.#model = {
            schemaVersion: PTMT_DOCK_SCHEMA_VERSION,
            applicationVersion: options.applicationVersion ?? 28,
            configFlags: options.configFlags ?? DockConfigFlags.DefaultConfig,
            dockingSizeStrategy: options.dockingSizeStrategy ?? 'split-reference',
            tabStripOverflowMode: options.tabStripOverflowMode ?? 'scroll',
            showIconsOnly: false,
            autoOpenFirstCenterTab: options.autoOpenFirstCenterTab ?? true,
            maximizedPaneId: null,
            columns: {
                left: this.#createDefaultColumn('left', true, 0.2, maxLayers.left ?? 3),
                center: this.#createDefaultColumn('center', true, 0.6, maxLayers.center ?? 3),
                right: this.#createDefaultColumn('right', true, 0.2, maxLayers.right ?? 3),
            },
            floating: [],
            sidebars: {
                left: { side: 'left', entries: [], activePanelId: null },
                right: { side: 'right', entries: [], activePanelId: null },
                top: { side: 'top', entries: [], activePanelId: null },
                bottom: { side: 'bottom', entries: [], activePanelId: null },
            },
            sidebarBehavior: {
                autoShowOnHover: true,
                keepOpen: false,
                animationsEnabled: true,
                hoverDelayMs: 150,
                hideDelayMs: 400,
                switchDelayMs: 150,
            },
            hiddenTabs: [],
            perspectives: {},
        };
    }

    // ─── Configuration & Batching ───────────────────────────────────────────

    get configFlags(): DockConfigFlags {
        return this.#model.configFlags;
    }

    setConfigFlags(flags: DockConfigFlags): void {
        if (this.#model.configFlags === flags) return;
        this.#model.configFlags = flags;
        this.signals.configFlagsChanged.emit(flags);
        this.#emitChanged('configFlagsChanged');
    }

    setConfigFlag(flag: DockConfigFlags, enabled: boolean): void {
        const next = enabled ? (this.#model.configFlags | flag) : (this.#model.configFlags & ~flag);
        this.setConfigFlags(next);
    }

    testConfigFlag(flag: DockConfigFlags): boolean {
        return hasDockConfigFlag(this.#model.configFlags, flag);
    }

    get dockingSizeStrategy(): DockingSizeStrategy {
        return this.#model.dockingSizeStrategy;
    }

    setDockingSizeStrategy(strategy: DockingSizeStrategy): void {
        if (this.#model.dockingSizeStrategy === strategy) return;
        this.#model.dockingSizeStrategy = strategy;
        this.#emitChanged('dockingSizeStrategyChanged');
    }

    get tabStripOverflowMode(): TabStripOverflowMode {
        return this.#model.tabStripOverflowMode;
    }

    setTabStripOverflowMode(mode: TabStripOverflowMode, paneId?: string): void {
        if (mode !== 'scroll' && mode !== 'wrap') throw new Error(`Invalid tab strip overflow mode: ${String(mode)}`);
        this.batch('tabStripOverflowModeChanged', () => {
            if (paneId) {
                const lookup = this.findPane(paneId);
                if (lookup) {
                    lookup.pane.overflowMode = mode;
                    this.#emitChanged('tabStripOverflowModeChanged');
                }
                return;
            }
            this.#model.tabStripOverflowMode = mode;
            this.#walkAllPanes((pane) => {
                pane.overflowMode = mode;
            });
            this.#emitChanged('tabStripOverflowModeChanged');
        });
    }

    get autoOpenFirstCenterTab(): boolean {
        return this.#model.autoOpenFirstCenterTab;
    }

    setAutoOpenFirstCenterTab(enabled: boolean): void {
        this.#model.autoOpenFirstCenterTab = enabled;
    }

    setColumnMaxLayers(column: ColumnName, maxLayers: number): void {
        this.#model.columns[column].maxLayers = Math.max(1, Math.round(maxLayers));
    }

    batch<T>(reason: string, fn: () => T): T {
        this.#batchDepth += 1;
        try {
            return fn();
        } finally {
            this.#batchDepth -= 1;
            if (this.#batchDepth === 0) {
                this.#flushChanged(reason);
            }
        }
    }

    snapshotModel(): DockWorkspaceModel {
        return structuredClone(this.#model);
    }

    // ─── Tab Registry & Lookup ──────────────────────────────────────────────

    registerTab(input: DockTabRegistrationInput): DockTabDescriptor {
        const existing = this.#tabs.get(input.panelId);
        if (existing) {
            if (input.sourceId !== undefined) existing.sourceId = input.sourceId;
            if (input.title !== undefined && input.title !== null) existing.title = input.title;
            if (input.icon !== undefined) existing.icon = input.icon;
            if (input.color !== undefined) existing.color = input.color;
            if (input.collapsed !== undefined) existing.collapsed = input.collapsed;
            if (input.features !== undefined) existing.features = input.features;
            if (input.badge !== undefined) existing.badge = input.badge;
            if (input.lockedToPane !== undefined) existing.lockedToPane = input.lockedToPane;
            if (input.isDefault !== undefined) existing.isDefault = input.isDefault;
            if (input.customContent !== undefined) existing.customContent = input.customContent;
            if (input.customData !== undefined) existing.customData = input.customData;
            return existing;
        }

        const isProtectedPtmtTab = input.sourceId === 'ptmt-settings-wrapper-content'
            || input.sourceId === 'ptmt-info-wrapper-content';
        const defaultFeatures = isProtectedPtmtTab
            ? (DockFeature.AllFeatures & ~DockFeature.Closable)
            : DockFeature.AllFeatures;

        const descriptor: DockTabDescriptor = {
            panelId: input.panelId,
            sourceId: input.sourceId ?? null,
            title: input.title || input.sourceId || input.panelId,
            icon: input.icon ?? null,
            color: input.color ?? null,
            collapsed: input.collapsed ?? false,
            features: input.features ?? defaultFeatures,
            badge: input.badge ?? null,
            lockedToPane: input.lockedToPane ?? null,
            placement: 'unassigned',
            isDefault: input.isDefault,
            customContent: input.customContent,
            customData: input.customData,
        };
        this.#tabs.set(descriptor.panelId, descriptor);
        this.signals.tabRegistered.emit(descriptor);
        return descriptor;
    }

    updateTab(panelId: string, patch: Partial<Omit<DockTabDescriptor, 'panelId'>>): DockTabDescriptor | null {
        const tab = this.#tabs.get(panelId);
        if (!tab) return null;
        Object.assign(tab, patch);
        this.#emitChanged('tabUpdated');
        return tab;
    }

    unregisterTab(panelId: string): boolean {
        const tab = this.#tabs.get(panelId);
        if (!tab) return false;
        this.batch('tabUnregistered', () => {
            this.#removeTabFromAllLocations(panelId);
            this.#tabs.delete(panelId);
            this.signals.tabUnregistered.emit(panelId);
            this.#emitChanged('tabUnregistered');
        });
        return true;
    }

    getTab(panelId: string): DockTabDescriptor | null {
        return this.#tabs.get(panelId) ?? null;
    }

    getTabBySourceId(sourceId: string): DockTabDescriptor | null {
        for (const tab of this.#tabs.values()) {
            if (tab.sourceId === sourceId) return tab;
        }
        return null;
    }

    listTabs(): DockTabDescriptor[] {
        return [...this.#tabs.values()];
    }

    findTabPlacement(panelId: string): DockTabPlacementInfo | null {
        for (const colName of COLUMN_NAMES) {
            const col = this.#model.columns[colName];
            const found = this.#findPaneContainingTab(col.root, panelId);
            if (found) {
                return {
                    kind: 'column',
                    column: colName,
                    pane: found,
                    index: found.tabs.indexOf(panelId),
                };
            }
        }
        for (const container of this.#model.floating) {
            const found = this.#findPaneContainingTab(container.root, panelId);
            if (found) {
                return {
                    kind: 'floating',
                    container,
                    pane: found,
                    index: found.tabs.indexOf(panelId),
                };
            }
        }
        for (const side of AUTO_HIDE_SIDES) {
            const rail = this.#model.sidebars[side];
            const index = rail.entries.findIndex((e) => e.panelId === panelId);
            if (index >= 0) {
                return {
                    kind: 'sidebar',
                    side,
                    entry: rail.entries[index],
                    index,
                };
            }
        }
        const hiddenIdx = this.#model.hiddenTabs.findIndex(
            (h) => h.panelId === panelId || (this.#tabs.get(panelId)?.sourceId && h.sourceId === this.#tabs.get(panelId)?.sourceId),
        );
        if (hiddenIdx >= 0) {
            return {
                kind: 'hidden',
                hiddenTab: this.#model.hiddenTabs[hiddenIdx],
                index: hiddenIdx,
            };
        }
        return null;
    }

    findPane(paneId: string): DockPaneLookupResult | null {
        for (const colName of COLUMN_NAMES) {
            const col = this.#model.columns[colName];
            const found = this.#findPaneInTree(col.root, paneId, null, 1);
            if (found) {
                return {
                    containerKind: 'column',
                    column: colName,
                    pane: found.pane,
                    parentSplit: found.parentSplit,
                    depth: found.depth,
                };
            }
        }
        for (const container of this.#model.floating) {
            const found = this.#findPaneInTree(container.root, paneId, null, 1);
            if (found) {
                return {
                    containerKind: 'floating',
                    container,
                    pane: found.pane,
                    parentSplit: found.parentSplit,
                    depth: found.depth,
                };
            }
        }
        return null;
    }

    findExistingNeighborPanes(paneId: string): Partial<Record<'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom', DockPaneState>> {
        const lookup = this.findPane(paneId);
        if (!lookup || !lookup.parentSplit) return {};
        const split = lookup.parentSplit;
        const idx = split.children.findIndex((c) => c.id === paneId || (c.type === 'split' && Boolean(this.#findPaneInTree(c, paneId, null, 1))));
        if (idx < 0) return {};

        const prevPane = idx > 0 ? this.#firstPaneInNode(split.children[idx - 1]) : null;
        const nextPane = idx + 1 < split.children.length ? this.#firstPaneInNode(split.children[idx + 1]) : null;
        const result: Partial<Record<'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom', DockPaneState>> = {};

        // In PTMT, 'vertical' splits place children left-to-right; 'horizontal' splits stack children top-to-bottom.
        if (split.orientation === 'vertical') {
            if (prevPane) result['existing-left'] = prevPane;
            if (nextPane) result['existing-right'] = nextPane;
        } else {
            if (prevPane) result['existing-top'] = prevPane;
            if (nextPane) result['existing-bottom'] = nextPane;
        }
        return result;
    }

    // ─── Multi-Tab Selection (Tab Groups) ───────────────────────────────────

    toggleTabSelection(panelId: string, additive = true): string[] {
        const placement = this.findTabPlacement(panelId);
        if (!placement || (placement.kind !== 'column' && placement.kind !== 'floating')) return [];
        const pane = placement.pane;
        if (!this.testConfigFlag(DockConfigFlags.EnableTabGroups)) {
            pane.selectedTabIds = [panelId];
            return pane.selectedTabIds;
        }
        if (!additive) {
            pane.selectedTabIds = [panelId];
        } else if (pane.selectedTabIds.includes(panelId)) {
            pane.selectedTabIds = pane.selectedTabIds.filter((id) => id !== panelId);
        } else {
            // Preserve pane tab order
            const nextSet = new Set([...pane.selectedTabIds, panelId]);
            pane.selectedTabIds = pane.tabs.filter((id) => nextSet.has(id));
        }
        this.#emitChanged('tabSelectionChanged');
        return [...pane.selectedTabIds];
    }

    getSelectedTabs(paneId: string): string[] {
        const lookup = this.findPane(paneId);
        if (!lookup) return [];
        return lookup.pane.tabs.filter((id) => lookup.pane.selectedTabIds.includes(id));
    }

    clearTabSelection(paneId?: string): void {
        if (paneId) {
            const lookup = this.findPane(paneId);
            if (lookup) lookup.pane.selectedTabIds = [];
            return;
        }
        this.#walkAllPanes((pane) => {
            pane.selectedTabIds = [];
        });
    }

    // ─── Tab Activation, Collapse & Close ───────────────────────────────────

    activateTab(panelId: string): boolean {
        const tab = this.#tabs.get(panelId);
        if (!tab) return false;
        const placement = this.findTabPlacement(panelId);
        if (!placement) return false;

        if (placement.kind === 'sidebar') {
            this.activateSidebarPanel(panelId, false);
            return true;
        }
        if (placement.kind === 'hidden') {
            return false;
        }

        return this.batch('tabActivated', () => {
            const pane = placement.pane;
            pane.activeTabId = panelId;
            pane.isCollapsed = false;

            for (const id of pane.tabs) {
                const peer = this.#tabs.get(id);
                if (!peer) continue;
                const shouldCollapse = id !== panelId;
                if (peer.collapsed !== shouldCollapse) {
                    peer.collapsed = shouldCollapse;
                    this.signals.tabCollapsedChanged.emit(id, shouldCollapse);
                }
            }

            if (placement.kind === 'column') {
                this.#recomputeColumnCollapsedState(placement.column);
            } else if (placement.kind === 'floating') {
                placement.container.zIndex = ++this.#floatingZ;
            }

            this.signals.tabActivated.emit(panelId, pane.id);
            this.#emitChanged('tabActivated');
            return true;
        });
    }

    setTabCollapsed(panelId: string, collapsed: boolean): boolean {
        const tab = this.#tabs.get(panelId);
        if (!tab) return false;
        if (collapsed && !hasDockFeature(tab.features, DockFeature.Collapsible)) return false;

        return this.batch('tabCollapsedChanged', () => {
            const placement = this.findTabPlacement(panelId);
            if (!placement || (placement.kind !== 'column' && placement.kind !== 'floating')) {
                tab.collapsed = collapsed;
                this.signals.tabCollapsedChanged.emit(panelId, collapsed);
                this.#emitChanged('tabCollapsedChanged');
                return true;
            }

            const pane = placement.pane;
            if (!collapsed) {
                return this.activateTab(panelId);
            }

            // Check center column auto-open first tab policy
            if (
                placement.kind === 'column'
                && placement.column === 'center'
                && this.#model.autoOpenFirstCenterTab
            ) {
                const openCenterTabs = this.#collectColumnOpenTabs('center').filter((id) => id !== panelId);
                if (openCenterTabs.length === 0) {
                    const firstCenterTab = this.#collectColumnAllTabs('center')[0];
                    if (firstCenterTab && firstCenterTab !== panelId) {
                        tab.collapsed = true;
                        this.signals.tabCollapsedChanged.emit(panelId, true);
                        this.activateTab(firstCenterTab);
                        return true;
                    } else if (firstCenterTab === panelId) {
                        // Keep the sole center tab open when autoOpenFirstCenterTab is active
                        return true;
                    }
                }
            }

            tab.collapsed = true;
            this.signals.tabCollapsedChanged.emit(panelId, true);

            if (pane.activeTabId === panelId) {
                const nextOpen = pane.tabs.find((id) => id !== panelId && !this.#tabs.get(id)?.collapsed) ?? null;
                pane.activeTabId = nextOpen;
                if (nextOpen) {
                    this.signals.tabActivated.emit(nextOpen, pane.id);
                }
            }

            this.#syncPaneCollapsedFromTabs(pane);
            if (placement.kind === 'column') {
                this.#recomputeColumnCollapsedState(placement.column);
            }
            this.#emitChanged('tabCollapsedChanged');
            return true;
        });
    }

    closeTab(panelId: string): boolean {
        return this.setTabCollapsed(panelId, true);
    }

    setPaneCollapsed(paneId: string, collapsed: boolean): boolean {
        const lookup = this.findPane(paneId);
        if (!lookup) return false;

        return this.batch('paneCollapsedChanged', () => {
            const { pane } = lookup;
            if (collapsed) {
                for (const id of pane.tabs) {
                    const t = this.#tabs.get(id);
                    if (t && !t.collapsed) {
                        t.collapsed = true;
                        this.signals.tabCollapsedChanged.emit(id, true);
                    }
                }
                pane.activeTabId = null;
                pane.isCollapsed = true;
            } else {
                pane.isCollapsed = false;
                const targetId = pane.activeTabId ?? pane.tabs[0] ?? null;
                if (targetId) {
                    this.activateTab(targetId);
                }
            }
            if (lookup.containerKind === 'column' && lookup.column) {
                this.#recomputeColumnCollapsedState(lookup.column);
            }
            this.signals.paneCollapsedChanged.emit(pane.id, pane.isCollapsed);
            this.#emitChanged('paneCollapsedChanged');
            return true;
        });
    }

    // ─── Docking, Splitting & Tab Group Moves ───────────────────────────────

    /**
     * Docks a single tab into a target pane or column using any of the 13 DockZones:
     * - 'center': adds/reorders tab inside targetPane
     * - 'left' | 'right' | 'top' | 'bottom': splits targetPane (or inserts into same-orientation parent split)
     * - 'outer-left' | 'outer-right' | 'outer-top' | 'outer-bottom': docks at the root of the column
     * - 'existing-left' | 'existing-right' | 'existing-top' | 'existing-bottom': moves into adjacent sibling pane
     */
    dockTab(
        panelId: string,
        targetPaneId: string | null,
        zone: DockZone = 'center',
        options: DockOperationOptions = {},
    ): string | null {
        return this.dockTabGroup([panelId], targetPaneId, zone, {
            ...options,
            activePanelId: panelId,
        });
    }

    /**
     * Docks one or more tabs together (preserving relative tab order) into a target pane, split, or outer column edge.
     */
    dockTabGroup(
        panelIds: readonly string[],
        targetPaneId: string | null,
        zone: DockZone = 'center',
        options: DockOperationOptions & { activePanelId?: string } = {},
    ): string | null {
        const validIds = [...new Set(panelIds)].filter((id) => {
            const tab = this.#tabs.get(id);
            return Boolean(tab && hasDockFeature(tab.features, DockFeature.Movable));
        });
        if (validIds.length === 0) return null;

        return this.batch('tabDocked', () => {
            // 1. Handle existing-neighbor zones by redirecting to the neighbor pane's center
            if (isExistingDockZone(zone) && targetPaneId) {
                const neighbors = this.findExistingNeighborPanes(targetPaneId);
                const neighborPane = neighbors[zone];
                if (neighborPane) {
                    return this.dockTabGroup(validIds, neighborPane.id, 'center', options);
                }
                zone = 'center';
            }

            // 2. Resolve target container / column / pane
            const targetLookup = targetPaneId ? this.findPane(targetPaneId) : null;
            const targetColumn: ColumnName = targetLookup?.column ?? options.column ?? 'center';

            // 3. Outer docking: dock at the root of the target column
            if (isOuterDockZone(zone)) {
                return this.#dockGroupAtColumnOuterEdge(validIds, targetColumn, zone, options);
            }

            // Ensure target column has at least one pane if targetLookup is missing
            const resolvedLookup = targetLookup ?? this.#ensureFirstPaneInColumn(targetColumn);
            const targetPane = resolvedLookup.pane;

            // 4. Same-pane reorder when docking to 'center' of the pane that already holds all validIds
            if (zone === 'center' && validIds.every((id) => targetPane.tabs.includes(id))) {
                if (validIds.length === 1 && options.index !== undefined && options.index !== null) {
                    const id = validIds[0];
                    const oldIdx = targetPane.tabs.indexOf(id);
                    if (oldIdx >= 0) {
                        targetPane.tabs.splice(oldIdx, 1);
                        const adjusted = oldIdx < options.index ? options.index - 1 : options.index;
                        const insertAt = clamp(adjusted, 0, targetPane.tabs.length);
                        targetPane.tabs.splice(insertAt, 0, id);
                    }
                }
                const toActivate = options.activePanelId ?? validIds[0];
                if (options.activate !== false && toActivate) {
                    this.activateTab(toActivate);
                }
                this.#emitChanged('tabReordered');
                return targetPane.id;
            }

            // 5. If zone is a split direction, check maxLayers and whether targetPane only has the moving tabs
            if (zone !== 'center') {
                const maxLayers = resolvedLookup.containerKind === 'column' && resolvedLookup.column
                    ? this.#model.columns[resolvedLookup.column].maxLayers
                    : 5;
                const remainingInTarget = targetPane.tabs.filter((id) => !validIds.includes(id));
                if (resolvedLookup.depth >= maxLayers || remainingInTarget.length === 0) {
                    zone = 'center';
                }
            }

            if (zone === 'center') {
                const rawInsertIndex = options.index !== undefined && options.index !== null
                    ? clamp(options.index, 0, targetPane.tabs.length)
                    : targetPane.tabs.length;

                // Adjust index if any moving tabs were already in targetPane before rawInsertIndex
                const removedBefore = targetPane.tabs
                    .slice(0, rawInsertIndex)
                    .filter((id) => validIds.includes(id)).length;
                const finalIndex = Math.max(0, rawInsertIndex - removedBefore);

                for (const id of validIds) {
                    this.#removeTabFromAllLocations(id);
                }

                targetPane.tabs.splice(clamp(finalIndex, 0, targetPane.tabs.length), 0, ...validIds);
                targetPane.selectedTabIds = [];

                const placementState: DockPlacementState = resolvedLookup.containerKind === 'floating' ? 'floating' : 'docked';
                for (const id of validIds) {
                    const tab = this.#tabs.get(id);
                    if (tab) tab.placement = placementState;
                }

                const toActivate = options.activePanelId ?? validIds[0];
                if (options.activate !== false && toActivate) {
                    this.activateTab(toActivate);
                } else {
                    this.#syncPaneCollapsedFromTabs(targetPane);
                }

                this.#cleanupEmptyPanesAcrossWorkspace();
                this.#emitChanged('tabDockedCenter');
                return targetPane.id;
            }

            // 6. Split targetPane in direction `zone` ('left' | 'right' | 'top' | 'bottom')
            for (const id of validIds) {
                this.#removeTabFromAllLocations(id);
            }

            const newPane = this.#createPaneNode(validIds, structuredClone(targetPane.viewSettings));
            const placementState: DockPlacementState = resolvedLookup.containerKind === 'floating' ? 'floating' : 'docked';
            for (const id of validIds) {
                const tab = this.#tabs.get(id);
                if (tab) tab.placement = placementState;
            }

            const activeId = options.activePanelId ?? validIds[0] ?? null;
            newPane.activeTabId = activeId;
            for (const id of validIds) {
                const tab = this.#tabs.get(id);
                if (tab) tab.collapsed = id !== activeId;
            }
            newPane.isCollapsed = false;

            // Ensure targetPaneStillHasActiveTab
            if (!targetPane.activeTabId || !targetPane.tabs.includes(targetPane.activeTabId)) {
                const nextActive = targetPane.tabs.find((id) => !this.#tabs.get(id)?.collapsed) ?? targetPane.tabs[0] ?? null;
                targetPane.activeTabId = nextActive;
                if (nextActive) {
                    const t = this.#tabs.get(nextActive);
                    if (t) t.collapsed = false;
                }
            }
            this.#syncPaneCollapsedFromTabs(targetPane);

            this.#insertPaneRelativeToTarget(
                resolvedLookup,
                newPane,
                zone,
                options.ratio,
                options.reuseSameOrientationSplit ?? false,
            );

            this.#cleanupEmptyPanesAcrossWorkspace();
            if (activeId) {
                this.signals.tabActivated.emit(activeId, newPane.id);
            }
            this.#emitChanged('paneSplit');
            return newPane.id;
        });
    }

    // ─── Floating Windows, Tab Groups & Dialog Merging ──────────────────────

    floatTab(panelId: string, geometry?: Partial<DockFloatingGeometry>): string | null {
        return this.floatTabGroup([panelId], geometry, panelId);
    }

    floatTabGroup(
        panelIds: readonly string[],
        geometry?: Partial<DockFloatingGeometry>,
        activePanelId?: string,
    ): string | null {
        if (!this.testConfigFlag(DockConfigFlags.FloatableTabs)) return null;
        const floatableIds = [...new Set(panelIds)].filter((id) => {
            const tab = this.#tabs.get(id);
            return Boolean(
                tab
                && hasDockFeature(tab.features, DockFeature.Floatable)
                && hasDockFeature(tab.features, DockFeature.Movable)
                && !tab.lockedToPane,
            );
        });
        if (floatableIds.length === 0) return null;

        // If tab groups are disabled and multiple tabs were requested, float each into its own container
        if (!this.testConfigFlag(DockConfigFlags.EnableTabGroups) && floatableIds.length > 1) {
            let lastContainerId: string | null = null;
            this.batch('tabsFloatedIndividually', () => {
                floatableIds.forEach((id, idx) => {
                    const offsetGeo = geometry
                        ? {
                            ...geometry,
                            x: (geometry.x ?? 80) + idx * 28,
                            y: (geometry.y ?? 80) + idx * 28,
                        }
                        : { x: 80 + idx * 28, y: 80 + idx * 28 };
                    lastContainerId = this.#floatGroupInternal([id], offsetGeo, id);
                });
            });
            return lastContainerId;
        }

        return this.#floatGroupInternal(floatableIds, geometry, activePanelId);
    }

    floatPane(paneId: string, geometry?: Partial<DockFloatingGeometry>): string | null {
        const lookup = this.findPane(paneId);
        if (!lookup || lookup.pane.tabs.length === 0) return null;
        if (lookup.pane.lockedName) return null;
        return this.floatTabGroup(
            [...lookup.pane.tabs],
            geometry,
            lookup.pane.activeTabId ?? lookup.pane.tabs[0],
        );
    }

    /**
     * Merges `sourceContainerId` into `targetContainerId` (from dock-spawn-ts `mergeDialogs`),
     * combining their tabs and keeping the dragged container's active tab selected.
     */
    mergeFloatingContainers(sourceContainerId: string, targetContainerId: string): boolean {
        if (!this.testConfigFlag(DockConfigFlags.EnableTabGroups)) return false;
        if (sourceContainerId === targetContainerId) return false;
        const source = this.#model.floating.find((c) => c.id === sourceContainerId);
        const target = this.#model.floating.find((c) => c.id === targetContainerId);
        if (!source || !target || source.noDocking || target.noDocking) return false;

        const sourcePane = this.#firstPaneInNode(source.root);
        const targetPane = this.#firstPaneInNode(target.root);
        if (!sourcePane || !targetPane) return false;

        const sourceTabs = this.#collectNodeTabs(source.root);
        if (sourceTabs.length === 0) return false;
        const activeFromSource = sourcePane.activeTabId ?? sourceTabs[0];

        return this.batch('floatingContainersMerged', () => {
            this.#model.floating = this.#model.floating.filter((c) => c.id !== sourceContainerId);
            for (const id of sourceTabs) {
                if (!targetPane.tabs.includes(id)) {
                    targetPane.tabs.push(id);
                }
                const tab = this.#tabs.get(id);
                if (tab) {
                    tab.placement = 'floating';
                    tab.collapsed = id !== activeFromSource;
                }
            }
            if (activeFromSource) {
                targetPane.activeTabId = activeFromSource;
                for (const id of targetPane.tabs) {
                    const tab = this.#tabs.get(id);
                    if (tab) tab.collapsed = id !== activeFromSource;
                }
            }
            targetPane.isCollapsed = false;
            target.zIndex = ++this.#floatingZ;
            this.signals.containersMerged.emit(sourceContainerId, targetContainerId);
            this.#emitChanged('floatingContainersMerged');
            return true;
        });
    }

    /**
     * Docks an entire floating container (single pane, tab group, or nested split tree)
     * back into a column pane or outer column edge (from lace-ts `dockFloatingContainer`).
     */
    dockFloatingContainer(
        containerId: string,
        targetPaneId: string | null = null,
        zone: DockZone = 'center',
        column?: ColumnName,
    ): string | null {
        const sourceIdx = this.#model.floating.findIndex((c) => c.id === containerId);
        if (sourceIdx < 0) return null;
        const source = this.#model.floating[sourceIdx];
        if (source.noDocking) return null;

        return this.batch('floatingContainerDocked', () => {
            const targetColumn = (targetPaneId ? this.findPane(targetPaneId)?.column : null)
                ?? column
                ?? source.originColumn
                ?? 'center';

            // Case 1: Single floating pane -> use dockTabGroup so tab order & active tab merge cleanly
            if (source.root.type === 'pane') {
                const tabs = [...source.root.tabs];
                const activeId = source.root.activeTabId ?? tabs[0];
                const fallbackTargetPaneId = targetPaneId
                    ?? (source.originPaneId && this.findPane(source.originPaneId) ? source.originPaneId : null);
                const resultPaneId = this.dockTabGroup(tabs, fallbackTargetPaneId, zone, {
                    column: targetColumn,
                    activePanelId: activeId ?? undefined,
                });
                if (resultPaneId) {
                    this.signals.containerDocked.emit(containerId, resultPaneId);
                }
                return resultPaneId;
            }

            // Case 2: Multi-pane floating split tree -> graft the entire split subtree into the target column!
            this.#model.floating.splice(sourceIdx, 1);
            const allFloatingTabs = this.#collectNodeTabs(source.root);
            for (const id of allFloatingTabs) {
                const tab = this.#tabs.get(id);
                if (tab) tab.placement = 'docked';
            }

            const colModel = this.#model.columns[targetColumn];
            colModel.visible = true;
            if (!colModel.root) {
                colModel.root = source.root;
            } else {
                const targetLookup = targetPaneId ? this.findPane(targetPaneId) : null;
                const effectiveZone: DockZone = zone === 'center' ? 'right' : zone;
                if (targetLookup && targetLookup.column === targetColumn) {
                    this.#insertNodeRelativeToTarget(targetLookup, source.root, effectiveZone);
                } else {
                    const orientation = splitOrientationForZone(effectiveZone);
                    const before = isInsertBeforeZone(effectiveZone);
                    colModel.root = this.#createSplitNode(
                        orientation,
                        before ? [source.root, colModel.root] : [colModel.root, source.root],
                    );
                }
            }

            this.#recomputeColumnCollapsedState(targetColumn);
            const firstPane = this.#firstPaneInNode(source.root);
            const resultId = firstPane?.id ?? null;
            if (resultId) {
                this.signals.containerDocked.emit(containerId, resultId);
            }
            this.#emitChanged('floatingContainerDocked');
            return resultId;
        });
    }

    setFloatingGeometry(containerId: string, geometry: Partial<DockFloatingGeometry>, emit = true): boolean {
        const container = this.#model.floating.find((c) => c.id === containerId);
        if (!container) return false;
        container.geometry = clampFloatingGeometry({ ...container.geometry, ...geometry });
        if (emit) this.#emitChanged('floatingGeometryChanged');
        return true;
    }

    setFloatingMaximized(containerId: string, maximized: boolean): boolean {
        const container = this.#model.floating.find((c) => c.id === containerId);
        if (!container || container.windowMaximized === maximized) return false;
        container.windowMaximized = maximized;
        container.zIndex = ++this.#floatingZ;
        this.#emitChanged('floatingMaximizedChanged');
        return true;
    }

    bringFloatingToFront(containerId: string): boolean {
        const container = this.#model.floating.find((c) => c.id === containerId);
        if (!container) return false;
        container.zIndex = ++this.#floatingZ;
        this.#emitChanged('floatingActivated');
        return true;
    }

    /**
     * Enables or disables floating tab groups at runtime (from dock-spawn-ts `setTabGroupsEnabled`).
     * Disabling splits any multi-tab floating windows into individual floating windows.
     */
    setTabGroupsEnabled(enabled: boolean): void {
        this.batch('tabGroupsEnabledChanged', () => {
            this.setConfigFlag(DockConfigFlags.EnableTabGroups, enabled);
            if (enabled) return;
            this.clearTabSelection();

            const toSplit = this.#model.floating.filter(
                (c) => this.#collectNodeTabs(c.root).length > 1,
            );
            for (const container of toSplit) {
                const tabs = this.#collectNodeTabs(container.root);
                const baseGeo = container.geometry;
                this.#model.floating = this.#model.floating.filter((c) => c.id !== container.id);
                tabs.forEach((panelId, idx) => {
                    this.#floatGroupInternal(
                        [panelId],
                        {
                            x: baseGeo.x + idx * 24,
                            y: baseGeo.y + idx * 24,
                            width: baseGeo.width,
                            height: baseGeo.height,
                        },
                        panelId,
                    );
                });
            }
            this.#emitChanged('tabGroupsEnabledChanged');
        });
    }

    // ─── Auto-Hide Edge Sidebars with Anchor Restore History ────────────────

    /**
     * Infers the natural auto-hide edge ('left' | 'right' | 'top' | 'bottom') for a panel
     * based on its column and split orientation relative to the center workspace.
     */
    inferAutoHideSide(panelId: string): AutoHideSide {
        const placement = this.findTabPlacement(panelId);
        if (!placement) return 'left';
        if (placement.kind === 'sidebar') return placement.side;
        if (placement.kind === 'column') {
            if (placement.column === 'left') return 'left';
            if (placement.column === 'right') return 'right';
            // Inside center column: inspect parent split orientation and child index
            const lookup = this.findPane(placement.pane.id);
            if (lookup?.parentSplit) {
                const idx = lookup.parentSplit.children.findIndex(
                    (c) => c.id === placement.pane.id || Boolean(this.#findPaneInTree(c, placement.pane.id, null, 1)),
                );
                const firstHalf = idx <= Math.floor((lookup.parentSplit.children.length - 1) / 2);
                if (lookup.parentSplit.orientation === 'horizontal') {
                    return firstHalf ? 'top' : 'bottom';
                }
                return firstHalf ? 'left' : 'right';
            }
            return 'bottom';
        }
        return 'right';
    }

    /**
     * Captures the ancestor split/pane anchor chain for a panel before pinning to a sidebar
     * (modeled on dock-spawn-ts `AutoHideManager.captureLocations`), allowing `unpinFromSidebar`
     * to reconstruct the exact nested dock position, tab order, and split ratios later.
     */
    captureRestoreLocations(panelId: string): DockRestoreLocation[] {
        const placement = this.findTabPlacement(panelId);
        if (!placement || placement.kind !== 'column') return [];

        const column = placement.column;
        const root = this.#model.columns[column].root;
        if (!root) return [];

        const path: Array<{ split: DockSplitState; childIndex: number }> = [];
        const findPath = (node: DockNodeState): boolean => {
            if (node.type === 'pane') return node.id === placement.pane.id;
            for (let i = 0; i < node.children.length; i++) {
                if (findPath(node.children[i])) {
                    path.push({ split: node, childIndex: i });
                    return true;
                }
            }
            return false;
        };
        findPath(root);

        const locations: DockRestoreLocation[] = [];

        // 1. Leaf pane tab-group membership location
        if (placement.pane.tabs.length > 1) {
            locations.push({
                kind: 'pane',
                column,
                index: placement.index,
                siblings: placement.pane.tabs.map((id) => ({
                    panelIds: [id],
                    sourceIds: [this.#tabs.get(id)?.sourceId ?? ''].filter(Boolean),
                    column,
                    isCenter: column === 'center',
                })),
                ratios: normalizeRatios([], placement.pane.tabs.length),
            });
        }

        // 2. Innermost-to-outermost ancestor split locations
        for (const { split, childIndex } of path) {
            locations.push({
                kind: 'split',
                orientation: split.orientation,
                column,
                index: childIndex,
                siblings: split.children.map((child) => this.#createRestoreAnchor(child, column)),
                ratios: [...normalizeRatios(split.ratios, split.children.length)],
            });
        }

        return locations;
    }

    pinToSidebar(
        panelId: string,
        preferredSide?: AutoHideSide,
        initialSize?: { width?: number; height?: number },
    ): AutoHideSide | null {
        if (!this.testConfigFlag(DockConfigFlags.EnableAutoHide) || !this.testConfigFlag(DockConfigFlags.PinnableTabs)) {
            return null;
        }
        const tab = this.#tabs.get(panelId);
        if (!tab || !hasDockFeature(tab.features, DockFeature.Pinnable) || tab.lockedToPane) {
            return null;
        }

        const side: AutoHideSide = preferredSide && AUTO_HIDE_SIDES.includes(preferredSide)
            ? preferredSide
            : this.inferAutoHideSide(panelId);

        return this.batch('tabPinned', () => {
            const existingPlacement = this.findTabPlacement(panelId);
            const returnColumn: ColumnName = existingPlacement?.kind === 'column'
                ? existingPlacement.column
                : existingPlacement?.kind === 'sidebar'
                    ? existingPlacement.entry.returnColumn
                    : existingPlacement?.kind === 'floating'
                        ? (existingPlacement.container.originColumn ?? 'left')
                        : 'left';
            const returnPaneId: string | null = existingPlacement?.kind === 'column'
                ? existingPlacement.pane.id
                : existingPlacement?.kind === 'sidebar'
                    ? existingPlacement.entry.returnPaneId
                    : null;
            const tabGroupPeerIds: string[] = existingPlacement?.kind === 'column'
                ? existingPlacement.pane.tabs.filter((id) => id !== panelId)
                : existingPlacement?.kind === 'sidebar'
                    ? existingPlacement.entry.tabGroupPeerIds
                    : [];
            const restoreLocations = existingPlacement?.kind === 'column'
                ? this.captureRestoreLocations(panelId)
                : existingPlacement?.kind === 'sidebar'
                    ? existingPlacement.entry.restoreLocations
                    : [];
            const prevEntry = existingPlacement?.kind === 'sidebar' ? existingPlacement.entry : null;

            this.#removeTabFromAllLocations(panelId);
            this.#cleanupEmptyPanesAcrossWorkspace();

            const entry: DockSidebarEntry = {
                panelId,
                sourceId: tab.sourceId,
                side,
                width: Math.max(160, Math.round(initialSize?.width ?? prevEntry?.width ?? 320)),
                height: Math.max(120, Math.round(initialSize?.height ?? prevEntry?.height ?? 260)),
                returnColumn,
                returnPaneId,
                tabGroupPeerIds,
                restoreLocations,
            };

            const rail = this.#model.sidebars[side];
            rail.entries.push(entry);
            tab.collapsed = false;
            tab.placement = rail.activePanelId === panelId ? 'pinned-shown' : 'pinned-hidden';

            this.signals.tabPinnedChanged.emit(panelId, side);
            this.#emitChanged('tabPinned');
            return side;
        });
    }

    /**
     * Unpins a panel from its auto-hide sidebar rail and restores it to its previous dock location
     * using anchor-based layout history (`DockRestoreLocation[]`), falling back to surviving tab-group
     * peers or the origin column.
     */
    unpinFromSidebar(panelId: string): string | null {
        const placement = this.findTabPlacement(panelId);
        if (!placement || placement.kind !== 'sidebar') return null;
        const tab = this.#tabs.get(panelId);
        if (!tab || !hasDockFeature(tab.features, DockFeature.Pinnable)) return null;

        return this.batch('tabUnpinned', () => {
            const { entry, side } = placement;
            const rail = this.#model.sidebars[side];
            rail.entries = rail.entries.filter((e) => e.panelId !== panelId);
            if (rail.activePanelId === panelId) {
                rail.activePanelId = null;
                this.signals.sidebarActiveChanged.emit(side, null);
            }

            // 1. Try exact returnPaneId if that pane still exists
            if (entry.returnPaneId) {
                const survivingPane = this.findPane(entry.returnPaneId);
                if (survivingPane && survivingPane.containerKind === 'column') {
                    const paneLoc = entry.restoreLocations.find((l) => l.kind === 'pane');
                    const insertIdx = paneLoc ? this.#resolveRestoredTabOrderIndex(survivingPane.pane, paneLoc) : survivingPane.pane.tabs.length;
                    const paneId = this.dockTab(panelId, survivingPane.pane.id, 'center', { index: insertIdx });
                    this.signals.tabPinnedChanged.emit(panelId, null);
                    return paneId;
                }
            }

            // 2. Try surviving tabGroupPeerIds (if the original pane was replaced, find where a peer tab lives now)
            for (const peerId of entry.tabGroupPeerIds) {
                const peerPlacement = this.findTabPlacement(peerId);
                if (peerPlacement && peerPlacement.kind === 'column') {
                    const paneLoc = entry.restoreLocations.find((l) => l.kind === 'pane');
                    const insertIdx = paneLoc
                        ? this.#resolveRestoredTabOrderIndex(peerPlacement.pane, paneLoc)
                        : peerPlacement.index + 1;
                    const paneId = this.dockTab(panelId, peerPlacement.pane.id, 'center', { index: insertIdx });
                    this.signals.tabPinnedChanged.emit(panelId, null);
                    return paneId;
                }
            }

            // 3. Walk saved split restoreLocations (closest surviving sibling anchor first, like dock-spawn-ts)
            for (const loc of entry.restoreLocations) {
                if (loc.kind !== 'split') continue;
                const candidates = loc.siblings
                    .map((anchor, index) => ({ anchor, index }))
                    .filter((c) => c.index !== loc.index)
                    .sort((a, b) => Math.abs(a.index - loc.index) - Math.abs(b.index - loc.index));

                for (const candidate of candidates) {
                    const anchorPane = this.#resolveAnchorPane(candidate.anchor);
                    if (!anchorPane) continue;
                    const before = loc.index < candidate.index;
                    const zone: DockZone = loc.orientation === 'horizontal'
                        ? (before ? 'top' : 'bottom')
                        : (before ? 'left' : 'right');
                    const savedRatio = loc.ratios[loc.index];
                    const paneId = this.dockTab(panelId, anchorPane.id, zone, {
                        column: loc.column,
                        ratio: savedRatio,
                        reuseSameOrientationSplit: true,
                    });
                    if (paneId) {
                        this.signals.tabPinnedChanged.emit(panelId, null);
                        return paneId;
                    }
                }
            }

            // 4. Fallback: dock into returnColumn (or outer edge matching sidebar side)
            const targetCol: ColumnName = entry.returnColumn
                ?? (side === 'left' ? 'left' : side === 'right' ? 'right' : 'center');
            const outerZone: DockZone = side === 'top'
                ? 'outer-top'
                : side === 'bottom'
                    ? 'outer-bottom'
                    : side === 'right'
                        ? 'outer-right'
                        : 'outer-left';
            const fallbackLookup = this.#ensureFirstPaneInColumn(targetCol);
            const paneId = fallbackLookup.pane.tabs.length === 0
                ? this.dockTab(panelId, fallbackLookup.pane.id, 'center', { column: targetCol })
                : this.dockTab(panelId, fallbackLookup.pane.id, outerZone, { column: targetCol });
            this.signals.tabPinnedChanged.emit(panelId, null);
            return paneId;
        });
    }

    floatFromSidebar(panelId: string, geometry?: Partial<DockFloatingGeometry>): string | null {
        const placement = this.findTabPlacement(panelId);
        if (!placement || placement.kind !== 'sidebar') return null;
        const { entry, side } = placement;
        return this.batch('sidebarFloated', () => {
            const rail = this.#model.sidebars[side];
            rail.entries = rail.entries.filter((e) => e.panelId !== panelId);
            if (rail.activePanelId === panelId) {
                rail.activePanelId = null;
                this.signals.sidebarActiveChanged.emit(side, null);
            }
            this.signals.tabPinnedChanged.emit(panelId, null);
            return this.floatTab(panelId, {
                width: geometry?.width ?? entry.width,
                height: geometry?.height ?? entry.height,
                x: geometry?.x ?? 96,
                y: geometry?.y ?? 96,
            });
        });
    }

    activateSidebarPanel(panelId: string | null, toggle = true): void {
        this.batch('sidebarActivated', () => {
            if (panelId === null) {
                for (const side of AUTO_HIDE_SIDES) {
                    const rail = this.#model.sidebars[side];
                    if (rail.activePanelId) {
                        const prevTab = this.#tabs.get(rail.activePanelId);
                        if (prevTab) prevTab.placement = 'pinned-hidden';
                        rail.activePanelId = null;
                        this.signals.sidebarActiveChanged.emit(side, null);
                    }
                }
                this.#emitChanged('sidebarClosed');
                return;
            }

            const placement = this.findTabPlacement(panelId);
            if (!placement || placement.kind !== 'sidebar') return;
            const targetSide = placement.side;

            for (const side of AUTO_HIDE_SIDES) {
                const rail = this.#model.sidebars[side];
                if (side !== targetSide && rail.activePanelId) {
                    const prevTab = this.#tabs.get(rail.activePanelId);
                    if (prevTab) prevTab.placement = 'pinned-hidden';
                    rail.activePanelId = null;
                    this.signals.sidebarActiveChanged.emit(side, null);
                }
            }

            const targetRail = this.#model.sidebars[targetSide];
            const tab = this.#tabs.get(panelId);
            if (toggle && targetRail.activePanelId === panelId) {
                targetRail.activePanelId = null;
                if (tab) tab.placement = 'pinned-hidden';
                this.signals.sidebarActiveChanged.emit(targetSide, null);
            } else {
                if (targetRail.activePanelId && targetRail.activePanelId !== panelId) {
                    const prevTab = this.#tabs.get(targetRail.activePanelId);
                    if (prevTab) prevTab.placement = 'pinned-hidden';
                }
                targetRail.activePanelId = panelId;
                if (tab) {
                    tab.collapsed = false;
                    tab.placement = 'pinned-shown';
                }
                this.signals.sidebarActiveChanged.emit(targetSide, panelId);
            }
            this.#emitChanged('sidebarActivated');
        });
    }

    setSidebarOverlaySize(panelId: string, size: { width?: number; height?: number }): boolean {
        const placement = this.findTabPlacement(panelId);
        if (!placement || placement.kind !== 'sidebar') return false;
        if (size.width !== undefined && Number.isFinite(size.width)) {
            placement.entry.width = clamp(Math.round(size.width), 160, 4000);
        }
        if (size.height !== undefined && Number.isFinite(size.height)) {
            placement.entry.height = clamp(Math.round(size.height), 120, 4000);
        }
        this.#emitChanged('sidebarOverlayResized');
        return true;
    }

    getSidebarBehavior(): DockSidebarBehavior {
        return structuredClone(this.#model.sidebarBehavior);
    }

    setSidebarBehavior(patch: Partial<DockSidebarBehavior>): void {
        const next: DockSidebarBehavior = {
            ...this.#model.sidebarBehavior,
            ...patch,
        };
        next.hoverDelayMs = clamp(Math.round(next.hoverDelayMs), 0, 5000);
        next.hideDelayMs = clamp(Math.round(next.hideDelayMs), 0, 5000);
        next.switchDelayMs = clamp(Math.round(next.switchDelayMs), 0, 5000);
        this.#model.sidebarBehavior = next;
        this.#emitChanged('sidebarBehaviorChanged');
    }

    /**
     * Enables or disables auto-hide at runtime (from dock-spawn-ts `setAutoHideEnabled`).
     * Disabling unpins all collapsed sidebar panels back into their docked positions.
     */
    setAutoHideEnabled(enabled: boolean): void {
        this.batch('autoHideEnabledChanged', () => {
            this.setConfigFlag(DockConfigFlags.EnableAutoHide, enabled);
            if (enabled) return;
            for (const side of AUTO_HIDE_SIDES) {
                const ids = this.#model.sidebars[side].entries.map((e) => e.panelId);
                for (const id of ids) {
                    this.unpinFromSidebar(id);
                }
            }
            this.#emitChanged('autoHideEnabledChanged');
        });
    }

    // ─── Container Fullscreen / Pane Maximize ───────────────────────────────

    get maximizedPaneId(): string | null {
        return this.#model.maximizedPaneId;
    }

    maximizePane(paneId: string | null): boolean {
        if (paneId !== null && !this.testConfigFlag(DockConfigFlags.EnableFullscreen)) {
            return false;
        }
        if (paneId === null) {
            let changed = this.#model.maximizedPaneId !== null;
            this.#model.maximizedPaneId = null;
            for (const c of this.#model.floating) {
                if (c.maximizedPaneId !== null) {
                    c.maximizedPaneId = null;
                    changed = true;
                }
            }
            if (changed) {
                this.signals.paneMaximizedChanged.emit(null);
                this.#emitChanged('paneMaximizedChanged');
            }
            return changed;
        }

        const lookup = this.findPane(paneId);
        if (!lookup || lookup.pane.hideFullscreenButton) return false;

        if (lookup.containerKind === 'floating' && lookup.container) {
            const next = lookup.container.maximizedPaneId === paneId ? null : paneId;
            lookup.container.maximizedPaneId = next;
            this.signals.paneMaximizedChanged.emit(next);
            this.#emitChanged('paneMaximizedChanged');
            return true;
        }

        const next = this.#model.maximizedPaneId === paneId ? null : paneId;
        this.#model.maximizedPaneId = next;
        this.signals.paneMaximizedChanged.emit(next);
        this.#emitChanged('paneMaximizedChanged');
        return true;
    }

    setFullscreenEnabled(enabled: boolean): void {
        this.batch('fullscreenEnabledChanged', () => {
            this.setConfigFlag(DockConfigFlags.EnableFullscreen, enabled);
            if (!enabled) {
                this.maximizePane(null);
            }
        });
    }

    // ─── Split & Column Sizing ──────────────────────────────────────────────

    setSplitRatios(splitId: string, ratios: readonly number[], emit = true): boolean {
        const split = this.#findSplitById(splitId);
        if (!split) return false;
        split.ratios = normalizeRatios(ratios, split.children.length);
        split.children.forEach((child, idx) => {
            child.flexRatio = split.ratios[idx] ?? (1 / split.children.length);
            if (!child.isCollapsed) {
                child.lastFlexRatio = child.flexRatio;
            }
        });
        if (emit) this.#emitChanged('splitRatiosChanged');
        return true;
    }

    setColumnRatios(ratios: Partial<Record<ColumnName, number>>, emit = true): void {
        const visibleCols = COLUMN_NAMES.filter((c) => this.#model.columns[c].visible && !this.#model.columns[c].collapsed);
        if (visibleCols.length === 0) return;
        const raw = visibleCols.map((c) => ratios[c] ?? this.#model.columns[c].flexRatio);
        const normalized = normalizeRatios(raw, visibleCols.length);
        visibleCols.forEach((c, idx) => {
            this.#model.columns[c].flexRatio = normalized[idx];
            this.#model.columns[c].lastFlexRatio = normalized[idx];
        });
        if (emit) this.#emitChanged('columnRatiosChanged');
    }

    setColumnVisibility(column: ColumnName, visible: boolean): void {
        if (column === 'center') return; // Center column is always visible
        const col = this.#model.columns[column];
        if (col.visible === visible) return;
        col.visible = visible;
        if (visible && !col.root) {
            col.root = this.#createPaneNode([]);
        }
        this.#emitChanged('columnVisibilityChanged');
    }

    // ─── Perspectives ───────────────────────────────────────────────────────

    savePerspective(name: string): void {
        const key = name.trim();
        if (!key) throw new Error('Perspective name must not be empty');
        const snapshot = this.toLayoutSnapshot();
        this.#model.perspectives[key] = JSON.stringify(snapshot);
        this.signals.perspectivesChanged.emit();
        this.#emitChanged('perspectiveSaved');
    }

    openPerspective(name: string): DockRestoreResult {
        const raw = this.#model.perspectives[name];
        if (!raw) return { ok: false, warnings: [`Unknown perspective: ${name}`] };
        try {
            const parsed = JSON.parse(raw) as LayoutSnapshot;
            return this.fromLayoutSnapshot(parsed);
        } catch (err) {
            return { ok: false, warnings: [err instanceof Error ? err.message : String(err)] };
        }
    }

    removePerspective(name: string): boolean {
        if (!(name in this.#model.perspectives)) return false;
        delete this.#model.perspectives[name];
        this.signals.perspectivesChanged.emit();
        this.#emitChanged('perspectiveRemoved');
        return true;
    }

    listPerspectives(): string[] {
        return Object.keys(this.#model.perspectives);
    }

    // ─── Bidirectional Bridge to PTMT LayoutSnapshot (v28+) ─────────────────

    toLayoutSnapshot(): LayoutSnapshot {
        const leftCol = this.#model.columns.left;
        const centerCol = this.#model.columns.center;
        const rightCol = this.#model.columns.right;

        const leftFlex = formatFlexPercentage(leftCol.flexRatio, 0, 0);
        const centerFlex = formatFlexPercentage(centerCol.flexRatio, 1, 1);
        const rightFlex = formatFlexPercentage(rightCol.flexRatio, 0, 0);

        const tabsRecord: SerializedDockExtensionState['tabs'] = {};
        for (const [id, tab] of this.#tabs.entries()) {
            const { placement: _placement, ...rest } = tab;
            tabsRecord[id] = structuredClone(rest);
        }

        const dockState: SerializedDockExtensionState = {
            schemaVersion: PTMT_DOCK_SCHEMA_VERSION,
            dockingSizeStrategy: this.#model.dockingSizeStrategy,
            tabStripOverflowMode: this.#model.tabStripOverflowMode,
            configFlags: this.#model.configFlags,
            maximizedPaneId: this.#model.maximizedPaneId,
            floating: structuredClone(this.#model.floating),
            sidebars: structuredClone(this.#model.sidebars),
            sidebarBehavior: structuredClone(this.#model.sidebarBehavior),
            tabs: tabsRecord,
            perspectives: { ...this.#model.perspectives },
        };

        return {
            version: this.#model.applicationVersion,
            timestamp: Date.now(),
            showIconsOnly: this.#model.showIconsOnly,
            showLeft: leftCol.visible,
            showRight: rightCol.visible,
            columnSizes: {
                left: leftCol.collapsed ? '0 0 36px' : leftFlex,
                center: centerFlex,
                right: rightCol.collapsed ? '0 0 36px' : rightFlex,
                leftCollapsed: leftCol.collapsed,
                rightCollapsed: rightCol.collapsed,
                leftLastFlex: formatFlexPercentage(leftCol.lastFlexRatio ?? leftCol.flexRatio, 1, 1),
                centerLastFlex: formatFlexPercentage(centerCol.lastFlexRatio ?? centerCol.flexRatio, 1, 1),
                rightLastFlex: formatFlexPercentage(rightCol.lastFlexRatio ?? rightCol.flexRatio, 1, 1),
            },
            columns: {
                left: {
                    flex: leftCol.collapsed ? '0 0 36px' : leftFlex,
                    content: this.#nodeToPTMTLayoutNode(leftCol.root, 'left'),
                    ghostTabs: structuredClone(leftCol.ghostTabs),
                },
                center: {
                    flex: centerFlex,
                    content: this.#nodeToPTMTLayoutNode(centerCol.root, 'center'),
                    ghostTabs: structuredClone(centerCol.ghostTabs),
                },
                right: {
                    flex: rightCol.collapsed ? '0 0 36px' : rightFlex,
                    content: this.#nodeToPTMTLayoutNode(rightCol.root, 'right'),
                    ghostTabs: structuredClone(rightCol.ghostTabs),
                },
            },
            hiddenTabs: structuredClone(this.#model.hiddenTabs),
            dockState,
        };
    }

    fromLayoutSnapshot(snapshot: LayoutSnapshot): DockRestoreResult {
        const warnings: string[] = [];
        if (!snapshot || typeof snapshot !== 'object' || !snapshot.columns) {
            return { ok: false, warnings: ['Invalid LayoutSnapshot object'] };
        }

        this.#restoring = true;
        try {
            this.batch('snapshotRestored', () => {
                const preservedPerspectives = { ...this.#model.perspectives };

                // Restore extended dock metadata if present
                const ext = snapshot.dockState;
                if (ext?.tabs) {
                    for (const [id, tabMeta] of Object.entries(ext.tabs)) {
                        this.registerTab({ ...tabMeta, panelId: id });
                    }
                }

                this.#model.applicationVersion = snapshot.version || 28;
                this.#model.showIconsOnly = Boolean(snapshot.showIconsOnly);
                if (ext) {
                    if (ext.dockingSizeStrategy) this.#model.dockingSizeStrategy = ext.dockingSizeStrategy;
                    if (ext.tabStripOverflowMode) this.#model.tabStripOverflowMode = ext.tabStripOverflowMode;
                    if (typeof ext.configFlags === 'number') this.#model.configFlags = ext.configFlags;
                    if (ext.sidebarBehavior) this.#model.sidebarBehavior = structuredClone(ext.sidebarBehavior);
                    if (ext.perspectives) {
                        this.#model.perspectives = { ...preservedPerspectives, ...ext.perspectives };
                    }
                }

                const seenTabs = new Set<string>();

                for (const colName of COLUMN_NAMES) {
                    const colSnap = snapshot.columns[colName];
                    const colModel = this.#model.columns[colName];
                    colModel.visible = colName === 'center'
                        ? true
                        : colName === 'left'
                            ? Boolean(snapshot.showLeft)
                            : Boolean(snapshot.showRight);
                    colModel.collapsed = colName === 'left'
                        ? Boolean(snapshot.columnSizes?.leftCollapsed)
                        : colName === 'right'
                            ? Boolean(snapshot.columnSizes?.rightCollapsed)
                            : false;

                    const rawFlex = snapshot.columnSizes?.[colName] ?? colSnap?.flex;
                    const rawLastFlex = colName === 'left'
                        ? snapshot.columnSizes?.leftLastFlex
                        : colName === 'right'
                            ? snapshot.columnSizes?.rightLastFlex
                            : snapshot.columnSizes?.centerLastFlex;
                    const defaultRatio = colName === 'center' ? 0.6 : 0.2;
                    colModel.flexRatio = parseFlexRatioFromFlexString(rawLastFlex)
                        ?? parseFlexRatioFromFlexString(rawFlex)
                        ?? defaultRatio;
                    colModel.lastFlexRatio = parseFlexRatioFromFlexString(rawLastFlex) ?? colModel.flexRatio;
                    colModel.ghostTabs = structuredClone(colSnap?.ghostTabs ?? []);
                    colModel.root = this.#nodeFromPTMTLayoutNode(colSnap?.content ?? null, seenTabs, false, warnings);
                    this.#recomputeColumnCollapsedState(colName);
                }

                // Restore floating containers if present in dockState
                this.#model.floating = [];
                if (ext?.floating && Array.isArray(ext.floating)) {
                    for (const floatModel of ext.floating) {
                        const sanitizedRoot = this.#sanitizeRestoredNode(floatModel.root, seenTabs, true, warnings);
                        if (!sanitizedRoot) continue;
                        this.#model.floating.push({
                            ...structuredClone(floatModel),
                            root: sanitizedRoot,
                            geometry: clampFloatingGeometry(floatModel.geometry),
                            zIndex: ++this.#floatingZ,
                        });
                    }
                }

                // Restore sidebars if present in dockState
                for (const side of AUTO_HIDE_SIDES) {
                    this.#model.sidebars[side] = { side, entries: [], activePanelId: null };
                }
                if (ext?.sidebars) {
                    for (const side of AUTO_HIDE_SIDES) {
                        const savedRail = ext.sidebars[side];
                        if (!savedRail || !Array.isArray(savedRail.entries)) continue;
                        const rail = this.#model.sidebars[side];
                        for (const entry of savedRail.entries) {
                            if (seenTabs.has(entry.panelId)) {
                                warnings.push(`Skipped duplicate sidebar placement for ${entry.panelId}`);
                                continue;
                            }
                            if (!this.#tabs.has(entry.panelId)) {
                                this.registerTab({
                                    panelId: entry.panelId,
                                    sourceId: entry.sourceId,
                                    title: entry.sourceId ?? entry.panelId,
                                });
                            }
                            seenTabs.add(entry.panelId);
                            rail.entries.push(structuredClone(entry));
                            const tab = this.#tabs.get(entry.panelId);
                            if (tab) {
                                tab.placement = savedRail.activePanelId === entry.panelId ? 'pinned-shown' : 'pinned-hidden';
                            }
                        }
                        if (savedRail.activePanelId && rail.entries.some((e) => e.panelId === savedRail.activePanelId)) {
                            rail.activePanelId = savedRail.activePanelId;
                        }
                    }
                }

                this.#model.hiddenTabs = structuredClone(snapshot.hiddenTabs ?? []);
                for (const h of this.#model.hiddenTabs) {
                    const tab = h.panelId ? this.#tabs.get(h.panelId) : this.getTabBySourceId(h.sourceId);
                    if (tab && !seenTabs.has(tab.panelId)) {
                        tab.placement = 'hidden';
                        seenTabs.add(tab.panelId);
                    }
                }

                for (const [id, tab] of this.#tabs.entries()) {
                    if (!seenTabs.has(id)) {
                        tab.placement = 'unassigned';
                        tab.collapsed = true;
                    }
                }

                this.#model.maximizedPaneId = ext?.maximizedPaneId && this.findPane(ext.maximizedPaneId)
                    ? ext.maximizedPaneId
                    : null;

                // If Auto-Hide is disabled when loading a layout with pinned panels, unpin them (dock-spawn-ts behavior)
                if (!this.testConfigFlag(DockConfigFlags.EnableAutoHide)) {
                    for (const side of AUTO_HIDE_SIDES) {
                        for (const entry of [...this.#model.sidebars[side].entries]) {
                            this.unpinFromSidebar(entry.panelId);
                        }
                    }
                }

                this.#emitChanged('snapshotRestored');
            });

            const result: DockRestoreResult = { ok: true, warnings };
            this.signals.stateRestored.emit(result);
            return result;
        } catch (error) {
            const result: DockRestoreResult = {
                ok: false,
                warnings: [...warnings, error instanceof Error ? error.message : String(error)],
            };
            this.signals.stateRestored.emit(result);
            return result;
        } finally {
            this.#restoring = false;
        }
    }

    // ─── Internal Helpers ───────────────────────────────────────────────────

    #createDefaultColumn(name: ColumnName, visible: boolean, flexRatio: number, maxLayers: number): DockColumnModel {
        return {
            name,
            visible,
            collapsed: false,
            flexRatio,
            lastFlexRatio: flexRatio,
            maxLayers,
            root: this.#createPaneNode([]),
            ghostTabs: [],
        };
    }

    #createPaneNode(tabs: string[], viewSettings?: Partial<ViewSettings>, id?: string): DockPaneState {
        const activeTabId = tabs.find((tid) => !this.#tabs.get(tid)?.collapsed) ?? tabs[0] ?? null;
        return {
            type: 'pane',
            id: id || this.#nextId('ptmt-pane'),
            tabs: [...tabs],
            activeTabId,
            selectedTabIds: [],
            viewSettings: { ...DEFAULT_VIEW_SETTINGS, ...viewSettings },
            flexRatio: 1,
            lastFlexRatio: 1,
            isCollapsed: tabs.length > 0 && tabs.every((tid) => Boolean(this.#tabs.get(tid)?.collapsed)),
            overflowMode: this.#model?.tabStripOverflowMode ?? 'scroll',
        };
    }

    #createSplitNode(
        orientation: Orientation,
        children: DockNodeState[],
        ratios?: readonly number[],
        id?: string,
    ): DockSplitState {
        const normalized = normalizeRatios(ratios ?? children.map((c) => c.flexRatio), children.length);
        children.forEach((child, idx) => {
            child.flexRatio = normalized[idx];
            child.lastFlexRatio = normalized[idx];
        });
        return {
            type: 'split',
            id: id || this.#nextId('ptmt-split'),
            orientation,
            naturalOrientation: orientation,
            orientationExpanded: orientation,
            orientationCollapsed: 'auto',
            children,
            ratios: normalized,
            flexRatio: 1,
            lastFlexRatio: 1,
            isCollapsed: children.length > 0 && children.every((c) => c.isCollapsed),
        };
    }

    #nextId(prefix: string): string {
        this.#idCounter += 1;
        return `${prefix}-${this.#idCounter}`;
    }

    #ensureFirstPaneInColumn(column: ColumnName): DockPaneLookupResult {
        const col = this.#model.columns[column];
        col.visible = true;
        if (!col.root) {
            col.root = this.#createPaneNode([]);
        }
        const first = this.#firstPaneInNode(col.root);
        if (!first) {
            const pane = this.#createPaneNode([]);
            col.root = pane;
            return { containerKind: 'column', column, pane, parentSplit: null, depth: 1 };
        }
        return this.findPane(first.id)!;
    }

    #firstPaneInNode(node: DockNodeState | null | undefined): DockPaneState | null {
        if (!node) return null;
        if (node.type === 'pane') return node;
        for (const child of node.children) {
            const found = this.#firstPaneInNode(child);
            if (found) return found;
        }
        return null;
    }

    #findPaneContainingTab(node: DockNodeState | null, panelId: string): DockPaneState | null {
        if (!node) return null;
        if (node.type === 'pane') return node.tabs.includes(panelId) ? node : null;
        for (const child of node.children) {
            const found = this.#findPaneContainingTab(child, panelId);
            if (found) return found;
        }
        return null;
    }

    #findPaneInTree(
        node: DockNodeState | null,
        paneId: string,
        parentSplit: DockSplitState | null,
        depth: number,
    ): { pane: DockPaneState; parentSplit: DockSplitState | null; depth: number } | null {
        if (!node) return null;
        if (node.type === 'pane') {
            return node.id === paneId ? { pane: node, parentSplit, depth } : null;
        }
        for (const child of node.children) {
            const found = this.#findPaneInTree(child, paneId, node, depth + 1);
            if (found) return found;
        }
        return null;
    }

    #findSplitById(splitId: string): DockSplitState | null {
        const visit = (node: DockNodeState | null): DockSplitState | null => {
            if (!node || node.type === 'pane') return null;
            if (node.id === splitId) return node;
            for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        for (const colName of COLUMN_NAMES) {
            const found = visit(this.#model.columns[colName].root);
            if (found) return found;
        }
        for (const container of this.#model.floating) {
            const found = visit(container.root);
            if (found) return found;
        }
        return null;
    }

    #walkAllPanes(visitor: (pane: DockPaneState) => void): void {
        const visit = (node: DockNodeState | null): void => {
            if (!node) return;
            if (node.type === 'pane') {
                visitor(node);
                return;
            }
            for (const child of node.children) visit(child);
        };
        for (const colName of COLUMN_NAMES) visit(this.#model.columns[colName].root);
        for (const container of this.#model.floating) visit(container.root);
    }

    #collectNodeTabs(node: DockNodeState | null): string[] {
        const out: string[] = [];
        const visit = (n: DockNodeState | null): void => {
            if (!n) return;
            if (n.type === 'pane') out.push(...n.tabs);
            else for (const child of n.children) visit(child);
        };
        visit(node);
        return out;
    }

    #collectColumnAllTabs(column: ColumnName): string[] {
        return this.#collectNodeTabs(this.#model.columns[column].root);
    }

    #collectColumnOpenTabs(column: ColumnName): string[] {
        return this.#collectColumnAllTabs(column).filter((id) => !this.#tabs.get(id)?.collapsed);
    }

    #syncPaneCollapsedFromTabs(pane: DockPaneState): void {
        const allCollapsed = pane.tabs.length > 0 && pane.tabs.every((id) => Boolean(this.#tabs.get(id)?.collapsed));
        if (pane.isCollapsed !== allCollapsed) {
            pane.isCollapsed = allCollapsed;
            this.signals.paneCollapsedChanged.emit(pane.id, allCollapsed);
        }
    }

    #recomputeColumnCollapsedState(column: ColumnName): void {
        const col = this.#model.columns[column];
        const updateNodeCollapsed = (node: DockNodeState | null): boolean => {
            if (!node) return true;
            if (node.type === 'pane') {
                this.#syncPaneCollapsedFromTabs(node);
                return node.isCollapsed;
            }
            const childrenCollapsed = node.children.map(updateNodeCollapsed);
            node.isCollapsed = childrenCollapsed.length > 0 && childrenCollapsed.every(Boolean);
            return node.isCollapsed;
        };
        const rootCollapsed = updateNodeCollapsed(col.root);
        // Center column never collapses into a fixed narrow rail
        col.collapsed = column === 'center' ? false : rootCollapsed;
    }

    #removeTabFromAllLocations(panelId: string): void {
        const removeFromTree = (node: DockNodeState | null): void => {
            if (!node) return;
            if (node.type === 'pane') {
                const idx = node.tabs.indexOf(panelId);
                if (idx >= 0) {
                    node.tabs.splice(idx, 1);
                    node.selectedTabIds = node.selectedTabIds.filter((id) => id !== panelId);
                    if (node.activeTabId === panelId) {
                        node.activeTabId = node.tabs.find((id) => !this.#tabs.get(id)?.collapsed) ?? node.tabs[Math.max(0, idx - 1)] ?? null;
                        if (node.activeTabId) {
                            const nextTab = this.#tabs.get(node.activeTabId);
                            if (nextTab) nextTab.collapsed = false;
                        }
                    }
                    this.#syncPaneCollapsedFromTabs(node);
                }
                return;
            }
            for (const child of node.children) removeFromTree(child);
        };

        for (const colName of COLUMN_NAMES) {
            removeFromTree(this.#model.columns[colName].root);
        }
        for (const container of this.#model.floating) {
            removeFromTree(container.root);
        }
        for (const side of AUTO_HIDE_SIDES) {
            const rail = this.#model.sidebars[side];
            const had = rail.entries.some((e) => e.panelId === panelId);
            if (had) {
                rail.entries = rail.entries.filter((e) => e.panelId !== panelId);
                if (rail.activePanelId === panelId) rail.activePanelId = null;
            }
        }
        const tabSourceId = this.#tabs.get(panelId)?.sourceId;
        this.#model.hiddenTabs = this.#model.hiddenTabs.filter(
            (h) => h.panelId !== panelId && (!tabSourceId || h.sourceId !== tabSourceId),
        );
    }

    #cleanupEmptyPanesAcrossWorkspace(): void {
        const pruneNode = (node: DockNodeState | null): DockNodeState | null => {
            if (!node) return null;
            if (node.type === 'pane') {
                return node.tabs.length > 0 ? node : null;
            }
            const oldCount = node.children.length;
            const removedIndices = new Set<number>();
            const nextChildren: DockNodeState[] = [];
            node.children.forEach((child, index) => {
                const pruned = pruneNode(child);
                if (pruned) {
                    nextChildren.push(pruned);
                } else {
                    removedIndices.add(index);
                }
            });

            if (nextChildren.length === 0) return null;
            if (nextChildren.length === 1) {
                const survivor = nextChildren[0];
                // Survivor inherits the collapsed split's slot size in its grandparent!
                survivor.flexRatio = node.flexRatio;
                survivor.lastFlexRatio = node.lastFlexRatio ?? node.flexRatio;
                return survivor;
            }

            if (removedIndices.size > 0) {
                node.ratios = removeRatiosByIndex(node.ratios, oldCount, removedIndices);
                node.children = nextChildren;
                node.children.forEach((child, idx) => {
                    child.flexRatio = node.ratios[idx];
                    if (!child.isCollapsed) child.lastFlexRatio = child.flexRatio;
                });
            }
            return node;
        };

        for (const colName of COLUMN_NAMES) {
            const col = this.#model.columns[colName];
            col.root = pruneNode(col.root);
            if (!col.root) {
                if (colName === 'left' || colName === 'right') {
                    col.visible = false;
                }
                col.root = this.#createPaneNode([]);
            }
            this.#recomputeColumnCollapsedState(colName);
        }

        this.#model.floating = this.#model.floating.filter((container) => {
            const pruned = pruneNode(container.root);
            if (!pruned) return false;
            container.root = pruned;
            return true;
        });

        if (this.#model.maximizedPaneId && !this.findPane(this.#model.maximizedPaneId)) {
            this.#model.maximizedPaneId = null;
        }
    }

    #insertPaneRelativeToTarget(
        targetLookup: DockPaneLookupResult,
        newPane: DockPaneState,
        zone: DockZone,
        customRatio?: number,
        reuseSameOrientationSplit = false,
    ): void {
        const orientation = splitOrientationForZone(zone);
        const before = isInsertBeforeZone(zone);
        const strategy = this.#model.dockingSizeStrategy;
        const parentSplit = targetLookup.parentSplit;

        // If parentSplit has the same orientation and reuseSameOrientationSplit (or split-reference/equal-distribution on multi-child split),
        // insert as a sibling using insertRatioWithStrategy so unrelated siblings keep their exact sizes!
        if (
            parentSplit
            && parentSplit.orientation === orientation
            && (reuseSameOrientationSplit || strategy === 'split-reference' || strategy === 'equal-distribution')
        ) {
            const refIndex = parentSplit.children.findIndex((c) => c.id === targetLookup.pane.id);
            if (refIndex >= 0) {
                const insertIndex = before ? refIndex : refIndex + 1;
                const nextRatios = insertRatioWithStrategy({
                    ratios: parentSplit.ratios,
                    oldCount: parentSplit.children.length,
                    insertIndex,
                    referenceIndex: refIndex,
                    strategy,
                    isOuterDock: false,
                    customRatio,
                });
                parentSplit.children.splice(insertIndex, 0, newPane);
                parentSplit.ratios = nextRatios;
                parentSplit.children.forEach((child, idx) => {
                    child.flexRatio = nextRatios[idx];
                    child.lastFlexRatio = nextRatios[idx];
                });
                return;
            }
        }

        // Otherwise replace targetPane with a new 2-child split inheriting targetPane's slot ratio
        this.#insertNodeRelativeToTarget(targetLookup, newPane, zone, customRatio);
    }

    #insertNodeRelativeToTarget(
        targetLookup: DockPaneLookupResult,
        newNode: DockNodeState,
        zone: DockZone,
        customRatio?: number,
    ): void {
        const orientation = splitOrientationForZone(zone);
        const before = isInsertBeforeZone(zone);
        const targetPane = targetLookup.pane;
        const slotRatio = targetPane.flexRatio;
        const slotLastRatio = targetPane.lastFlexRatio;

        const newFraction = typeof customRatio === 'number' && customRatio > 0 && customRatio < 1
            ? clamp(customRatio, 0.05, 0.95)
            : 0.5;
        const childRatios = before ? [newFraction, 1 - newFraction] : [1 - newFraction, newFraction];
        const children = before ? [newNode, targetPane] : [targetPane, newNode];
        const createdSplit = this.#createSplitNode(orientation, children, childRatios);
        createdSplit.flexRatio = slotRatio;
        createdSplit.lastFlexRatio = slotLastRatio;

        if (targetLookup.parentSplit) {
            const idx = targetLookup.parentSplit.children.findIndex((c) => c.id === targetPane.id);
            if (idx >= 0) {
                targetLookup.parentSplit.children[idx] = createdSplit;
                return;
            }
        }

        if (targetLookup.containerKind === 'column' && targetLookup.column) {
            this.#model.columns[targetLookup.column].root = createdSplit;
        } else if (targetLookup.containerKind === 'floating' && targetLookup.container) {
            targetLookup.container.root = createdSplit;
        }
    }

    #dockGroupAtColumnOuterEdge(
        validIds: readonly string[],
        column: ColumnName,
        zone: DockZone,
        options: DockOperationOptions & { activePanelId?: string },
    ): string {
        for (const id of validIds) {
            this.#removeTabFromAllLocations(id);
        }

        const colModel = this.#model.columns[column];
        colModel.visible = true;

        const newPane = this.#createPaneNode([...validIds]);
        const activeId = options.activePanelId ?? validIds[0] ?? null;
        newPane.activeTabId = activeId;
        for (const id of validIds) {
            const tab = this.#tabs.get(id);
            if (tab) {
                tab.placement = 'docked';
                tab.collapsed = id !== activeId;
            }
        }
        newPane.isCollapsed = false;

        const orientation = splitOrientationForZone(zone);
        const before = isInsertBeforeZone(zone);
        const strategy = this.#model.dockingSizeStrategy;

        if (!colModel.root || (colModel.root.type === 'pane' && colModel.root.tabs.length === 0)) {
            colModel.root = newPane;
        } else if (
            colModel.root.type === 'split'
            && colModel.root.orientation === orientation
        ) {
            // Reuse root splitter so outer docking in equal-distribution balances thirds/quarters!
            const rootSplit = colModel.root;
            const insertIndex = before ? 0 : rootSplit.children.length;
            const refIndex = before ? 0 : rootSplit.children.length - 1;
            const nextRatios = insertRatioWithStrategy({
                ratios: rootSplit.ratios,
                oldCount: rootSplit.children.length,
                insertIndex,
                referenceIndex: refIndex,
                strategy,
                isOuterDock: true,
                customRatio: options.ratio,
            });
            rootSplit.children.splice(insertIndex, 0, newPane);
            rootSplit.ratios = nextRatios;
            rootSplit.children.forEach((child, idx) => {
                child.flexRatio = nextRatios[idx];
                child.lastFlexRatio = nextRatios[idx];
            });
        } else {
            const newFraction = typeof options.ratio === 'number' && options.ratio > 0 && options.ratio < 1
                ? clamp(options.ratio, 0.05, 0.95)
                : 0.5;
            const ratios = before ? [newFraction, 1 - newFraction] : [1 - newFraction, newFraction];
            colModel.root = this.#createSplitNode(
                orientation,
                before ? [newPane, colModel.root] : [colModel.root, newPane],
                ratios,
            );
        }

        this.#cleanupEmptyPanesAcrossWorkspace();
        if (activeId) {
            this.signals.tabActivated.emit(activeId, newPane.id);
        }
        this.#emitChanged('outerDocked');
        return newPane.id;
    }

    #floatGroupInternal(
        panelIds: readonly string[],
        geometry?: Partial<DockFloatingGeometry>,
        activePanelId?: string,
    ): string {
        return this.batch('tabFloated', () => {
            const firstPlacement = this.findTabPlacement(panelIds[0]);
            const originColumn: ColumnName = firstPlacement?.kind === 'column'
                ? firstPlacement.column
                : firstPlacement?.kind === 'sidebar'
                    ? firstPlacement.entry.returnColumn
                    : 'center';
            const originPaneId: string | null = firstPlacement?.kind === 'column'
                ? firstPlacement.pane.id
                : null;
            const inheritedViewSettings = firstPlacement && (firstPlacement.kind === 'column' || firstPlacement.kind === 'floating')
                ? structuredClone(firstPlacement.pane.viewSettings)
                : undefined;

            for (const id of panelIds) {
                this.#removeTabFromAllLocations(id);
            }
            this.#cleanupEmptyPanesAcrossWorkspace();

            const pane = this.#createPaneNode([...panelIds], inheritedViewSettings);
            const activeId = activePanelId && panelIds.includes(activePanelId)
                ? activePanelId
                : panelIds[0];
            pane.activeTabId = activeId;
            pane.isCollapsed = false;

            for (const id of panelIds) {
                const tab = this.#tabs.get(id);
                if (tab) {
                    tab.placement = 'floating';
                    tab.collapsed = id !== activeId;
                }
            }

            const container: DockFloatingContainerModel = {
                id: this.#nextId('ptmt-float'),
                root: pane,
                geometry: clampFloatingGeometry(geometry ?? {}),
                zIndex: ++this.#floatingZ,
                windowMaximized: false,
                maximizedPaneId: null,
                originColumn,
                originPaneId,
            };
            this.#model.floating.push(container);
            this.signals.tabFloated.emit(panelIds, container.id);
            this.#emitChanged('tabFloated');
            return container.id;
        });
    }

    #createRestoreAnchor(node: DockNodeState, column: ColumnName): DockRestoreAnchor {
        const panelIds = this.#collectNodeTabs(node);
        const sourceIds = panelIds
            .map((id) => this.#tabs.get(id)?.sourceId)
            .filter((s): s is string => Boolean(s));
        return {
            panelIds,
            sourceIds,
            column,
            isCenter: column === 'center',
        };
    }

    #resolveAnchorPane(anchor: DockRestoreAnchor): DockPaneState | null {
        for (const panelId of anchor.panelIds) {
            const p = this.findTabPlacement(panelId);
            if (p && p.kind === 'column') return p.pane;
        }
        for (const sourceId of anchor.sourceIds) {
            const tab = this.getTabBySourceId(sourceId);
            if (!tab) continue;
            const p = this.findTabPlacement(tab.panelId);
            if (p && p.kind === 'column') return p.pane;
        }
        if (anchor.isCenter) {
            return this.#firstPaneInNode(this.#model.columns.center.root);
        }
        return null;
    }

    #resolveRestoredTabOrderIndex(pane: DockPaneState, paneLocation: DockRestoreLocation): number {
        const afterSiblings = paneLocation.siblings.slice(paneLocation.index + 1);
        for (const sib of afterSiblings) {
            for (const pid of sib.panelIds) {
                const idx = pane.tabs.indexOf(pid);
                if (idx >= 0) return idx;
            }
        }
        const beforeSiblings = [...paneLocation.siblings.slice(0, paneLocation.index)].reverse();
        for (const sib of beforeSiblings) {
            for (const pid of sib.panelIds) {
                const idx = pane.tabs.indexOf(pid);
                if (idx >= 0) return idx + 1;
            }
        }
        return clamp(paneLocation.index, 0, pane.tabs.length);
    }

    #nodeToPTMTLayoutNode(node: DockNodeState | null, column: ColumnName): LayoutNode | null {
        if (!node) return null;
        if (node.type === 'pane') {
            const tabs: TabData[] = node.tabs.map((panelId, order) => {
                const desc = this.#tabs.get(panelId);
                return {
                    panelId,
                    sourceId: desc?.sourceId ?? null,
                    title: desc?.title ?? null,
                    icon: desc?.icon ?? null,
                    color: desc?.color ?? null,
                    collapsed: desc?.collapsed ?? false,
                    active: node.activeTabId === panelId && !(desc?.collapsed ?? false),
                    order,
                    isDefault: desc?.isDefault,
                    customContent: desc?.customContent ?? null,
                    customData: desc?.customData ? structuredClone(desc.customData) : undefined,
                };
            });
            const paneNode: PaneNode = {
                type: 'pane',
                paneId: node.id,
                flex: node.isCollapsed ? '0 0 auto' : formatFlexPercentage(node.flexRatio),
                lastFlex: formatFlexPercentage(node.lastFlexRatio ?? node.flexRatio),
                viewSettings: structuredClone(node.viewSettings),
                tabs,
                isCollapsed: node.isCollapsed,
                columnLocation: column,
            };
            return paneNode;
        }

        const splitNode: SplitNode = {
            type: 'split',
            flex: node.isCollapsed ? '0 0 auto' : formatFlexPercentage(node.flexRatio),
            lastFlex: formatFlexPercentage(node.lastFlexRatio ?? node.flexRatio),
            orientation: node.orientation,
            naturalOrientation: node.naturalOrientation,
            orientationExpanded: node.orientationExpanded,
            orientationCollapsed: node.orientationCollapsed,
            children: node.children
                .map((child) => this.#nodeToPTMTLayoutNode(child, column))
                .filter((c): c is LayoutNode => Boolean(c)),
            splitRatios: ratiosToHundred(node.ratios, node.children.length),
            isCollapsed: node.isCollapsed,
            columnLocation: column,
        };
        return splitNode;
    }

    #nodeFromPTMTLayoutNode(
        node: LayoutNode | null,
        seenTabs: Set<string>,
        floating: boolean,
        warnings: string[],
    ): DockNodeState | null {
        if (!node) return null;
        if (node.type === 'pane') {
            const tabIds: string[] = [];
            let activeId: string | null = null;
            for (const rawTab of node.tabs ?? []) {
                const panelId = rawTab.panelId
                    || (rawTab.sourceId ? this.getTabBySourceId(rawTab.sourceId)?.panelId : null)
                    || rawTab.sourceId
                    || this.#nextId('panel');
                if (seenTabs.has(panelId)) {
                    warnings.push(`Skipped duplicate tab placement for ${panelId}`);
                    continue;
                }
                seenTabs.add(panelId);
                const desc = this.registerTab({
                    panelId,
                    sourceId: rawTab.sourceId ?? null,
                    title: rawTab.title ?? rawTab.sourceId ?? panelId,
                    icon: rawTab.icon ?? null,
                    color: rawTab.color ?? null,
                    collapsed: Boolean(rawTab.collapsed),
                    isDefault: rawTab.isDefault,
                    customContent: rawTab.customContent,
                    customData: rawTab.customData,
                });
                desc.placement = floating ? 'floating' : 'docked';
                tabIds.push(panelId);
                if (rawTab.active && !rawTab.collapsed) {
                    activeId = panelId;
                }
            }
            if (!activeId) {
                activeId = tabIds.find((id) => !this.#tabs.get(id)?.collapsed) ?? null;
            }
            const flexRatio = parseFlexRatioFromFlexString(node.lastFlex)
                ?? parseFlexRatioFromFlexString(node.flex)
                ?? 1;
            const pane = this.#createPaneNode(tabIds, node.viewSettings, node.paneId);
            pane.activeTabId = activeId;
            pane.flexRatio = flexRatio;
            pane.lastFlexRatio = parseFlexRatioFromFlexString(node.lastFlex) ?? flexRatio;
            pane.isCollapsed = Boolean(node.isCollapsed) || (tabIds.length > 0 && tabIds.every((id) => Boolean(this.#tabs.get(id)?.collapsed)));
            return pane;
        }

        const children: DockNodeState[] = [];
        const rawRatios: number[] = [];
        (node.children ?? []).forEach((child, idx) => {
            const converted = this.#nodeFromPTMTLayoutNode(child, seenTabs, floating, warnings);
            if (!converted) return;
            children.push(converted);
            const ratioFromSplit = node.splitRatios?.[idx];
            rawRatios.push(
                typeof ratioFromSplit === 'number' && ratioFromSplit > 0
                    ? ratioFromSplit
                    : converted.flexRatio,
            );
        });

        if (children.length === 0) return null;
        if (children.length === 1) return children[0];

        const split = this.#createSplitNode(node.orientation || 'vertical', children, rawRatios);
        split.naturalOrientation = node.naturalOrientation || node.orientation || 'vertical';
        split.orientationExpanded = (node.orientationExpanded as ViewOrientationSetting) || split.naturalOrientation;
        split.orientationCollapsed = (node.orientationCollapsed as ViewOrientationSetting) || 'auto';
        const flexRatio = parseFlexRatioFromFlexString(node.lastFlex)
            ?? parseFlexRatioFromFlexString(node.flex)
            ?? 1;
        split.flexRatio = flexRatio;
        split.lastFlexRatio = parseFlexRatioFromFlexString(node.lastFlex) ?? flexRatio;
        split.isCollapsed = Boolean(node.isCollapsed) || children.every((c) => c.isCollapsed);
        return split;
    }

    #sanitizeRestoredNode(
        node: DockNodeState | null,
        seenTabs: Set<string>,
        floating: boolean,
        warnings: string[],
    ): DockNodeState | null {
        if (!node) return null;
        if (node.type === 'pane') {
            const tabs = node.tabs.filter((id) => {
                if (seenTabs.has(id)) {
                    warnings.push(`Skipped duplicate floating tab placement: ${id}`);
                    return false;
                }
                seenTabs.add(id);
                if (!this.#tabs.has(id)) {
                    this.registerTab({ panelId: id, title: id });
                }
                const tab = this.#tabs.get(id);
                if (tab) tab.placement = floating ? 'floating' : 'docked';
                return true;
            });
            if (tabs.length === 0) return null;
            return {
                ...structuredClone(node),
                tabs,
                activeTabId: node.activeTabId && tabs.includes(node.activeTabId) ? node.activeTabId : tabs[0],
                selectedTabIds: [],
            };
        }
        const children: DockNodeState[] = [];
        const rawRatios: number[] = [];
        node.children.forEach((child, idx) => {
            const sanitized = this.#sanitizeRestoredNode(child, seenTabs, floating, warnings);
            if (sanitized) {
                children.push(sanitized);
                rawRatios.push(node.ratios[idx] ?? 1);
            }
        });
        if (children.length === 0) return null;
        if (children.length === 1) return children[0];
        return {
            ...structuredClone(node),
            children,
            ratios: normalizeRatios(rawRatios, children.length),
        };
    }

    #emitChanged(reason: string): void {
        if (this.#batchDepth > 0 || this.#restoring) {
            this.#pendingReason = reason;
            return;
        }
        this.signals.stateChanged.emit(reason);
    }

    #flushChanged(fallbackReason: string): void {
        if (this.#batchDepth > 0 || this.#restoring || !this.#pendingReason) return;
        const reason = this.#pendingReason || fallbackReason;
        this.#pendingReason = null;
        this.signals.stateChanged.emit(reason);
    }
}

function ratiosToHundred(ratios: readonly number[], count: number): number[] {
    return normalizeRatios(ratios, count).map((r) => Number((r * 100).toFixed(2)));
}
