// layout-transactions.js
// Deep module for user-visible layout mutations.

import { setActivePanelInPane } from '../tabs/tabs.js';
import { checkAndCollapsePaneIfAllTabsCollapsed, removePaneIfEmpty } from './pane.js';
import { invalidatePaneTabSizeCache } from './resizer.js';
import { getTabById } from '../core/utils.js';

function getPaneForTabElement(tabEl) {
    return tabEl ? tabEl.closest('.ptmt-pane') : null;
}

function emitLayoutChanged(reason, pane, detail = {}) {
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason, pane, ...detail } }));
}

/** Move one tab/panel as a single layout transaction and emit one layout event. */
export function moveTabTransaction({ panel, pane, index = 0, reason = 'tabMoved' }) {
    if (!panel || !pane?._tabStrip || !pane?._panelContainer) return false;

    const tab = getTabById(panel.dataset.panelId);
    if (!tab) return false;

    const prevPane = getPaneForTabElement(tab);

    if (prevPane && prevPane._tabStrip && prevPane._tabStrip !== pane._tabStrip) {
        prevPane._tabStrip.removeChild(tab);
        invalidatePaneTabSizeCache(prevPane);
    }

    const tabs = Array.from(pane._tabStrip.querySelectorAll('.ptmt-tab'));
    const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
    const insertBefore = index >= tabs.length ? settingsBtn : tabs[index];
    pane._tabStrip.insertBefore(tab, insertBefore || null);
    invalidatePaneTabSizeCache(pane);

    if (panel.parentElement && panel.parentElement !== pane._panelContainer) {
        panel.parentElement.removeChild(panel);
    }

    const panelIndex = Math.min(index, pane._panelContainer.children.length - 1);
    const panelInsertBefore = index >= pane._panelContainer.children.length ? null : pane._panelContainer.children[panelIndex];
    pane._panelContainer.insertBefore(panel, panelInsertBefore);

    tab.classList.remove('collapsed');
    panel.classList.remove('collapsed');

    if (prevPane) {
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
