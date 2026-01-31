// tabs.js

import { el, isElement, getPanelBySourceId, getPanelById, getTabById, getRefs } from './utils.js';
import { setPaneCollapsedView, removePaneIfEmpty, checkAndCollapsePaneIfAllTabsCollapsed, splitPaneWithPane } from './pane.js';
import { hideDropIndicator, hideSplitOverlay } from './drag-drop.js';
import { invalidatePaneTabSizeCache } from './resizer.js';
import { runTabAction } from './tab-actions.js';

const makeId = (prefix = 'ptmt') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

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

export function createPanelElement(title) {
  const panel = el('div', { className: 'ptmt-panel hidden' });
  panel.appendChild(el('div', { className: 'ptmt-panel-content' }));
  panel.dataset.ptmtType = 'panel';
  if (title) panel.dataset.title = title;
  return panel;
}

export function setTabCollapsed(pid, collapsed) {
  const tab = getTabById(pid);
  if (!tab) return;
  const isCurrentlyCollapsed = tab.classList.contains('collapsed');
  if (isCurrentlyCollapsed === collapsed) return;

  tab.classList.toggle('collapsed', collapsed);
  const panel = getPanelById(pid);
  if (panel) panel.classList.toggle('collapsed', collapsed);

  const sourceId = panel?.dataset.sourceId;
  runTabAction(sourceId, collapsed ? 'onCollapse' : 'onOpen', panel);
}


export function createTabElement(title, pid, icon = null, options = {}) {
  const t = el('div', { className: 'ptmt-tab', draggable: true, tabindex: 0 });
  if (options.collapsed) {
    t.classList.add('collapsed');
  }
  const labelEl = el('span', { className: 'ptmt-tab-label' }, title || 'Tab');
  t.dataset.for = pid;

  if (icon) {
    const iconEl = el('span', { className: 'ptmt-tab-icon' }, icon);
    t.appendChild(iconEl);
  }
  t.appendChild(labelEl);


  t.addEventListener('click', () => {
    const pane = getPaneForTabElement(t);
    if (!pane) return;

    const isActive = t.classList.contains('active');

    if (isActive) {
      const wasCollapsed = pane.classList.contains('view-collapsed');
      setPaneCollapsedView(pane, !wasCollapsed);

      if (wasCollapsed) { // pane is opening
        setTabCollapsed(pid, false);
      } else { // pane is collapsing
        pane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').forEach(tab => {
          setTabCollapsed(tab.dataset.for, true);
          tab.classList.remove('active');
        });
      }
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
      return;
    }

    if (pane.classList.contains('view-collapsed')) {
      setPaneCollapsedView(pane, false);
    }

    setActivePanelInPane(pane, pid);

    pane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').forEach(tab => {
      setTabCollapsed(tab.dataset.for, tab.dataset.for !== pid);
    });

    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
  });

  t.addEventListener('dragstart', ev => {
    t.classList.add('dragging');
    try {
      ev.dataTransfer.setData('text/plain', pid);
      ev.dataTransfer.setData('application/x-ptmt-tab', pid);
    } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
    const g = t.cloneNode(true);
    Object.assign(g.style, { position: 'absolute', left: '-9999px', top: '-9999px' });
    document.body.appendChild(g);
    try {
      ev.dataTransfer.setDragImage(g, 10, 10);
    } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
    setTimeout(() => g.remove(), 60);
  });

  t.addEventListener('dragend', () => {
    t.classList.remove('dragging');
    hideDropIndicator();
    hideSplitOverlay();
  });

  return t;
}

export function setActivePanelInPane(pane, pid = null) {
  if (!pane) return false;
  const panelContainer = pane._panelContainer;
  const tabStrip = pane._tabStrip;

  const previouslyActiveTab = tabStrip.querySelector('.ptmt-tab.active');

  let targetPid = pid;
  if (!targetPid) {
    const firstAvailableTab = tabStrip.querySelector('.ptmt-tab:not(.collapsed):not([data-for=""])') || tabStrip.querySelector('.ptmt-tab:not([data-for=""])');
    targetPid = firstAvailableTab?.dataset.for || panelContainer.querySelector('.ptmt-panel')?.dataset.panelId || null;
  }

  // We intentionally removed the early return if already active to handle de-conflicting
  // when an already-active tab is moved into a pane that has another active tab.

  tabStrip.querySelectorAll('.ptmt-tab').forEach(t => {
    const isTarget = t.dataset.for === targetPid;
    t.classList.toggle('active', isTarget);
    if (isTarget) {
      t.classList.remove('collapsed');
    } else {
      t.classList.add('collapsed');
    }

    const p = getPanelById(t.dataset.for);
    if (p) {
      p.classList.toggle('active', isTarget);
      if (isTarget) {
        p.classList.remove('collapsed');
        p.classList.remove('hidden');
      } else {
        p.classList.add('collapsed');
        p.classList.add('hidden');
      }
    }
  });

  if (!targetPid) return false;

  const targetPanel = getPanelById(targetPid);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');
    targetPanel.classList.remove('collapsed');
  }

  const sourceId = targetPanel?.dataset.sourceId;
  runTabAction(sourceId, 'onSelect', targetPanel);

  return true;
}

export function openTab(pid) {
  const target = getPanelById(pid);
  if (!target) return false;

  const tab = getTabById(pid);
  const pane = getPaneForPanel(target) || getPaneForTabElement(tab) || getActivePane();
  if (!pane) return false;

  return setActivePanelInPane(pane, pid);
}

export function closeTabById(pid) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);

  const pane = getPaneForTabElement(tab) || getPaneForPanel(panel) || getActivePane();
  if (!pane) return true;

  if (tab) setTabCollapsed(pid, true);
  if (panel) panel.classList.add('hidden');
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

  if (tab) tab.remove();
  if (panel) panel.remove();

  if (pane) {
    invalidatePaneTabSizeCache(pane);
    // If the destroyed tab was active, find a new one to activate.
    if (tab && tab.classList.contains('active')) {
      setActivePanelInPane(pane);
    }
    removePaneIfEmpty(pane);
  }
  return true;
}

export function createTabFromContent(content, options = {}, target = null) {
  const { title = null, icon = null, makeActive = true, setAsDefault = false, sourceId = null } = options;

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

  if (!node) {
    return null;
  }

  const effectiveSourceId = sourceId || node.id;

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
    console.warn(`[SFT] Could not find a target pane for content.`);
    return null;
  }

  if (effectiveSourceId && getPanelBySourceId(effectiveSourceId)) {
    return getPanelBySourceId(effectiveSourceId);
  }

  const panelTitle = title || node.getAttribute('data-panel-title') || node.id || 'Panel';
  const panel = createPanelElement(panelTitle);
  panel.dataset.sourceId = effectiveSourceId;
  const pid = registerPanelDom(panel, panelTitle);
  panel.querySelector('.ptmt-panel-content').appendChild(node);
  targetPane._panelContainer.appendChild(panel);

  const tab = createTabElement(panelTitle, pid, icon, { collapsed: options.collapsed });
  targetPane._tabStrip.appendChild(tab);

  invalidatePaneTabSizeCache(targetPane);

  runTabAction(effectiveSourceId, 'onInit', panel);

  if (setAsDefault) setDefaultPanelById(pid);
  if (makeActive) openTab(pid);

  return panel;
}

export function createTabForBodyContent({ title = 'Main', icon = '📝', setAsDefault = true, collapsed = false } = {}, targetPane = null) {
  const PROTECTED_IDS = new Set(['ptmt-main', 'ptmt-staging-area', 'ptmt-settings-wrapper']);

  const toMove = Array.from(document.body.childNodes).filter(n => {
    if (n.nodeType !== 1) return true;
    return !PROTECTED_IDS.has(n.id);
  });

  if (toMove.length === 0) return null;

  const pane = targetPane || getActivePane();
  if (!pane) {
    console.error('[SFT] createTabForBodyContent failed: Could not find a target pane.');
    return null;
  }

  const panel = createPanelElement(title);
  const sourceId = 'ptmt-main-content';
  panel.dataset.sourceId = sourceId;
  const pid = registerPanelDom(panel, title);
  const content = panel.querySelector('.ptmt-panel-content');

  for (const node of toMove) {
    if (node.nodeType === 1 && PROTECTED_IDS.has(node.id)) continue;
    if (node.tagName === 'SCRIPT' && node.dataset?.ptmtIgnore !== 'false') {
      try { document.head.appendChild(node); } catch (e) {
        console.warn('[PTMT] Failed :', e);
      }
    } else {
      try { content.appendChild(node); } catch (e) {
        console.warn('[PTMT] Failed :', e);
      }
    }
  }

  pane._panelContainer.appendChild(panel);
  const tab = createTabElement(title, pid, icon, { collapsed });

  const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
  if (settingsBtn) pane._tabStrip.insertBefore(tab, settingsBtn); else pane._tabStrip.appendChild(tab);

  invalidatePaneTabSizeCache(pane);

  runTabAction(sourceId, 'onInit', panel);

  if (setAsDefault) setDefaultPanelById(pid);
  openTab(pid);
  return panel;
}

export function moveTabToPane(pid, pane) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);
  if (!tab || !pane) return;
  const wasActive = tab.classList.contains('active');

  const prevPane = getPaneForTabElement(tab);
  if (prevPane && prevPane._tabStrip && prevPane._tabStrip !== pane._tabStrip) {
    prevPane._tabStrip.removeChild(tab);
    invalidatePaneTabSizeCache(prevPane);
  }

  if (pane._tabStrip && !pane._tabStrip.contains(tab)) {
    const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
    pane._tabStrip[settingsBtn ? 'insertBefore' : 'appendChild'](tab, settingsBtn);
    invalidatePaneTabSizeCache(pane);
  }

  if (panel) {
    if (panel.parentElement && panel.parentElement !== pane._panelContainer) panel.parentElement.removeChild(panel);
    if (!pane._panelContainer.contains(panel)) pane._panelContainer.appendChild(panel);
  }

  if (prevPane) {
    const isCurrentlyCollapsed = prevPane.classList.contains('view-collapsed');
    // Only maintain active tab if pane is OPEN and we didn't just remove the active one.
    if (!isCurrentlyCollapsed && !wasActive) {
      setActivePanelInPane(prevPane);
    }
    checkAndCollapsePaneIfAllTabsCollapsed(prevPane);
    removePaneIfEmpty(prevPane);
  }
}

export function movePanelToPane(panel, pane) {
  if (!panel || !pane) return;
  const pid = panel.dataset.panelId;
  const tab = getTabById(pid);
  const wasActive = tab ? tab.classList.contains('active') : false;

  if (!pid) return;
  const prevPane = getPaneForPanel(panel);
  if (prevPane && prevPane._panelContainer && prevPane._panelContainer !== pane._panelContainer) {
    prevPane._panelContainer.removeChild(panel);
    invalidatePaneTabSizeCache(prevPane);
  }
  if (!pane._panelContainer.contains(panel)) {
    pane._panelContainer.appendChild(panel);
    invalidatePaneTabSizeCache(pane);
  }
  moveTabToPane(pid, pane);
  if (prevPane) {
    const isCurrentlyCollapsed = prevPane.classList.contains('view-collapsed');
    // Only maintain active tab if pane is OPEN and we didn't just remove the active one.
    if (!isCurrentlyCollapsed && !wasActive) {
      setActivePanelInPane(prevPane);
    }
    checkAndCollapsePaneIfAllTabsCollapsed(prevPane);
    removePaneIfEmpty(prevPane);
  }
}


export function moveTabIntoPaneAtIndex(panel, pane, index) {
  const tab = getTabById(panel.dataset.panelId);
  if (!tab) return;
  const wasActive = tab.classList.contains('active');

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


  if (prevPane) {
    const isCurrentlyCollapsed = prevPane.classList.contains('view-collapsed');
    // Only maintain active tab if pane is OPEN and we didn't just remove the active one.
    if (!isCurrentlyCollapsed && !wasActive) {
      setActivePanelInPane(prevPane);
    }
    checkAndCollapsePaneIfAllTabsCollapsed(prevPane);
    removePaneIfEmpty(prevPane);
  }


  window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
}

export function cloneTabIntoPane(panel, pane, index = null) {
  const title = panel.dataset.title || 'Tab';
  const newPanel = createPanelElement(title);
  const newPid = registerPanelDom(newPanel, title);
  newPanel.querySelector('.ptmt-panel-content').innerHTML = panel.querySelector('.ptmt-panel-content').innerHTML;
  index ??= pane._tabStrip.querySelectorAll('.ptmt-tab').length;
  pane._panelContainer.appendChild(newPanel);
  const tab = createTabElement(title, newPid);
  const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
  pane._tabStrip[settingsBtn ? 'insertBefore' : 'appendChild'](tab, settingsBtn);

  invalidatePaneTabSizeCache(pane);

  setActivePanelInPane(pane, newPid);
  return newPanel;
}

export function cloneTabIntoSplit(panel, pane, vertical, newFirst) {
  const newPanel = cloneTabIntoPane(panel, pane, 0);
  splitPaneWithPane(pane, newPanel, vertical, newFirst);
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
    console.warn('[PTMT] Failed :', e);
  }
}