// tabs.js

import { el, isElement, getPanelBySourceId, getPanelById, getTabById, getRefs, createIconElement, hexToRgba } from './utils.js';
import { setPaneCollapsedView, removePaneIfEmpty, checkAndCollapsePaneIfAllTabsCollapsed } from './pane.js';
import { hideDropIndicator, hideSplitOverlay } from './drag-drop.js';
import { invalidatePaneTabSizeCache } from './resizer.js';
import { runTabAction } from './tab-actions.js';
import { settings } from './settings.js';
import { showContextMenu } from './context-menu.js';

/** @typedef {import('./types.js').PTMTAPI} PTMTAPI */
/** @typedef {import('./types.js').TabData} TabData */
/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */
/** @typedef {import('./types.js').ViewSettings} ViewSettings */

const makeId = (prefix = 'ptmt') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
const PANEL_SWITCH_ANIMATION_MS = 180;

function shouldAnimatePanels() {
  return document.body.classList.contains('ptmt-enable-animations')
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

export const registerPanelDom = (panelEl, title) => {
  const pid = panelEl.dataset.panelId || makeId('panel');
  panelEl.dataset.panelId = pid;
  if (title) panelEl.dataset.title = title;
  return pid;
};


const allTabs = () => Array.from(document.querySelectorAll('.ptmt-tab'));
const getPaneForTabElement = tabEl => tabEl ? tabEl.closest('.ptmt-pane') : null;
export const getPaneForPanel = panelEl => panelEl ? panelEl.closest('.ptmt-pane') : null;

export const getActivePane = () => {
  const activeTab = document.querySelector('.ptmt-tab.active');
  const refs = getRefs();
  return activeTab ? getPaneForTabElement(activeTab) : refs.centerBody.querySelector('.ptmt-pane');
};

function setPanelVisible(panel, visible) {
  if (!panel) return;

  if (panel._ptmtPanelAnimTimer) {
    clearTimeout(panel._ptmtPanelAnimTimer);
    panel._ptmtPanelAnimTimer = null;
  }

  panel.classList.remove('ptmt-panel-entering', 'ptmt-panel-exiting');

  if (!shouldAnimatePanels()) {
    panel.classList.toggle('hidden', !visible);
    return;
  }

  if (visible) {
    panel.classList.remove('hidden');
    panel.classList.add('ptmt-panel-entering');
    panel._ptmtPanelAnimTimer = setTimeout(() => {
      panel.classList.remove('ptmt-panel-entering');
      panel._ptmtPanelAnimTimer = null;
    }, PANEL_SWITCH_ANIMATION_MS);
    return;
  }

  if (panel.classList.contains('hidden')) return;

  panel.classList.add('ptmt-panel-exiting');
  panel._ptmtPanelAnimTimer = setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('ptmt-panel-exiting');
    panel._ptmtPanelAnimTimer = null;
  }, PANEL_SWITCH_ANIMATION_MS);
}

export function createPanelElement(title) {
  const panel = el('div', { className: 'ptmt-panel hidden' });
  panel.appendChild(el('div', { className: 'ptmt-panel-content' }));
  panel.dataset.ptmtType = 'panel';
  if (title) panel.dataset.title = title;
  return panel;
}

export function setTabCollapsed(pid, collapsed, skipEvent = false) {
  const tab = getTabById(pid);
  if (!tab) return;
  const isCurrentlyCollapsed = tab.classList.contains('collapsed');
  if (isCurrentlyCollapsed === collapsed) return;

  tab.classList.toggle('collapsed', collapsed);
  const panel = getPanelById(pid);
  if (panel) panel.classList.toggle('collapsed', collapsed);

  const sourceId = panel?.dataset.sourceId;
  runTabAction(sourceId, collapsed ? 'onCollapse' : 'onOpen', panel);

  // Trigger a save so the collapsed/active tab state is persisted immediately
  if (!skipEvent) {
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabCollapse' } }));
  }
}


export function createTabElement(title, pid, icon = null, options = {}) {
  const t = el('div', { className: 'ptmt-tab', draggable: true, tabindex: 0 });
  const bg = el('div', { className: 'ptmt-tab-bg' });
  t.appendChild(bg);

  if (options.color) {
    bg.style.backgroundColor = hexToRgba(options.color);
  }
  if (options.collapsed) {
    t.classList.add('collapsed');
  }
  const labelEl = el('span', { className: 'ptmt-tab-label' }, title || 'Tab');
  t.dataset.for = pid;

  if (icon) {
    const iconEl = createIconElement(icon);
    if (iconEl) t.appendChild(iconEl);
  }
  t.appendChild(labelEl);


  t.addEventListener('click', () => {
    const pane = getPaneForTabElement(t);
    if (!pane) return;

    const isActive = t.classList.contains('active');

    if (isActive) {
      const wasCollapsed = pane.classList.contains('view-collapsed');

      if (!wasCollapsed && settings.get('autoOpenFirstCenterTab')) {
        const isCenterColumn = !!pane.closest('#ptmt-centerBody');
        if (isCenterColumn) {
          const otherOpenTabsCount = Array.from(document.querySelectorAll('#ptmt-centerBody .ptmt-tab:not(.ptmt-view-settings):not([data-for=""])'))
            .filter(tab => tab !== t && !tab.classList.contains('collapsed'))
            .length;

          if (otherOpenTabsCount === 0) {
            const firstTab = document.querySelector('#ptmt-centerBody .ptmt-tab:not(.ptmt-view-settings):not([data-for=""])');
            if (firstTab && firstTab !== t) {
              openTab(firstTab.dataset.for);
              return;
            } else if (firstTab === t) {
              return; // It's the only tab, refuse to collapse
            }
          }
        }
      }

      setPaneCollapsedView(pane, !wasCollapsed);

      if (wasCollapsed) { // pane is opening
        setTabCollapsed(pid, false);
      } else { // pane is collapsing
        pane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').forEach(tab => {
          setTabCollapsed(tab.dataset.for, true);
          tab.classList.remove('active');
        });
      }
      // Dispatch a save event so the pane collapse/expand state is persisted
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'paneToggle', pane } }));
      return;
    }

    if (pane.classList.contains('view-collapsed')) {
      setPaneCollapsedView(pane, false);
    }

    setActivePanelInPane(pane, pid);
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabSwitch', pane } }));
  });

  t.addEventListener('dragstart', ev => {
    t.classList.add('dragging');
    try {
      ev.dataTransfer.setData('text/plain', pid);
      ev.dataTransfer.setData('application/x-ptmt_tab', pid);
    } catch (e) {
      console.warn('[PTMT] Failed to set drag data:', e);
    }
    const g = t.cloneNode(true);
    g.classList.add('ptmt-drag-image-hide'); // Add the new class
    document.body.appendChild(g);
    try {
      ev.dataTransfer.setDragImage(g, 10, 10);
    } catch (e) {
      console.warn('[PTMT] Failed to set drag image:', e);
    }
    setTimeout(() => g.remove(), 60);
  });

  t.addEventListener('dragend', () => {
    t.classList.remove('dragging');
    hideDropIndicator();
    hideSplitOverlay();
  });

  t.addEventListener('contextmenu', (e) => {
    const panel = getPanelById(pid);
    const sourceId = panel?.dataset.sourceId;
    if (!sourceId) return;

    showContextMenu(e, [
      {
        label: 'Edit Tab',
        icon: 'fa-solid fa-gear',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('ptmt:openTabSettings', {
            detail: { sourceId, tabElement: t, tabRow: null }
          }));
        }
      }
    ]);
  });

  return t;
}

export function setActivePanelInPane(pane, pid = null, preserveCollapsedState = false) {
  if (!pane) return false;
  const tabStrip = pane._tabStrip;

  let targetPid = pid;
  if (!targetPid) {
    const firstAvailableTab = tabStrip.querySelector('.ptmt-tab:not(.collapsed):not([data-for=""])') || tabStrip.querySelector('.ptmt-tab:not([data-for=""])');
    targetPid = firstAvailableTab?.dataset.for || pane._panelContainer?.querySelector('.ptmt-panel')?.dataset.panelId || null;
  }

  const isTabSwitch = pid !== null;

  const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab'));
  for (const t of tabs) {
    const pId = t.dataset.for;
    if (!pId) continue;
    const isTarget = pId === targetPid;

    // 1. Tab Classes - Only update if changed to avoid reflows
    if (t.classList.contains('active') !== isTarget) {
      t.classList.toggle('active', isTarget);
    }

    if (!preserveCollapsedState) {
      if (t.classList.contains('collapsed') !== !isTarget) {
        t.classList.toggle('collapsed', !isTarget);
      }
    }

    // 2. Panel Updates (with cached ref)
    let p = t._panelRef;
    if (!p) {
      p = getPanelById(pId);
      if (p) t._panelRef = p;
    }

    if (p) {
      if (p.classList.contains('active') !== isTarget) p.classList.toggle('active', isTarget);
      if (p.classList.contains('hidden') !== !isTarget || p.classList.contains('ptmt-panel-exiting')) {
        setPanelVisible(p, isTarget);
      }

      if (!preserveCollapsedState) {
        const wasCollapsed = p.classList.contains('collapsed');
        const nowCollapsed = !isTarget;
        if (wasCollapsed !== nowCollapsed) {
          p.classList.toggle('collapsed', nowCollapsed);
          runTabAction(p.dataset.sourceId, nowCollapsed ? 'onCollapse' : 'onOpen', p);
        }
      }

      // 3. Tab Actions - Select
      if (isTarget && isTabSwitch) {
        runTabAction(p.dataset.sourceId, 'onSelect', p);

        // Scroll into view if needed
        t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }

  return targetPid !== null;
}

export function isTabHidden(sourceId) {
  if (!sourceId) return false;
  const activeLayout = settings.getActiveLayout();
  const hiddenTabs = activeLayout?.hiddenTabs || [];
  return hiddenTabs.some(h => (typeof h === 'string' ? h : h.sourceId) === sourceId);
}

export function openTab(pid) {
  const target = getPanelById(pid);
  if (!target) return false;

  const tab = getTabById(pid);
  const pane = getPaneForPanel(target) || getPaneForTabElement(tab) || getActivePane();
  if (!pane) return false;

  const res = setActivePanelInPane(pane, pid);

  // Ensure the pane itself is visible if we're opening a tab in it
  if (pane.classList.contains('view-collapsed')) {
    setPaneCollapsedView(pane, false);
  }

  window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabSwitch', pane } }));
  return res;
}

export function closeTabById(pid) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);

  const pane = getPaneForTabElement(tab) || getPaneForPanel(panel) || getActivePane();
  if (!pane) return true;

  if (settings.get('autoOpenFirstCenterTab')) {
    const isCenterColumn = !!pane.closest('#ptmt-centerBody');
    if (isCenterColumn) {
      const otherOpenTabsCount = Array.from(document.querySelectorAll('#ptmt-centerBody .ptmt-tab:not(.ptmt-view-settings):not([data-for=""])'))
        .filter(t => t.dataset.for !== pid && !t.classList.contains('collapsed'))
        .length;

      if (otherOpenTabsCount === 0) {
        const firstTab = document.querySelector('#ptmt-centerBody .ptmt-tab:not(.ptmt-view-settings):not([data-for=""])');
        if (firstTab && firstTab.dataset.for !== pid) {
          if (tab) setTabCollapsed(pid, true);
          setPanelVisible(panel, false);
          openTab(firstTab.dataset.for);
          return true;
        } else if (firstTab && firstTab.dataset.for === pid) {
          return true; // Refuse to close the only tab
        }
      }
    }
  }

  if (tab) setTabCollapsed(pid, true);
  setPanelVisible(panel, false);
  if (tab?.classList.contains('active')) setActivePanelInPane(pane);

  removePaneIfEmpty(pane);
  checkAndCollapsePaneIfAllTabsCollapsed(pane);
  return true;
}

/**
 * Physically removes a tab and its panel from the DOM.
 * @param {string} pid The panelId of the tab to destroy.
 */
export function destroyTabById(pid) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);
  const pane = getPaneForTabElement(tab) || getPaneForPanel(panel);
  const wasActive = tab?.classList.contains('active');

  if (tab) tab.remove();
  if (panel) panel.remove();

  if (pane) {
    // If the destroyed tab was active, find a new one to activate.
    if (wasActive) {
      setActivePanelInPane(pane);
    }
    removePaneIfEmpty(pane);
    checkAndCollapsePaneIfAllTabsCollapsed(pane);
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabDestroyed', pane } }));
  }
  return true;
}

export function createTabFromContent(content, options = {}, target = null) {
  const { title = null, icon = null, makeActive = true, setAsDefault = false, sourceId = null, collapsed = false } = options;

  let node;
  if (typeof content === 'string') {
    node = document.getElementById(content);
  } else if (isElement(content)) {
    node = content;
  }

  let stagingArea = document.getElementById('ptmt-staging-area');
  if (!stagingArea) {
    console.warn('[PTMT] Staging area not found, creating a new one.');
    stagingArea = el('div', { id: 'ptmt-staging-area', style: { display: 'none' } });
    document.body.appendChild(stagingArea);
  }

  if (node && node.parentElement !== stagingArea) {
    stagingArea.appendChild(node);
  }

  // Allow proceeding even without a node so we can create placeholders.
  // The element might be injected later by ST or extensions.

  const effectiveSourceId = sourceId || (node ? node.id : null);
  if (!effectiveSourceId) return null;

  let targetPane;
  const refs = getRefs();
  if (isElement(target) && target.classList.contains('ptmt-pane')) {
    targetPane = target;
  } else if (typeof target === 'string' && refs[`${target}Body`]) {
    targetPane = refs[`${target}Body`].querySelector('.ptmt-pane');
  } else {
    targetPane = getActivePane() || refs.centerBody.querySelector('.ptmt-pane');
  }

  if (!targetPane) {
    console.warn(`[PTMT] Could not find a target pane for content.`);
    return null;
  }

  const mapping = settings.getMapping(effectiveSourceId);
  const panelTitle = title || mapping.title || node?.getAttribute('data-panel-title') || node?.id || 'Panel';
  let panel = effectiveSourceId ? getPanelBySourceId(effectiveSourceId) : null;
  let pid;

  if (panel) {
    pid = panel.dataset.panelId;
  } else {
    panel = createPanelElement(panelTitle);
    panel.dataset.sourceId = effectiveSourceId;
    pid = registerPanelDom(panel, panelTitle);
    if (node) panel.querySelector('.ptmt-panel-content').appendChild(node);
  }

  if (targetPane) {
    targetPane._panelContainer.appendChild(panel);
    // Ensure tab exists in this pane
    const existingTab = targetPane._tabStrip.querySelector(`.ptmt-tab[data-for="${CSS.escape(pid)}"]`);
    const tabIcon = icon || mapping.icon || null;
    if (!existingTab) {
      const tabColor = options.color || mapping.color || null;
      const tab = createTabElement(panelTitle, pid, tabIcon, { collapsed: options.collapsed, color: tabColor });
      targetPane._tabStrip.appendChild(tab);
    } else {
      // Apply color if it changed
      const tabBg = existingTab.querySelector('.ptmt-tab-bg');
      if (tabBg) {
        const color = options.color || mapping.color || '';
        tabBg.style.backgroundColor = color ? hexToRgba(color) : '';
      }
      // Tab exists but might not have icon - update it
      let iconEl = existingTab.querySelector('.ptmt-tab-icon');
      if (tabIcon) {
        if (!iconEl) {
          iconEl = createIconElement(tabIcon);
          if (iconEl) existingTab.prepend(iconEl);
        } else {
          // Icon element exists but might be empty
          const hasFaIcon = Array.from(iconEl.classList).some(c => c.startsWith('fa-'));
          const hasText = iconEl.textContent.trim().length > 0;
          if (!hasFaIcon && !hasText) {
            // Replace with proper icon
            iconEl.remove();
            iconEl = createIconElement(tabIcon);
            if (iconEl) existingTab.prepend(iconEl);
          }
        }
      }
    }

    // If the user explicitly requested uncollapsed state, apply it now
    if (options.collapsed === false) {
      setTabCollapsed(pid, false);
    }

    invalidatePaneTabSizeCache(targetPane);
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabAdded', pane: targetPane } }));
  }

  runTabAction(effectiveSourceId, 'onInit', panel);

  if (setAsDefault) setDefaultPanelById(pid);
  if (makeActive) {
    openTab(pid);
  }

  return panel;
}

export function moveTabIntoPaneAtIndex(panel, pane, index) {
  const tab = getTabById(panel.dataset.panelId);
  if (!tab) return;

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
  const panelInsertBefore = index >= pane._panelContainer.children.length ? null : pane._panelContainer.children[Math.min(index, pane._panelContainer.children.length - 1)];
  pane._panelContainer.insertBefore(panel, panelInsertBefore);


  // Reset collapsed state when moving to a new pane
  // The tab/panel should be expanded in its new context
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


  window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'tabMoved', pane } }));
}

export function listTabs() {
  return allTabs().map(t => {
    const pid = t.dataset.for;
    const panel = getPanelById(pid);
    return { id: pid, title: (t.querySelector('.ptmt-tab-label')?.textContent || '').trim(), collapsed: t.classList.contains('collapsed'), panel };
  });
}

export function moveNodeIntoTab(nodeId, targetPanelId) {
  const node = document.getElementById(nodeId);
  const panel = getPanelById(targetPanelId);
  if (!node || !panel) return false;

  const content = panel.querySelector('.ptmt-panel-content');
  if (!content) return false;

  content.appendChild(node);
  return true;
}

export function setDefaultPanelById(pid) {
  try {
    const prev = document.querySelector('[data-default-panel="true"]');
    if (prev) prev.removeAttribute('data-default-panel');
    const p = getPanelById(pid);
    if (p) p.dataset.defaultPanel = 'true';
  } catch (e) {
    console.warn('[PTMT] Failed to set default panel:', e);
  }
}
