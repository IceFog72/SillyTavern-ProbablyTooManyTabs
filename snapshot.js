// snapshot.js 

import { getRefs, recalculateColumnSizes, applyColumnVisibility } from './layout.js';
import { getPanelById, getSplitOrientation, el } from './utils.js';
import { createPane, writePaneViewSettings, readPaneViewSettings, applyPaneOrientation, setPaneCollapsedView, checkAndCollapsePaneIfAllTabsCollapsed } from './pane.js';
import { openTab, createTabFromElementId, setActivePanelInPane, createTabForBodyContent, createPanelElement, registerPanelDom, createTabElement } from './tabs.js';
import { attachResizer, updateResizerDisabledStates, recalculateAllSplitsRecursively } from './resizer.js';
import { LayoutManager } from './LayoutManager.js';
import { settings } from './settings.js';

const SNAPSHOT_VERSION = 4;


const DEFAULT_MIN_SIZES = {
    pane: { width: '200px', height: '100px' },
    split: { width: '150px', height: '80px' }
};

export function generateLayoutSnapshot() {
    const refs = getRefs();
    if (!refs) return null;

    const buildNodeTree = (element, parentColumn = null) => {
        if (!element) return null;

        if (element.classList.contains('sftnt-pane')) {
            const tabElements = Array.from(element.querySelectorAll(':scope > .sftnt-pane-grid > .sftnt-tabStrip > .sftnt-tab'));
            const panels = Array.from(element.querySelectorAll(':scope > .sftnt-pane-grid > .sftnt-panelContainer > .sftnt-panel'));

            const tabsData = tabElements.map((tabEl, index) => {
                const pid = tabEl.dataset.for;
                const panel = getPanelById(pid);
                const sourceId = panel?.dataset?.sourceId || null;
                const isCustom = !sourceId && panel?.dataset?.sftntType === 'panel';

                return {
                    panelId: pid || null,
                    sourceId: sourceId,
                    title: tabEl.querySelector('.sftnt-tab-label')?.textContent?.trim() || panel?.dataset?.title || null,
                    icon: tabEl.querySelector('.sftnt-tab-icon')?.textContent || null,
                    collapsed: tabEl.classList.contains('collapsed'),
                    active: tabEl.classList.contains('active'),
                    order: index,
                    isDefault: panel?.dataset?.defaultPanel === 'true',
                    customContent: isCustom ? panel?.querySelector('.sftnt-panel-content')?.innerHTML : null,
                    customData: panel?.dataset || {}
                };
            });

            const computedStyle = getComputedStyle(element);
            const isCollapsed = element.classList.contains('view-collapsed');

            return {
                type: 'pane',
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

        if (element.classList.contains('sftnt-split')) {
            const structuralChildren = Array.from(element.children).filter(c =>
                c.classList.contains('sftnt-pane') || c.classList.contains('sftnt-split')
            );

            const children = structuralChildren.map(child => buildNodeTree(child, parentColumn));

            const splitRatios = structuralChildren.map(child => {
                const flexMatch = (child.style.flex || '').match(/(\d+(?:\.\d+)?)/);
                return flexMatch ? parseFloat(flexMatch[1]) : 50;
            });

            const computedStyle = getComputedStyle(element);
            const isCollapsed = element.classList.contains('sftnt-container-collapsed');

            return {
                type: 'split',
                flex: element.style.flex || null,
                lastFlex: element.dataset.lastFlex || null,
                orientation: getSplitOrientation(element),
                naturalOrientation: element.dataset.naturalOrientation || getSplitOrientation(element),
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
        document.querySelectorAll('.sftnt-resizer-vertical, .sftnt-resizer-horizontal').forEach(resizer => {
            const prev = resizer.previousElementSibling;
            const next = resizer.nextElementSibling;
            if (prev && next) {
                states.push({
                    type: resizer.classList.contains('sftnt-resizer-vertical') ? 'vertical' : 'horizontal',
                    prevFlex: prev.style.flex,
                    nextFlex: next.style.flex,
                    disabled: resizer.classList.contains('disabled')
                });
            }
        });
        return states;
    };

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
                content: buildNodeTree(refs.leftBody.querySelector('.sftnt-pane, .sftnt-split'), 'left')
            },
            center: {
                flex: refs.centerBody.style.flex || null,
                content: buildNodeTree(refs.centerBody.querySelector('.sftnt-pane, .sftnt-split'), 'center')
            },
            right: {
                flex: refs.rightBody.style.flex || null,
                content: buildNodeTree(refs.rightBody.querySelector('.sftnt-pane, .sftnt-split'), 'right')
            }
        },

        resizerStates: captureResizerStates(),

        panelLocations: (() => {
            const locations = new Map();
            ['left', 'center', 'right'].forEach(col => {
                const column = refs[`${col}Body`];
                column.querySelectorAll('.sftnt-panel').forEach((panel, idx) => {
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
        console.error('[SFT] Invalid snapshot, loading default layout');
        const defaultLayout = settings.get('defaultLayout');
        if (defaultLayout && defaultLayout !== snapshot) {
            applyLayoutSnapshot(defaultLayout, api, settings);
        }
        return;
    }

    const refs = getRefs();
    if (!refs || !refs.mainBody) {
        console.error('[SFT] Cannot apply snapshot: layout refs not found');
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

    const resizers = Array.from(refs.mainBody.querySelectorAll('.sftnt-resizer-vertical.sftnt-column-resizer'));
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

            createTabsForPane(pane, node.tabs || [], placedPanelIds);

            return pane;
        }

        if (node.type === 'split') {
            const split = el('div', { className: 'sftnt-split' });


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
                        className: `sftnt-resizer-${node.orientation}`
                    });
                    split.appendChild(resizer);
                    attachResizer(resizer, node.orientation);
                }

                const childEl = rebuildNodeTree(childNode, split);

                if (childEl && node.splitRatios?.[index]) {
                    childEl.style.flex = `0 1 ${node.splitRatios[index]}%`;
                }
            });

            return split;
        }

        return null;
    };

    const createTabsForPane = (pane, tabsData, placedPanelIds) => {
        if (!pane || !Array.isArray(tabsData)) return;

        const sortedTabs = [...tabsData].sort((a, b) => (a.order || 0) - (b.order || 0));

        let activePid = null;
        let defaultPid = null;

        for (const t of sortedTabs) {
            if (!t) continue;

            try {
                let panel = null;
                let pid = null;

                if (t.sourceId && !placedPanelIds.has(t.sourceId)) {
                    const mapping = (settings.get('panelMappings') || []).find(m => m.id === t.sourceId) || {};
                    panel = createTabFromElementId(t.sourceId, {
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
                    panel.querySelector('.sftnt-panel-content').innerHTML = t.customContent;

                    Object.entries(t.customData || {}).forEach(([key, value]) => {
                        if (key !== 'panelId') panel.dataset[key] = value;
                    });

                    pid = registerPanelDom(panel, t.title);
                    pane._panelContainer.appendChild(panel);

                    const tab = createTabElement(t.title, pid, t.icon);
                    pane._tabStrip.appendChild(tab);
                }

                if (pid) {
                    const tabEl = pane._tabStrip.querySelector(`.sftnt-tab[data-for="${CSS.escape(pid)}"]`);
                    if (tabEl) {
                        if (t.collapsed) tabEl.classList.add('collapsed');
                        if (t.active) activePid = pid;
                        if (t.isDefault) {
                            defaultPid = pid;
                            const p = getPanelById(pid);
                            if (p) p.dataset.defaultPanel = 'true';
                        }
                    }
                }
            } catch (e) {
                console.warn('[SFT] Failed to restore tab:', t, e);
            }
        }

        if (activePid) {
            setActivePanelInPane(pane, activePid);
        } else if (defaultPid) {
            setActivePanelInPane(pane, defaultPid);
        } else {
            setActivePanelInPane(pane);
        }
    };

    const leftHasContent = nodeHasMeaningfulContent(snapshot.columns.left?.content);
    const centerHasContent = nodeHasMeaningfulContent(snapshot.columns.center?.content);
    const rightHasContent = nodeHasMeaningfulContent(snapshot.columns.right?.content);

    if (leftHasContent) rebuildNodeTree(snapshot.columns.left.content, refs.leftBody);
    if (centerHasContent) rebuildNodeTree(snapshot.columns.center.content, refs.centerBody);
    if (rightHasContent) rebuildNodeTree(snapshot.columns.right.content, refs.rightBody);

    if (!refs.centerBody.querySelector('.sftnt-pane')) {
        const fallbackPane = createPane({}, { deferInitialCheck: true });
        refs.centerBody.appendChild(fallbackPane);
        createdPanes.push(fallbackPane);
    }

    const mappings = settings.get('panelMappings') || [];
    const orphanPanelIds = mappings
        .map(m => m.id)
        .filter(id => !placedPanelIds.has(id));

    if (orphanPanelIds.length > 0) {
        orphanPanelIds.forEach(id => {
            const originalLocation = panelLocationMap.get(id);
            let targetPane = null;

            if (originalLocation) {
                const column = refs[`${originalLocation.column}Body`];
                if (column) {
                    targetPane = column.querySelectorAll('.sftnt-pane')[originalLocation.paneIndex] ||
                        column.querySelector('.sftnt-pane');
                }
            }

            if (!targetPane) {
                targetPane = refs.centerBody.querySelector('.sftnt-pane');
            }

            if (targetPane) {
                const mapping = mappings.find(m => m.id === id) || {};
                createTabFromElementId(id, {
                    title: mapping.title,
                    icon: mapping.icon,
                    makeActive: false
                }, targetPane);
            }
        });
    }


    requestAnimationFrame(() => {

        elementsToCollapse.forEach(item => {

            if (item.lastFlex) {
                item.el.dataset.lastFlex = item.lastFlex;
            }
            if (item.lastWidth) {
                item.el.dataset.lastWidth = item.lastWidth;
            }
            if (item.lastHeight) {
                item.el.dataset.lastHeight = item.lastHeight;
            }

            if (item.type === 'pane') {

                if (typeof setPaneCollapsedView === 'function') {
                    setPaneCollapsedView(item.el, true);
                } else {
                    item.el.classList.add('view-collapsed');
                }
            } else if (item.type === 'split') {
                item.el.classList.add('sftnt-container-collapsed');
            }
        });

        createdPanes.forEach(pane => applyPaneOrientation(pane));


        const settingsWrapperId = 'sftnt-settings-wrapper-content';
        let settingsWrapper = document.getElementById(settingsWrapperId);
        if (!settingsWrapper) {
            settingsWrapper = el('div', { id: settingsWrapperId });
            const stagingArea = document.getElementById('sftnt-staging-area') || document.body;
            stagingArea.appendChild(settingsWrapper);
        }

        const centerPane = refs.centerBody.querySelector('.sftnt-pane');
        if (centerPane) {
            const settingsPanel = createTabFromElementId(settingsWrapperId, {
                title: 'Layout Settings',
                icon: '🔧',
                makeActive: false
            }, centerPane);

            if (settingsPanel) {
                const layoutManager = new LayoutManager(api, settings);
                const settingsUI = layoutManager.createSettingsPanel();
                settingsPanel.querySelector('.sftnt-panel-content').appendChild(settingsUI);
            }

            createTabForBodyContent({
                title: 'Main',
                icon: '📌',
                setAsDefault: true
            }, centerPane);

            const mainPanel = document.querySelector('[data-source-id="sftnt-main-content"]');
            if (mainPanel) {
                openTab(mainPanel.dataset.panelId);
            }
        }


        setTimeout(() => {
            recalculateAllSplitsRecursively();
            recalculateColumnSizes();
            updateResizerDisabledStates();

            window.dispatchEvent(new CustomEvent('sftnt:layoutChanged', {
                detail: { reason: 'snapshotApplied' }
            }));
        }, 50);
    });
}

function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (!snapshot.columns || typeof snapshot.columns !== 'object') return false;

    if (snapshot.version && snapshot.version < 3) {
        console.warn('[SFT] Snapshot version too old:', snapshot.version);
        return false;
    }

    const hasContent = ['left', 'center', 'right'].some(col =>
        nodeHasMeaningfulContent(snapshot.columns[col]?.content)
    );

    if (!hasContent) {
        console.warn('[SFT] Snapshot has no meaningful content');
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