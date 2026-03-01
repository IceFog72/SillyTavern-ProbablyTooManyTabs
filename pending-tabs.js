// pending-tabs.js
import { getRefs } from './layout.js';
import { createTabFromContent, destroyTabById } from './tabs.js';
import { settings } from './settings.js';
import { getPanelBySourceId } from './utils.js';

let hydrationObserver = null;
let demotionObserver = null;
let pendingTabsMap = new Map();

export const getTabIdentifier = (tabInfo) => {
    if (tabInfo.searchId) return `id:${tabInfo.searchId}`;
    if (tabInfo.searchClass) return `class:${tabInfo.searchClass}`;
    return null;
};


export function updatePendingTabColumn(tabInfo, newColumn) {
    const identifier = getTabIdentifier(tabInfo);
    if (!identifier) return;

    if (pendingTabsMap.has(identifier)) {
        const existingTab = pendingTabsMap.get(identifier);
        existingTab.column = newColumn;
        existingTab.paneId = tabInfo.paneId;
        console.log(`[PTMT-Pending] Updated live destination for ${identifier} to column '${newColumn}' and pane '${tabInfo.paneId}'.`);
    } else {
        const newPendingTab = { ...tabInfo, column: newColumn };
        pendingTabsMap.set(identifier, newPendingTab);
        console.log(`[PTMT-Pending] Armed listener for ${identifier} in column '${newColumn}' and pane '${tabInfo.paneId}'.`);
    }
}

function addTabToPendingList(tabInfo) {
    const identifier = getTabIdentifier(tabInfo);
    if (identifier && !pendingTabsMap.has(identifier)) {
        console.log(`[PTMT-Pending] Re-arming listener for ${identifier}`);
        pendingTabsMap.set(identifier, tabInfo);

        const currentLayout = settings.getActiveLayout();
        const column = tabInfo.column || 'center';

        for (const col of Object.values(currentLayout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
            }
        }

        if (!currentLayout.columns[column]) currentLayout.columns[column] = { ghostTabs: [] };
        if (!currentLayout.columns[column].ghostTabs) currentLayout.columns[column].ghostTabs = [];

        const newTabInfo = {
            searchId: tabInfo.searchId || '',
            searchClass: tabInfo.searchClass || '',
            paneId: tabInfo.paneId || null
        };
        if (!currentLayout.columns[column].ghostTabs.some(t => getTabIdentifier(t) === identifier)) {
            currentLayout.columns[column].ghostTabs.push(newTabInfo);
        }

        settings.update({ [settings.getActiveLayoutKey()]: currentLayout });
        checkForPendingTabs([document.body]);
    }
}

function findTargetPane(columnName, paneId) {
    if (paneId) {
        const pane = document.querySelector(`.ptmt-pane[data-pane-id="${paneId}"]`);
        if (pane) return pane;
    }

    const refs = getRefs();
    const columnEl = refs[`${columnName}Body`];
    if (!columnEl) return null;

    let searchEl = columnEl;
    while (searchEl) {
        const pane = searchEl.querySelector('.ptmt-pane');
        if (pane) return pane;
        const split = searchEl.querySelector('.ptmt-split');
        if (!split) break;
        searchEl = split.children[0];
    }
    return null;
}

function hydrateTab(tabInfo, foundElement) {
    const identifier = getTabIdentifier(tabInfo);
    if (!identifier) return;

    // SAFETY: If the element we found is ALREADY inside a PTMT panel, it's already "tamed".
    // We only care about elements that are "wild" (in the main DOM or re-created by ST).
    if (foundElement.closest('.ptmt-panel-content')) {
        return;
    }

    const existingPanel = getPanelBySourceId(identifier);
    if (existingPanel) {
        console.log(`[PTMT-Pending] Found new content for ${identifier}. Replacing existing tab.`);
        destroyTabById(existingPanel.dataset.panelId);
    }

    console.log(`[PTMT-Pending] Hydrating tab: ${identifier}`);
    const targetPane = findTargetPane(tabInfo.column, tabInfo.paneId);
    if (!targetPane) {
        console.warn(`[PTMT-Pending] Could not find a target pane (ID: ${tabInfo.paneId || 'any'}) in column '${tabInfo.column}' for tab '${identifier}'.`);
        return;
    }

    const sourceIdForMapping = tabInfo.searchId || tabInfo.searchClass;
    const mappings = settings.get('panelMappings') || [];
    const mapping = mappings.find(m => m.id === sourceIdForMapping) || {};

    createTabFromContent(foundElement, {
        title: tabInfo.title || mapping.title,
        icon: tabInfo.icon || mapping.icon || 'fa-tab',
        makeActive: true, // Always auto-open per user request
        collapsed: false, // Ensure it's not collapsed
        sourceId: identifier
    }, targetPane);

    // CRITICAL: Once hydrated, stop looking for this element to prevent performance leaks
    //pendingTabsMap.delete(identifier);
}

function checkForPendingTabs(nodes) {
    if (pendingTabsMap.size === 0) return;

    const tabsToHydrate = new Map();

    for (const node of nodes) {
        if (node.nodeType !== 1) continue;

        for (const [identifier, tabInfo] of pendingTabsMap.entries()) {
            if (tabsToHydrate.has(identifier)) continue;

            let foundElement = null;
            if (tabInfo.searchId) {
                if (node.id === tabInfo.searchId) foundElement = node;
                else if (node.querySelector) foundElement = node.querySelector(`#${CSS.escape(tabInfo.searchId)}`);
            } else if (tabInfo.searchClass) {
                let potentialElements = [];
                if (node.classList?.contains(tabInfo.searchClass)) {
                    potentialElements.push(node);
                }
                if (node.querySelectorAll) {
                    potentialElements.push(...node.querySelectorAll(`.${CSS.escape(tabInfo.searchClass)}`));
                }
                for (const el of potentialElements) {
                    if (!el.closest('[name="templatesAndPopupsWrapper"]')) {
                        foundElement = el;
                        break;
                    }
                }
            }

            if (foundElement) {
                tabsToHydrate.set(identifier, { tabInfo, foundElement });
            }
        }
    }

    for (const { tabInfo, foundElement } of tabsToHydrate.values()) {
        hydrateTab(tabInfo, foundElement);
    }
}

export function initPendingTabsManager(allGhostTabs) {
    pendingTabsMap.clear();

    for (const tabInfo of allGhostTabs) {
        if (tabInfo.sourceId && !tabInfo.searchId) {
            tabInfo.searchId = tabInfo.sourceId;
        }
        const identifier = getTabIdentifier(tabInfo);
        if (identifier) {
            pendingTabsMap.set(identifier, { ...tabInfo });
        }
    }

    // Always disconnect existing observer to prevent memory leaks
    if (hydrationObserver) {
        hydrationObserver.disconnect();
        hydrationObserver = null;
    }

    if (pendingTabsMap.size === 0) return;

    let nodesToCheck = new Set();
    let hydrationTimeout = null;

    hydrationObserver = new MutationObserver((mutationsList) => {
        let structuralChange = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Only care about Elements
                        // OPTIMIZATION: Filter out noisy updates immediately
                        if (node.id === 'chat' || node.classList.contains('mes')) continue;
                        nodesToCheck.add(node);
                        structuralChange = true;
                    }
                }
            }
        }

        if (structuralChange) {
            if (hydrationTimeout) clearTimeout(hydrationTimeout);
            hydrationTimeout = setTimeout(() => {
                if (nodesToCheck.size === 0) return;
                const batch = Array.from(nodesToCheck);
                nodesToCheck.clear();
                checkForPendingTabs(batch);
            }, 100);
        }
    });

    const observeTarget = document.getElementById('movingDivs') || document.body;
    hydrationObserver.observe(observeTarget, { childList: true, subtree: true });

    checkForPendingTabs([document.body]);
}

export function initDemotionObserver(api) {
    if (demotionObserver) demotionObserver.disconnect();
    const target = document.getElementById('ptmt-main');
    if (!target) return;

    const callback = (mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                const panelContent = mutation.target;
                if (panelContent.matches('.ptmt-panel-content') && panelContent.childElementCount === 0) {
                    const panel = panelContent.closest('.ptmt-panel');
                    if (!panel || panel.dataset.demoting) continue;

                    const sourceId = panel.dataset.sourceId;
                    if (!sourceId || !sourceId.includes(':')) continue;

                    panel.dataset.demoting = 'true';

                    const [type, value] = sourceId.split(':', 2);
                    const tabInfoToRearm = {};
                    if (type === 'id') tabInfoToRearm.searchId = value;
                    else if (type === 'class') tabInfoToRearm.searchClass = value;
                    else { delete panel.dataset.demoting; continue; }

                    const columnEl = panel.closest('.ptmt-body-column');
                    const paneEl = panel.closest('.ptmt-pane');
                    const colId = columnEl ? columnEl.id : 'ptmt-centerBody';
                    const colName = colId.replace('ptmt-', '').replace('Body', '');
                    const paneId = paneEl ? paneEl.dataset.paneId : null;

                    console.log(`[PTMT-Demotion] Tab ${sourceId} content removed from pane ${paneId}. Destroying tab and re-arming listener.`);

                    destroyTabById(panel.dataset.panelId);

                    addTabToPendingList({ ...tabInfoToRearm, column: colName, paneId: paneId });

                    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'demotion' } }));

                    continue;
                }
            }
        }
    };
    demotionObserver = new MutationObserver(callback);
    demotionObserver.observe(target, { childList: true, subtree: true });
}

export function cleanupPendingTabsObservers() {
    if (hydrationObserver) {
        hydrationObserver.disconnect();
        hydrationObserver = null;
    }
    if (demotionObserver) {
        demotionObserver.disconnect();
        demotionObserver = null;
    }
    pendingTabsMap.clear();
}