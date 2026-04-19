// drag-drop.js
// Implements the "split compass" drop UI: a centered 5-zone widget that appears
// on any pane when a tab is being dragged over it.
// Zones: center (add as tab) | top | bottom | left | right (split directions)

import { getPaneLayerCount, splitPaneWithPane, MAX_PANE_LAYERS } from './pane.js';
import { openTab, getActivePane, moveTabIntoPaneAtIndex } from './tabs.js';
import { getPanelById, throttle, getRefs } from './utils.js';

/** @typedef {import('./types.js').DragContext} DragContext */
/** @typedef {import('./types.js').RelativePanePosition} RelativePanePosition */
/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */

// ─── Drag Session ──────────────────────────────────────────────────────────────
let dragSession    = null;
let lastIndex      = -1;
let currentDraggingPid = null;

function clearDragSession() {
  dragSession = null;
  lastIndex   = -1;
  currentDraggingPid = null;
  hideCompass();
}

function updateDragSession(paneUnder, mainBodyRect) {
  if (!paneUnder) return;
  const tabStrip = paneUnder._tabStrip;
  if (!tabStrip) return;

  const tsRect   = tabStrip.getBoundingClientRect();
  const tabs     = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
  const tabRects = tabs.map(t => t.getBoundingClientRect());
  const container = paneUnder._panelContainer || paneUnder;
  const paneRect  = container.getBoundingClientRect();

  dragSession = { pane: paneUnder, tabStrip, tsRect, tabs, tabRects, paneRect, mainBodyRect,
    vertical: tabStrip.classList.contains('vertical') };
}

// ─── Compass Widget ────────────────────────────────────────────────────────────

let compassEl          = null;
let compassCurrentPane = null;
let compassHoveredZone = null;   // 'center'|'top'|'bottom'|'left'|'right'|null

// Zone rects + precomputed preview rects — recomputed ONLY when the pane changes.
// Avoids getBoundingClientRect() on every dragover frame.
let cachedZoneRects    = null;   // Array<{zone, left, right, top, bottom}>
let cachedPreviews     = null;   // {top,bottom,left,right,center} → {x,y,w,h}

function getOrCreateCompass() {
  if (compassEl) return compassEl;
  compassEl = document.createElement('div');
  compassEl.className = 'ptmt-split-compass';
  compassEl.innerHTML = `
    <div class="ptmt-compass-zone ptmt-compass-top"    data-zone="top"   ><i class="fa-solid fa-caret-up"></i></div>
    <div class="ptmt-compass-middle-row">
      <div class="ptmt-compass-zone ptmt-compass-left"   data-zone="left"  ><i class="fa-solid fa-caret-left"></i></div>
      <div class="ptmt-compass-zone ptmt-compass-center" data-zone="center"><i class="fa-solid fa-window-restore"></i></div>
      <div class="ptmt-compass-zone ptmt-compass-right"  data-zone="right" ><i class="fa-solid fa-caret-right"></i></div>
    </div>
    <div class="ptmt-compass-zone ptmt-compass-bottom"  data-zone="bottom" ><i class="fa-solid fa-caret-down"></i></div>
  `;
  document.body.appendChild(compassEl);
  return compassEl;
}

/** Position compass on a pane and (re)cache all geometry. */
function showCompassOnPane(pane, canSplit) {
  const compass   = getOrCreateCompass();
  const isSamPane = compassCurrentPane === pane;

  if (!isSamPane) {
    // Reposition & rebuild rect cache
    const container = pane._panelContainer || pane;
    const r = container.getBoundingClientRect();

    compass.style.left = `${r.left + r.width  / 2}px`;
    compass.style.top  = `${r.top  + r.height / 2}px`;
    compass.style.display = 'flex';
    compassCurrentPane = pane;

    // Precompute zone rects from the freshly positioned compass
    cachedZoneRects = Array.from(compass.querySelectorAll('.ptmt-compass-zone')).map(el => {
      const zr = el.getBoundingClientRect();
      return { zone: el.dataset.zone, left: zr.left, right: zr.right, top: zr.top, bottom: zr.bottom, el };
    });

    // Precompute split preview rects (4 halves + full-pane center)
    const HALF = 0.5;
    cachedPreviews = {
      left:   { x: r.left,                    y: r.top,                     w: r.width * HALF, h: r.height },
      right:  { x: r.left + r.width  * HALF,  y: r.top,                     w: r.width * HALF, h: r.height },
      top:    { x: r.left,                    y: r.top,                     w: r.width,        h: r.height * HALF },
      bottom: { x: r.left,                    y: r.top + r.height * HALF,   w: r.width,        h: r.height * HALF },
      center: null,  // no preview for center drop
    };
  }

  compass.classList.toggle('ptmt-compass-no-split', !canSplit);
}

function hideCompass() {
  if (compassEl) compassEl.style.display = 'none';
  compassCurrentPane = null;
  compassHoveredZone = null;
  cachedZoneRects    = null;
  cachedPreviews     = null;
  hideSplitPreview();
}

/** Hit-test against CACHED zone rects — zero getBoundingClientRect() calls. */
function getZoneUnderPoint(clientX, clientY) {
  if (!cachedZoneRects) return null;
  for (const z of cachedZoneRects) {
    if (clientX >= z.left && clientX <= z.right && clientY >= z.top && clientY <= z.bottom) {
      return z.zone;
    }
  }
  return null;
}

/** Highlight the hovered zone; show preview using cached geometry. */
function updateCompassHighlight(zone, canSplit) {
  if (compassHoveredZone === zone) return;  // no change — skip all DOM writes
  compassHoveredZone = zone;

  if (cachedZoneRects) {
    for (const z of cachedZoneRects) {
      z.el.classList.toggle('ptmt-compass-zone-active', z.zone === zone);
    }
  }

  if (!zone || zone === 'center' || !canSplit) {
    hideSplitPreview();
    return;
  }

  const p = cachedPreviews?.[zone];
  if (p) showSplitPreview(p.x, p.y, p.w, p.h);
}

// ─── Split Preview Overlay ─────────────────────────────────────────────────────

let splitPreviewEl = null;

function getOrCreateSplitPreview() {
  if (splitPreviewEl) return splitPreviewEl;
  splitPreviewEl = document.createElement('div');
  splitPreviewEl.className = 'ptmt-split-preview';
  document.body.appendChild(splitPreviewEl);
  return splitPreviewEl;
}

function showSplitPreview(x, y, w, h) {
  const p = getOrCreateSplitPreview();
  Object.assign(p.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
}

function hideSplitPreview() {
  if (splitPreviewEl) splitPreviewEl.style.display = 'none';
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

function getDragPidFromEvent(ev, isDropEvent = false) {
  if (currentDraggingPid) return currentDraggingPid;
  if (isDropEvent) {
    try { return ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('application/x-ptmt-tab') || ''; }
    catch { return ''; }
  }
  return '';
}

function getDragContext(ev, elUnder, isDropEvent = false) {
  const pid = getDragPidFromEvent(ev, isDropEvent);
  if (!pid) return null;
  const paneUnder    = elUnder?.closest('.ptmt-pane') || getActivePane();
  const overTabStrip = !!(elUnder?.closest('.ptmt-tabStrip'));
  return { pid, elUnder, paneUnder, overTabStrip, clientX: ev.clientX, clientY: ev.clientY };
}

let lastElementUnder = null;

// ─── Main drag event processor ─────────────────────────────────────────────────

function processDragEvent(ev, { performDrop = false } = {}) {
  if (ev.cancelable) ev.preventDefault();

  const clientX = ev.clientX;
  const clientY = ev.clientY;
  const elUnder = document.elementFromPoint(clientX, clientY) || ev.target;

  if (elUnder === lastElementUnder && !performDrop && dragSession) {
    if (!dragSession.overTabStrip) {
      // Same element — but we can still do the cheap zone hittest without reading DOM
      if (compassCurrentPane) {
        const zone    = getZoneUnderPoint(clientX, clientY);
        const layers  = getPaneLayerCount(dragSession.pane);
        updateCompassHighlight(zone, layers < MAX_PANE_LAYERS);
      }
      return;
    }
  }
  lastElementUnder = elUnder;

  if (elUnder?.closest('.ptmt-settings-panel, #ptmt-unified-editor')) {
    hideDropIndicator(); hideCompass(); return;
  }

  const ctx = getDragContext(ev, elUnder, performDrop);
  if (!ctx || !ctx.pid) { hideDropIndicator(); hideCompass(); return; }

  const refs = getRefs();
  if (!dragSession || dragSession.pane !== ctx.paneUnder) {
    updateDragSession(ctx.paneUnder, refs.mainBody.getBoundingClientRect());
  }

  if (ctx.clientX > dragSession.mainBodyRect.right - 10) {
    hideDropIndicator(); hideCompass(); return;
  }

  // ── Tab strip ──────────────────────────────────────────────────────────────
  if (ctx.overTabStrip) {
    hideCompass();
    handleTabStripDrop(ctx, ev, performDrop);
    return;
  }

  // ── Panel body — compass ───────────────────────────────────────────────────
  const { paneUnder, clientX: cx, clientY: cy } = ctx;
  const layers   = getPaneLayerCount(paneUnder);
  const canSplit = layers < MAX_PANE_LAYERS;

  if (!performDrop) {
    showCompassOnPane(paneUnder, canSplit);
    updateCompassHighlight(getZoneUnderPoint(cx, cy), canSplit);
    hideDropIndicator();
    return;
  }

  // ── Drop: commit ───────────────────────────────────────────────────────────
  const zone  = compassHoveredZone ?? getZoneUnderPoint(cx, cy);
  hideCompass();
  hideDropIndicator();

  const panel = getPanelById(ctx.pid);
  if (!panel) return;

  if (!zone || zone === 'center' || !canSplit) {
    const index = computeDropIndexFromSession(cx, cy);
    moveTabIntoPaneAtIndex(panel, paneUnder, index);
    openTab(panel.dataset.panelId);
    return;
  }

  const vertical = zone === 'left' || zone === 'right';
  const newFirst  = zone === 'left' || zone === 'top';
    splitPaneWithPane(paneUnder, panel, vertical, newFirst);
  openTab(panel.dataset.panelId);
}

// ─── Tab strip drop ────────────────────────────────────────────────────────────

function handleTabStripDrop(ctx, ev, performDrop) {
  const index = computeDropIndexFromSession(ctx.clientX, ctx.clientY);

  if (!performDrop) {
    showDropIndicatorFromSession(index);
    return;
  }

  const panel = getPanelById(ctx.pid);
  if (!panel) { hideDropIndicator(); return; }

  moveTabIntoPaneAtIndex(panel, ctx.paneUnder, index);
  hideDropIndicator();
  openTab(panel.dataset.panelId);
}

// ─── Drop-indicator ────────────────────────────────────────────────────────────

function computeDropIndexFromSession(clientX, clientY) {
  if (!dragSession || !dragSession.tabRects.length) return 0;
  const { tabRects, vertical } = dragSession;
  const clientPos = vertical ? clientY : clientX;
  for (let i = 0; i < tabRects.length; i++) {
    const r = tabRects[i];
    const mid = vertical ? (r.top + r.height / 2) : (r.left + r.width / 2);
    if (clientPos < mid) return i;
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
    const top = tabRects.length === 0 ? tsRect.top + 2
              : index >= tabRects.length ? tabRects[tabRects.length - 1].bottom - 2
              : tabRects[index].top - 2;
    Object.assign(style, { top: `${top - mainBodyRect.top}px`, left: `${tsRect.left - mainBodyRect.left}px`,
      width: `${tsRect.width}px`, height: '2px', transform: 'translateY(-1px)' });
  } else {
    const left = tabRects.length === 0 ? tsRect.left + 2
               : index >= tabRects.length ? tabRects[tabRects.length - 1].right - 2
               : tabRects[index].left - 2;
    Object.assign(style, { left: `${left - mainBodyRect.left}px`, top: `${tsRect.top - mainBodyRect.top}px`,
      height: `${tsRect.height}px`, width: '2px', transform: 'translateX(-1px)' });
  }
  Object.assign(refs.dropIndicator.style, style);
}

export const hideDropIndicator = () => {
  const refs = getRefs();
  refs.dropIndicator && (refs.dropIndicator.style.display = 'none');
};

export const hideSplitOverlay = hideCompass;  // backwards compat for tabs.js

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export function enableInteractions() {
  const refs = getRefs();

  document.addEventListener('dragstart', ev => {
    const tabEl = ev.target?.closest?.('.ptmt-tab');
    if (tabEl) currentDraggingPid = tabEl.dataset.for;
  });

  document.addEventListener('dragover', ev => {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = 'move'; } catch { }
  });

  // Throttle only the heavy path (pane-switch detection → getBoundingClientRect).
  // Zone highlight on same pane escapes the throttle via the early-return in processDragEvent.
  const throttledProcessDrag = throttle(ev => processDragEvent(ev, { performDrop: false }), 16);
  refs.mainBody.addEventListener('dragover', throttledProcessDrag);

  refs.mainBody.addEventListener('drop', ev => {
    processDragEvent(ev, { performDrop: true });
    clearDragSession();
  });

  refs.mainBody.addEventListener('dragleave', (e) => {
    setTimeout(() => {
      const r = refs.mainBody.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right
                  && e.clientY >= r.top  && e.clientY <= r.bottom;
      if (!inside) { hideDropIndicator(); hideCompass(); clearDragSession(); }
    }, 50);
  });

  document.addEventListener('dragend', clearDragSession);
}
