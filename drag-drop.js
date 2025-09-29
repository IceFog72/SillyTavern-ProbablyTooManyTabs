// drag-drop.js

import { getRefs } from './layout.js';
import { getPaneLayerCount, splitPaneWithPane, MAX_PANE_LAYERS } from './pane.js';
import { openTab, getActivePane, moveTabIntoPaneAtIndex, cloneTabIntoPane, cloneTabIntoSplit, movePanelToPane, moveTabToPane } from './tabs.js';
import { getPanelById, getTabById, throttle } from './utils.js';

function getDragContext(ev) {
    const pid = getDragPidFromEvent(ev);
    if (!pid) return null;

    const elUnder = document.elementFromPoint(ev.clientX, ev.clientY) || null;
    const paneUnder = elUnder?.closest('.ptmt-pane') || getActivePane();
    const overTabStrip = !!(elUnder?.closest('.ptmt-tabStrip'));
    const wantsCopy = ev.ctrlKey || ev.metaKey || ev.altKey;

    return { pid, elUnder, paneUnder, overTabStrip, wantsCopy };
}

function handleTabStripDrop(ctx, ev, performDrop) {
    const { paneUnder } = ctx;
    hideSplitOverlay();
    const index = computeDropIndex(paneUnder._tabStrip, ev.clientX, ev.clientY);

    if (!performDrop) {
        showDropIndicatorOnTabStrip(paneUnder._tabStrip, index);
        return;
    }

    const panel = getPanelById(ctx.pid);
    if (!panel) { hideDropIndicator(); return; }

    if (ctx.wantsCopy) {
        cloneTabIntoPane(panel, paneUnder, index);
    } else {
        moveTabIntoPaneAtIndex(panel, paneUnder, index);
    }

    hideDropIndicator();
    openTab(panel.dataset.panelId);
}

function handlePaneSplitDrop(ctx, ev, performDrop) {
    const { paneUnder } = ctx;
    const { rx, ry } = relativePanePos(paneUnder, ev.clientX, ev.clientY);

    const edgeThresh = 0.2;
    const layers = getPaneLayerCount(paneUnder);
    const canSplit = layers < MAX_PANE_LAYERS;

    if (!canSplit || (rx > edgeThresh && rx < 1 - edgeThresh && ry > edgeThresh && ry < 1 - edgeThresh)) {
        return false; 
    }

    const vertical = (rx < edgeThresh || rx > 1 - edgeThresh);
    const first = vertical ? (rx < 0.5) : (ry < 0.5);

    if (!performDrop) {
        showSplitOverlayForPane(paneUnder, vertical, first);
        hideDropIndicator();
        return true;
    }

    const panel = getPanelById(ctx.pid);
    if (!panel) { hideSplitOverlay(); return true; }

    if (ctx.wantsCopy) {
        cloneTabIntoSplit(panel, paneUnder, vertical, first);
    } else {
        splitPaneWithPane(paneUnder, panel, vertical, first);
    }

    hideSplitOverlay();
    openTab(panel.dataset.panelId);
    return true; 
}

const getDragPidFromEvent = (ev) => {
  try {
    return ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('application/x-ptmt-tab') || '';
  } catch { return ''; }
};

const elementUnderPoint = (x, y) => document.elementFromPoint(x, y) || null;

function relativePanePos(pane, clientX, clientY) {
  const container = pane._panelContainer || pane;
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return { rect, x, y, rx: x / Math.max(1, rect.width), ry: y / Math.max(1, rect.height) };
}

function computeDropIndex(tabStrip, clientX, clientY) {
  const vertical = tabStrip.classList.contains('vertical');
  const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
  if (!tabs.length) return 0;
  
  for (let i = 0; i < tabs.length; i++) {
    const r = tabs[i].getBoundingClientRect();
    const midpoint = vertical ? (r.top + r.height / 2) : (r.left + r.width / 2);
    const clientPos = vertical ? clientY : clientX;
    
    if (clientPos < midpoint) return i;
  }
  return tabs.length;
}

function showDropIndicatorOnTabStrip(tabStrip, index) {
  const refs = getRefs();
  if (!refs.dropIndicator || !refs.mainBody) return;

  const mainBodyRect = refs.mainBody.getBoundingClientRect();
  const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
  const vertical = tabStrip.classList.contains('vertical');
  const tsRect = tabStrip.getBoundingClientRect();
  const style = { display: 'block', width: '', height: '', left: '', top: '', transform: '' };

  if (vertical) {
    let top = (tabs.length === 0) ? tsRect.top + 2 : (index >= tabs.length) ? tabs[tabs.length - 1].getBoundingClientRect().bottom - 2 : tabs[index].getBoundingClientRect().top - 2;
    Object.assign(style, { top: `${top - mainBodyRect.top}px`, left: `${tsRect.left - mainBodyRect.left}px`, width: `${tsRect.width}px`, height: '2px', transform: 'translateY(-1px)' });
  } else {
    let left = (tabs.length === 0) ? tsRect.left + 2 : (index >= tabs.length) ? tabs[tabs.length - 1].getBoundingClientRect().right - 2 : tabs[index].getBoundingClientRect().left - 2;
    Object.assign(style, { left: `${left - mainBodyRect.left}px`, top: `${tsRect.top - mainBodyRect.top}px`, height: `${tsRect.height}px`, width: '2px', transform: 'translateX(-1px)' });
  }
  Object.assign(refs.dropIndicator.style, style);
}

export const hideDropIndicator = () => {
  const refs = getRefs();
  refs.dropIndicator && (refs.dropIndicator.style.display = 'none');
};

const showSplitOverlayForPane = (pane, vertical, first) => {
  const refs = getRefs();
  if (!refs.splitOverlay || !pane || !pane._panelContainer || !refs.mainBody) return;

  const mainBodyRect = refs.mainBody.getBoundingClientRect();
  const r = pane._panelContainer.getBoundingClientRect();

  let x = r.left - mainBodyRect.left;
  let y = r.top - mainBodyRect.top;
  let w = r.width;
  let h = r.height;

  if (vertical) {
    w = Math.max(40, Math.floor(w * 0.5));
    if (!first) x += w;
  } else {
    h = Math.max(40, Math.floor(h * 0.5));
    if (!first) y += h;
  }

  Object.assign(refs.splitOverlay.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, display: 'block' });
};

export const hideSplitOverlay = () => {
  const refs = getRefs();
  refs.splitOverlay && (refs.splitOverlay.style.display = 'none');
};

function processDragEvent(ev, { performDrop = false } = {}) {
    ev.preventDefault();
    const ctx = getDragContext(ev);

    if (!ctx) {
        hideDropIndicator();
        hideSplitOverlay();
        return;
    }


    if (ctx.overTabStrip) {
        handleTabStripDrop(ctx, ev, performDrop);
        return;
    }


    const splitHandled = handlePaneSplitDrop(ctx, ev, performDrop);
    if (splitHandled) {
        return;
    }


    handleTabStripDrop(ctx, ev, performDrop);
}

export function enableInteractions() {
    const refs = getRefs();
    document.addEventListener('dragover', ev => {
        ev.preventDefault();
        try { ev.dataTransfer.dropEffect = 'move'; } catch {}
    });

    const throttledProcessDrag = throttle(ev => processDragEvent(ev, { performDrop: false }), 24);

    refs.mainBody.addEventListener('dragover', throttledProcessDrag);

    refs.mainBody.addEventListener('drop', ev => {

        processDragEvent(ev, { performDrop: true });
    });

    refs.mainBody.addEventListener('dragleave', (e) => {
        setTimeout(() => {
            const mainRect = refs.mainBody.getBoundingClientRect();
            const stillInside = e.clientX >= mainRect.left && e.clientX <= mainRect.right && e.clientY >= mainRect.top && e.clientY <= mainRect.bottom;
            if (!stillInside) {
                hideDropIndicator();
                hideSplitOverlay();
            }
        }, 50);
    });
}


export function enablePaneTabDrop(tabStrip, pane) {
  tabStrip.addEventListener('dragover', ev => {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch { }
    const pid = getDragPidFromEvent(ev);
    if (!pid) return;
    showDropIndicatorOnTabStrip(tabStrip, computeDropIndex(tabStrip, ev.clientX, ev.clientY));
  });
  tabStrip.addEventListener('dragleave', hideDropIndicator);
  tabStrip.addEventListener('drop', ev => {
    ev.preventDefault();
    const pid = getDragPidFromEvent(ev);
    if (!pid) { hideDropIndicator(); return; }
    const tab = getTabById(pid);
    const panel = getPanelById(pid);
    if (!tab || !panel) { hideDropIndicator(); return; }
    const index = computeDropIndex(tabStrip, ev.clientX, ev.clientY);
    const wantsCopy = ev.ctrlKey || ev.metaKey || ev.altKey;
    wantsCopy ? cloneTabIntoPane(panel, pane, index) : moveTabIntoPaneAtIndex(panel, pane, index);
    hideDropIndicator();
    openTab(panel.dataset.panelId);
  });
}

export function enablePanePanelDrop(panelContainer, pane) {
  panelContainer.addEventListener('dragover', ev => {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch { }
  });
  panelContainer.addEventListener('drop', ev => {
    ev.preventDefault();
    const pid = getDragPidFromEvent(ev);
    if (!pid) return;
    const panel = getPanelById(pid);
    if (!panel) return;
    movePanelToPane(panel, pane);
    moveTabToPane(pid, pane);
    openTab(pid);
  });
}