// drag-drop.js

import { getPaneLayerCount, splitPaneWithPane, MAX_PANE_LAYERS } from './pane.js';
import { openTab, getActivePane, moveTabIntoPaneAtIndex, cloneTabIntoPane, cloneTabIntoSplit } from './tabs.js';
import { getPanelById, throttle, getRefs } from './utils.js';

/** @typedef {import('./types.js').DragContext} DragContext */
/** @typedef {import('./types.js').RelativePanePosition} RelativePanePosition */
/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */

// --- Drag Session Cache ---
let dragSession = null;
let lastIndex = -1;
let currentDraggingPid = null;

function clearDragSession() {
  dragSession = null;
  lastIndex = -1;
  currentDraggingPid = null;
}

function updateDragSession(paneUnder, mainBodyRect) {
  if (!paneUnder) return;
  const tabStrip = paneUnder._tabStrip;
  if (!tabStrip) return;

  const tsRect = tabStrip.getBoundingClientRect();
  const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
  const tabRects = tabs.map(t => t.getBoundingClientRect());
  const container = paneUnder._panelContainer || paneUnder;
  const paneRect = container.getBoundingClientRect();

  dragSession = {
    pane: paneUnder,
    tabStrip,
    tsRect,
    tabs,
    tabRects,
    paneRect,
    mainBodyRect,
    vertical: tabStrip.classList.contains('vertical')
  };
}
// --------------------------

function getDragPidFromEvent(ev, isDropEvent = false) {
  if (currentDraggingPid) return currentDraggingPid;
  if (isDropEvent) {
    try {
      return ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('application/x-ptmt-tab') || '';
    } catch { return ''; }
  }
  return '';
}

function relativePanePos(pane, clientX, clientY) {
  const container = pane._panelContainer || pane;
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return { rect, x, y, rx: x / Math.max(1, rect.width), ry: y / Math.max(1, rect.height) };
}

function getDragContext(ev, elUnder, isDropEvent = false) {
  const pid = getDragPidFromEvent(ev, isDropEvent);
  if (!pid) return null;

  const clientX = ev.clientX;
  const clientY = ev.clientY;

  const paneUnder = elUnder?.closest('.ptmt-pane') || getActivePane();
  const overTabStrip = !!(elUnder?.closest('.ptmt-tabStrip'));
  const wantsCopy = ev.ctrlKey || ev.metaKey || ev.altKey;

  return { pid, elUnder, paneUnder, overTabStrip, wantsCopy, clientX, clientY };
}

let lastElementUnder = null;

function processDragEvent(ev, { performDrop = false } = {}) {
  if (ev.cancelable) ev.preventDefault();

  const clientX = ev.clientX;
  const clientY = ev.clientY;

  // Optimize: use ev.target instead of expensive elementFromPoint
  // dragover events naturally bubble up with the target being the element directly under the mouse
  const elUnder = ev.target;

  if (elUnder === lastElementUnder && !performDrop && dragSession) {
    // If we're over the same literal element and not dropping, 
    // we can likely still reuse everything unless we're in a high-precision zone (tab strip)
    if (!dragSession.overTabStrip) return;
  }
  lastElementUnder = elUnder;

  const isOverSettingsPanel = elUnder?.closest('.ptmt-settings-panel, #ptmt-unified-editor');

  if (isOverSettingsPanel) {
    hideDropIndicator();
    hideSplitOverlay();
    return;
  }

  const ctx = getDragContext(ev, elUnder, performDrop);

  if (!ctx || !ctx.pid) {
    hideDropIndicator();
    hideSplitOverlay();
    return;
  }

  // Optimize: Only refresh session if pane changed or we don't have one
  const refs = getRefs();
  if (!dragSession || dragSession.pane !== ctx.paneUnder) {
    const mainBodyRect = refs.mainBody.getBoundingClientRect();
    updateDragSession(ctx.paneUnder, mainBodyRect);
  }

  // Double check if we're technically over a settings panel via coordinates 
  // (sometimes elementFromPoint hits the overlay but we want a small margin)
  if (ctx.clientX > dragSession.mainBodyRect.right - 10) {
    hideDropIndicator(); hideSplitOverlay(); return;
  }

  if (ctx.overTabStrip) {
    handleTabStripDrop(ctx, ev, performDrop);
    return;
  }

  const splitHandled = handlePaneSplitDrop(ctx, ev, performDrop);
  if (splitHandled) {
    return;
  }

  // Fallback: If not splitting (e.g., max layers reached), fallback to adding as tab
  handleTabStripDrop(ctx, ev, performDrop);
}

function handleTabStripDrop(ctx, ev, performDrop) {
  const { paneUnder } = ctx;

  // Use cached session data for index calculation if over tab strip
  const index = computeDropIndexFromSession(ctx.clientX, ctx.clientY);

  if (!performDrop) {
    hideSplitOverlay();
    showDropIndicatorFromSession(index);
    return;
  }

  const panel = getPanelById(ctx.pid);
  if (!panel) { hideDropIndicator(); hideSplitOverlay(); return; }

  // Use precise index
  const dropIndex = index;

  if (ctx.wantsCopy) {
    cloneTabIntoPane(panel, paneUnder, dropIndex);
  } else {
    moveTabIntoPaneAtIndex(panel, paneUnder, dropIndex);
  }

  hideDropIndicator();
  hideSplitOverlay();
  openTab(panel.dataset.panelId);
}

function handlePaneSplitDrop(ctx, ev, performDrop) {
  const { paneUnder } = ctx;
  if (!dragSession) return false;

  const rect = dragSession.paneRect;
  const x = ctx.clientX - rect.left;
  const y = ctx.clientY - rect.top;

  // Use pixel distances for more intuitive edge detection on thin/wide panels
  const distLeft = x;
  const distRight = rect.width - x;
  const distTop = y;
  const distBottom = rect.height - y;

  const layers = getPaneLayerCount(paneUnder);
  const canSplit = layers < MAX_PANE_LAYERS;

  // If we can't split, fallback to returning false so it gets added as a tab
  if (!canSplit) {
    return false;
  }

  // Which dimension are we physically closer to?
  const isHorizontalProximity = Math.min(distLeft, distRight) < Math.min(distTop, distBottom);
  const vertical = isHorizontalProximity; // if closer to left/right, we split vertically
  const first = vertical ? (distLeft < distRight) : (distTop < distBottom);

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

function computeDropIndexFromSession(clientX, clientY) {
  if (!dragSession || !dragSession.tabRects.length) return 0;

  const { tabRects, vertical } = dragSession;
  const clientPos = vertical ? clientY : clientX;

  for (let i = 0; i < tabRects.length; i++) {
    const r = tabRects[i];
    const midpoint = vertical ? (r.top + r.height / 2) : (r.left + r.width / 2);
    if (clientPos < midpoint) return i;
  }
  return tabRects.length;
}

function showDropIndicatorFromSession(index) {
  const refs = getRefs();
  if (!refs.dropIndicator || !dragSession) return;

  if (index === lastIndex) return;
  lastIndex = index;

  const { vertical, tsRect, tabRects, mainBodyRect } = dragSession;
  const style = { display: 'block', width: '', height: '', left: '', top: '', transform: '' };

  if (vertical) {
    let top = (tabRects.length === 0) ? tsRect.top + 2 : (index >= tabRects.length) ? tabRects[tabRects.length - 1].bottom - 2 : tabRects[index].top - 2;
    Object.assign(style, { top: `${top - mainBodyRect.top}px`, left: `${tsRect.left - mainBodyRect.left}px`, width: `${tsRect.width}px`, height: '2px', transform: 'translateY(-1px)' });
  } else {
    let left = (tabRects.length === 0) ? tsRect.left + 2 : (index >= tabRects.length) ? tabRects[tabRects.length - 1].right - 2 : tabRects[index].left - 2;
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
  if (!refs.splitOverlay || !pane || !dragSession) return;

  const { mainBodyRect, paneRect: r } = dragSession;

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

  document.addEventListener('dragstart', ev => {
    const tabEl = ev.target.closest('.ptmt-tab');
    if (tabEl) {
      currentDraggingPid = tabEl.dataset.for;
    }
  });

  document.addEventListener('dragover', ev => {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch { }
  });

  const throttledProcessDrag = throttle(ev => processDragEvent(ev, { performDrop: false }), 16);

  refs.mainBody.addEventListener('dragover', throttledProcessDrag);

  refs.mainBody.addEventListener('drop', ev => {
    processDragEvent(ev, { performDrop: true });
    clearDragSession();
  });

  refs.mainBody.addEventListener('dragleave', (e) => {
    setTimeout(() => {
      const mainRect = refs.mainBody.getBoundingClientRect();
      const stillInside = e.clientX >= mainRect.left && e.clientX <= mainRect.right && e.clientY >= mainRect.top && e.clientY <= mainRect.bottom;
      if (!stillInside) {
        hideDropIndicator();
        hideSplitOverlay();
        clearDragSession();
      }
    }, 50);
  });

  document.addEventListener('dragend', clearDragSession);
}
