// extensions/third-party/PTMT-Tabs/js/pending-tabs.js
import { getRefs } from './layout.js';
import { createTabFromContent, destroyTabById } from './tabs.js';
import { settings } from './settings.js';

let hydrationObserver = null;
let demotionObserver = null;
let pendingTabsMap = new Map();

const getTabIdentifier = (tabInfo) => {
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
        console.log(`[PTMT-Pending] Updated live destination for ${identifier} to column '${newColumn}'.`);
    } else {
        const newPendingTab = { ...tabInfo, column: newColumn };
        pendingTabsMap.set(identifier, newPendingTab);
        console.log(`[PTMT-Pending] Moved and armed listener for ${identifier} in column '${newColumn}'.`);
    }
}

function addTabToPendingList(tabInfo) {
    const identifier = getTabIdentifier(tabInfo);
    if (identifier && !pendingTabsMap.has(identifier)) {
        console.log(`[PTMT-Pending] Re-arming listener for ${identifier}`);
        pendingTabsMap.set(identifier, tabInfo);
        checkForPendingTabs([document.body]);
    }
}

function findTargetPaneForColumn(columnName) {
    const refs = getRefs();
    const columnEl = refs[`${columnName}Body`];
    if (!columnEl) return null;
    
    let searchEl = columnEl;
    while(searchEl) {
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
    if (!identifier || !pendingTabsMap.has(identifier)) return;

    console.log(`[PTMT-Pending] Hydrating tab: ${identifier}`);
    const targetPane = findTargetPaneForColumn(tabInfo.column);
    if (!targetPane) {
        console.warn(`[PTMT-Pending] Could not find a target pane in column '${tabInfo.column}' for tab '${identifier}'.`);
        return;
    }
    
    const mappings = settings.get('panelMappings') || [];
    const mapping = mappings.find(m => m.id === tabInfo.searchId) || {};

    createTabFromContent(foundElement, {
        title: tabInfo.title || mapping.title,
        icon: tabInfo.icon || mapping.icon,
        makeActive: true,
        sourceId: identifier
    }, targetPane);

    pendingTabsMap.delete(identifier);
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

export function initPendingTabsManager(pendingTabs) {
    pendingTabsMap.clear();
    const layout = settings.get('savedLayout') || settings.get('defaultLayout');

    for(const tabInfo of pendingTabs) {
        if (tabInfo.sourceId && !tabInfo.searchId) {
            tabInfo.searchId = tabInfo.sourceId;
        }
        const identifier = getTabIdentifier(tabInfo);
        if (identifier) {
            const fullTabInfo = { ...tabInfo };
            for (const colName in layout.columns) {
                if (layout.columns[colName].ghostTabs?.some(t => getTabIdentifier(t) === identifier)) {
                    fullTabInfo.column = colName;
                    break;
                }
            }
            pendingTabsMap.set(identifier, fullTabInfo);
        }
    }
    
    if (hydrationObserver) {
        hydrationObserver.disconnect();
    }

    if (pendingTabsMap.size === 0) return;

    hydrationObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                checkForPendingTabs(mutation.addedNodes);
            }
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
                    const colId = columnEl ? columnEl.id : 'ptmt-centerBody';
                    const colName = colId.replace('ptmt-', '').replace('Body', '');

                    console.log(`[PTMT-Demotion] Tab ${sourceId} content removed. Destroying tab and re-arming listener.`);
                    
                    destroyTabById(panel.dataset.panelId);
                    
                    addTabToPendingList({ ...tabInfoToRearm, column: colName });
                    
                    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'demotion' } }));
                    
                    continue; 
                }
            }
        }
    };
    demotionObserver = new MutationObserver(callback);
    demotionObserver.observe(target, { childList: true, subtree: true });
}