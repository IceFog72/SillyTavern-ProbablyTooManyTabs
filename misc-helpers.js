// misc-helpers.js

import { isElement, registerBodyObserver } from './utils.js';
import { SELECTORS } from './constants.js';

/**
 * Deprecated compatibility shim. PTMT must not remove SillyTavern's shared html
 * mousedown/touchstart handler because it also owns unrelated popup behavior.
 */
export function removeMouseDownDrawerHandler() {
  return false;
}

let drawerUnregister = null;

/**
 * Watches for drawers being closed and immediately re-opens them.
 * Uses the unified body observer for efficiency.
 */
export function initDrawerObserver() {
  if (drawerUnregister) {
    drawerUnregister();
    drawerUnregister = null;
  }

  drawerUnregister = registerBodyObserver(
    'drawer-observer',
    { attributes: true, attributeFilter: ['class'] },
    (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.nodeType === 1 && target.classList.contains(SELECTORS.ST_DRAWER_CLOSED.substring(1))) {
            target.classList.remove(SELECTORS.ST_DRAWER_CLOSED.substring(1));
            target.classList.add(SELECTORS.ST_DRAWER_OPEN.substring(1));
          }
        }
      }
    }
  );
}

export function cleanupDrawerObserver() {
  drawerUnregister?.();
  drawerUnregister = null;
}

export function openAllDrawersJq(context = document) {
  try {
    if (window.jQuery && jQuery) {
      return jQuery(context).find(SELECTORS.ST_DRAWER_CLOSED).not(SELECTORS.ST_DRAWER_OPEN).removeClass(SELECTORS.ST_DRAWER_CLOSED.substring(1)).addClass(SELECTORS.ST_DRAWER_OPEN.substring(1)).length;
    }
    const rootEl = isElement(context) ? context : document;
    let changed = 0;
    rootEl.querySelectorAll(SELECTORS.ST_DRAWER_CLOSED).forEach(e => {
      if (!e.classList.contains(SELECTORS.ST_DRAWER_OPEN.substring(1))) {
        e.classList.remove(SELECTORS.ST_DRAWER_CLOSED.substring(1));
        e.classList.add(SELECTORS.ST_DRAWER_OPEN.substring(1));
        changed++;
      }
    });
    return changed;
  } catch {
    return 0;
  }
}

export function moveBg1ToSheld() {
  const bg1 = document.getElementById('bg1');
  const sheld = document.getElementById('sheld');
  if (bg1 && sheld) {
    sheld.appendChild(bg1);
    return true;
  }
  return false;
}

export function moveBg1BackToPtmtMain() {
  const bg1 = document.getElementById('bg1');
  const ptmtMain = document.getElementById('ptmt-main');
  if (bg1 && ptmtMain) {
    ptmtMain.appendChild(bg1);
    return true;
  }
  return false;
}

/** Moves specified elements to the #movingDivs container. */
export function moveToMovingDivs(ids = ['expression-plus-wrapper']) {
  if (!document?.body) return [];
  let movingDivs = document.querySelector(SELECTORS.ST_MOVING_DIVS);
  if (!movingDivs) {
    movingDivs = document.createElement('div');
    movingDivs.id = SELECTORS.ST_MOVING_DIVS.split(',')[0].trim().substring(1);
    document.body.appendChild(movingDivs);
  }

  const found = ids.map(id => document.getElementById(id)).filter(Boolean);
  found.forEach(eln => {
    if (eln.parentElement !== movingDivs) movingDivs.appendChild(eln);
  });
  return found;
}

/**
 * Legacy helper retained for API compatibility. New PTMT code does not use it.
 */
export function overrideDelegatedEventHandler(eventType, selector, findFunction, newHandler) {
  if (!window.jQuery || !jQuery._data) return;
  try {
    const delegatedEvents = jQuery._data(document, 'events');
    if (!delegatedEvents || !delegatedEvents[eventType]) return;
    const handlerToRemove = delegatedEvents[eventType]
      .find(handler => handler.selector === selector && findFunction(handler.handler.toString()))?.handler;
    if (handlerToRemove) {
      jQuery(document).off(eventType, selector, handlerToRemove);
      jQuery(document).on(eventType, selector, newHandler);
    }
  } catch (e) {
    console.error('[PTMT] Error while overriding event handler:', e);
  }
}

// ── public API ───────────────────────────────────────────────
