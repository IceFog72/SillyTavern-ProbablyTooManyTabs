// tabs.js

import { el, isElement, getPanelBySourceId,getPanelById,getTabById } from './utils.js';
import { getRefs } from './layout.js';
import { setPaneCollapsedView, removePaneIfEmpty, checkAndCollapsePaneIfAllTabsCollapsed, splitPaneWithPane } from './pane.js';
import { hideDropIndicator, hideSplitOverlay } from './drag-drop.js';

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
  const panel = el('div', { className: 'ptmt-panel' });
  panel.appendChild(el('div', { className: 'ptmt-panel-content' }));
  panel.dataset.ptmtType = 'panel';
  if (title) panel.dataset.title = title;
  return panel;
}


export function createTabElement(title, pid, icon = null) {
  const t = el('div', { className: 'ptmt-tab', draggable: true, tabindex: 0 });
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
      

      t.classList.add('active');
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
      return;
    }

    if (pane.classList.contains('view-collapsed')) {
      setPaneCollapsedView(pane, false);
    }


    const allTabsInPane = Array.from(pane._tabStrip.querySelectorAll('.ptmt-tab'));
    allTabsInPane.forEach(tab => {
      const isThisTab = (tab === t);
      tab.classList.toggle('active', isThisTab);

      tab.classList.toggle('collapsed', !isThisTab);
    });


    const allPanelsInPane = Array.from(pane._panelContainer.querySelectorAll('.ptmt-panel'));
    allPanelsInPane.forEach(panel => {
      const isThisPanel = (panel.dataset.panelId === pid);
      panel.classList.toggle('hidden', !isThisPanel);
    });

    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
  });

  t.addEventListener('dragstart', ev => {
    t.classList.add('dragging');
    try {
      ev.dataTransfer.setData('text/plain', pid);
      ev.dataTransfer.setData('application/x-ptmt-tab', pid);
    } catch { }
    const g = t.cloneNode(true);
    Object.assign(g.style, { position: 'absolute', left: '-9999px', top: '-9999px' });
    document.body.appendChild(g);
    try {
      ev.dataTransfer.setDragImage(g, 10, 10);
    } catch { }
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
  panelContainer.querySelectorAll('.ptmt-panel').forEach(p => p.classList.add('hidden'));
  tabStrip.querySelectorAll('.ptmt-tab').forEach(t => t.classList.remove('active'));

  let targetPid = pid;
  if (!targetPid) {
    const firstAvailableTab = tabStrip.querySelector('.ptmt-tab:not(.collapsed)');
    targetPid = firstAvailableTab?.dataset.for || panelContainer.querySelector('.ptmt-panel')?.dataset.panelId || null;
  }
  if (!targetPid) return false;

  const targetPanel = getPanelById(targetPid);
  const targetTab = getTabById(targetPid);

  if (targetPanel) targetPanel.classList.remove('hidden');
  if (targetTab) targetTab.classList.add('active');
  return true;
}

export function openTab(pid) {
  const target = getPanelById(pid);
  if (!target) return false;

  const tab = getTabById(pid);
  const pane = getPaneForPanel(target) || getPaneForTabElement(tab) || getActivePane();
  if (!pane) return false;

  if (tab?.classList.contains('collapsed')) {
    tab.classList.remove('collapsed');
    target.classList.remove('hidden');
  }

  pane._panelContainer.querySelectorAll('.ptmt-panel').forEach(panel => panel.classList.add('hidden'));
  pane._tabStrip.querySelectorAll('.ptmt-tab').forEach(t => t.classList.remove('active'));
  target.classList.remove('hidden');
  if (tab) tab.classList.add('active');
  return true;
}

export function closeTabById(pid) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);

  const pane = getPaneForTabElement(tab) || getPaneForPanel(panel) || getActivePane();
  if (!pane) return true;

  if (tab) tab.classList.add('collapsed');
  if (panel) panel.classList.add('hidden');
  if (tab?.classList.contains('active')) setActivePanelInPane(pane);

  removePaneIfEmpty(pane);
  checkAndCollapsePaneIfAllTabsCollapsed(pane);
  return true;
}

export function createTabFromElementId(elementId, options = {}, target = null) {
    const { title = null, icon = null, makeActive = true, setAsDefault = false } = options;


    const stagingArea = document.getElementById('ptmt-staging-area');
    let node = stagingArea?.querySelector(`#${CSS.escape(elementId)}`);


    if (!node) {
        node = document.getElementById(elementId);

        if (node) {
            stagingArea.appendChild(node);
        }
    }


    if (!node) {
        return null;
    }

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
        console.warn(`[SFT] Could not find a target pane for elementId: ${elementId}`);
        return null;
    }


    if (getPanelBySourceId(elementId)) {
        return getPanelBySourceId(elementId);
    }

    const panelTitle = title || node.getAttribute('data-panel-title') || node.id || 'Panel';
    const panel = createPanelElement(panelTitle);
    panel.dataset.sourceId = elementId;
    const pid = registerPanelDom(panel, panelTitle);
    panel.querySelector('.ptmt-panel-content').appendChild(node);
    targetPane._panelContainer.appendChild(panel);

    const tab = createTabElement(panelTitle, pid, icon);
    targetPane._tabStrip.appendChild(tab);

    if (setAsDefault) setDefaultPanelById(pid);
    if (makeActive) openTab(pid);

    return panel;
}

export function createTabForBodyContent({ title = 'Main', icon = '📝', setAsDefault = true } = {}, targetPane = null) {
  const toMove = Array.from(document.body.childNodes).filter(n => !(n.nodeType === 1 && n.id === 'ptmt-main'));
  if (toMove.length === 0) return null;


  const pane = targetPane || getActivePane();
  if (!pane) {
    console.error('[SFT] createTabForBodyContent failed: Could not find a target pane.');
    return null;
  }


  const panel = createPanelElement(title);
  panel.dataset.sourceId = 'ptmt-main-content'; 
  const pid = registerPanelDom(panel, title);
  const content = panel.querySelector('.ptmt-panel-content');

  for (const node of toMove) {
    if (node.nodeType === 1 && node.id === 'ptmt-main') continue;
    if (node.tagName === 'SCRIPT' && node.dataset?.ptmtIgnore !== 'false') {
      try { document.head.appendChild(node); } catch { }
    } else {
      try { content.appendChild(node); } catch { }
    }
  }

  pane._panelContainer.appendChild(panel);
  const tab = createTabElement(title, pid, icon);
  
  const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
  if (settingsBtn) pane._tabStrip.insertBefore(tab, settingsBtn); else pane._tabStrip.appendChild(tab);
  
  if (setAsDefault) setDefaultPanelById(pid);
  openTab(pid);
  return panel;
}

export function moveTabToPane(pid, pane) {
  const tab = getTabById(pid);
  const panel = getPanelById(pid);
  if (!tab || !pane) return;

  const prevPane = getPaneForTabElement(tab);
  if (prevPane && prevPane._tabStrip && prevPane._tabStrip !== pane._tabStrip) prevPane._tabStrip.removeChild(tab);

  if (pane._tabStrip && !pane._tabStrip.contains(tab)) {
    const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
    pane._tabStrip[settingsBtn ? 'insertBefore' : 'appendChild'](tab, settingsBtn);
  }

  if (panel) {
    if (panel.parentElement && panel.parentElement !== pane._panelContainer) panel.parentElement.removeChild(panel);
    if (!pane._panelContainer.contains(panel)) pane._panelContainer.appendChild(panel);
  }

  if (prevPane) {
    setActivePanelInPane(prevPane);
    removePaneIfEmpty(prevPane);
  }
}

export function movePanelToPane(panel, pane) {
  if (!panel || !pane) return;
  const pid = panel.dataset.panelId;
  if (!pid) return;
  const prevPane = getPaneForPanel(panel);
  if (prevPane && prevPane._panelContainer && prevPane._panelContainer !== pane._panelContainer) prevPane._panelContainer.removeChild(panel);
  if (!pane._panelContainer.contains(panel)) pane._panelContainer.appendChild(panel);
  moveTabToPane(pid, pane);
  if (prevPane) {
    setActivePanelInPane(prevPane);
    removePaneIfEmpty(prevPane);
  }
}


export function moveTabIntoPaneAtIndex(panel, pane, index) {
  const tab = getTabById(panel.dataset.panelId);
  if (!tab) return;

  const prevPane = getPaneForTabElement(tab);

  if (prevPane && prevPane._tabStrip && prevPane._tabStrip !== pane._tabStrip) {
    prevPane._tabStrip.removeChild(tab);
  }


  const tabs = Array.from(pane._tabStrip.querySelectorAll('.ptmt-tab'));
  const settingsBtn = pane._tabStrip.querySelector('.ptmt-view-settings');
  const insertBefore = index >= tabs.length ? settingsBtn : tabs[index];

  pane._tabStrip.insertBefore(tab, insertBefore || null);


  if (panel.parentElement && panel.parentElement !== pane._panelContainer) {
    panel.parentElement.removeChild(panel);
  }
  const panelInsertBefore = index >= pane._panelContainer.children.length ? null : pane._panelContainer.children[Math.min(index, pane._panelContainer.children.length - 1)];
  pane._panelContainer.insertBefore(panel, panelInsertBefore);


  if (prevPane) {
    setActivePanelInPane(prevPane);
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
  } catch { }
}