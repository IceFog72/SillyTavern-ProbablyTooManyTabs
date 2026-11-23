// dock-reconciler.ts - DOM-Preserving Reconciler & Interactive Controller for PTMT Dock Engine
// Bridges DockEngine to PTMT's live DOM (#ptmt-mainBody, .ptmt-pane, .ptmt-split, .ptmt-tab, .ptmt-panel)
// without ever destroying or recreating live SillyTavern panel content.
import { el, getPanelById, getPanelBySourceId, getRefs, getTabById, readPaneViewSettings, writePaneViewSettings, trackListener, } from '../core/utils.js';
import { SELECTORS, EVENTS } from '../core/constants.js';
import { settings } from '../core/settings.js';
import { showContextMenu } from '../ui/context-menu.js';
import { createPane, cleanupPaneObservers, removePaneIfEmpty, checkAndCollapsePaneIfAllTabsCollapsed, setPaneCollapsedView, splitPaneWithPane, applyPaneOrientation, applyIconsOnly, } from '../layout/pane.js';
import { setActivePanelInPane, openTab } from '../tabs/tabs.js';
import { moveTabTransaction } from '../layout/layout-transactions.js';
import { recalculateAllSplitsRecursively, parseFlexBasis } from '../layout/layout-math.js';
import { recalculateColumnSizes, applyColumnVisibility } from '../layout/layout.js';
import { DockEngine } from './dock-engine.js';
import { isExistingDockZone, isInsertBeforeZone, isOuterDockZone, splitOrientationForZone, } from './dock-types.js';
import { clamp, clampFloatingGeometry, formatFlexPercentage, insertRatioWithStrategy, normalizeRatios, } from './dock-math.js';
const COLUMN_NAMES = ['left', 'center', 'right'];
const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export class PTMTDockController {
    engine;
    #floatingDom = new Map();
    #floatingLayerEl = null;
    #maximizedPaneEl = null;
    #dragRevealDepth = 0;
    #initialized = false;
    #isApplyingState = false;
    constructor(engine) {
        this.engine = engine ?? new DockEngine();
    }
    init() {
        if (this.#initialized) {
            this.#ensureShellElements();
            this.decorateAllPanes();
            return;
        }
        this.#initialized = true;
        this.#ensureShellElements();
        this.#bindGlobalListeners();
        this.syncFromDOM();
        this.decorateAllPanes();
    }
    cleanup() {
        this.endDragReveal(true);
        this.maximizePane(null);
        for (const dom of this.#floatingDom.values()) {
            dom.tabObserver.disconnect();
            cleanupPaneObservers(dom.paneEl);
            dom.windowEl.remove();
        }
        this.#floatingDom.clear();
        this.#floatingLayerEl?.remove();
        this.#floatingLayerEl = null;
        this.#initialized = false;
    }
    // ─── Configuration & Strategy Controls ──────────────────────────────────
    get dockingSizeStrategy() {
        return settings.get('dockingSizeStrategy')
            ?? this.engine.dockingSizeStrategy;
    }
    setDockingSizeStrategy(strategy) {
        this.engine.setDockingSizeStrategy(strategy);
        settings.update({ dockingSizeStrategy: strategy });
        this.#emitLayoutChanged('dockingSizeStrategyChanged');
    }
    togglePaneTabAlign(paneEl) {
        const vs = readPaneViewSettings(paneEl);
        const next = !vs.tabAlignEnd;
        writePaneViewSettings(paneEl, { tabAlignEnd: next });
        paneEl.classList.toggle('ptmt-tabs-align-end', next);
        this.#emitLayoutChanged('paneTabAlignChanged', paneEl);
        return next;
    }
    // ─── Drag Reveal: Hidden/Empty Left/Right Columns + Auto-Hide/Shy Tabs ─
    beginDragReveal() {
        this.#dragRevealDepth += 1;
        if (this.#dragRevealDepth > 1)
            return;
        const refs = getRefs();
        document.body.classList.add('ptmt-drag-active');
        refs.mainBody?.classList.add('ptmt-drag-active');
        for (const colName of ['left', 'right']) {
            const colEl = colName === 'left' ? refs.leftBody : refs.rightBody;
            if (!colEl)
                continue;
            const isHidden = colEl.style.display === 'none';
            const tabCount = colEl.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length;
            if (!isHidden && tabCount > 0)
                continue;
            colEl.dataset.ptmtDragRevealed = 'true';
            colEl.dataset.ptmtPrevDisplay = colEl.style.display;
            colEl.dataset.ptmtPrevFlex = colEl.style.flex;
            colEl.classList.add('ptmt-column-drag-target');
            if (!colEl.querySelector(SELECTORS.PANE)) {
                const pane = createPane();
                colEl.appendChild(pane);
                applyPaneOrientation(pane);
                this.decoratePane(pane);
            }
            colEl.style.display = 'flex';
            colEl.style.flex = '0 0 140px';
        }
    }
    endDragReveal(force = false) {
        if (force) {
            this.#dragRevealDepth = 0;
        }
        else {
            this.#dragRevealDepth = Math.max(0, this.#dragRevealDepth - 1);
            if (this.#dragRevealDepth > 0)
                return;
        }
        const refs = getRefs();
        document.body.classList.remove('ptmt-drag-active');
        refs.mainBody?.classList.remove('ptmt-drag-active');
        let visibilityChanged = false;
        for (const colName of ['left', 'right']) {
            const colEl = colName === 'left' ? refs.leftBody : refs.rightBody;
            if (!colEl || colEl.dataset.ptmtDragRevealed !== 'true')
                continue;
            const prevDisplay = colEl.dataset.ptmtPrevDisplay ?? '';
            const prevFlex = colEl.dataset.ptmtPrevFlex ?? '';
            delete colEl.dataset.ptmtDragRevealed;
            delete colEl.dataset.ptmtPrevDisplay;
            delete colEl.dataset.ptmtPrevFlex;
            colEl.classList.remove('ptmt-column-drag-target');
            const hasTabsNow = colEl.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length > 0;
            if (hasTabsNow) {
                delete colEl.dataset.isColumnCollapsed;
                colEl.style.flex = colEl.dataset.lastFlex || '1 1 20%';
                const settingKey = colName === 'left' ? 'showLeftPane' : 'showRightPane';
                if (!settings.get(settingKey)) {
                    settings.update({ [settingKey]: true });
                }
                visibilityChanged = true;
            }
            else {
                colEl.querySelectorAll(SELECTORS.PANE).forEach((p) => {
                    if (!p._tabStrip?.querySelector('.ptmt-tab:not(.ptmt-view-settings)')) {
                        p.remove();
                    }
                });
                const settingKey = colName === 'left' ? 'showLeftPane' : 'showRightPane';
                if (!settings.get(settingKey)) {
                    colEl.style.display = 'none';
                }
                else {
                    colEl.style.display = prevDisplay || 'flex';
                }
                colEl.style.flex = prevFlex;
            }
        }
        if (visibilityChanged) {
            applyColumnVisibility();
            recalculateColumnSizes();
        }
    }
    // ─── Multi-Tab Selection (Tab Groups) ───────────────────────────────────
    toggleTabSelection(panelId, additive = true) {
        const tabEl = getTabById(panelId);
        const paneEl = tabEl?.closest(SELECTORS.PANE);
        if (!tabEl || !paneEl || !paneEl._tabStrip)
            return [];
        if (!additive) {
            this.clearTabSelection(paneEl);
            tabEl.classList.add('ptmt-tab-selected');
        }
        else {
            tabEl.classList.toggle('ptmt-tab-selected');
        }
        const selectedIds = this.getSelectedTabIdsInPane(paneEl);
        if (paneEl.dataset.paneId) {
            this.engine.toggleTabSelection(panelId, additive);
        }
        return selectedIds;
    }
    getSelectedTabIdsInPane(paneEl) {
        if (!paneEl || !paneEl._tabStrip)
            return [];
        return Array.from(paneEl._tabStrip.querySelectorAll('.ptmt-tab.ptmt-tab-selected'))
            .map((t) => t.dataset.for || '')
            .filter(Boolean);
    }
    getDragGroupForPanel(panelId) {
        const tabEl = getTabById(panelId);
        const paneEl = tabEl?.closest(SELECTORS.PANE);
        if (!paneEl)
            return [panelId];
        const selected = this.getSelectedTabIdsInPane(paneEl);
        if (selected.length > 1 && selected.includes(panelId)) {
            return selected;
        }
        return [panelId];
    }
    clearTabSelection(paneEl) {
        const root = paneEl?._tabStrip ?? document;
        root.querySelectorAll('.ptmt-tab.ptmt-tab-selected').forEach((t) => {
            t.classList.remove('ptmt-tab-selected');
        });
        this.engine.clearTabSelection(paneEl?.dataset?.paneId);
    }
    // ─── Strategy-Aware Docking & Outer Edge Docking ────────────────────────
    dockPanelsToTarget(panelIds, targetPaneEl, zone = 'center', options = {}) {
        const validPanels = [...new Set(panelIds)]
            .map((pid) => getPanelById(pid))
            .filter((p) => Boolean(p));
        if (validPanels.length === 0)
            return null;
        this.clearTabSelection();
        const primaryPanel = (options.activePanelId ? getPanelById(options.activePanelId) : null) ?? validPanels[0];
        // 1. Handle existing-* neighbor zones
        if (isExistingDockZone(zone) && targetPaneEl) {
            const neighbor = this.#findExistingNeighborPaneDOM(targetPaneEl, zone);
            if (neighbor) {
                return this.dockPanelsToTarget(panelIds, neighbor, 'center', options);
            }
            zone = 'center';
        }
        // 2. Handle outer-* zones (dock at the root of the column!)
        if (isOuterDockZone(zone)) {
            const columnEl = targetPaneEl?.closest(SELECTORS.COLUMN)
                ?? this.#getColumnElement(options.column ?? 'center');
            if (columnEl) {
                return this.#dockPanelsAtColumnOuterEdgeDOM(validPanels, primaryPanel, columnEl, zone);
            }
        }
        const resolvedTargetPane = targetPaneEl ?? this.#findDefaultTargetPane(options.column ?? 'center');
        if (!resolvedTargetPane)
            return null;
        // 3. Center drop (also prevent splitting a pane when moving ALL of its own tabs or targeting a floating pane)
        const targetExistingPanelIds = Array.from(resolvedTargetPane._panelContainer?.querySelectorAll(SELECTORS.PANEL) ?? []).map((p) => p.dataset.panelId || '').filter(Boolean);
        const movingIds = new Set(validPanels.map((p) => p.dataset.panelId || ''));
        const isSelfFullSplit = targetExistingPanelIds.length > 0 && targetExistingPanelIds.every((id) => movingIds.has(id));
        const isFloatingTarget = Boolean(resolvedTargetPane.dataset.floatingContainerId || resolvedTargetPane.closest('.ptmt-floating-window'));
        if (zone === 'center' || isSelfFullSplit || isFloatingTarget) {
            let insertIdx = options.index
                ?? (resolvedTargetPane._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length || 0);
            for (const panel of validPanels) {
                moveTabTransaction({ panel, pane: resolvedTargetPane, index: insertIdx });
                insertIdx += 1;
            }
            if (primaryPanel.dataset.panelId) {
                openTab(primaryPanel.dataset.panelId);
            }
            this.cleanupEmptyFloatingWindows();
            this.syncFromDOM();
            return resolvedTargetPane;
        }
        // 4. Panel-relative split ('left' | 'right' | 'top' | 'bottom')
        const vertical = zone === 'left' || zone === 'right';
        const newFirst = isInsertBeforeZone(zone);
        const parentEl = resolvedTargetPane.parentElement;
        const strategy = parentEl?.dataset?.sizingStrategy ?? this.dockingSizeStrategy;
        const targetRect = resolvedTargetPane.getBoundingClientRect();
        const parentIsSameOrientationSplit = Boolean(parentEl
            && parentEl.classList.contains(SELECTORS.SPLIT.substring(1))
            && (parentEl.classList.contains('horizontal') === !vertical));
        const priorSiblingFlexes = parentIsSameOrientationSplit && parentEl
            ? this.#captureSplitChildRatios(parentEl)
            : null;
        const targetIndexInParent = parentIsSameOrientationSplit && parentEl
            ? this.#getStructuralChildren(parentEl).indexOf(resolvedTargetPane)
            : -1;
        const srcPanes = new Set(validPanels
            .map((p) => p.closest(SELECTORS.PANE))
            .filter((p) => Boolean(p)));
        splitPaneWithPane(resolvedTargetPane, validPanels[0], vertical, newFirst);
        const newPaneEl = validPanels[0].closest(SELECTORS.PANE);
        if (newPaneEl && validPanels.length > 1) {
            for (let i = 1; i < validPanels.length; i++) {
                moveTabTransaction({ panel: validPanels[i], pane: newPaneEl, index: i });
            }
        }
        const createdSplit = newPaneEl?.parentElement;
        if (createdSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
            if (priorSiblingFlexes && targetIndexInParent >= 0 && parentEl) {
                const targetShare = priorSiblingFlexes[targetIndexInParent] ?? (1 / priorSiblingFlexes.length);
                const flexStr = formatFlexPercentage(targetShare);
                createdSplit.style.flex = flexStr;
                createdSplit.dataset.lastFlex = flexStr;
            }
            else if (targetRect.width > 0 && parentEl?.classList.contains(SELECTORS.SPLIT.substring(1))) {
                const parentRect = parentEl.getBoundingClientRect();
                const isParentHoriz = parentEl.classList.contains('horizontal');
                const ratio = isParentHoriz
                    ? (parentRect.height > 0 ? targetRect.height / parentRect.height : 0.5)
                    : (parentRect.width > 0 ? targetRect.width / parentRect.width : 0.5);
                if (strategy !== 'proportional') {
                    const flexStr = formatFlexPercentage(clamp(ratio, 0.1, 0.9));
                    createdSplit.style.flex = flexStr;
                    createdSplit.dataset.lastFlex = flexStr;
                }
            }
        }
        if (primaryPanel.dataset.panelId) {
            openTab(primaryPanel.dataset.panelId);
        }
        for (const srcPane of srcPanes) {
            if (srcPane.isConnected && srcPane !== newPaneEl) {
                removePaneIfEmpty(srcPane);
            }
        }
        this.cleanupEmptyFloatingWindows();
        if (newPaneEl)
            this.decoratePane(newPaneEl);
        this.syncFromDOM();
        return newPaneEl ?? null;
    }
    // ─── Floating Windows (Single Unified Bar + Drag-to-Dock) ───────────────
    floatTab(panelId, geometry) {
        return this.floatTabGroup([panelId], geometry, panelId);
    }
    floatTabGroup(panelIds, geometry, activePanelId) {
        this.#ensureShellElements();
        const panels = [...new Set(panelIds)]
            .map((id) => getPanelById(id))
            .filter((p) => Boolean(p));
        if (panels.length === 0)
            return null;
        this.clearTabSelection();
        const firstPanel = panels[0];
        const sourcePane = firstPanel.closest(SELECTORS.PANE);
        if (sourcePane && sourcePane === this.#maximizedPaneEl) {
            this.maximizePane(null);
        }
        const sourceCol = sourcePane?.closest(SELECTORS.COLUMN);
        const originColumn = sourceCol?.id === 'ptmt-leftBody'
            ? 'left'
            : sourceCol?.id === 'ptmt-rightBody'
                ? 'right'
                : 'center';
        const hostRect = getRefs().mainBody?.getBoundingClientRect();
        const sourceRect = sourcePane?.getBoundingClientRect();
        const clampedGeo = clampFloatingGeometry({
            x: geometry?.x ?? (sourceRect && hostRect ? Math.max(24, sourceRect.left - hostRect.left + 24) : 80),
            y: geometry?.y ?? (sourceRect && hostRect ? Math.max(24, sourceRect.top - hostRect.top + 24) : 64),
            width: geometry?.width ?? (sourceRect && sourceRect.width > 180 ? Math.min(640, sourceRect.width) : 480),
            height: geometry?.height ?? (sourceRect && sourceRect.height > 140 ? Math.min(520, sourceRect.height) : 360),
        }, hostRect ? { width: hostRect.width, height: hostRect.height } : null);
        for (const panel of panels) {
            const pid = panel.dataset.panelId;
            const tabEl = getTabById(pid);
            const label = tabEl?.querySelector('.ptmt-tab-label')?.textContent || panel.dataset.title || pid;
            this.engine.registerTab({
                panelId: pid,
                sourceId: panel.dataset.sourceId ?? null,
                title: label,
            });
        }
        const containerId = this.engine.floatTabGroup(panels.map((p) => p.dataset.panelId), clampedGeo, activePanelId ?? firstPanel.dataset.panelId);
        if (!containerId)
            return null;
        const inheritedSettings = sourcePane ? { ...readPaneViewSettings(sourcePane) } : {};
        // Floating panes always use horizontal top bar (tabs first) so there's one clean title/tab bar,
        // while preserving `inheritedSettings` on the floating container to restore when docked back.
        const floatingSettings = {
            ...inheritedSettings,
            defaultOrientation: 'horizontal',
            contentFlow: 'default',
            tabStripMode: 'normal',
        };
        const floatingDom = this.#createFloatingWindowDOM(containerId, clampedGeo, floatingSettings, originColumn, inheritedSettings);
        const prevPanes = new Set();
        panels.forEach((panel, index) => {
            const prevPane = panel.closest(SELECTORS.PANE);
            if (prevPane)
                prevPanes.add(prevPane);
            moveTabTransaction({ panel, pane: floatingDom.paneEl, index });
        });
        const targetActiveId = activePanelId ?? firstPanel.dataset.panelId ?? null;
        setActivePanelInPane(floatingDom.paneEl, targetActiveId);
        for (const prevPane of prevPanes) {
            if (prevPane !== floatingDom.paneEl) {
                setActivePanelInPane(prevPane);
                checkAndCollapsePaneIfAllTabsCollapsed(prevPane);
                removePaneIfEmpty(prevPane);
            }
        }
        this.cleanupEmptyFloatingWindows();
        this.decoratePane(floatingDom.paneEl);
        this.syncFromDOM();
        this.#emitLayoutChanged('tabFloated', floatingDom.paneEl);
        return containerId;
    }
    floatPane(paneOrId, geometry) {
        const paneEl = typeof paneOrId === 'string' ? this.getPaneElementById(paneOrId) : paneOrId;
        if (!paneEl || !paneEl._tabStrip)
            return null;
        const tabs = Array.from(paneEl._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
        const panelIds = tabs.map((t) => t.dataset.for || '').filter(Boolean);
        if (panelIds.length === 0)
            return null;
        const activeTab = paneEl._tabStrip.querySelector('.ptmt-tab.active');
        return this.floatTabGroup(panelIds, geometry, activeTab?.dataset.for);
    }
    mergeFloatingContainers(sourceContainerId, targetContainerId) {
        if (sourceContainerId === targetContainerId)
            return false;
        const sourceDom = this.#floatingDom.get(sourceContainerId);
        const targetDom = this.#floatingDom.get(targetContainerId);
        if (!sourceDom || !targetDom) {
            return this.engine.mergeFloatingContainers(sourceContainerId, targetContainerId);
        }
        const sourcePanels = Array.from(sourceDom.paneEl._panelContainer?.querySelectorAll(SELECTORS.PANEL) ?? []);
        if (sourcePanels.length === 0)
            return false;
        const activeTab = sourceDom.paneEl._tabStrip?.querySelector('.ptmt-tab.active');
        const activePid = activeTab?.dataset.for ?? sourcePanels[0].dataset.panelId ?? null;
        let insertIdx = targetDom.paneEl._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0;
        for (const panel of sourcePanels) {
            moveTabTransaction({ panel, pane: targetDom.paneEl, index: insertIdx++ });
        }
        this.#destroyFloatingDOM(sourceContainerId);
        this.engine.mergeFloatingContainers(sourceContainerId, targetContainerId);
        setActivePanelInPane(targetDom.paneEl, activePid);
        this.#bringFloatingWindowToFront(targetDom);
        this.syncFromDOM();
        this.#emitLayoutChanged('floatingContainersMerged', targetDom.paneEl);
        return true;
    }
    dockFloatingContainer(containerId, targetPaneEl, zone = 'center', column) {
        const floatingDom = this.#floatingDom.get(containerId);
        if (!floatingDom)
            return null;
        const panels = Array.from(floatingDom.paneEl._panelContainer?.querySelectorAll(SELECTORS.PANEL) ?? []);
        const panelIds = panels.map((p) => p.dataset.panelId || '').filter(Boolean);
        const activeTab = floatingDom.paneEl._tabStrip?.querySelector('.ptmt-tab.active');
        const activePid = activeTab?.dataset.for ?? panelIds[0];
        const originCol = floatingDom.windowEl.dataset.originColumn || column || 'center';
        const savedViewSettings = floatingDom.originalViewSettings;
        const targetWasEmpty = Boolean(targetPaneEl
            && (targetPaneEl._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0) === 0);
        const destinationPane = this.dockPanelsToTarget(panelIds, targetPaneEl ?? null, zone, {
            activePanelId: activePid,
            column: originCol,
        });
        // Restore the pane settings remembered from before floating when creating a new split pane or filling an empty pane
        const shouldRestoreSettings = Boolean(destinationPane
            && Object.keys(savedViewSettings).length > 0
            && (targetWasEmpty || (zone !== 'center' && !isExistingDockZone(zone))));
        if (shouldRestoreSettings && destinationPane) {
            writePaneViewSettings(destinationPane, savedViewSettings);
            destinationPane.classList.toggle('ptmt-tabs-align-end', !!savedViewSettings.tabAlignEnd);
            applyPaneOrientation(destinationPane);
            if (typeof savedViewSettings.iconOnly === 'boolean') {
                applyIconsOnly(destinationPane, savedViewSettings.iconOnly);
            }
        }
        this.#destroyFloatingDOM(containerId);
        this.engine.dockFloatingContainer(containerId, destinationPane?.dataset?.paneId ?? null, zone, originCol);
        this.syncFromDOM();
        this.#emitLayoutChanged('floatingContainerDocked', destinationPane ?? undefined);
        return destinationPane;
    }
    cleanupEmptyFloatingWindows() {
        for (const [containerId, dom] of [...this.#floatingDom.entries()]) {
            const tabCount = dom.paneEl._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0;
            const panelCount = dom.paneEl._panelContainer?.querySelectorAll(SELECTORS.PANEL).length ?? 0;
            if (tabCount === 0 || panelCount === 0 || !dom.windowEl.isConnected) {
                this.#destroyFloatingDOM(containerId);
            }
        }
    }
    // ─── Container Fullscreen / Pane Maximize ───────────────────────────────
    get maximizedPaneElement() {
        return this.#maximizedPaneEl;
    }
    maximizePane(paneOrId) {
        const targetPane = typeof paneOrId === 'string'
            ? this.getPaneElementById(paneOrId)
            : paneOrId;
        // If targetPane is inside a floating window, toggle that floating window's maximize state
        if (targetPane?.dataset.floatingContainerId) {
            const fDom = this.#floatingDom.get(targetPane.dataset.floatingContainerId);
            if (fDom) {
                this.#toggleFloatingWindowMaximize(fDom);
                return true;
            }
        }
        if (!targetPane || targetPane === this.#maximizedPaneEl) {
            if (!this.#maximizedPaneEl)
                return false;
            const prev = this.#maximizedPaneEl;
            this.#maximizedPaneEl = null;
            prev.classList.remove('ptmt-pane-maximized');
            getRefs().mainBody?.classList.remove('ptmt-has-maximized-pane');
            document.body.classList.remove('ptmt-has-maximized-pane');
            this.#updatePaneMaximizeButtonIcon(prev, false);
            this.engine.maximizePane(null);
            this.#emitLayoutChanged('paneRestoredFromMaximize', prev);
            return true;
        }
        if (this.#maximizedPaneEl && this.#maximizedPaneEl !== targetPane) {
            this.#maximizedPaneEl.classList.remove('ptmt-pane-maximized');
            this.#updatePaneMaximizeButtonIcon(this.#maximizedPaneEl, false);
        }
        if (targetPane.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1))) {
            setPaneCollapsedView(targetPane, false);
        }
        this.#maximizedPaneEl = targetPane;
        this.#syncMaximizedBounds();
        targetPane.classList.add('ptmt-pane-maximized');
        getRefs().mainBody?.classList.add('ptmt-has-maximized-pane');
        document.body.classList.add('ptmt-has-maximized-pane');
        this.#updatePaneMaximizeButtonIcon(targetPane, true);
        if (targetPane.dataset.paneId) {
            this.engine.maximizePane(targetPane.dataset.paneId);
        }
        this.#emitLayoutChanged('paneMaximized', targetPane);
        return true;
    }
    #syncMaximizedBounds() {
        const mainBody = getRefs().mainBody;
        if (!mainBody)
            return;
        const r = mainBody.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0)
            return;
        document.documentElement.style.setProperty('--ptmt-max-top', `${Math.round(r.top)}px`);
        document.documentElement.style.setProperty('--ptmt-max-left', `${Math.round(r.left)}px`);
        document.documentElement.style.setProperty('--ptmt-max-width', `${Math.round(r.width)}px`);
        document.documentElement.style.setProperty('--ptmt-max-height', `${Math.round(r.height)}px`);
    }
    // ─── Outer Column Edge Docking (DOM) ────────────────────────────────────
    #dockPanelsAtColumnOuterEdgeDOM(panels, primaryPanel, columnEl, zone) {
        const orientation = splitOrientationForZone(zone);
        const before = isInsertBeforeZone(zone);
        const rootChild = Array.from(columnEl.children).find((c) => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
        const strategy = rootChild?.dataset?.sizingStrategy ?? this.dockingSizeStrategy;
        if (!rootChild) {
            const pane = createPane();
            columnEl.appendChild(pane);
            panels.forEach((p, idx) => moveTabTransaction({ panel: p, pane, index: idx }));
            if (primaryPanel.dataset.panelId)
                openTab(primaryPanel.dataset.panelId);
            this.decoratePane(pane);
            this.syncFromDOM();
            return pane;
        }
        const rootIsSameOrientationSplit = rootChild.classList.contains(SELECTORS.SPLIT.substring(1))
            && (rootChild.classList.contains('horizontal') === (orientation === 'horizontal'));
        if (rootIsSameOrientationSplit) {
            const existingChildren = this.#getStructuralChildren(rootChild);
            const oldRatios = this.#captureSplitChildRatios(rootChild);
            const newPane = createPane();
            const resizer = el('splitter', {
                className: orientation === 'horizontal'
                    ? SELECTORS.RESIZER_H.substring(1)
                    : SELECTORS.RESIZER_V.substring(1),
            });
            if (before) {
                rootChild.insertBefore(resizer, existingChildren[0] ?? null);
                rootChild.insertBefore(newPane, resizer);
            }
            else {
                rootChild.append(resizer, newPane);
            }
            window.ptmtTabs?.attachResizer?.(resizer, orientation);
            const insertIndex = before ? 0 : existingChildren.length;
            const nextRatios = insertRatioWithStrategy({
                ratios: oldRatios,
                oldCount: existingChildren.length,
                insertIndex,
                referenceIndex: before ? 0 : existingChildren.length - 1,
                strategy,
                isOuterDock: true,
            });
            const updatedChildren = this.#getStructuralChildren(rootChild);
            updatedChildren.forEach((child, idx) => {
                const flexStr = formatFlexPercentage(nextRatios[idx] ?? (1 / updatedChildren.length));
                child.style.flex = flexStr;
                child.dataset.lastFlex = flexStr;
            });
            panels.forEach((p, idx) => moveTabTransaction({ panel: p, pane: newPane, index: idx }));
            if (primaryPanel.dataset.panelId)
                openTab(primaryPanel.dataset.panelId);
            recalculateAllSplitsRecursively(rootChild);
            this.cleanupEmptyFloatingWindows();
            this.decoratePane(newPane);
            this.syncFromDOM();
            return newPane;
        }
        const newSplit = el('div', {
            className: `${SELECTORS.SPLIT.substring(1)}${orientation === 'horizontal' ? ' horizontal' : ''}`,
        });
        newSplit.dataset.naturalOrientation = orientation;
        newSplit.dataset.orientationExpanded = orientation;
        newSplit.dataset.orientationCollapsed = 'auto';
        const newPane = createPane();
        const resizer = el('splitter', {
            className: orientation === 'horizontal'
                ? SELECTORS.RESIZER_H.substring(1)
                : SELECTORS.RESIZER_V.substring(1),
        });
        columnEl.replaceChild(newSplit, rootChild);
        if (before) {
            newSplit.append(newPane, resizer, rootChild);
        }
        else {
            newSplit.append(rootChild, resizer, newPane);
        }
        window.ptmtTabs?.attachResizer?.(resizer, orientation);
        newPane.style.flex = '1 1 50%';
        newPane.dataset.lastFlex = '1 1 50%';
        rootChild.style.flex = '1 1 50%';
        rootChild.dataset.lastFlex = '1 1 50%';
        panels.forEach((p, idx) => moveTabTransaction({ panel: p, pane: newPane, index: idx }));
        if (primaryPanel.dataset.panelId)
            openTab(primaryPanel.dataset.panelId);
        recalculateAllSplitsRecursively(newSplit);
        this.cleanupEmptyFloatingWindows();
        this.decoratePane(newPane);
        this.syncFromDOM();
        return newPane;
    }
    // ─── Pane & Tab Strip UI Decoration ─────────────────────────────────────
    decorateAllPanes() {
        document.querySelectorAll(SELECTORS.PANE).forEach((pane) => this.decoratePane(pane));
    }
    decoratePane(paneEl) {
        if (!paneEl || !paneEl._tabStrip)
            return;
        const tabStrip = paneEl._tabStrip;
        const vs = readPaneViewSettings(paneEl);
        paneEl.classList.toggle('ptmt-tabs-align-end', !!vs.tabAlignEnd);
        paneEl.classList.toggle('ptmt-pane-hide-tablist-btn', vs.showTabListButton === false);
        paneEl.classList.toggle('ptmt-pane-hide-maximize-btn', vs.showMaximizeButton === false);
        paneEl.classList.toggle('ptmt-pane-hide-undock-handle', vs.showUndockHandle === false);
        const actionsHost = paneEl._grid || paneEl;
        let actionsEl = actionsHost.querySelector(':scope > .ptmt-tabstrip-actions');
        if (!actionsEl) {
            // Remove any legacy actions element that may have lived inside tabStrip
            tabStrip.querySelector('.ptmt-tabstrip-actions')?.remove();
            actionsEl = el('div', { className: 'ptmt-tabstrip-actions' });
            actionsEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                tabStrip.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                }));
            });
            // 1. Tab Overflow Dropdown Menu Button
            const menuBtn = el('button', {
                type: 'button',
                className: 'ptmt-tabstrip-action-btn ptmt-tabstrip-menu-btn',
                title: 'All Tabs in Pane',
            }, el('i', { className: 'fa-solid fa-chevron-down' }));
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.#openPaneTabListMenu(e, paneEl);
            });
            // 2. Single Maximize / Restore Button (works for both docked panes and floating windows)
            const maxBtn = el('button', {
                type: 'button',
                className: 'ptmt-tabstrip-action-btn ptmt-pane-maximize-btn',
                title: 'Maximize / Restore (Esc)',
            }, el('i', { className: 'fa-solid fa-expand' }));
            maxBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.maximizePane(paneEl);
            });
            // 3. 3-Dots Undock Handle (placed last after Maximize — pull to undock pane into a floating window)
            const undockHandle = el('button', {
                type: 'button',
                className: 'ptmt-tabstrip-action-btn ptmt-pane-undock-handle',
                title: 'Drag to undock pane into a floating window',
            }, el('i', { className: 'fa-solid fa-ellipsis-vertical' }));
            this.#bindPaneUndockHandle(undockHandle, paneEl);
            actionsEl.append(menuBtn, maxBtn, undockHandle);
            actionsHost.appendChild(actionsEl);
        }
    }
    // ─── DOM -> DockEngine Synchronization & Snapshot Persistence ───────────
    syncFromDOM() {
        if (this.#isApplyingState)
            return;
        const refs = getRefs();
        const mainBody = refs.mainBody;
        if (!mainBody)
            return;
        this.engine.batch('syncFromDOM', () => {
            const colMap = {
                left: refs.leftBody,
                center: refs.centerBody,
                right: refs.rightBody,
            };
            const model = this.engine.snapshotModel();
            for (const colName of COLUMN_NAMES) {
                const colEl = colMap[colName];
                if (!colEl)
                    continue;
                const visible = colEl.style.display !== 'none';
                this.engine.setColumnVisibility(colName, visible);
            }
            document.querySelectorAll(SELECTORS.PANEL).forEach((panelEl) => {
                const pid = panelEl.dataset.panelId;
                if (!pid)
                    return;
                const tabEl = getTabById(pid);
                const title = tabEl?.querySelector('.ptmt-tab-label')?.textContent
                    || panelEl.dataset.title
                    || panelEl.dataset.sourceId
                    || pid;
                this.engine.registerTab({
                    panelId: pid,
                    sourceId: panelEl.dataset.sourceId ?? null,
                    title,
                    collapsed: tabEl ? tabEl.classList.contains('collapsed') : panelEl.classList.contains('collapsed'),
                });
            });
            const hostRect = mainBody.getBoundingClientRect();
            for (const [containerId, dom] of this.#floatingDom.entries()) {
                if (!dom.windowEl.isConnected)
                    continue;
                if (!dom.windowEl.classList.contains('is-window-maximized') && hostRect.width > 0) {
                    const r = dom.windowEl.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        this.engine.setFloatingGeometry(containerId, {
                            x: Math.round(r.left - hostRect.left),
                            y: Math.round(r.top - hostRect.top),
                            width: Math.round(r.width),
                            height: Math.round(r.height),
                        }, false);
                    }
                }
            }
            const strategy = settings.get('dockingSizeStrategy') ?? model.dockingSizeStrategy;
            this.engine.setDockingSizeStrategy(strategy);
        });
    }
    exportDockExtensionState() {
        this.syncFromDOM();
        const model = this.engine.snapshotModel();
        const refs = getRefs();
        const hostRect = refs.mainBody?.getBoundingClientRect();
        const floatingModels = [];
        for (const [containerId, dom] of this.#floatingDom.entries()) {
            if (!dom.windowEl.isConnected)
                continue;
            const panels = Array.from(dom.paneEl._panelContainer?.querySelectorAll(SELECTORS.PANEL) ?? []);
            const tabIds = panels.map((p) => p.dataset.panelId || '').filter(Boolean);
            if (tabIds.length === 0)
                continue;
            for (const panel of panels) {
                const pid = panel.dataset.panelId;
                const tabEl = getTabById(pid);
                const title = tabEl?.querySelector('.ptmt-tab-label')?.textContent || panel.dataset.title || pid;
                this.engine.registerTab({
                    panelId: pid,
                    sourceId: panel.dataset.sourceId ?? null,
                    title,
                    collapsed: Boolean(tabEl?.classList.contains('collapsed')),
                });
            }
            const activeTab = dom.paneEl._tabStrip?.querySelector('.ptmt-tab.active');
            const rect = dom.windowEl.getBoundingClientRect();
            const geometry = hostRect && rect.width > 0
                ? clampFloatingGeometry({
                    x: rect.left - hostRect.left,
                    y: rect.top - hostRect.top,
                    width: rect.width,
                    height: rect.height,
                })
                : clampFloatingGeometry({
                    x: parseInt(dom.windowEl.style.left, 10) || 80,
                    y: parseInt(dom.windowEl.style.top, 10) || 64,
                    width: parseInt(dom.windowEl.style.width, 10) || 480,
                    height: parseInt(dom.windowEl.style.height, 10) || 340,
                });
            const paneNode = {
                type: 'pane',
                id: dom.paneEl.dataset.paneId || `float-pane-${containerId}`,
                tabs: tabIds,
                activeTabId: activeTab?.dataset.for ?? tabIds[0] ?? null,
                selectedTabIds: [],
                viewSettings: readPaneViewSettings(dom.paneEl),
                flexRatio: 1,
                lastFlexRatio: 1,
                isCollapsed: false,
                overflowMode: 'scroll',
            };
            floatingModels.push({
                id: containerId,
                root: paneNode,
                geometry,
                zIndex: parseInt(dom.windowEl.style.zIndex, 10) || 100,
                windowMaximized: dom.windowEl.classList.contains('is-window-maximized'),
                maximizedPaneId: null,
                originColumn: (dom.windowEl.dataset.originColumn || 'center'),
                originalViewSettings: { ...dom.originalViewSettings },
            });
        }
        const tabsRecord = {};
        for (const tab of this.engine.listTabs()) {
            const { placement: _p, ...rest } = tab;
            tabsRecord[tab.panelId] = structuredClone(rest);
        }
        return {
            schemaVersion: model.schemaVersion,
            dockingSizeStrategy: this.dockingSizeStrategy,
            tabStripOverflowMode: 'scroll',
            configFlags: model.configFlags,
            maximizedPaneId: this.#maximizedPaneEl?.dataset?.paneId ?? null,
            floating: floatingModels,
            sidebars: {
                left: { side: 'left', entries: [], activePanelId: null },
                right: { side: 'right', entries: [], activePanelId: null },
                top: { side: 'top', entries: [], activePanelId: null },
                bottom: { side: 'bottom', entries: [], activePanelId: null },
            },
            sidebarBehavior: structuredClone(model.sidebarBehavior),
            tabs: tabsRecord,
            perspectives: { ...model.perspectives },
        };
    }
    applyDockExtensionState(dockState) {
        this.#isApplyingState = true;
        try {
            this.#ensureShellElements();
            this.maximizePane(null);
            const staging = document.querySelector(SELECTORS.STAGING_AREA);
            for (const [containerId, dom] of [...this.#floatingDom.entries()]) {
                const orphanPanels = Array.from(dom.paneEl._panelContainer?.querySelectorAll(SELECTORS.PANEL) ?? []);
                for (const panel of orphanPanels) {
                    staging?.appendChild(panel);
                }
                this.#destroyFloatingDOM(containerId);
            }
            if (!dockState) {
                this.decorateAllPanes();
                return;
            }
            if (dockState.dockingSizeStrategy) {
                this.engine.setDockingSizeStrategy(dockState.dockingSizeStrategy);
            }
            if (dockState.tabs) {
                for (const [id, meta] of Object.entries(dockState.tabs)) {
                    this.engine.registerTab({ ...meta, panelId: id });
                }
            }
            for (const floatModel of dockState.floating ?? []) {
                const paneState = floatModel.root.type === 'pane' ? floatModel.root : null;
                if (!paneState)
                    continue;
                const panelIdsToFloat = [];
                for (const savedPid of paneState.tabs) {
                    const savedMeta = dockState.tabs?.[savedPid];
                    const livePanel = getPanelById(savedPid)
                        || (savedMeta?.sourceId ? getPanelBySourceId(savedMeta.sourceId) : null);
                    if (livePanel?.dataset.panelId) {
                        panelIdsToFloat.push(livePanel.dataset.panelId);
                    }
                }
                if (panelIdsToFloat.length > 0) {
                    const activeMeta = paneState.activeTabId ? dockState.tabs?.[paneState.activeTabId] : null;
                    const activeLivePanel = (paneState.activeTabId ? getPanelById(paneState.activeTabId) : null)
                        || (activeMeta?.sourceId ? getPanelBySourceId(activeMeta.sourceId) : null);
                    const cid = this.floatTabGroup(panelIdsToFloat, floatModel.geometry, activeLivePanel?.dataset.panelId ?? panelIdsToFloat[0]);
                    if (cid) {
                        const fDom = this.#floatingDom.get(cid);
                        if (fDom) {
                            if (floatModel.originalViewSettings) {
                                fDom.originalViewSettings = { ...floatModel.originalViewSettings };
                            }
                            if (floatModel.windowMaximized) {
                                this.#toggleFloatingWindowMaximize(fDom, true);
                            }
                        }
                    }
                }
            }
            this.decorateAllPanes();
            if (dockState.maximizedPaneId) {
                const maxPaneEl = this.getPaneElementById(dockState.maximizedPaneId);
                if (maxPaneEl) {
                    this.maximizePane(maxPaneEl);
                }
            }
        }
        finally {
            this.#isApplyingState = false;
            this.syncFromDOM();
        }
    }
    getPaneElementById(paneId) {
        return document.querySelector(`${SELECTORS.PANE}[data-pane-id="${CSS.escape(paneId)}"]`);
    }
    // ─── Internal Shell & Floating Window DOM Builders ──────────────────────
    #ensureShellElements() {
        const refs = getRefs();
        if (!refs.mainBody)
            return;
        if (!this.#floatingLayerEl || !this.#floatingLayerEl.isConnected) {
            this.#floatingLayerEl = refs.mainBody.querySelector('#ptmt-floating-layer');
            if (!this.#floatingLayerEl) {
                this.#floatingLayerEl = el('div', {
                    id: 'ptmt-floating-layer',
                    className: 'ptmt-floating-layer',
                });
                refs.mainBody.appendChild(this.#floatingLayerEl);
            }
        }
    }
    #bindGlobalListeners() {
        // 1. Escape key restores maximized pane (or maximized floating window)
        const onKeyDown = (evt) => {
            const event = evt;
            if (event.key !== 'Escape')
                return;
            if (this.#maximizedPaneEl) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.maximizePane(null);
                return;
            }
            for (const dom of this.#floatingDom.values()) {
                if (dom.windowEl.classList.contains('is-window-maximized')) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.#toggleFloatingWindowMaximize(dom, false);
                    return;
                }
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        trackListener(document, 'keydown', onKeyDown, true);
        // 2. Keep maximized pane bounds aligned to #ptmt-mainBody on viewport resize
        const onWindowResize = () => {
            if (this.#maximizedPaneEl)
                this.#syncMaximizedBounds();
        };
        window.addEventListener('resize', onWindowResize);
        trackListener(window, 'resize', onWindowResize);
        // 3. Auto-cleanup empty floating windows after any layout change
        const onLayoutChanged = () => {
            this.cleanupEmptyFloatingWindows();
        };
        window.addEventListener(EVENTS.LAYOUT_CHANGED, onLayoutChanged);
        trackListener(window, EVENTS.LAYOUT_CHANGED, onLayoutChanged);
        // 4. Ctrl/Cmd + click on .ptmt-tab for multi-tab group selection
        const onTabClickCapture = (evt) => {
            const event = evt;
            if (!event.ctrlKey && !event.metaKey)
                return;
            const tabEl = event.target?.closest?.('.ptmt-tab:not(.ptmt-view-settings)');
            if (!tabEl || !tabEl.dataset.for)
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.toggleTabSelection(tabEl.dataset.for, true);
        };
        document.addEventListener('click', onTabClickCapture, true);
        trackListener(document, 'click', onTabClickCapture, true);
    }
    #createFloatingWindowDOM(containerId, geometry, viewSettings, originColumn, originalViewSettings = {}) {
        this.#ensureShellElements();
        const paneEl = createPane(viewSettings, { deferInitialCheck: false });
        paneEl.dataset.floatingContainerId = containerId;
        paneEl.classList.add('ptmt-floating-pane');
        // ONE unified bar: no separate titlebar, the pane's own .ptmt-tabStrip IS the bar!
        const windowEl = el('div', {
            className: 'ptmt-floating-window',
            dataset: { containerId, originColumn },
            style: {
                left: `${geometry.x}px`,
                top: `${geometry.y}px`,
                width: `${geometry.width}px`,
                height: `${geometry.height}px`,
                zIndex: String(100 + this.#floatingDom.size + 1),
            },
        }, paneEl);
        for (const dir of RESIZE_DIRECTIONS) {
            const handle = el('div', {
                className: `ptmt-floating-resize-handle ptmt-floating-resize-${dir}`,
                dataset: { resizeDir: dir },
            });
            this.#bindFloatingResizeHandle(windowEl, handle, dir, containerId);
            windowEl.appendChild(handle);
        }
        // Automatically destroy floating window whenever its last tab is removed
        const tabObserver = new MutationObserver(() => {
            const tabCount = paneEl._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0;
            if (tabCount === 0) {
                this.#destroyFloatingDOM(containerId);
            }
        });
        if (paneEl._tabStrip) {
            tabObserver.observe(paneEl._tabStrip, { childList: true });
        }
        const floatingDom = {
            containerId,
            windowEl,
            paneEl,
            tabObserver,
            originalViewSettings: { ...originalViewSettings },
        };
        windowEl.addEventListener('pointerdown', () => this.#bringFloatingWindowToFront(floatingDom));
        if (paneEl._tabStrip) {
            paneEl._tabStrip.addEventListener('dblclick', (e) => {
                if (e.target.closest('.ptmt-tab, button'))
                    return;
                this.#toggleFloatingWindowMaximize(floatingDom);
            });
            this.#bindFloatingTabStripDragAndDock(floatingDom);
        }
        this.#floatingLayerEl?.appendChild(windowEl);
        this.#floatingDom.set(containerId, floatingDom);
        return floatingDom;
    }
    /**
     * Dragging the floating window's unified tab strip moves the floating window AND
     * triggers the exact same Split Compass / tab-strip drop UI as dragging a single tab,
     * so releasing over any docked pane docks the floating window there, releasing over
     * another floating window merges them, and releasing in open space keeps it floating.
     */
    #bindPaneUndockHandle(handleEl, paneEl) {
        handleEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0)
                return;
            // Already floating: drag the floating window directly
            if (paneEl.dataset.floatingContainerId) {
                const fDom = this.#floatingDom.get(paneEl.dataset.floatingContainerId);
                if (fDom)
                    this.#startFloatingWindowPointerDrag(fDom, e, handleEl);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const hostRect = getRefs().mainBody?.getBoundingClientRect();
            const paneRect = paneEl.getBoundingClientRect();
            let activeFloating = null;
            let offsetX = 120;
            let offsetY = 16;
            let mergeTarget = null;
            const onMove = (moveEv) => {
                if (!hostRect)
                    return;
                if (!activeFloating) {
                    if (Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY) < 6)
                        return;
                    const floatW = paneRect.width > 180 ? Math.min(640, Math.round(paneRect.width)) : 480;
                    const floatH = paneRect.height > 140 ? Math.min(520, Math.round(paneRect.height)) : 360;
                    offsetX = Math.round(floatW / 2);
                    offsetY = 16;
                    const containerId = this.floatPane(paneEl, {
                        x: moveEv.clientX - hostRect.left - offsetX,
                        y: moveEv.clientY - hostRect.top - offsetY,
                        width: floatW,
                        height: floatH,
                    });
                    if (!containerId)
                        return;
                    activeFloating = this.#floatingDom.get(containerId) ?? null;
                    if (!activeFloating)
                        return;
                    activeFloating.windowEl.classList.add('is-dragging');
                    this.beginDragReveal();
                }
                const winRect = activeFloating.windowEl.getBoundingClientRect();
                const clamped = clampFloatingGeometry({
                    x: moveEv.clientX - hostRect.left - offsetX,
                    y: moveEv.clientY - hostRect.top - offsetY,
                    width: winRect.width,
                    height: winRect.height,
                }, { width: hostRect.width, height: hostRect.height });
                activeFloating.windowEl.style.left = `${clamped.x}px`;
                activeFloating.windowEl.style.top = `${clamped.y}px`;
                const hoveredFloat = this.#findFloatingMergeTarget(activeFloating.containerId, moveEv.clientX, moveEv.clientY);
                if (hoveredFloat !== mergeTarget) {
                    mergeTarget?.windowEl.classList.remove('ptmt-floating-drop-target');
                    mergeTarget = hoveredFloat;
                    mergeTarget?.windowEl.classList.add('ptmt-floating-drop-target');
                }
                if (mergeTarget) {
                    window.ptmtTabs?._dockClearPreview?.();
                }
                else {
                    activeFloating.windowEl.style.pointerEvents = 'none';
                    window.ptmtTabs?._dockPreviewDrag?.(`floating:${activeFloating.containerId}`, moveEv.clientX, moveEv.clientY);
                    activeFloating.windowEl.style.pointerEvents = '';
                }
            };
            const cleanupUndockDrag = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onCancel);
            };
            const onCancel = () => {
                cleanupUndockDrag();
                if (!activeFloating)
                    return;
                activeFloating.windowEl.classList.remove('is-dragging');
                mergeTarget?.windowEl.classList.remove('ptmt-floating-drop-target');
                mergeTarget = null;
                window.ptmtTabs?._dockClearPreview?.();
                this.endDragReveal();
                activeFloating = null;
            };
            const onUp = (upEv) => {
                cleanupUndockDrag();
                if (!activeFloating)
                    return;
                const fDom = activeFloating;
                activeFloating = null;
                fDom.windowEl.classList.remove('is-dragging');
                if (mergeTarget) {
                    const targetId = mergeTarget.containerId;
                    mergeTarget.windowEl.classList.remove('ptmt-floating-drop-target');
                    mergeTarget = null;
                    window.ptmtTabs?._dockClearPreview?.();
                    this.endDragReveal();
                    this.mergeFloatingContainers(fDom.containerId, targetId);
                    return;
                }
                fDom.windowEl.style.pointerEvents = 'none';
                const docked = Boolean(window.ptmtTabs?._dockCommitDrop?.(`floating:${fDom.containerId}`, upEv.clientX, upEv.clientY));
                fDom.windowEl.style.pointerEvents = '';
                this.endDragReveal();
                if (!docked) {
                    this.syncFromDOM();
                    this.#emitLayoutChanged('floatingWindowMoved', fDom.paneEl);
                }
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
        });
    }
    #bindFloatingTabStripDragAndDock(floatingDom) {
        const { paneEl } = floatingDom;
        const tabStrip = paneEl._tabStrip;
        if (!tabStrip)
            return;
        tabStrip.addEventListener('pointerdown', (e) => {
            if (e.button !== 0)
                return;
            if (e.target.closest('.ptmt-tab, button:not(.ptmt-pane-undock-handle)'))
                return;
            this.#startFloatingWindowPointerDrag(floatingDom, e, tabStrip);
        });
    }
    #startFloatingWindowPointerDrag(floatingDom, e, captureEl) {
        const { windowEl, containerId } = floatingDom;
        e.preventDefault();
        this.#bringFloatingWindowToFront(floatingDom);
        captureEl.setPointerCapture?.(e.pointerId);
        const hostRect = getRefs().mainBody?.getBoundingClientRect();
        let winRect = windowEl.getBoundingClientRect();
        let offsetX = e.clientX - winRect.left;
        let offsetY = e.clientY - winRect.top;
        const startX = e.clientX;
        const startY = e.clientY;
        let moved = false;
        let mergeTarget = null;
        const onMove = (moveEv) => {
            if (!hostRect)
                return;
            if (!moved && Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY) < 4)
                return;
            if (!moved) {
                moved = true;
                if (windowEl.classList.contains('is-window-maximized')) {
                    this.#toggleFloatingWindowMaximize(floatingDom, false);
                    winRect = windowEl.getBoundingClientRect();
                    offsetX = Math.round(winRect.width / 2);
                    offsetY = 16;
                }
                windowEl.classList.add('is-dragging');
                this.beginDragReveal();
            }
            const clamped = clampFloatingGeometry({
                x: moveEv.clientX - hostRect.left - offsetX,
                y: moveEv.clientY - hostRect.top - offsetY,
                width: winRect.width,
                height: winRect.height,
            }, { width: hostRect.width, height: hostRect.height });
            windowEl.style.left = `${clamped.x}px`;
            windowEl.style.top = `${clamped.y}px`;
            // 1. Check if hovering over another floating window to merge
            const hoveredFloat = this.#findFloatingMergeTarget(containerId, moveEv.clientX, moveEv.clientY);
            if (hoveredFloat !== mergeTarget) {
                mergeTarget?.windowEl.classList.remove('ptmt-floating-drop-target');
                mergeTarget = hoveredFloat;
                mergeTarget?.windowEl.classList.add('ptmt-floating-drop-target');
            }
            // 2. Otherwise drive the live Split Compass / tab-strip drop preview underneath!
            if (mergeTarget) {
                window.ptmtTabs?._dockClearPreview?.();
            }
            else {
                windowEl.style.pointerEvents = 'none';
                window.ptmtTabs?._dockPreviewDrag?.(`floating:${containerId}`, moveEv.clientX, moveEv.clientY);
                windowEl.style.pointerEvents = '';
            }
        };
        const cleanupDrag = (pointerId) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            if (pointerId !== undefined) {
                try {
                    captureEl.releasePointerCapture?.(pointerId);
                }
                catch { }
            }
            windowEl.classList.remove('is-dragging');
        };
        const onCancel = (cancelEv) => {
            cleanupDrag(cancelEv.pointerId);
            if (!moved)
                return;
            mergeTarget?.windowEl.classList.remove('ptmt-floating-drop-target');
            mergeTarget = null;
            window.ptmtTabs?._dockClearPreview?.();
            this.endDragReveal();
        };
        const onUp = (upEv) => {
            cleanupDrag(upEv.pointerId);
            if (!moved)
                return;
            if (mergeTarget) {
                const targetId = mergeTarget.containerId;
                mergeTarget.windowEl.classList.remove('ptmt-floating-drop-target');
                mergeTarget = null;
                window.ptmtTabs?._dockClearPreview?.();
                this.endDragReveal();
                this.mergeFloatingContainers(containerId, targetId);
                return;
            }
            windowEl.style.pointerEvents = 'none';
            const docked = Boolean(window.ptmtTabs?._dockCommitDrop?.(`floating:${containerId}`, upEv.clientX, upEv.clientY));
            windowEl.style.pointerEvents = '';
            this.endDragReveal();
            if (!docked) {
                this.syncFromDOM();
                this.#emitLayoutChanged('floatingWindowMoved', floatingDom.paneEl);
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    }
    #bindFloatingResizeHandle(windowEl, handleEl, dir, containerId) {
        handleEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || windowEl.classList.contains('is-window-maximized'))
                return;
            e.preventDefault();
            e.stopPropagation();
            handleEl.setPointerCapture?.(e.pointerId);
            const hostRect = getRefs().mainBody?.getBoundingClientRect();
            const startRect = windowEl.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = hostRect ? startRect.left - hostRect.left : 0;
            const startTop = hostRect ? startRect.top - hostRect.top : 0;
            const onMove = (moveEv) => {
                const dx = moveEv.clientX - startX;
                const dy = moveEv.clientY - startY;
                let x = startLeft;
                let y = startTop;
                let w = startRect.width;
                let h = startRect.height;
                if (dir.includes('e'))
                    w = Math.max(220, startRect.width + dx);
                if (dir.includes('s'))
                    h = Math.max(140, startRect.height + dy);
                if (dir.includes('w')) {
                    const nextW = Math.max(220, startRect.width - dx);
                    x = startLeft + (startRect.width - nextW);
                    w = nextW;
                }
                if (dir.includes('n')) {
                    const nextH = Math.max(140, startRect.height - dy);
                    y = startTop + (startRect.height - nextH);
                    h = nextH;
                }
                const clamped = clampFloatingGeometry({ x, y, width: w, height: h }, hostRect ? { width: hostRect.width, height: hostRect.height } : null);
                windowEl.style.left = `${clamped.x}px`;
                windowEl.style.top = `${clamped.y}px`;
                windowEl.style.width = `${clamped.width}px`;
                windowEl.style.height = `${clamped.height}px`;
            };
            const onUp = (upEv) => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                try {
                    handleEl.releasePointerCapture?.(upEv.pointerId);
                }
                catch { }
                this.engine.setFloatingGeometry(containerId, {
                    x: parseInt(windowEl.style.left, 10) || 0,
                    y: parseInt(windowEl.style.top, 10) || 0,
                    width: parseInt(windowEl.style.width, 10) || 480,
                    height: parseInt(windowEl.style.height, 10) || 340,
                });
                this.#emitLayoutChanged('floatingWindowResized');
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        });
    }
    #findFloatingMergeTarget(sourceContainerId, clientX, clientY) {
        const candidates = [];
        for (const [id, dom] of this.#floatingDom.entries()) {
            if (id === sourceContainerId || !dom.windowEl.isConnected)
                continue;
            const strip = dom.paneEl._tabStrip;
            const r = strip ? strip.getBoundingClientRect() : dom.windowEl.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom + 16) {
                candidates.push(dom);
            }
        }
        candidates.sort((a, b) => (parseInt(b.windowEl.style.zIndex, 10) || 0) - (parseInt(a.windowEl.style.zIndex, 10) || 0));
        return candidates[0] ?? null;
    }
    #toggleFloatingWindowMaximize(floatingDom, force) {
        const isMax = force ?? !floatingDom.windowEl.classList.contains('is-window-maximized');
        floatingDom.windowEl.classList.toggle('is-window-maximized', isMax);
        this.#updatePaneMaximizeButtonIcon(floatingDom.paneEl, isMax);
        this.engine.setFloatingMaximized(floatingDom.containerId, isMax);
        this.#bringFloatingWindowToFront(floatingDom);
        this.#emitLayoutChanged('floatingWindowMaximized', floatingDom.paneEl);
    }
    #bringFloatingWindowToFront(floatingDom) {
        let maxZ = 100;
        for (const dom of this.#floatingDom.values()) {
            maxZ = Math.max(maxZ, parseInt(dom.windowEl.style.zIndex, 10) || 100);
        }
        floatingDom.windowEl.style.zIndex = String(maxZ + 1);
        this.engine.bringFloatingToFront(floatingDom.containerId);
    }
    #destroyFloatingDOM(containerId) {
        const dom = this.#floatingDom.get(containerId);
        if (!dom)
            return;
        dom.tabObserver.disconnect();
        cleanupPaneObservers(dom.paneEl);
        dom.windowEl.remove();
        this.#floatingDom.delete(containerId);
    }
    #openPaneTabListMenu(event, paneEl) {
        const tabs = Array.from(paneEl._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)') ?? []);
        if (tabs.length === 0)
            return;
        const items = tabs.map((tabEl) => {
            const pid = tabEl.dataset.for || '';
            const panel = pid ? getPanelById(pid) : null;
            const sourceId = panel?.dataset.sourceId;
            const label = tabEl.querySelector('.ptmt-tab-label')?.textContent || pid || 'Tab';
            const isActive = tabEl.classList.contains('active');
            const isCollapsed = tabEl.classList.contains('collapsed');
            // Resolve the tab's real icon from its DOM element or panel mapping
            let iconStr = '';
            const domIcon = tabEl.querySelector('.ptmt-tab-icon, i[class*="fa-"]');
            if (domIcon) {
                const faClasses = Array.from(domIcon.classList).filter((c) => c === 'fa-solid' || c === 'fa-regular' || c === 'fa-brands' || c.startsWith('fa-'));
                if (faClasses.length > 0) {
                    const hasStyle = faClasses.some((c) => c === 'fa-solid' || c === 'fa-regular' || c === 'fa-brands');
                    iconStr = hasStyle ? faClasses.join(' ') : `fa-solid ${faClasses.join(' ')}`;
                }
                else if (domIcon.textContent?.trim()) {
                    iconStr = domIcon.textContent.trim();
                }
            }
            if (!iconStr && sourceId) {
                const mappedIcon = settings.getMapping(sourceId)?.icon;
                if (mappedIcon) {
                    iconStr = mappedIcon.startsWith('fa-') ? `fa-solid ${mappedIcon}` : mappedIcon;
                }
            }
            if (!iconStr)
                iconStr = 'fa-solid fa-layer-group';
            return {
                label: `${isActive ? '● ' : isCollapsed ? '○ ' : ''}${label}`,
                icon: iconStr,
                onClick: () => {
                    if (pid)
                        openTab(pid);
                    tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                },
            };
        });
        showContextMenu(event, items);
    }
    #updatePaneMaximizeButtonIcon(paneEl, isMaximized) {
        const icon = paneEl.querySelector('.ptmt-pane-maximize-btn i');
        if (icon) {
            icon.className = isMaximized ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
        }
    }
    #findExistingNeighborPaneDOM(paneEl, zone) {
        const parentSplit = paneEl.parentElement;
        if (!parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1)))
            return null;
        const children = this.#getStructuralChildren(parentSplit);
        const index = children.indexOf(paneEl);
        if (index < 0)
            return null;
        const prev = this.#firstPaneInDOM(children[index - 1]);
        const next = this.#firstPaneInDOM(children[index + 1]);
        const isHoriz = parentSplit.classList.contains('horizontal');
        if (isHoriz) {
            if (zone === 'existing-top')
                return prev;
            if (zone === 'existing-bottom')
                return next;
        }
        else {
            if (zone === 'existing-left')
                return prev;
            if (zone === 'existing-right')
                return next;
        }
        return null;
    }
    #firstPaneInDOM(elNode) {
        if (!elNode)
            return null;
        if (elNode.classList.contains(SELECTORS.PANE.substring(1)))
            return elNode;
        return elNode.querySelector(SELECTORS.PANE);
    }
    #getStructuralChildren(splitEl) {
        return Array.from(splitEl.children).filter((c) => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
    }
    #captureSplitChildRatios(splitEl) {
        const children = this.#getStructuralChildren(splitEl);
        const isHoriz = splitEl.classList.contains('horizontal');
        const raw = children.map((child) => {
            const pct = parseFlexBasis(child.dataset.lastFlex || child.style.flex);
            if (pct !== null && pct > 0)
                return pct;
            const rect = child.getBoundingClientRect();
            const size = isHoriz ? rect.height : rect.width;
            return size > 0 ? size : 1;
        });
        return normalizeRatios(raw, children.length);
    }
    #getColumnElement(column) {
        const refs = getRefs();
        if (column === 'left')
            return refs.leftBody;
        if (column === 'right')
            return refs.rightBody;
        return refs.centerBody;
    }
    #findDefaultTargetPane(column = 'center', ensureColumnVisible = false) {
        if (ensureColumnVisible) {
            if (column === 'left' && !settings.get('showLeftPane')) {
                settings.update({ showLeftPane: true });
                applyColumnVisibility();
            }
            else if (column === 'right' && !settings.get('showRightPane')) {
                settings.update({ showRightPane: true });
                applyColumnVisibility();
            }
        }
        const colEl = this.#getColumnElement(column) ?? this.#getColumnElement('center');
        if (!colEl)
            return null;
        let pane = colEl.querySelector(SELECTORS.PANE);
        if (!pane) {
            pane = createPane();
            colEl.appendChild(pane);
            this.decoratePane(pane);
        }
        return pane;
    }
    #emitLayoutChanged(reason, pane) {
        try {
            window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason, pane } }));
            recalculateColumnSizes();
        }
        catch { }
    }
}
export const ptmtDock = new PTMTDockController();
export function initDock() {
    ptmtDock.init();
    return ptmtDock;
}
export function cleanupDock() {
    ptmtDock.cleanup();
}
export function getDockController() {
    return ptmtDock;
}
//# sourceMappingURL=dock-reconciler.js.map