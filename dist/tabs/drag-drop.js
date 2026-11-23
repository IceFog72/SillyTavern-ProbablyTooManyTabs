// drag-drop.ts
// Implements the 13-zone "split compass" drop UI:
// - 5 inner pane zones: center (add as tab) | top | bottom | left | right (split directions)
// - 4 existing neighbor pane zones: existing-top | existing-bottom | existing-left | existing-right
// - 4 outer column/root edge zones (from dock-spawn-ts DockWheel): outer-top | outer-bottom | outer-left | outer-right
// Also supports dragging multi-tab groups, floating windows, and pinned sidebar tabs, plus touch/pen pointer fallback.
import { getPaneLayerCount, splitPaneWithPane, MAX_PANE_LAYERS } from '../layout/pane.js';
import { openTab } from './tabs.js';
import { moveTabTransaction } from '../layout/layout-transactions.js';
import { getPanelById, throttle, getRefs, trackListener } from '../core/utils.js';
// ─── Drag Session ──────────────────────────────────────────────────────────────
let dragSession = null;
let lastIndex = -1;
let currentDraggingPid = null;
function clearDragSession() {
    dragSession = null;
    lastIndex = -1;
    currentDraggingPid = null;
    hideCompass();
    hideDropIndicator();
    globalThis.window?.ptmtTabs?.dock?.endDragReveal?.();
}
function isPaneEmpty(pane) {
    if (!pane)
        return false;
    return (pane._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0) === 0;
}
function getVisiblePaneRect(pane) {
    const container = pane._panelContainer;
    if (container) {
        const cr = container.getBoundingClientRect();
        if (cr.width > 0 && cr.height > 0)
            return cr;
    }
    const pr = pane.getBoundingClientRect();
    if (pr.width > 0 && pr.height > 0)
        return pr;
    const col = pane.closest?.('.ptmt-body-column') || pane.parentElement;
    if (col) {
        const colRect = col.getBoundingClientRect();
        if (colRect.width > 0 && colRect.height > 0)
            return colRect;
    }
    return pr;
}
function isFloatingPane(pane) {
    if (!pane)
        return false;
    return Boolean(pane.dataset?.floatingContainerId || pane.closest?.('.ptmt-floating-window'));
}
function updateDragSession(paneUnder, mainBodyRect) {
    if (!paneUnder)
        return;
    const tabStrip = paneUnder._tabStrip;
    if (!tabStrip)
        return;
    const tsRect = tabStrip.getBoundingClientRect();
    const tabs = Array.from(tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
    const tabRects = tabs.map(t => t.getBoundingClientRect());
    const paneRect = getVisiblePaneRect(paneUnder);
    const reversed = Boolean(paneUnder.classList?.contains('ptmt-tabs-align-end')
        || document.body?.classList?.contains('ptmt-tabs-align-end'));
    dragSession = {
        pane: paneUnder, tabStrip, tsRect, tabs, tabRects, paneRect, mainBodyRect,
        vertical: tabStrip.classList.contains('vertical'),
        reversed,
    };
}
// ─── Compass Widget ────────────────────────────────────────────────────────────
let compassEl = null;
let compassCurrentPane = null;
let compassHoveredZone = null;
// Zone rects + precomputed preview rects — recomputed ONLY when the pane changes.
// Avoids getBoundingClientRect() on every dragover frame.
let cachedZoneRects = null;
let cachedPreviews = null;
let cachedExistingTargets = null;
function getOrCreateCompass() {
    if (compassEl)
        return compassEl;
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
    <div class="ptmt-compass-zone ptmt-compass-existing ptmt-compass-existing-top"    data-zone="existing-top"   title="Move to existing pane above"><i class="fa-solid fa-window-restore"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-existing ptmt-compass-existing-bottom" data-zone="existing-bottom" title="Move to existing pane below"><i class="fa-solid fa-window-restore"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-existing ptmt-compass-existing-left"   data-zone="existing-left"   title="Move to existing pane on the left"><i class="fa-solid fa-window-restore"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-existing ptmt-compass-existing-right"  data-zone="existing-right"  title="Move to existing pane on the right"><i class="fa-solid fa-window-restore"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-outer ptmt-compass-outer-top"    data-zone="outer-top"    title="Dock at top outer edge of column"><i class="fa-solid fa-angles-up"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-outer ptmt-compass-outer-bottom" data-zone="outer-bottom" title="Dock at bottom outer edge of column"><i class="fa-solid fa-angles-down"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-outer ptmt-compass-outer-left"   data-zone="outer-left"   title="Dock at left outer edge of column"><i class="fa-solid fa-angles-left"></i></div>
    <div class="ptmt-compass-zone ptmt-compass-outer ptmt-compass-outer-right"  data-zone="outer-right"  title="Dock at right outer edge of column"><i class="fa-solid fa-angles-right"></i></div>
  `;
    document.body.appendChild(compassEl);
    return compassEl;
}
function getStructuralChildren(split) {
    return Array.from(split?.children || []).filter(el => el.classList?.contains('ptmt-pane') || el.classList?.contains('ptmt-split'));
}
function getFirstPaneInElement(element) {
    if (!element)
        return null;
    if (element.classList?.contains('ptmt-pane'))
        return element;
    return element.querySelector('.ptmt-pane') || null;
}
function getPaneDirection(fromPane, toPane) {
    const fromRect = (fromPane._panelContainer || fromPane).getBoundingClientRect();
    const toRect = (toPane._panelContainer || toPane).getBoundingClientRect();
    const fromCenterX = fromRect.left + fromRect.width / 2;
    const fromCenterY = fromRect.top + fromRect.height / 2;
    const toCenterX = toRect.left + toRect.width / 2;
    const toCenterY = toRect.top + toRect.height / 2;
    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx < 0 ? 'left' : 'right';
    }
    return dy < 0 ? 'top' : 'bottom';
}
function getExistingPaneTargets(pane) {
    const parentSplit = pane?.parentElement;
    if (!pane || !parentSplit?.classList?.contains('ptmt-split'))
        return {};
    const children = getStructuralChildren(parentSplit);
    const index = children.indexOf(pane);
    if (index < 0)
        return {};
    const targets = {};
    const siblingPanes = [
        getFirstPaneInElement(children[index - 1]),
        getFirstPaneInElement(children[index + 1]),
    ].filter((p) => Boolean(p));
    for (const siblingPane of siblingPanes) {
        const direction = getPaneDirection(pane, siblingPane);
        targets[`existing-${direction}`] = siblingPane;
    }
    return targets;
}
/** Position compass on a pane and (re)cache all geometry. */
function showCompassOnPane(pane, canSplit) {
    const compass = getOrCreateCompass();
    const isSamePane = compassCurrentPane === pane;
    if (!isSamePane) {
        // Reposition & rebuild rect cache (use visible rect fallback so collapsed panes never place compass at 0,0)
        const r = getVisiblePaneRect(pane);
        const colEl = pane.closest('.ptmt-body-column') || pane.parentElement || pane;
        const colRect = colEl.getBoundingClientRect();
        let cx = r.left + r.width / 2;
        let cy = r.top + r.height / 2;
        const vw = globalThis.window?.innerWidth || 0;
        const vh = globalThis.window?.innerHeight || 0;
        if (vw > 180)
            cx = Math.max(90, Math.min(vw - 90, cx));
        if (vh > 180)
            cy = Math.max(90, Math.min(vh - 90, cy));
        compass.style.left = `${cx}px`;
        compass.style.top = `${cy}px`;
        compass.style.display = 'flex';
        compassCurrentPane = pane;
        cachedExistingTargets = getExistingPaneTargets(pane);
        compass.querySelectorAll('.ptmt-compass-existing').forEach(el => {
            const zone = el.dataset.zone || '';
            el.classList.toggle('ptmt-compass-existing-available', !!cachedExistingTargets?.[zone]);
        });
        // Precompute zone rects from the freshly positioned compass
        cachedZoneRects = Array.from(compass.querySelectorAll('.ptmt-compass-zone')).map(el => {
            const zr = el.getBoundingClientRect();
            return { zone: el.dataset.zone || '', left: zr.left, right: zr.right, top: zr.top, bottom: zr.bottom, el };
        });
        // Precompute split preview rects (4 inner halves + 4 outer column edges + full-pane center)
        const HALF = 0.5;
        const dockCtrl = globalThis.window?.ptmtTabs?.dock;
        const isEqualStrategy = dockCtrl?.dockingSizeStrategy === 'equal-distribution';
        const rootSplit = colEl.querySelector(':scope > .ptmt-split');
        const rootChildCount = rootSplit ? getStructuralChildren(rootSplit).length : 1;
        const rootIsHoriz = Boolean(rootSplit?.classList?.contains('horizontal'));
        const outerVertShare = isEqualStrategy && rootSplit && !rootIsHoriz
            ? 1 / (rootChildCount + 1)
            : HALF;
        const outerHorizShare = isEqualStrategy && rootSplit && rootIsHoriz
            ? 1 / (rootChildCount + 1)
            : HALF;
        cachedPreviews = {
            left: { x: r.left, y: r.top, w: r.width * HALF, h: r.height },
            right: { x: r.left + r.width * HALF, y: r.top, w: r.width * HALF, h: r.height },
            top: { x: r.left, y: r.top, w: r.width, h: r.height * HALF },
            bottom: { x: r.left, y: r.top + r.height * HALF, w: r.width, h: r.height * HALF },
            'outer-left': { x: colRect.left, y: colRect.top, w: colRect.width * outerVertShare, h: colRect.height },
            'outer-right': { x: colRect.left + colRect.width * (1 - outerVertShare), y: colRect.top, w: colRect.width * outerVertShare, h: colRect.height },
            'outer-top': { x: colRect.left, y: colRect.top, w: colRect.width, h: colRect.height * outerHorizShare },
            'outer-bottom': { x: colRect.left, y: colRect.top + colRect.height * (1 - outerHorizShare), w: colRect.width, h: colRect.height * outerHorizShare },
            center: isPaneEmpty(pane) ? { x: r.left, y: r.top, w: r.width, h: r.height } : null,
        };
        for (const [zone, targetPane] of Object.entries(cachedExistingTargets)) {
            const targetContainer = targetPane._panelContainer || targetPane;
            const tr = targetContainer.getBoundingClientRect();
            cachedPreviews[zone] = { x: tr.left, y: tr.top, w: tr.width, h: tr.height };
        }
    }
    compass.classList.toggle('ptmt-compass-no-split', !canSplit);
}
export function hideCompass() {
    if (compassEl)
        compassEl.style.display = 'none';
    compassCurrentPane = null;
    compassHoveredZone = null;
    cachedZoneRects = null;
    cachedPreviews = null;
    cachedExistingTargets = null;
    hideSplitPreview();
}
/** Hit-test against CACHED zone rects — zero getBoundingClientRect() calls. */
function getZoneUnderPoint(clientX, clientY) {
    if (!cachedZoneRects)
        return null;
    for (const z of cachedZoneRects) {
        if (clientX >= z.left && clientX <= z.right && clientY >= z.top && clientY <= z.bottom) {
            return z.zone;
        }
    }
    return null;
}
/** Highlight the hovered zone; show preview using cached geometry. */
function updateCompassHighlight(zone, canSplit) {
    if (compassHoveredZone === zone)
        return; // no change — skip all DOM writes
    compassHoveredZone = zone;
    const isExistingZone = Boolean(zone?.startsWith('existing-'));
    const splitZoneDisabled = Boolean(zone && zone !== 'center' && !isExistingZone && !canSplit);
    if (cachedZoneRects) {
        for (const z of cachedZoneRects) {
            z.el.classList.toggle('ptmt-compass-zone-active', z.zone === zone && !splitZoneDisabled);
        }
    }
    if (!zone || splitZoneDisabled) {
        hideSplitPreview();
        return;
    }
    const p = cachedPreviews?.[zone];
    if (p)
        showSplitPreview(p.x, p.y, p.w, p.h);
    else
        hideSplitPreview();
}
// ─── Split Preview Overlay ─────────────────────────────────────────────────────
let splitPreviewEl = null;
function getOrCreateSplitPreview() {
    if (splitPreviewEl)
        return splitPreviewEl;
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
    if (splitPreviewEl)
        splitPreviewEl.style.display = 'none';
}
// ─── Core helpers ─────────────────────────────────────────────────────────────
function getDragPidFromEvent(ev, isDropEvent = false) {
    if (currentDraggingPid)
        return currentDraggingPid;
    if (isDropEvent) {
        try {
            return ev.dataTransfer?.getData('text/plain') || ev.dataTransfer?.getData('application/x-ptmt-tab') || '';
        }
        catch {
            return '';
        }
    }
    return '';
}
function getDragContext(ev, elUnder, isDropEvent = false) {
    const pid = getDragPidFromEvent(ev, isDropEvent);
    if (!pid)
        return null;
    // Splitters and gaps belong to no pane; never redirect them to another pane.
    const paneUnder = elUnder?.closest('.ptmt-pane') || null;
    const overTabStrip = !!(elUnder?.closest('.ptmt-tabStrip'));
    return { pid, elUnder, paneUnder, overTabStrip, clientX: ev.clientX, clientY: ev.clientY };
}
let lastElementUnder = null;
// ─── Main drag event processor ─────────────────────────────────────────────────
function processDragEvent(ev, { performDrop = false } = {}) {
    if (ev.cancelable)
        ev.preventDefault();
    const clientX = ev.clientX;
    const clientY = ev.clientY;
    const elUnder = document.elementFromPoint(clientX, clientY) || ev.target;
    const overTabStrip = !!(elUnder?.closest?.('.ptmt-tabStrip'));
    if (elUnder === lastElementUnder && !performDrop && dragSession) {
        if (!overTabStrip) {
            // Same element — but we can still do the cheap zone hittest without reading DOM
            if (compassCurrentPane) {
                const zone = getZoneUnderPoint(clientX, clientY);
                const layers = getPaneLayerCount(dragSession.pane);
                updateCompassHighlight(zone, !isPaneEmpty(dragSession.pane) && !isFloatingPane(dragSession.pane) && layers < MAX_PANE_LAYERS);
            }
            return;
        }
    }
    lastElementUnder = elUnder;
    if (elUnder?.closest('.ptmt-settings-panel, #ptmt-unified-editor')) {
        hideDropIndicator();
        hideCompass();
        return;
    }
    const ctx = getDragContext(ev, elUnder, performDrop);
    if (!ctx || !ctx.pid || !ctx.paneUnder) {
        hideDropIndicator();
        hideCompass();
        return;
    }
    const refs = getRefs();
    if (!refs.mainBody) {
        hideDropIndicator();
        hideCompass();
        return;
    }
    if (!dragSession || dragSession.pane !== ctx.paneUnder) {
        updateDragSession(ctx.paneUnder, refs.mainBody.getBoundingClientRect());
    }
    if (!dragSession) {
        hideDropIndicator();
        hideCompass();
        return;
    }
    if (dragSession.mainBodyRect.width > 0 && ctx.clientX > dragSession.mainBodyRect.right) {
        hideDropIndicator();
        hideCompass();
        return;
    }
    // ── Tab strip ──────────────────────────────────────────────────────────────
    if (ctx.overTabStrip) {
        hideCompass();
        handleTabStripDrop(ctx, ev, performDrop);
        return;
    }
    // ── Panel body — compass ───────────────────────────────────────────────────
    const { paneUnder, clientX: cx, clientY: cy } = ctx;
    const layers = getPaneLayerCount(paneUnder);
    const emptyPane = isPaneEmpty(paneUnder);
    const canSplit = !emptyPane && !isFloatingPane(paneUnder) && layers < MAX_PANE_LAYERS;
    if (!performDrop) {
        showCompassOnPane(paneUnder, canSplit);
        updateCompassHighlight(getZoneUnderPoint(cx, cy), canSplit);
        hideDropIndicator();
        return;
    }
    // ── Drop: commit ───────────────────────────────────────────────────────────
    const zone = compassHoveredZone ?? getZoneUnderPoint(cx, cy);
    const existingTargetPane = zone?.startsWith('existing-') ? cachedExistingTargets?.[zone] : null;
    hideCompass();
    hideDropIndicator();
    const dockCtrl = globalThis.window?.ptmtTabs?.dock;
    // 1. Floating window dropped onto a pane/zone via its dock grip
    if (ctx.pid.startsWith('floating:') && dockCtrl) {
        const containerId = ctx.pid.slice('floating:'.length);
        const effectiveZone = ((!zone || !canSplit) ? 'center' : zone);
        dockCtrl.dockFloatingContainer(containerId, existingTargetPane ?? paneUnder, effectiveZone);
        return;
    }
    // 2. Multi-selected tab group or outer-* edge zone drop
    const groupIds = dockCtrl?.getDragGroupForPanel?.(ctx.pid) ?? [ctx.pid];
    const isOuterZone = Boolean(zone?.startsWith('outer-'));
    if (dockCtrl && (groupIds.length > 1 || (isOuterZone && canSplit))) {
        const effectiveZone = ((!zone || !canSplit) ? 'center' : zone);
        dockCtrl.dockPanelsToTarget(groupIds, existingTargetPane ?? paneUnder, effectiveZone, {
            activePanelId: ctx.pid,
        });
        return;
    }
    const panel = getPanelById(ctx.pid);
    if (!panel)
        return;
    if (existingTargetPane) {
        const targetIndex = existingTargetPane._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length || 0;
        moveTabTransaction({ panel, pane: existingTargetPane, index: targetIndex });
        openTab(panel.dataset.panelId);
        return;
    }
    if (!zone || zone === 'center' || !canSplit) {
        const index = computeDropIndexFromSession(cx, cy);
        moveTabTransaction({ panel, pane: paneUnder, index });
        openTab(panel.dataset.panelId);
        return;
    }
    const vertical = zone === 'left' || zone === 'right' || zone === 'outer-left' || zone === 'outer-right';
    const newFirst = zone === 'left' || zone === 'top' || zone === 'outer-left' || zone === 'outer-top';
    splitPaneWithPane(paneUnder, panel, vertical, newFirst);
    openTab(panel.dataset.panelId);
}
// ─── Tab strip drop ────────────────────────────────────────────────────────────
function handleTabStripDrop(ctx, _ev, performDrop) {
    const dockCtrl = globalThis.window?.ptmtTabs?.dock;
    // Dragging a floating window onto a docked pane's tab bar splits that pane (or fills it if empty)
    if (ctx.pid.startsWith('floating:') && ctx.paneUnder && dragSession) {
        const layers = getPaneLayerCount(ctx.paneUnder);
        const canSplit = !isPaneEmpty(ctx.paneUnder) && layers < MAX_PANE_LAYERS;
        const { vertical, tsRect, paneRect } = dragSession;
        const splitZone = !canSplit
            ? 'center'
            : vertical
                ? (ctx.clientY < tsRect.top + tsRect.height / 2 ? 'top' : 'bottom')
                : (ctx.clientX < tsRect.left + tsRect.width / 2 ? 'left' : 'right');
        if (!performDrop) {
            hideDropIndicator();
            if (splitZone === 'left')
                showSplitPreview(paneRect.left, paneRect.top, paneRect.width * 0.5, paneRect.height);
            else if (splitZone === 'right')
                showSplitPreview(paneRect.left + paneRect.width * 0.5, paneRect.top, paneRect.width * 0.5, paneRect.height);
            else if (splitZone === 'top')
                showSplitPreview(paneRect.left, paneRect.top, paneRect.width, paneRect.height * 0.5);
            else if (splitZone === 'bottom')
                showSplitPreview(paneRect.left, paneRect.top + paneRect.height * 0.5, paneRect.width, paneRect.height * 0.5);
            else if (isPaneEmpty(ctx.paneUnder))
                showSplitPreview(paneRect.left, paneRect.top, paneRect.width, paneRect.height);
            else
                hideSplitPreview();
            return;
        }
        const containerId = ctx.pid.slice('floating:'.length);
        hideDropIndicator();
        hideSplitPreview();
        dockCtrl?.dockFloatingContainer(containerId, ctx.paneUnder, splitZone);
        return;
    }
    const index = computeDropIndexFromSession(ctx.clientX, ctx.clientY);
    if (!performDrop) {
        showDropIndicatorFromSession(index);
        return;
    }
    const groupIds = dockCtrl?.getDragGroupForPanel?.(ctx.pid) ?? [ctx.pid];
    if (dockCtrl && groupIds.length > 1) {
        hideDropIndicator();
        dockCtrl.dockPanelsToTarget(groupIds, ctx.paneUnder, 'center', {
            index,
            activePanelId: ctx.pid,
        });
        return;
    }
    const panel = getPanelById(ctx.pid);
    if (!panel) {
        hideDropIndicator();
        return;
    }
    moveTabTransaction({ panel, pane: ctx.paneUnder, index });
    hideDropIndicator();
    openTab(panel.dataset.panelId);
}
// ─── Drop-indicator ────────────────────────────────────────────────────────────
function computeDropIndexFromSession(clientX, clientY) {
    if (!dragSession || !dragSession.tabRects.length)
        return 0;
    const { tabRects, vertical, reversed } = dragSession;
    const clientPos = vertical ? clientY : clientX;
    for (let i = 0; i < tabRects.length; i++) {
        const r = tabRects[i];
        const mid = vertical ? (r.top + r.height / 2) : (r.left + r.width / 2);
        if (reversed ? (clientPos > mid) : (clientPos < mid))
            return i;
    }
    return tabRects.length;
}
function showDropIndicatorFromSession(index) {
    const refs = getRefs();
    if (!refs.dropIndicator || !dragSession)
        return;
    if (index === lastIndex)
        return;
    lastIndex = index;
    const { vertical, reversed, tsRect, tabRects, mainBodyRect } = dragSession;
    const style = { display: 'block', width: '', height: '', left: '', top: '', transform: '' };
    if (vertical) {
        const top = tabRects.length === 0
            ? (reversed ? tsRect.bottom - 2 : tsRect.top + 2)
            : index >= tabRects.length
                ? (reversed ? tabRects[tabRects.length - 1].top + 2 : tabRects[tabRects.length - 1].bottom - 2)
                : (reversed ? tabRects[index].bottom - 2 : tabRects[index].top - 2);
        Object.assign(style, {
            top: `${top - mainBodyRect.top}px`, left: `${tsRect.left - mainBodyRect.left}px`,
            width: `${tsRect.width}px`, height: '2px', transform: 'translateY(-1px)',
        });
    }
    else {
        const left = tabRects.length === 0
            ? (reversed ? tsRect.right - 2 : tsRect.left + 2)
            : index >= tabRects.length
                ? (reversed ? tabRects[tabRects.length - 1].left + 2 : tabRects[tabRects.length - 1].right - 2)
                : (reversed ? tabRects[index].right - 2 : tabRects[index].left - 2);
        Object.assign(style, {
            left: `${left - mainBodyRect.left}px`, top: `${tsRect.top - mainBodyRect.top}px`,
            height: `${tsRect.height}px`, width: '2px', transform: 'translateX(-1px)',
        });
    }
    Object.assign(refs.dropIndicator.style, style);
}
export const hideDropIndicator = () => {
    const refs = getRefs();
    if (refs.dropIndicator)
        refs.dropIndicator.style.display = 'none';
};
// ─── External Pointer Drag API (used by Floating Window unified bar) ──────────
export function previewExternalDrag(pid, clientX, clientY) {
    currentDraggingPid = pid;
    const elUnder = document.elementFromPoint(clientX, clientY);
    // Ignore floating windows when previewing dock drops onto docked panes
    if (elUnder?.closest?.('.ptmt-floating-window')) {
        hideCompass();
        hideDropIndicator();
        return;
    }
    processDragEvent({
        clientX,
        clientY,
        target: elUnder,
        cancelable: false,
        preventDefault() { },
        dataTransfer: null,
    }, { performDrop: false });
}
export function commitExternalDrop(pid, clientX, clientY) {
    currentDraggingPid = pid;
    const elUnder = document.elementFromPoint(clientX, clientY);
    const overTabStrip = Boolean(elUnder?.closest?.('.ptmt-tabStrip') && !elUnder?.closest?.('.ptmt-floating-window'));
    const hoveredZone = compassHoveredZone ?? getZoneUnderPoint(clientX, clientY);
    const paneUnder = elUnder?.closest?.('.ptmt-pane');
    const isRevealedEmptyColumn = Boolean(paneUnder?.closest?.('.ptmt-column-drag-target'));
    // Only dock a floating window if released on an active compass zone, a docked tab strip, or a revealed empty side column
    if (!overTabStrip && !hoveredZone && !isRevealedEmptyColumn) {
        clearExternalPreview();
        return false;
    }
    processDragEvent({
        clientX,
        clientY,
        target: elUnder,
        cancelable: false,
        preventDefault() { },
        dataTransfer: null,
    }, { performDrop: true });
    clearExternalPreview();
    return true;
}
export function clearExternalPreview() {
    dragSession = null;
    lastIndex = -1;
    currentDraggingPid = null;
    hideCompass();
    hideDropIndicator();
}
// ─── Touch / Pen Pointer Drag Fallback ────────────────────────────────────────
function bindPointerDragFallback(mainBody) {
    const handlePointerDown = (evt) => {
        const event = evt;
        if (event.pointerType === 'mouse' || (event.button && event.button !== 0))
            return;
        const target = event.target;
        if (!target)
            return;
        const tabEl = target.closest?.('.ptmt-tab:not(.ptmt-view-settings)');
        const tabStripOrActions = target.closest?.('.ptmt-tabStrip, .ptmt-tabstrip-actions');
        const pid = tabEl?.dataset.for || null;
        if (!pid && !tabStripOrActions)
            return;
        const startX = event.clientX;
        const startY = event.clientY;
        let dragging = false;
        let longPressFired = false;
        // Long-press right-click fallback for touch screens (especially iOS Safari where contextmenu doesn't fire on divs/buttons)
        const longPressTarget = tabEl || tabStripOrActions;
        const longPressTimer = longPressTarget
            ? setTimeout(() => {
                if (dragging)
                    return;
                longPressFired = true;
                cleanup();
                longPressTarget.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: startX,
                    clientY: startY,
                }));
            }, 550)
            : null;
        const blockTouchScroll = (touchEvt) => {
            if (dragging && touchEvt.cancelable)
                touchEvt.preventDefault();
        };
        const cleanup = () => {
            if (longPressTimer !== null)
                clearTimeout(longPressTimer);
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', onEnd, true);
            document.removeEventListener('pointercancel', onCancel, true);
            document.removeEventListener('touchmove', blockTouchScroll, { capture: true });
        };
        const onMove = (moveEvt) => {
            const move = moveEvt;
            const dist = Math.hypot(move.clientX - startX, move.clientY - startY);
            if (dist > 8 && longPressTimer !== null)
                clearTimeout(longPressTimer);
            if (!pid || longPressFired)
                return;
            if (!dragging) {
                if (dist < 10)
                    return;
                dragging = true;
                currentDraggingPid = pid;
                globalThis.window?.ptmtTabs?.dock?.beginDragReveal?.();
            }
            processDragEvent({
                clientX: move.clientX,
                clientY: move.clientY,
                target: move.target,
                cancelable: true,
                preventDefault() { },
                dataTransfer: null,
            }, { performDrop: false });
        };
        const onEnd = (endEvt) => {
            cleanup();
            if (!dragging || longPressFired)
                return;
            const end = endEvt;
            processDragEvent({
                clientX: end.clientX,
                clientY: end.clientY,
                target: end.target,
                cancelable: true,
                preventDefault() { },
                dataTransfer: null,
            }, { performDrop: true });
            clearDragSession();
        };
        const onCancel = () => {
            cleanup();
            if (dragging)
                clearDragSession();
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onEnd, true);
        document.addEventListener('pointercancel', onCancel, true);
        document.addEventListener('touchmove', blockTouchScroll, { passive: false, capture: true });
    };
    mainBody.addEventListener('pointerdown', handlePointerDown);
    trackListener(mainBody, 'pointerdown', handlePointerDown);
}
// ─── Bootstrap ────────────────────────────────────────────────────────────────
export function enableInteractions() {
    const refs = getRefs();
    if (!refs.mainBody)
        return;
    const mainBody = refs.mainBody;
    const handleDocumentDragStart = (ev) => {
        const target = ev.target;
        const tabEl = target?.closest?.('.ptmt-tab:not(.ptmt-view-settings)');
        if (tabEl) {
            currentDraggingPid = tabEl.dataset.for || null;
            globalThis.window?.ptmtTabs?.dock?.beginDragReveal?.();
        }
    };
    document.addEventListener('dragstart', handleDocumentDragStart);
    trackListener(document, 'dragstart', handleDocumentDragStart);
    const handleDocumentDragOver = (ev) => {
        const dragEv = ev;
        dragEv.preventDefault();
        try {
            if (dragEv.dataTransfer)
                dragEv.dataTransfer.dropEffect = 'move';
        }
        catch { }
    };
    document.addEventListener('dragover', handleDocumentDragOver);
    trackListener(document, 'dragover', handleDocumentDragOver);
    // Throttle only the heavy path (pane-switch detection → getBoundingClientRect).
    // Zone highlight on same pane escapes the throttle via the early-return in processDragEvent.
    const throttledProcessDrag = throttle((ev) => processDragEvent(ev, { performDrop: false }), 16);
    mainBody.addEventListener('dragover', throttledProcessDrag);
    trackListener(mainBody, 'dragover', throttledProcessDrag);
    const handleMainBodyDrop = (ev) => {
        processDragEvent(ev, { performDrop: true });
        clearDragSession();
    };
    mainBody.addEventListener('drop', handleMainBodyDrop);
    trackListener(mainBody, 'drop', handleMainBodyDrop);
    const handleMainBodyDragLeave = (ev) => {
        const e = ev;
        const related = e.relatedTarget;
        if (related && mainBody.contains(related))
            return;
        // Ignore synthetic (0,0) dragleave fires; only hide visuals when truly outside mainBody
        if (e.clientX === 0 && e.clientY === 0 && related !== null)
            return;
        setTimeout(() => {
            const r = mainBody.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right
                && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) {
                hideDropIndicator();
                hideCompass();
            }
        }, 50);
    };
    mainBody.addEventListener('dragleave', handleMainBodyDragLeave);
    trackListener(mainBody, 'dragleave', handleMainBodyDragLeave);
    document.addEventListener('dragend', clearDragSession);
    trackListener(document, 'dragend', clearDragSession);
    bindPointerDragFallback(mainBody);
}
//# sourceMappingURL=drag-drop.js.map