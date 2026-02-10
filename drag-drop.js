// drag-drop.js

import { getPaneLayerCount, splitPaneWithPane, MAX_PANE_LAYERS } from './pane.js';
import { openTab, getActivePane, moveTabIntoPaneAtIndex, cloneTabIntoPane, cloneTabIntoSplit } from './tabs.js';
import { getPanelById, throttle, getRefs } from './utils.js';

// Helper functions moved up or converted to function declarations to avoid ReferenceError
function getDragPidFromEvent(ev) {
  try {
    return ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('application/x-ptmt-tab') || '';
  } catch { return ''; }
}

function relativePanePos(pane, clientX, clientY) {
  const container = pane._panelContainer || pane;
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return { rect, x, y, rx: x / Math.max(1, rect.width), ry: y / Math.max(1, rect.height) };
}

function getDragContext(ev) {
  const pid = getDragPidFromEvent(ev);
  if (!pid) return null;

  const clientX = ev.clientX;
  const clientY = ev.clientY;

  const elUnder = document.elementFromPoint(clientX, clientY) || null;
  const paneUnder = elUnder?.closest('.ptmt-pane') || getActivePane();
  const overTabStrip = !!(elUnder?.closest('.ptmt-tabStrip'));
  const wantsCopy = ev.ctrlKey || ev.metaKey || ev.altKey;

  return { pid, elUnder, paneUnder, overTabStrip, wantsCopy, clientX, clientY };
}

function processDragEvent(ev, { performDrop = false } = {}) {
  if (ev.cancelable) ev.preventDefault();

  // Ignore drags when cursor is over the layout editor - they have their own handling
  const clientX = ev.clientX;
  const clientY = ev.clientY;
  const elUnder = document.elementFromPoint(clientX, clientY);
  const isOverSettingsPanel = elUnder?.closest('.ptmt-settings-panel, #ptmt-unified-editor');

  if (isOverSettingsPanel) {
    hideDropIndicator();
    hideSplitOverlay();
    return;
  }

  const ctx = getDragContext(ev);

  if (!ctx || !ctx.pid) {
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

function handleTabStripDrop(ctx, ev, performDrop) {
  const { paneUnder } = ctx;
  hideSplitOverlay();
  const index = computeDropIndex(paneUnder._tabStrip, ctx.clientX, ctx.clientY);

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
  const { rx, ry } = relativePanePos(paneUnder, ctx.clientX, ctx.clientY);

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

function computeDropIndex(tabStrip, clientX, clientY) {
  const vertical = tabStrip.classList.contains('vertical');
  const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
  if (!tabs.length) return 0;

  // 1. Read all dimensions at once
  const tabRects = tabs.map(t => t.getBoundingClientRect());

  // 2. Perform logic without touching the DOM
  for (let i = 0; i < tabRects.length; i++) {
    const r = tabRects[i];
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

export function enableInteractions() {
  const refs = getRefs();
  document.addEventListener('dragover', ev => {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch { }
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
