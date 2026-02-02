// snapshot.js 

import { getRefs } from './utils.js'; // Ensure getRefs is imported from utils
import { getPanelById, getSplitOrientation, el, getPanelBySourceId } from './utils.js';
import { createPane, writePaneViewSettings, readPaneViewSettings, applyPaneOrientation, setPaneCollapsedView, checkAndCollapsePaneIfAllTabsCollapsed } from './pane.js';
import { setActivePanelInPane, createPanelElement, registerPanelDom, createTabElement, createTabFromContent } from './tabs.js';
import { attachResizer, updateResizerDisabledStates, recalculateAllSplitsRecursively, checkPaneForIconMode, validateAndCorrectAllMinSizes } from './resizer.js';
import { LayoutManager } from './LayoutManager.js';
import { recalculateColumnSizes } from './layout.js';
import { settings, SettingsManager } from './settings.js';
import { initPendingTabsManager } from './pending-tabs.js';

const SNAPSHOT_VERSION = 12;

const DEFAULT_MIN_SIZES = {
    pane: { width: '200px', height: '100px' },
    split: { width: '150px', height: '80px' }
};

export function generateLayoutSnapshot() {
    const refs = getRefs();
    if (!refs) return null;
    const buildNodeTree = (element, parentColumn = null) => {
        if (!element) return null;

        if (element.classList.contains('ptmt-pane')) {
            const tabElements = Array.from(element.querySelectorAll(':scope > .ptmt-pane-grid > .ptmt-tabStrip > .ptmt-tab'));
            const panels = Array.from(element.querySelectorAll(':scope > .ptmt-pane-grid > .ptmt-panelContainer > .ptmt-panel'));

            const tabsData = tabElements.map((tabEl, index) => {
                const pid = tabEl.dataset.for;
                const panel = getPanelById(pid);
                const sourceId = panel?.dataset?.sourceId || null;
                const isCustom = !sourceId && panel?.dataset?.ptmtType === 'panel';

                return {
                    panelId: pid || null,
                    sourceId: sourceId,
                    title: tabEl.querySelector('.ptmt-tab-label')?.textContent?.trim() || panel?.dataset?.title || null,
                    icon: tabEl.querySelector('.ptmt-tab-icon')?.textContent || null,
                    collapsed: tabEl.classList.contains('collapsed'),
                    active: tabEl.classList.contains('active'),
                    order: index,
                    isDefault: panel?.dataset?.defaultPanel === 'true',
                    customContent: isCustom ? panel?.querySelector('.ptmt-panel-content')?.innerHTML : null,
                    customData: panel?.dataset || {}
                };
            });

            const computedStyle = getComputedStyle(element);
            const isCollapsed = element.classList.contains('view-collapsed');

            return {
                type: 'pane',
                paneId: element.dataset.paneId,
                flex: element.style.flex || null,
                lastFlex: element.dataset.lastFlex || null,
                minWidth: element.style.minWidth || null,
                minHeight: element.style.minHeight || null,
                actualWidth: isCollapsed ? (element.dataset.lastWidth || computedStyle.width) : computedStyle.width,
                actualHeight: isCollapsed ? (element.dataset.lastHeight || computedStyle.height) : computedStyle.height,
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

        if (element.classList.contains('ptmt-split')) {
            const structuralChildren = Array.from(element.children).filter(c =>
                c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split')
            );

            const children = structuralChildren.map(child => buildNodeTree(child, parentColumn));

            // FIX: Regex now looks for the number specifically attached to a % sign
            const splitRatios = structuralChildren.map(child => {
                const flexString = child.style.flex || '';
                // Look for '1 1 49.5%' -> matches 49.5
                const percentMatch = flexString.match(/(\d+(?:\.\d+)?)%/);
                if (percentMatch) {
                    return parseFloat(percentMatch[1]);
                }

                // Fallback: If no percent found (e.g. 'flex: 1'), assumes equal distribution or specific logic
                // But usually split children have percentages. 
                return (100 / structuralChildren.length);
            });

            const computedStyle = getComputedStyle(element);
            const isCollapsed = element.classList.contains('ptmt-container-collapsed');

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

                actualWidth: isCollapsed ? (element.dataset.lastWidth || computedStyle.width) : computedStyle.width,
                actualHeight: isCollapsed ? (element.dataset.lastHeight || computedStyle.height) : computedStyle.height,
                isCollapsed: isCollapsed,
                columnLocation: parentColumn
            };
        }

        return null;
    };

    const captureResizerStates = () => {
        const states = [];
        document.querySelectorAll('.ptmt-resizer-vertical, .ptmt-resizer-horizontal').forEach(resizer => {
            const prev = resizer.previousElementSibling;
            const next = resizer.nextElementSibling;
            if (prev && next) {
                states.push({
                    type: resizer.classList.contains('ptmt-resizer-vertical') ? 'vertical' : 'horizontal',
                    prevFlex: prev.style.flex,
                    nextFlex: next.style.flex,
                    disabled: resizer.classList.contains('disabled')
                });
            }
        });
        return states;
    };

    const currentLayout = settings.get('savedLayout') || settings.get('defaultLayout');

    const snapshot = {
        version: SNAPSHOT_VERSION,
        timestamp: Date.now(),
        showLeft: refs.leftBody.style.display !== 'none',
        showRight: refs.rightBody.style.display !== 'none',

        columnSizes: {
            left: refs.leftBody.style.flex || '1 1 22%',
            center: refs.centerBody.style.flex || '1 1 56%',
            right: refs.rightBody.style.flex || '1 1 22%',
            leftCollapsed: refs.leftBody.dataset.isColumnCollapsed === 'true',
            rightCollapsed: refs.rightBody.dataset.isColumnCollapsed === 'true',
            leftLastFlex: refs.leftBody.dataset.lastFlex || null,
            rightLastFlex: refs.rightBody.dataset.lastFlex || null
        },

        columns: {
            left: {
                flex: refs.leftBody.style.flex || null,
                content: buildNodeTree(refs.leftBody.querySelector('.ptmt-pane, .ptmt-split'), 'left'),
                ghostTabs: currentLayout.columns.left.ghostTabs || []
            },
            center: {
                flex: refs.centerBody.style.flex || null,
                content: buildNodeTree(refs.centerBody.querySelector('.ptmt-pane, .ptmt-split'), 'center'),
                ghostTabs: currentLayout.columns.center.ghostTabs || []
            },
            right: {
                flex: refs.rightBody.style.flex || null,
                content: buildNodeTree(refs.rightBody.querySelector('.ptmt-pane, .ptmt-split'), 'right'),
                ghostTabs: currentLayout.columns.right.ghostTabs || []
            }
        },

        resizerStates: captureResizerStates(),
        hiddenTabs: currentLayout.hiddenTabs || [],

        panelLocations: (() => {
            const locations = new Map();
            ['left', 'center', 'right'].forEach(col => {
                const column = refs[`${col}Body`];
                column.querySelectorAll('.ptmt-panel').forEach((panel, idx) => {
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

    return snapshot;
}

export function applyLayoutSnapshot(snapshot, api, settings) {
    if (!validateSnapshot(snapshot)) {
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

    const settingsWrapperId = 'ptmt-settings-wrapper-content';
    let settingsWrapper = document.getElementById(settingsWrapperId);
    if (!settingsWrapper) {
        settingsWrapper = el('div', { id: settingsWrapperId });
        const stagingArea = document.getElementById('ptmt-staging-area') || document.body;
        stagingArea.appendChild(settingsWrapper);
    }

    const refs = getRefs();
    if (!refs || !refs.mainBody) {
        console.error('[PTMT] Cannot apply snapshot: layout refs not found');
        return;
    }

    [refs.leftBody, refs.centerBody, refs.rightBody].forEach(col => {
        if (col) {
            const elementsToPreserve = Array.from(col.querySelectorAll('[data-preserve="true"]'));
            while (col.firstChild) {
                col.removeChild(col.firstChild);
            }
            elementsToPreserve.forEach(el => col.appendChild(el));
        }
    });

    refs.leftBody.style.display = snapshot.showLeft ? 'flex' : 'none';
    refs.rightBody.style.display = snapshot.showRight ? 'flex' : 'none';

    if (snapshot.columnSizes) {
        refs.leftBody.style.flex = snapshot.columnSizes.left;
        refs.centerBody.style.flex = snapshot.columnSizes.center;
        refs.rightBody.style.flex = snapshot.columnSizes.right;

        if (snapshot.columnSizes.leftCollapsed) {
            refs.leftBody.dataset.isColumnCollapsed = 'true';
            refs.leftBody.dataset.lastFlex = snapshot.columnSizes.leftLastFlex || snapshot.columnSizes.left;
        }
        if (snapshot.columnSizes.rightCollapsed) {
            refs.rightBody.dataset.isColumnCollapsed = 'true';
            refs.rightBody.dataset.lastFlex = snapshot.columnSizes.rightLastFlex || snapshot.columnSizes.right;
        }
    }

    const resizers = Array.from(refs.mainBody.querySelectorAll('.ptmt-column-resizer'));
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
                if (node.lastFlex) pane.dataset.lastFlex = node.lastFlex;
                if (node.minWidth) pane.style.minWidth = node.minWidth;
                if (node.minHeight) pane.style.minHeight = node.minHeight;
            }

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
            const split = el('div', { className: 'ptmt-split' });

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

                // FIX: Do not overwrite the flex if the child node explicitly provided it.
                // Only use splitRatios as a fallback if explicit flex is missing.
                if (childEl) {
                    const explicitFlex = childNode.flex;
                    const isExplicitValid = explicitFlex && explicitFlex.indexOf('%') > -1;

                    if (!isExplicitValid && node.splitRatios?.[index]) {
                        childEl.style.flex = `0 1 ${node.splitRatios[index]}%`;
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

                if (t.sourceId && !getPanelBySourceId(t.sourceId)) {
                    const mapping = (settings.get('panelMappings') || []).find(m => m.id === t.sourceId) || {};
                    panel = createTabFromContent(t.sourceId, {
                        title: t.title || mapping.title,
                        icon: t.icon || mapping.icon,
                        makeActive: false
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
                    const tab = createTabElement(t.title, pid, t.icon);
                    pane._tabStrip.appendChild(tab);
                }

                if (pid) {
                    const tabEl = pane._tabStrip.querySelector(`.ptmt-tab[data-for="${CSS.escape(pid)}"]`);
                    if (tabEl) {
                        // FIX: If the pane is collapsed, tabs should also be collapsed unless explicitly active
                        if (t.collapsed || (isPaneCollapsed && !t.active)) tabEl.classList.add('collapsed');
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
            setActivePanelInPane(pane, activePid);
        } else if (defaultPid) {
            setActivePanelInPane(pane, defaultPid);
        } else {
            if (!isPaneCollapsed) {
                setActivePanelInPane(pane);
            }
        }
    };

    const leftHasContent = nodeHasMeaningfulContent(snapshot.columns.left?.content);
    const centerHasContent = nodeHasMeaningfulContent(snapshot.columns.center?.content);
    const rightHasContent = nodeHasMeaningfulContent(snapshot.columns.right?.content);

    if (leftHasContent) rebuildNodeTree(snapshot.columns.left.content, refs.leftBody);
    if (centerHasContent) rebuildNodeTree(snapshot.columns.center.content, refs.centerBody);
    if (rightHasContent) rebuildNodeTree(snapshot.columns.right.content, refs.rightBody);

    if (refs.leftBody.style.display !== 'none' && !refs.leftBody.querySelector('.ptmt-pane')) refs.leftBody.appendChild(createPane({}, { deferInitialCheck: true }));
    if (!refs.centerBody.querySelector('.ptmt-pane')) refs.centerBody.appendChild(createPane({}, { deferInitialCheck: true }));
    if (refs.rightBody.style.display !== 'none' && !refs.rightBody.querySelector('.ptmt-pane')) refs.rightBody.appendChild(createPane({}, { deferInitialCheck: true }));

    const allGhostTabs = [];
    ['left', 'center', 'right'].forEach(colName => {
        (snapshot.columns[colName]?.ghostTabs || []).forEach(tabInfo => {
            allGhostTabs.push({ ...tabInfo, column: colName });
        });
    });

    const mappings = settings.get('panelMappings') || [];
    const allGhostSourceIds = new Set(allGhostTabs.map(t => t.sourceId));
    const hiddenTabsList = new Set((snapshot.hiddenTabs || []).map(h => typeof h === 'string' ? h : h.sourceId));

    const orphanPanelIds = mappings
        .map(m => m.id)
        .filter(id => !placedPanelIds.has(id) && !allGhostSourceIds.has(id) && !hiddenTabsList.has(id));

    if (orphanPanelIds.length > 0) {
        orphanPanelIds.forEach(id => {
            const originalLocation = panelLocationMap.get(id);
            let targetPane = null;

            if (originalLocation) {
                const column = refs[`${originalLocation.column}Body`];
                if (column) {
                    targetPane = column.querySelectorAll('.ptmt-pane')[originalLocation.paneIndex] ||
                        column.querySelector('.ptmt-pane');
                }
            }
            if (!targetPane) {
                targetPane = refs.centerBody.querySelector('.ptmt-pane');
            }
            if (targetPane) {
                const mapping = mappings.find(m => m.id === id) || {};
                createTabFromContent(id, {
                    title: mapping.title,
                    icon: mapping.icon,
                    makeActive: false
                }, targetPane);
            }
        });
    }

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
                    item.el.classList.add('view-collapsed');
                }
            } else if (item.type === 'split') {
                item.el.classList.add('ptmt-container-collapsed');
            }
        });

        createdPanes.forEach(pane => applyPaneOrientation(pane));

        const settingsWrapperId = 'ptmt-settings-wrapper-content';
        let settingsWrapper = document.getElementById(settingsWrapperId);
        if (!settingsWrapper) {
            settingsWrapper = el('div', { id: settingsWrapperId });
            const stagingArea = document.getElementById('ptmt-staging-area') || document.body;
            stagingArea.appendChild(settingsWrapper);
        }

        const centerPane = refs.centerBody.querySelector('.ptmt-pane');
        const settingsTab = getPanelBySourceId(settingsWrapperId);

        if (!settingsTab && centerPane) {
            const settingsPanel = createTabFromContent(settingsWrapperId, {
                title: 'Layout Settings',
                icon: '🔧',
                makeActive: false
            }, centerPane);

            if (settingsPanel) {
                const layoutManager = new LayoutManager(api, settings);
                const settingsUI = layoutManager.createSettingsPanel();
                settingsPanel.querySelector('.ptmt-panel-content').appendChild(settingsUI);
            }
        } else if (settingsTab) {
            // Re-initialize manager on existing panel
            const layoutManager = new LayoutManager(api, settings);
            const settingsUI = layoutManager.createSettingsPanel();
            const content = settingsTab.querySelector('.ptmt-panel-content');
            if (content) {
                content.innerHTML = '';
                content.appendChild(settingsUI);
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
            document.querySelectorAll('.ptmt-pane').forEach(checkPaneForIconMode);
            validateAndCorrectAllMinSizes();

            window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', {
                detail: { reason: 'snapshotApplied' }
            }));

            setTimeout(() => {
                document.querySelectorAll('.ptmt-pane').forEach(checkPaneForIconMode);
            }, 300);
        }, 200);
    });
}

function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (!snapshot.columns || typeof snapshot.columns !== 'object') return false;

    if (!snapshot.version || snapshot.version < SNAPSHOT_VERSION) {
        console.warn(`[PTMT] Snapshot version ${snapshot.version} is older than current version ${SNAPSHOT_VERSION}.`);
        return false;
    }

    const hasContent = ['left', 'center', 'right'].some(col =>
        nodeHasMeaningfulContent(snapshot.columns[col]?.content) || snapshot.columns[col]?.ghostTabs?.length > 0
    );

    if (!hasContent) {
        console.warn('[PTMT] Snapshot has no meaningful content');
        return false;
    }

    return true;
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