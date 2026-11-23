// pending-tabs.ts
import { createTabFromContent, destroyTabById, openTab } from './tabs.js';
import { settings } from '../core/settings.js';
import { getPanelBySourceId, getRefs, trackObserver } from '../core/utils.js';
import type { ColumnName, GhostTab, PTMTAPI } from '../core/types.js';

export interface PendingTabInfo extends Partial<GhostTab> {
    title?: string;
    icon?: string;
}

let hydrationObserver: MutationObserver | null = null;
let demotionObserver: MutationObserver | null = null;
const pendingTabsMap = new Map<string, PendingTabInfo>();

export const getTabIdentifier = (tabInfo: PendingTabInfo): string | null => {
    if (tabInfo.searchId) return `id:${tabInfo.searchId}`;
    if (tabInfo.searchClass) return `class:${tabInfo.searchClass}`;
    return null;
};

export function updatePendingTabColumn(tabInfo: PendingTabInfo, newColumn: string): void {
    const identifier = getTabIdentifier(tabInfo);
    if (!identifier) return;

    const existingTab = pendingTabsMap.get(identifier);
    if (existingTab) {
        existingTab.column = newColumn;
        existingTab.paneId = tabInfo.paneId;
        console.log(`[PTMT-Pending] Updated live destination for ${identifier} to column '${newColumn}' and pane '${tabInfo.paneId}'.`);
    } else {
        const newPendingTab: PendingTabInfo = { ...tabInfo, column: newColumn };
        pendingTabsMap.set(identifier, newPendingTab);
        console.log(`[PTMT-Pending] Armed listener for ${identifier} in column '${newColumn}' and pane '${tabInfo.paneId}'.`);
    }
}

function addTabToPendingList(tabInfo: PendingTabInfo): void {
    const identifier = getTabIdentifier(tabInfo);
    if (identifier && !pendingTabsMap.has(identifier)) {
        console.log(`[PTMT-Pending] Re-arming listener for ${identifier}`);
        pendingTabsMap.set(identifier, tabInfo);

        // Deep-clone to avoid mutating settings in memory before save
        const currentLayout = structuredClone(settings.getActiveLayout());
        const column = (tabInfo.column || 'center') as ColumnName;

        for (const col of Object.values(currentLayout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
            }
        }

        if (!currentLayout.columns[column]) currentLayout.columns[column] = { content: null, ghostTabs: [] };
        if (!currentLayout.columns[column].ghostTabs) currentLayout.columns[column].ghostTabs = [];

        const newTabInfo: GhostTab = {
            searchId: tabInfo.searchId || '',
            searchClass: tabInfo.searchClass || '',
            paneId: tabInfo.paneId || undefined,
        };
        if (!currentLayout.columns[column].ghostTabs.some(t => getTabIdentifier(t) === identifier)) {
            currentLayout.columns[column].ghostTabs.push(newTabInfo);
        }

        settings.update({ [settings.getActiveLayoutKey()]: currentLayout });
        checkForPendingTabs([document.body]);
    }
}

function findTargetPane(columnName: string | undefined, paneId: string | null | undefined): HTMLElement | null {
    if (paneId) {
        const pane = document.querySelector<HTMLElement>(`.ptmt-pane[data-pane-id="${paneId}"]`);
        if (pane) return pane;
    }

    const refs = getRefs();
    const colKey = `${(columnName || 'center') as ColumnName}Body` as const;
    const columnEl = refs[colKey];
    if (!columnEl) return null;

    let searchEl: Element | null = columnEl;
    while (searchEl) {
        const pane = searchEl.querySelector<HTMLElement>('.ptmt-pane');
        if (pane) return pane;
        const split: Element | null = searchEl.querySelector('.ptmt-split');
        if (!split) break;
        searchEl = split.children[0] || null;
    }
    return null;
}

function hydrateTab(tabInfo: PendingTabInfo, foundElement: Element): void {
    const identifier = getTabIdentifier(tabInfo);
    if (!identifier) return;

    // SAFETY: If the element we found is ALREADY inside a PTMT panel, it's already "tamed".
    // We only care about elements that are "wild" (in the main DOM or re-created by ST).
    if (foundElement.closest('.ptmt-panel-content')) {
        return;
    }

    const existingPanel = getPanelBySourceId(identifier);
    if (existingPanel) {
        const contentNode = existingPanel.querySelector('.ptmt-panel-content');
        if (contentNode && contentNode.childElementCount === 0) {
            console.log(`[PTMT-Pending] Found new content for ${identifier}. Injecting into existing empty tab.`);
            contentNode.appendChild(foundElement);

            // Optionally trigger the init logic if needed
            // But since it's already an existing panel, just opening it is sufficient.
            if (existingPanel.dataset.panelId) openTab(existingPanel.dataset.panelId);
            return;
        } else {
            console.log(`[PTMT-Pending] Found new content for ${identifier}. Replacing existing populated tab.`);
            if (existingPanel.dataset.panelId) destroyTabById(existingPanel.dataset.panelId);
        }
    }

    console.log(`[PTMT-Pending] Hydrating tab: ${identifier}`);
    const targetPane = findTargetPane(tabInfo.column, tabInfo.paneId);
    if (!targetPane) {
        console.warn(`[PTMT-Pending] Could not find a target pane (ID: ${tabInfo.paneId || 'any'}) in column '${tabInfo.column}' for tab '${identifier}'.`);
        return;
    }

    const sourceIdForMapping = tabInfo.searchId || tabInfo.searchClass;
    const mappings = settings.get('panelMappings') || [];
    const mapping = mappings.find(m => m.id === sourceIdForMapping) || { title: undefined, icon: undefined, color: undefined };

    createTabFromContent(foundElement as HTMLElement, {
        title: tabInfo.title || mapping.title,
        icon: tabInfo.icon || mapping.icon || 'fa-layer-group',
        makeActive: true, // Always auto-open per user request
        collapsed: false, // Ensure it's not collapsed
        sourceId: identifier,
        color: mapping.color,
    }, targetPane);

    // CRITICAL: Only delete ID-based tabs (one-time, unique elements).
    // Class-based tabs can recur (e.g., ST creates new galleryImageDraggable on each zoom),
    // so keep them in the map to catch future elements. The reuse logic above handles
    // replacing content in the existing tab.
    if (identifier.startsWith('id:')) {
        pendingTabsMap.delete(identifier);
    }
}

function checkForPendingTabs(nodes: Element[]): void {
    if (pendingTabsMap.size === 0) return;

    const tabsToHydrate = new Map<string, { tabInfo: PendingTabInfo; foundElement: Element }>();

    for (const node of nodes) {
        if (node.nodeType !== 1) continue;

        for (const [identifier, tabInfo] of pendingTabsMap.entries()) {
            if (tabsToHydrate.has(identifier)) continue;

            let foundElement: Element | null = null;
            if (tabInfo.searchId) {
                if (node.id === tabInfo.searchId) foundElement = node;
                else if (node.querySelector) foundElement = node.querySelector(`#${CSS.escape(tabInfo.searchId)}`);
            } else if (tabInfo.searchClass) {
                const potentialElements: Element[] = [];
                if (node.classList?.contains(tabInfo.searchClass)) {
                    potentialElements.push(node);
                }
                if (node.querySelectorAll) {
                    potentialElements.push(...node.querySelectorAll(`.${CSS.escape(tabInfo.searchClass)}`));
                }
                for (const elem of potentialElements) {
                    if (!elem.closest('[name="templatesAndPopupsWrapper"]')) {
                        foundElement = elem;
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

export function initPendingTabsManager(allGhostTabs: PendingTabInfo[]): void {
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

    const nodesToCheck = new Set<Element>();
    let hydrationTimeout: ReturnType<typeof setTimeout> | null = null;

    hydrationObserver = trackObserver(new MutationObserver((mutationsList) => {
        let structuralChange = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Only care about Elements
                        const elem = node as Element;
                        // OPTIMIZATION: Filter out noisy updates immediately
                        if (elem.id === 'chat' || elem.classList.contains('mes')) continue;
                        nodesToCheck.add(elem);
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
    }));

    const observeTarget = document.getElementById('movingDivs') || document.body;
    hydrationObserver.observe(observeTarget, { childList: true, subtree: true });
    hydrationObserver.observe(document.body, { childList: true });

    checkForPendingTabs([document.body]);
}

export function initDemotionObserver(_api?: PTMTAPI): void {
    if (demotionObserver) demotionObserver.disconnect();
    const target = document.getElementById('ptmt-main');
    if (!target) return;

    const callback = (mutationsList: MutationRecord[]): void => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                const panelContent = mutation.target as Element;
                if (panelContent instanceof Element && panelContent.matches('.ptmt-panel-content') && panelContent.childElementCount === 0) {
                    const panel = panelContent.closest<HTMLElement>('.ptmt-panel');
                    if (!panel || panel.dataset.demoting) continue;

                    const sourceId = panel.dataset.sourceId;
                    if (!sourceId || !sourceId.includes(':')) continue;

                    panel.dataset.demoting = 'true';

                    const [type, value] = sourceId.split(':', 2);
                    const tabInfoToRearm: PendingTabInfo = {};
                    if (type === 'id') tabInfoToRearm.searchId = value;
                    else if (type === 'class') tabInfoToRearm.searchClass = value;
                    else { delete panel.dataset.demoting; continue; }

                    const columnEl = panel.closest<HTMLElement>('.ptmt-body-column');
                    const paneEl = panel.closest<HTMLElement>('.ptmt-pane');
                    const colId = columnEl ? columnEl.id : 'ptmt-centerBody';
                    const colName = colId.replace('ptmt-', '').replace('Body', '');
                    const paneId = paneEl ? paneEl.dataset.paneId : undefined;

                    console.log(`[PTMT-Demotion] Tab ${sourceId} content removed from pane ${paneId}. Destroying tab and re-arming listener.`);

                    if (panel.dataset.panelId) destroyTabById(panel.dataset.panelId);

                    addTabToPendingList({ ...tabInfoToRearm, column: colName, paneId });

                    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'demotion' } }));

                    continue;
                }
            }
        }
    };
    demotionObserver = trackObserver(new MutationObserver(callback));
    demotionObserver.observe(target, { childList: true, subtree: true });
}
