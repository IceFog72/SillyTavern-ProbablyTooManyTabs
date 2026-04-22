// snapshot.js 

import { getRefs, writePaneViewSettings, readPaneViewSettings } from './utils.js';
import { getPanelById, getSplitOrientation, el, getPanelBySourceId } from './utils.js';
import { createPane, applyPaneOrientation, setPaneCollapsedView, checkAndCollapsePaneIfAllTabsCollapsed, applyIconsOnly } from './pane.js';
import { setActivePanelInPane, createPanelElement, registerPanelDom, createTabElement, createTabFromContent } from './tabs.js';
import { attachResizer, updateResizerDisabledStates, checkPaneForIconMode, validateAndCorrectAllMinSizes } from './resizer.js';
import { LayoutManager } from './LayoutManager.js';
import { recalculateColumnSizes } from './layout.js';
import { settings, SettingsManager } from './settings.js';
import { initPendingTabsManager } from './pending-tabs.js';
import { recalculateAllSplitsRecursively, parseFlexBasis } from './layout-math.js';
import { SELECTORS, EVENTS, LAYOUT } from './constants.js';
import { createInfoPanel, PTMT_INFO_PANEL_ID, PTMT_INFO_CURRENT_VERSION } from './layout-editor/InfoPanel.js';


/** @typedef {import('./types.js').LayoutSnapshot} LayoutSnapshot */
/** @typedef {import('./types.js').PaneNode} PaneNode */
/** @typedef {import('./types.js').SplitNode} SplitNode */
/** @typedef {import('./types.js').TabData} TabData */
/** @typedef {import('./types.js').ViewSettings} ViewSettings */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */
/** @typedef {import('./types.js').ColumnSizes} ColumnSizes */
/** @typedef {import('./types.js').GhostTab} GhostTab */
/** @typedef {import('./types.js').HiddenTab} HiddenTab */

const SNAPSHOT_VERSION = 15;      // Minimum supported version
const SNAPSHOT_CURRENT_VERSION = 19; // Version written by generateLayoutSnapshot

// ─── Snapshot Migration Registry ─────────────────────────────────────────────
// Each key is a source version; the value migrates that version to (key + 1).
// To add a future v17→v18 migration, just add `17: (snap) => { ... snap.version = 18; return snap; }`.
// Migrations run in sequence: 15→16→17→...

const SNAPSHOT_MIGRATIONS = {
    15: (snap) => {
        // v15→v16: No structural change. Identity migration — just bumps version.
        snap.version = 16;
        return snap;
    },
    16: (snap) => {
        // v16→v17: Add charlib-embedded-container tab to layouts that don't have it.
        const CHARLIB_SOURCE_ID = 'charlib-embedded-container';
        const CHARLIB_TAB = { sourceId: CHARLIB_SOURCE_ID };

        const hasCharlib = (node) => {
            if (!node) return false;
            if (node.type === 'pane') {
                return (node.tabs || []).some(t => t.sourceId === CHARLIB_SOURCE_ID);
            }
            if (node.type === 'split') {
                return (node.children || []).some(hasCharlib);
            }
            return false;
        };

        const addCharlibToFirstPane = (node) => {
            if (!node) return;
            if (node.type === 'pane') {
                if (!(node.tabs || []).some(t => t.sourceId === CHARLIB_SOURCE_ID)) {
                    node.tabs = [...(node.tabs || []), CHARLIB_TAB];
                }
                return;
            }
            if (node.type === 'split' && node.children?.length) {
                addCharlibToFirstPane(node.children[0]);
            }
        };

        const alreadyHasCharlib = ['left', 'center', 'right'].some(col => hasCharlib(snap.columns?.[col]?.content));
        if (!alreadyHasCharlib) {
            for (const col of ['left', 'center', 'right']) {
                const content = snap.columns?.[col]?.content;
                if (content) {
                    addCharlibToFirstPane(content);
                    break;
                }
            }
        }

        snap.version = 17;
        return snap;
    },
    17: (snap) => {
        // v17→v18: Add iconOnly field to pane viewSettings (default: false)
        const addIconOnlyToPane = (node) => {
            if (!node) return;
            if (node.type === 'pane' && node.viewSettings) {
                if (!('iconOnly' in node.viewSettings)) {
                    node.viewSettings.iconOnly = false;
                }
                return;
            }
            if (node.type === 'split' && node.children) {
                node.children.forEach(addIconOnlyToPane);
            }
        };

        for (const col of ['left', 'center', 'right']) {
            const content = snap.columns?.[col]?.content;
            if (content) {
                addIconOnlyToPane(content);
            }
        }

        snap.version = 18;
        return snap;
    },
    18: (snap) => {
        // v18→v19: Update panel mapping titles (Navigation → API Sliders, Inspector → Characters)
        // This migration is documented but doesn't modify the snapshot structure.
        // The actual title updates happen in settings.js initializeSettings() for backward compatibility.
        snap.version = 19;
        return snap;
    },
};

/**
 * Attempts to migrate a snapshot from its current version to SNAPSHOT_CURRENT_VERSION.
 * Returns the migrated snapshot, or null if migration fails.
 */
function migrateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;

    let current = JSON.parse(JSON.stringify(snapshot));
    let steps = 0;
    const MAX_STEPS = 10; // safety limit

    while (current.version < SNAPSHOT_CURRENT_VERSION && steps < MAX_STEPS) {
        const migrate = SNAPSHOT_MIGRATIONS[current.version];
        if (!migrate) {
            console.warn(`[PTMT] No migration path from version ${current.version}`);
            return null;
        }
        try {
            console.log(`[PTMT] Migrating snapshot v${current.version} → v${current.version + 1}`);
            current = migrate(current);
            steps++;
        } catch (e) {
            console.error(`[PTMT] Migration from v${current.version} failed:`, e);
            return null;
        }
    }

    if (current.version !== SNAPSHOT_CURRENT_VERSION) {
        console.warn(`[PTMT] Migration ended at v${current.version}, expected v${SNAPSHOT_CURRENT_VERSION}`);
        return null;
    }

    return current;
}

const DEFAULT_MIN_SIZES = {
    pane: { width: '200px', height: '100px' },
    split: { width: '150px', height: '76px' }
};

export function generateLayoutSnapshot() {
    console.log("[PTMT Layout] 📸 Generating layout snapshot...");
    const refs = getRefs();
    if (!refs) return null;
    const buildNodeTree = (element, parentColumn = null) => {
        if (!element) return null;

        if (element.classList.contains(SELECTORS.PANE.substring(1))) {
            const tabElements = Array.from(element.querySelectorAll(`:scope > .ptmt-pane-grid > ${SELECTORS.TAB_STRIP} > ${SELECTORS.TAB}`));
            const panels = Array.from(element.querySelectorAll(`:scope > .ptmt-pane-grid > ${SELECTORS.PANEL_CONTAINER} > ${SELECTORS.PANEL}`));


            const tabsData = tabElements.map((tabEl, index) => {
                const pid = tabEl.dataset.for;
                const panel = getPanelById(pid);
                const sourceId = panel?.dataset?.sourceId || null;
                const isCustom = !sourceId && panel?.dataset?.ptmtType === 'panel';

                return {
                    panelId: pid || null,
                    sourceId: sourceId,
                    title: tabEl.querySelector(SELECTORS.TAB_LABEL)?.textContent?.trim() || panel?.dataset?.title || null,
                    icon: (() => {
                        const iconEl = tabEl.querySelector(SELECTORS.TAB_ICON);

                        if (!iconEl) return null;
                        if (iconEl.classList.contains('fa-solid') || Array.from(iconEl.classList).some(c => c.startsWith('fa-'))) {
                            const faStyles = new Set(['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands', 'fa-sharp']);
                            return Array.from(iconEl.classList).find(c => c.startsWith('fa-') && !faStyles.has(c)) || null;
                        }
                        return iconEl.textContent || null;
                    })(),
                    collapsed: tabEl.classList.contains('collapsed'),
                    active: tabEl.classList.contains('active'),

                    order: index,
                    isDefault: panel?.dataset?.defaultPanel === 'true',
                    customContent: isCustom ? panel?.querySelector('.ptmt-panel-content')?.innerHTML : null,
                    customData: panel?.dataset || {}
                };
            });

            const isCollapsed = element.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1));


            return {
                type: 'pane',
                paneId: element.dataset.paneId,
                flex: element.style.flex || null,
                lastFlex: element.dataset.lastFlex || null,
                minWidth: element.style.minWidth || null,
                minHeight: element.style.minHeight || null,
                actualWidth: isCollapsed ? (element.dataset.lastWidth || `${element.offsetWidth}px`) : `${element.offsetWidth}px`,
                actualHeight: isCollapsed ? (element.dataset.lastHeight || `${element.offsetHeight}px`) : `${element.offsetHeight}px`,
                viewSettings: {
                    ...readPaneViewSettings(element),
                    appliedOrientation: element.dataset.appliedOrientation || null,
                    lastExpandedOrientation: element.dataset.lastExpandedOrientation || null
                },
                tabs: tabsData,
                isCollapsed: isCollapsed,
                columnLocation: parentColumn
            };
        }

        if (element.classList.contains(SELECTORS.SPLIT.substring(1))) {
            const structuralChildren = Array.from(element.children).filter(c =>
                c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1))
            );


            const children = structuralChildren.map(child => buildNodeTree(child, parentColumn));

            // Capture ratios using lastFlex (user intent) as priority, then style.flex (current state)
            const splitRatios = structuralChildren.map(child => {
                const flexString = child.dataset.lastFlex || child.style.flex || '';
                const basis = parseFlexBasis(flexString);
                return basis ?? (100 / structuralChildren.length);
            });

            const isCollapsed = element.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1));


            return {
                type: 'split',
                flex: element.style.flex || null,
                lastFlex: element.dataset.lastFlex || null,
                orientation: getSplitOrientation(element),
                naturalOrientation: element.dataset.naturalOrientation || getSplitOrientation(element),
                orientationExpanded: element.dataset.orientationExpanded || null,
                orientationCollapsed: element.dataset.orientationCollapsed || null,
                children: children.filter(Boolean),
                splitRatios: splitRatios,

                actualWidth: isCollapsed ? (element.dataset.lastWidth || `${element.offsetWidth}px`) : `${element.offsetWidth}px`,
                actualHeight: isCollapsed ? (element.dataset.lastHeight || `${element.offsetHeight}px`) : `${element.offsetHeight}px`,
                isCollapsed: isCollapsed,
                columnLocation: parentColumn
            };
        }

        return null;
    };

    const captureResizerStates = () => {
        const states = [];
        document.querySelectorAll(`${SELECTORS.RESIZER_V}, ${SELECTORS.RESIZER_H}`).forEach(resizer => {
            const prev = resizer.previousElementSibling;

            const next = resizer.nextElementSibling;
            if (prev && next) {
                states.push({
                    type: resizer.classList.contains(SELECTORS.RESIZER_V.substring(1)) ? 'vertical' : 'horizontal',
                    prevFlex: prev.style.flex,
                    nextFlex: next.style.flex,
                    disabled: resizer.classList.contains('disabled')

                });
            }
        });
        return states;
    };

    const isMobile = settings.get('isMobile');
    const layoutKey = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
    const currentLayout = settings.get(layoutKey) || settings.getActiveDefaultLayout() || { columns: { left: {}, center: {}, right: {} }, hiddenTabs: [] };

    const snapshot = {
        version: SNAPSHOT_CURRENT_VERSION,
        timestamp: Date.now(),
        mode: isMobile ? 'mobile' : 'desktop',
        showLeft: refs.leftBody.style.display !== 'none',
        showRight: refs.rightBody.style.display !== 'none',

        columnSizes: {
            left: refs.leftBody.dataset.isColumnCollapsed === 'true'
                ? (refs.leftBody.dataset.lastFlex || refs.leftBody.style.flex || "1 1 20%")
                : (refs.leftBody.style.flex || refs.leftBody.dataset.lastFlex || "1 1 20%"),
            center: refs.centerBody.style.flex || "1 1 60%",
            right: refs.rightBody.dataset.isColumnCollapsed === 'true'
                ? (refs.rightBody.dataset.lastFlex || refs.rightBody.style.flex || "1 1 20%")
                : (refs.rightBody.style.flex || refs.rightBody.dataset.lastFlex || "1 1 20%"),
            leftCollapsed: refs.leftBody.dataset.isColumnCollapsed === 'true',
            rightCollapsed: refs.rightBody.dataset.isColumnCollapsed === 'true',
            leftLastFlex: refs.leftBody.dataset.lastFlex,
            centerLastFlex: refs.centerBody.dataset.lastFlex,
            rightLastFlex: refs.rightBody.dataset.lastFlex
        },

        columns: {
            left: {
                flex: refs.leftBody.style.flex || null,
                content: buildNodeTree(refs.leftBody.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), 'left'),
                ghostTabs: currentLayout.columns.left.ghostTabs || []
            },
            center: {
                flex: refs.centerBody.style.flex || null,
                content: buildNodeTree(refs.centerBody.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), 'center'),
                ghostTabs: currentLayout.columns.center.ghostTabs || []
            },
            right: {
                flex: refs.rightBody.style.flex || null,
                content: buildNodeTree(refs.rightBody.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), 'right'),
                ghostTabs: currentLayout.columns.right.ghostTabs || []
            }

        },

        resizerStates: captureResizerStates(),
        hiddenTabs: currentLayout.hiddenTabs || [],

        panelLocations: (() => {
            const locations = new Map();
            ['left', 'center', 'right'].forEach(col => {
                const column = refs[`${col}Body`];
                column.querySelectorAll(SELECTORS.PANEL).forEach((panel, idx) => {
                    if (panel.dataset.sourceId) {

                        locations.set(panel.dataset.sourceId, {
                            column: col,
                            paneIndex: idx
                        });
                    }
                });
            });
            return Array.from(locations.entries());
        })()
    };

    console.log("[PTMT Layout] ✅ Snapshot generated:", snapshot);
    return snapshot;
}

export function applyLayoutSnapshot(snapshot, api, settings) {
    const validated = validateSnapshot(snapshot);
    if (!validated) {
        console.error('[PTMT] Invalid or outdated snapshot, loading current default layout.');
        const defaultLayout = SettingsManager.defaultSettings.defaultLayout;
        if (snapshot === defaultLayout) {
            console.error('[PTMT] The default layout itself is invalid. Aborting.');
            return;
        }
        if (defaultLayout) {
            applyLayoutSnapshot(defaultLayout, api, settings);
        }
        return;
    }
    snapshot = validated; // Use migrated/validated snapshot from here on

    const settingsWrapperId = 'ptmt-settings-wrapper-content';
    let settingsWrapper = document.getElementById(settingsWrapperId);
    if (!settingsWrapper) {
        settingsWrapper = el('div', { id: settingsWrapperId });
        const stagingArea = document.querySelector(SELECTORS.STAGING_AREA) || document.body;
        stagingArea.appendChild(settingsWrapper);
    }


    const refs = getRefs();
    if (!refs || !refs.mainBody) {
        console.error('[PTMT] Cannot apply snapshot: layout refs not found');
        return;
    }

    const stagingArea = document.querySelector(SELECTORS.STAGING_AREA) || document.body;
    [refs.leftBody, refs.centerBody, refs.rightBody].forEach(col => {
        if (col) {
            const elementsToPreserve = Array.from(col.querySelectorAll('[data-preserve="true"]'));
            const preserveSet = new Set(elementsToPreserve);
            // Move all other children to staging area before clearing
            const childrenToMove = Array.from(col.childNodes).filter(node => !preserveSet.has(node));
            childrenToMove.forEach(node => stagingArea.appendChild(node));
            // Remove remaining non-preserved children (handles text nodes, etc.)
            while (col.firstChild) {
                col.removeChild(col.firstChild);
            }
            elementsToPreserve.forEach(el => col.appendChild(el));
        }
    });


    refs.leftBody.style.display = snapshot.showLeft ? 'flex' : 'none';
    refs.rightBody.style.display = snapshot.showRight ? 'flex' : 'none';

    // Sync settings to match snapshot visibility
    settings.update({
        showLeftPane: !!snapshot.showLeft,
        showRightPane: !!snapshot.showRight
    });

    if (snapshot.columnSizes) {
        // Restore lastFlex first so column expansion/size logic has correct values
        if (snapshot.columnSizes.leftLastFlex) refs.leftBody.dataset.lastFlex = snapshot.columnSizes.leftLastFlex;
        if (snapshot.columnSizes.centerLastFlex) refs.centerBody.dataset.lastFlex = snapshot.columnSizes.centerLastFlex;
        if (snapshot.columnSizes.rightLastFlex) refs.rightBody.dataset.lastFlex = snapshot.columnSizes.rightLastFlex;

        // Apply the saved column sizes (for collapsed columns this is the lastFlex expanded size,
        // not 0 0 36px — the delayed recalculateColumnSizes will correct collapsed ones)
        refs.leftBody.style.flex = snapshot.columnSizes.left;
        refs.centerBody.style.flex = snapshot.columnSizes.center;
        refs.rightBody.style.flex = snapshot.columnSizes.right;

        if (snapshot.columnSizes.leftCollapsed) {
            refs.leftBody.dataset.isColumnCollapsed = 'true';
        }
        if (snapshot.columnSizes.rightCollapsed) {
            refs.rightBody.dataset.isColumnCollapsed = 'true';
        }
    }

    const resizers = Array.from(refs.mainBody.querySelectorAll(SELECTORS.COLUMN_RESIZER));

    if (resizers[0]) resizers[0].style.display = snapshot.showLeft ? 'flex' : 'none';
    if (resizers[1]) resizers[1].style.display = snapshot.showRight ? 'flex' : 'none';

    const createdPanes = [];
    const elementsToCollapse = [];
    const placedPanelIds = new Set();
    const panelLocationMap = new Map(snapshot.panelLocations || []);

    const rebuildNodeTree = (node, parent) => {
        if (!node || !parent) return null;

        if (node.type === 'split' && node.children?.length === 1) {
            return rebuildNodeTree(node.children[0], parent);
        }

        if (node.type === 'pane') {
            const pane = createPane({}, { deferInitialCheck: true });
            if (node.paneId) pane.dataset.paneId = node.paneId;

            if (node.isCollapsed) {
                if (node.actualWidth) pane.dataset.lastWidth = node.actualWidth;
                if (node.actualHeight) pane.dataset.lastHeight = node.actualHeight;
                if (node.lastFlex) pane.dataset.lastFlex = node.lastFlex;

                const minWidth = node.minWidth || DEFAULT_MIN_SIZES.pane.width;
                const minHeight = node.minHeight || DEFAULT_MIN_SIZES.pane.height;
                pane.style.minWidth = minWidth;
                pane.style.minHeight = minHeight;
                pane.style.flex = node.flex || '0 0 auto';
            } else {
                if (node.flex) pane.style.flex = node.flex;
            }

            if (node.lastFlex) pane.dataset.lastFlex = node.lastFlex;
            if (node.minWidth) pane.style.minWidth = node.minWidth;
            if (node.minHeight) pane.style.minHeight = node.minHeight;

            writePaneViewSettings(pane, node.viewSettings || {});
            if (node.viewSettings?.appliedOrientation) {
                pane.dataset.appliedOrientation = node.viewSettings.appliedOrientation;
            }
            if (node.viewSettings?.lastExpandedOrientation) {
                pane.dataset.lastExpandedOrientation = node.viewSettings.lastExpandedOrientation;
            }

            parent.appendChild(pane);
            createdPanes.push(pane);

            if (node.isCollapsed) {
                elementsToCollapse.push({
                    el: pane,
                    type: 'pane',
                    lastFlex: node.lastFlex,
                    lastWidth: node.actualWidth,
                    lastHeight: node.actualHeight
                });
            }

            createTabsForPane(pane, node.tabs || [], placedPanelIds, node.isCollapsed);
            return pane;
        }

        if (node.type === 'split') {
            const split = el('div', { className: SELECTORS.SPLIT.substring(1) });


            if (node.isCollapsed) {
                if (node.actualWidth) split.dataset.lastWidth = node.actualWidth;
                if (node.actualHeight) split.dataset.lastHeight = node.actualHeight;
                if (node.lastFlex) split.dataset.lastFlex = node.lastFlex;
                split.style.flex = node.flex || '0 0 auto';
            } else {
                if (node.flex) split.style.flex = node.flex;
                if (node.lastFlex) split.dataset.lastFlex = node.lastFlex;
            }

            split.dataset.naturalOrientation = node.naturalOrientation || node.orientation;
            if (node.orientationExpanded) split.dataset.orientationExpanded = node.orientationExpanded;
            if (node.orientationCollapsed) split.dataset.orientationCollapsed = node.orientationCollapsed;
            split.classList.toggle('horizontal', node.orientation === 'horizontal');

            parent.appendChild(split);

            if (node.isCollapsed) {
                elementsToCollapse.push({
                    el: split,
                    type: 'split',
                    lastFlex: node.lastFlex,
                    lastWidth: node.actualWidth,
                    lastHeight: node.actualHeight
                });
            }

            node.children?.forEach((childNode, index) => {
                if (index > 0) {
                    const resizer = el('splitter', {
                        className: `ptmt-resizer-${node.orientation}`
                    });
                    split.appendChild(resizer);
                    attachResizer(resizer, node.orientation);
                }


                const childEl = rebuildNodeTree(childNode, split);

                if (childEl) {
                    // splitRatios is the most reliable memory of the split's internal proportions (lastFlex).
                    // Apply it if it exists to ensure correct baseline (e.g. 20%/80%) before any logic runs.
                    if (node.splitRatios?.[index]) {
                        childEl.style.flex = `1 1 ${node.splitRatios[index]}%`;
                    } else if (childNode.flex) {
                        childEl.style.flex = childNode.flex;
                    }
                }
            });

            return split;
        }

        return null;
    };

    const createTabsForPane = (pane, tabsData, placedPanelIds, isPaneCollapsed) => {
        if (!pane || !Array.isArray(tabsData)) return;
        const sortedTabs = [...tabsData].sort((a, b) => (a.order || 0) - (b.order || 0));
        let activePid = null;
        let defaultPid = null;

        for (const t of sortedTabs) {
            if (!t) continue;
            try {
                let panel = null;
                let pid = null;

                if (t.sourceId) {
                    const mapping = settings.getMapping(t.sourceId);
                    const iconToUse = t.icon || mapping.icon || 'fa-tab';
                    panel = createTabFromContent(t.sourceId, {
                        title: t.title || mapping.title,
                        icon: iconToUse,
                        makeActive: false,
                        color: mapping.color || t.color
                    }, pane);

                    if (panel) {
                        pid = panel.dataset.panelId;
                        placedPanelIds.add(t.sourceId);
                    }
                } else if (t.customContent) {
                    panel = createPanelElement(t.title || 'Custom');
                    panel.querySelector('.ptmt-panel-content').innerHTML = t.customContent;
                    Object.entries(t.customData || {}).forEach(([key, value]) => {
                        if (key !== 'panelId') panel.dataset[key] = value;
                    });
                    pid = registerPanelDom(panel, t.title);
                    pane._panelContainer.appendChild(panel);
                    const tab = createTabElement(t.title, pid, t.icon || 'fa-layer-group');
                    pane._tabStrip.appendChild(tab);
                }

                if (pid) {
                    const tabEl = pane._tabStrip.querySelector(`${SELECTORS.TAB}[data-for="${CSS.escape(pid)}"]`);

                    if (tabEl) {
                        // Ensure all tabs are collapsed if the pane is collapsed, 
                        // or if the tab specifically was saved as collapsed.
                        if (t.collapsed || isPaneCollapsed) tabEl.classList.add('collapsed');
                        if (t.active) activePid = pid;
                        if (t.isDefault) {
                            defaultPid = pid;
                            const p = getPanelById(pid);
                            if (p) p.dataset.defaultPanel = 'true';
                        }
                    }
                }
            } catch (e) {
                console.warn('[PTMT] Failed to restore tab:', t, e);
            }
        }

        if (activePid) {
            setActivePanelInPane(pane, activePid, isPaneCollapsed);
        } else if (defaultPid) {
            setActivePanelInPane(pane, defaultPid, isPaneCollapsed);
        } else if (!isPaneCollapsed) {
            // Only force-activate a tab if the pane is actually expanded.
            // If it's collapsed and no activePid was found, we should leave it with 0 active tabs.
            setActivePanelInPane(pane, null, false);
        }
    };

    const leftHasContent = nodeHasMeaningfulContent(snapshot.columns.left?.content);
    const centerHasContent = nodeHasMeaningfulContent(snapshot.columns.center?.content);
    const rightHasContent = nodeHasMeaningfulContent(snapshot.columns.right?.content);

    if (leftHasContent) rebuildNodeTree(snapshot.columns.left.content, refs.leftBody);
    if (centerHasContent) rebuildNodeTree(snapshot.columns.center.content, refs.centerBody);
    if (rightHasContent) rebuildNodeTree(snapshot.columns.right.content, refs.rightBody);

    if (refs.leftBody.style.display !== 'none' && !refs.leftBody.querySelector(SELECTORS.PANE)) refs.leftBody.appendChild(createPane({}, { deferInitialCheck: true }));
    if (!refs.centerBody.querySelector(SELECTORS.PANE)) refs.centerBody.appendChild(createPane({}, { deferInitialCheck: true }));
    if (refs.rightBody.style.display !== 'none' && !refs.rightBody.querySelector(SELECTORS.PANE)) refs.rightBody.appendChild(createPane({}, { deferInitialCheck: true }));


    const allGhostTabs = [];
    ['left', 'center', 'right'].forEach(colName => {
        (snapshot.columns[colName]?.ghostTabs || []).forEach(tabInfo => {
            allGhostTabs.push({ ...tabInfo, column: colName });
        });
    });

    const mappings = settings.get('panelMappings') || [];
    const allGhostSourceIds = new Set(allGhostTabs.map(t => t.sourceId));
    const hiddenTabsList = new Set((snapshot.hiddenTabs || []).map(h => typeof h === 'string' ? h : h.sourceId));

    // Internal PTMT panels are initialised explicitly later in the RAF callback — skip orphan recovery for them.
    const PTMT_INTERNAL_IDS = new Set(['ptmt-settings-wrapper-content', PTMT_INFO_PANEL_ID]);

    const orphanPanelIds = mappings
        .map(m => m.id)
        .filter(id => !placedPanelIds.has(id) && !allGhostSourceIds.has(id) && !hiddenTabsList.has(id) && !PTMT_INTERNAL_IDS.has(id));

    if (orphanPanelIds.length > 0) {
        console.log(`[PTMT] Recovering ${orphanPanelIds.length} orphan tabs:`, orphanPanelIds);
        orphanPanelIds.forEach(id => {
            const originalLocation = panelLocationMap.get(id);
            let targetPane = null;

            if (originalLocation) {
                const column = refs[`${originalLocation.column}Body`];
                if (column) {
                    targetPane = column.querySelectorAll(SELECTORS.PANE)[originalLocation.paneIndex] ||
                        column.querySelector(SELECTORS.PANE);
                }
            }
            if (!targetPane) {
                targetPane = refs.centerBody.querySelector(SELECTORS.PANE);
            }

            if (targetPane) {
                const mapping = mappings.find(m => m.id === id) || {};
                // Double check if it actually isn't there (sometimes IDs mismatch)
                if (!targetPane.querySelector(`[data-source-id="${CSS.escape(id)}"]`)) {
                    createTabFromContent(id, {
                        title: mapping.title,
                        icon: mapping.icon,
                        color: mapping.color,
                        makeActive: false
                    }, targetPane);
                    placedPanelIds.add(id);
                }
            }
        });
    }

    document.querySelectorAll('.ptmt-panel').forEach(panel => {
        const content = panel.querySelector('.ptmt-panel-content');
        if (content && content.childElementCount === 0) {
            const sourceId = panel.dataset.sourceId;
            if (sourceId) {
                const isClass = sourceId.startsWith('class:');
                const isId = sourceId.startsWith('id:');
                const rawId = isClass || isId ? sourceId.split(':')[1] : sourceId;

                const searchId = isClass ? '' : rawId;
                const searchClass = isClass ? rawId : '';

                const existing = allGhostTabs.find(t => t.searchId === searchId && t.searchClass === searchClass);
                if (!existing) {
                    allGhostTabs.push({
                        sourceId,
                        searchId,
                        searchClass,
                        paneId: panel.closest('.ptmt-pane')?.dataset.paneId,
                        column: panel.closest('.ptmt-body-column')?.id.replace('ptmt-', '').replace('Body', '') || 'center'
                    });
                }
            }
        }
    });

    initPendingTabsManager(allGhostTabs);

    requestAnimationFrame(() => {
        elementsToCollapse.forEach(item => {
            if (item.lastFlex) item.el.dataset.lastFlex = item.lastFlex;
            if (item.lastWidth) item.el.dataset.lastWidth = item.lastWidth;
            if (item.lastHeight) item.el.dataset.lastHeight = item.lastHeight;

            if (item.type === 'pane') {
                if (typeof setPaneCollapsedView === 'function') {
                    setPaneCollapsedView(item.el, true);
                } else {
                    item.el.classList.add(SELECTORS.VIEW_COLLAPSED.substring(1));
                }
            } else if (item.type === 'split') {
                item.el.classList.add(SELECTORS.CONTAINER_COLLAPSED.substring(1));
            }

        });

        createdPanes.forEach(pane => {
            applyPaneOrientation(pane);
            const vs = readPaneViewSettings(pane);
            if (vs.iconOnly) {
                applyIconsOnly(pane, true);
            }
        });

        const settingsWrapperId = 'ptmt-settings-wrapper-content';
        const settingsWrapper = document.getElementById(settingsWrapperId);


        const centerPane = refs.centerBody.querySelector(SELECTORS.PANE);

        const settingsTab = getPanelBySourceId(settingsWrapperId);

        if (!settingsTab && centerPane) {
            const settingsPanel = createTabFromContent(settingsWrapperId, {
                title: 'Layout Settings',
                icon: 'fa-screwdriver-wrench',
                makeActive: false
            }, centerPane);

            if (settingsPanel) {
                if (api.manager) api.manager.cleanup();
                const layoutManager = new LayoutManager(api, settings);
                api.manager = layoutManager;
                const settingsUI = layoutManager.createSettingsPanel();
                settingsPanel.querySelector('.ptmt-panel-content').appendChild(settingsUI);
            }
        } else if (settingsTab) {
            // Re-initialize manager on existing panel
            if (api.manager) api.manager.cleanup();
            const layoutManager = new LayoutManager(api, settings);
            api.manager = layoutManager;
            const settingsUI = layoutManager.createSettingsPanel();
            const content = settingsTab.querySelector('.ptmt-panel-content');
            if (content) {
                content.innerHTML = '';
                content.appendChild(settingsUI);
            }
        }

        // ─── Info Panel (Guide / What's New / More) ────────────────────────────

        const infoWrapperId = PTMT_INFO_PANEL_ID;

        // Ensure a DOM element with the right ID exists in the staging area
        // so createTabFromContent can find and wrap it.
        if (!document.getElementById(infoWrapperId)) {
            const stubEl = el('div', { id: infoWrapperId });
            const stagingArea = document.querySelector(SELECTORS.STAGING_AREA) || document.body;
            stagingArea.appendChild(stubEl);
        }

        const existingInfoTab = getPanelBySourceId(infoWrapperId);
        let infoTabPanel = null;

        if (!existingInfoTab && centerPane) {
            infoTabPanel = createTabFromContent(infoWrapperId, {
                title: 'Info & Guide',
                icon: 'fa-circle-info',
                makeActive: false,
            }, centerPane);
        } else if (existingInfoTab) {
            infoTabPanel = existingInfoTab;
        }

        // Populate / refresh the Info panel UI
        if (infoTabPanel) {
            const infoContent = infoTabPanel.querySelector('.ptmt-panel-content');
            if (infoContent) {
                infoContent.innerHTML = '';
                const infoPanelUI = createInfoPanel(settings);
                infoContent.appendChild(infoPanelUI);

                // ─── Auto-open logic ───────────────────────────────────────────
                // First install: lastSeenVersion is null → open on Guide tab.
                // After update: version changed → open on Changelog tab.
                // Same version: do nothing (user dismissed already).
                const lastSeenVersion = settings.get('lastSeenVersion');
                const isFirstOpen = lastSeenVersion === null || lastSeenVersion === undefined;
                const isUpdate    = !isFirstOpen
                    && lastSeenVersion !== PTMT_INFO_CURRENT_VERSION
                    && lastSeenVersion !== 'never';  // user opted out of auto-open

                if (isFirstOpen || isUpdate) {
                    // Activate the correct sub-tab
                    infoPanelUI._activateTab(isFirstOpen ? 'guide' : 'changelog');

                    // Switch the PTMT tab so the panel is visible
                    const infoTabEl = document.querySelector(`.ptmt-tab[data-for="${CSS.escape(infoTabPanel.dataset.panelId)}"]`);
                    if (infoTabEl && typeof setActivePanelInPane === 'function') {
                        const hostPane = infoTabEl.closest('.ptmt-pane');
                        if (hostPane) {
                            setActivePanelInPane(hostPane, infoTabPanel.dataset.panelId);
                        }
                    }

                    // Record the version so this doesn't fire again until next update
                    settings.update({ lastSeenVersion: PTMT_INFO_CURRENT_VERSION });
                }
            }
        }

        createdPanes.forEach(pane => {
            if (typeof checkAndCollapsePaneIfAllTabsCollapsed === 'function') {
                checkAndCollapsePaneIfAllTabsCollapsed(pane);
            }
        });

        setTimeout(() => {
            recalculateAllSplitsRecursively();
            recalculateColumnSizes();
            updateResizerDisabledStates();
            document.querySelectorAll(SELECTORS.PANE).forEach(checkPaneForIconMode);
            validateAndCorrectAllMinSizes();

            window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, {
                detail: { reason: 'snapshotApplied' }
            }));

            setTimeout(() => {
                document.querySelectorAll(SELECTORS.PANE).forEach(checkPaneForIconMode);
            }, 300);
        }, 200);

    });
}

function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (!snapshot.columns || typeof snapshot.columns !== 'object') return null;

    // Validate column structure
    for (const col of ['left', 'center', 'right']) {
        const column = snapshot.columns[col];
        if (!column || typeof column !== 'object') {
            console.warn(`[PTMT] Snapshot missing or invalid column: ${col}`);
            return null;
        }
        // Ensure content has a valid type
        if (column.content && !['pane', 'split'].includes(column.content.type)) {
            console.warn(`[PTMT] Invalid content type in column ${col}: ${column.content.type}`);
            return null;
        }
        // Validate split nodes have children array
        if (column.content?.type === 'split' && !Array.isArray(column.content.children)) {
            console.warn(`[PTMT] Split node in column ${col} missing children array`);
            return null;
        }
    }

    // Version check: attempt migration if old version
    if (!snapshot.version || snapshot.version < SNAPSHOT_VERSION) {
        console.warn(`[PTMT] Snapshot version ${snapshot.version} is below minimum supported version ${SNAPSHOT_VERSION}. Cannot migrate.`);
        if (typeof window.toastr !== 'undefined') {
            window.toastr.info("PTMT Layout has been updated and reset to defaults to ensure compatibility.", "Layout Updated");
        }
        return null;
    }

    if (snapshot.version < SNAPSHOT_CURRENT_VERSION) {
        const migrated = migrateSnapshot(snapshot);
        if (!migrated) {
            console.warn(`[PTMT] Migration from v${snapshot.version} failed. Resetting to default.`);
            if (typeof window.toastr !== 'undefined') {
                window.toastr.info("PTMT Layout has been updated and reset to defaults to ensure compatibility.", "Layout Updated");
            }
            return null;
        }
        snapshot = migrated;
    }

    if (snapshot.version > SNAPSHOT_CURRENT_VERSION) {
        console.warn(`[PTMT] Snapshot version ${snapshot.version} is newer than supported (${SNAPSHOT_CURRENT_VERSION}). Using as-is.`);
    }

    const hasContent = ['left', 'center', 'right'].some(col =>
        nodeHasMeaningfulContent(snapshot.columns[col]?.content) || snapshot.columns[col]?.ghostTabs?.length > 0
    );

    if (!hasContent) {
        console.warn('[PTMT] Snapshot has no meaningful content');
        return null;
    }

    return snapshot;
}

function nodeHasMeaningfulContent(node) {
    if (!node) return false;
    if (node.type === 'pane') {
        return Array.isArray(node.tabs) && node.tabs.length > 0;
    }
    if (node.type === 'split') {
        return Array.isArray(node.children) &&
            node.children.some(child => nodeHasMeaningfulContent(child));
    }
    return false;
}