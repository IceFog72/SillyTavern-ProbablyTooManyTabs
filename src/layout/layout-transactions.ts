// layout-transactions.ts
// Deep module for user-visible layout mutations.

import { setActivePanelInPane } from '../tabs/tabs.js';
import { checkAndCollapsePaneIfAllTabsCollapsed, removePaneIfEmpty } from './pane.js';
import { invalidatePaneTabSizeCache } from './resizer.js';
import { getTabById } from '../core/utils.js';

function getPaneForTabElement(tabEl: Element | null): HTMLElement | null {
    return tabEl ? tabEl.closest<HTMLElement>('.ptmt-pane') : null;
}

function emitLayoutChanged(reason: string, pane: HTMLElement, detail: Record<string, unknown> = {}): void {
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason, pane, ...detail } }));
}

export interface MoveTabTransactionArgs {
    panel: HTMLElement | null | undefined;
    pane: HTMLElement | null | undefined;
    index?: number;
    reason?: string;
}

/** Move one tab/panel as a single layout transaction and emit one layout event. */
export function moveTabTransaction({ panel, pane, index = 0, reason = 'tabMoved' }: MoveTabTransactionArgs): boolean {
    if (!panel || !pane?._tabStrip || !pane?._panelContainer) return false;

    const panelId = panel.dataset.panelId;
    const tab = panelId ? getTabById(panelId) : null;
    if (!tab) return false;

    const prevPane = getPaneForTabElement(tab);

    if (prevPane && prevPane._tabStrip && prevPane._tabStrip !== pane._tabStrip) {
        prevPane._tabStrip.removeChild(tab);
        invalidatePaneTabSizeCache(prevPane);
    }

    const tabs = Array.from(pane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
    const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
    const clampedIndex = Math.max(0, Math.min(Number.isFinite(index) ? Math.floor(index) : tabs.length, tabs.length));
    const insertBefore = clampedIndex >= tabs.length ? settingsBtn : tabs[clampedIndex];
    if (insertBefore !== tab) {
        pane._tabStrip.insertBefore(tab, insertBefore || null);
    }
    invalidatePaneTabSizeCache(pane);

    if (panel.parentElement && panel.parentElement !== pane._panelContainer) {
        panel.parentElement.removeChild(panel);
    }

    const panelCount = pane._panelContainer.children.length;
    const panelInsertBefore = clampedIndex >= panelCount ? null : pane._panelContainer.children[clampedIndex];
    if (panelInsertBefore !== panel) {
        pane._panelContainer.insertBefore(panel, panelInsertBefore);
    }

    tab.classList.remove('collapsed');
    panel.classList.remove('collapsed');

    if (prevPane && prevPane !== pane) {
        const isCurrentlyCollapsed = prevPane.classList.contains('view-collapsed');
        if (!isCurrentlyCollapsed) {
            setActivePanelInPane(prevPane);
        }
        checkAndCollapsePaneIfAllTabsCollapsed(prevPane);
        removePaneIfEmpty(prevPane);
    }

    emitLayoutChanged(reason, pane);
    return true;
}
