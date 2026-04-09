// misc-helpers.js

import { isElement, registerBodyObserver } from './utils.js';
import { SELECTORS } from './constants.js';

/**
 * Removes SillyTavern's drawer mousedown handler.
 * NOTE: Uses jQuery._data() which is a private API. This is a best-effort
 * approach — if jQuery is unavailable or the API changes, it silently degrades.
 */
export function removeMouseDownDrawerHandler() {
  try {
    // Guard: jQuery._data is a private API removed in jQuery 4.x
    if (window.jQuery && typeof jQuery._data === 'function') {
      const evs = jQuery._data(document.documentElement, 'events') || {};
      ['touchstart', 'mousedown'].forEach(type => {
        const handlersToRemove = (evs[type] || []).filter(h => {
          const src = h?.handler?.toString() || '';
          return src.includes('isExportPopupOpen') && src.includes('exportPopper.update');
        });

        handlersToRemove.forEach(h => {
          jQuery('html').off(type, h.handler);
        });
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

let drawerUnregister = null;

/**
 * Watches for drawers being closed and immediately re-opens them.
 * Uses the unified body observer for efficiency.
 */
export function initDrawerObserver() {
  // Clean up previous registration
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

  console.log('[PTMT] Drawer state observer initialized.');
}

export function cleanupDrawerObserver() {
  if (drawerUnregister) {
    drawerUnregister();
    drawerUnregister = null;
    console.log('[PTMT] Drawer state observer cleaned up.');
  }
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
    console.log('[PTMT] Moved bg1 to inside #sheld as last item');
    return true;
  }
  return false;
}

export function moveBg1BackToPtmtMain() {
  const bg1 = document.getElementById('bg1');
  const ptmtMain = document.getElementById('ptmt-main');
  if (bg1 && ptmtMain) {
    ptmtMain.appendChild(bg1);
    console.log('[PTMT] Moved bg1 back to under #ptmt-main');
    return true;
  }
  return false;
}

export function moveBgDivs(ids = ['bg_custom', 'bg1']) {
  if (!document?.body) return [];
  // Background div repositioning is currently disabled.
  return [];
}

/**
 * Moves specified elements to the #movingDivs container.
 * @param {string[]} ids List of element IDs to move.
 */
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
    if (eln.parentElement !== movingDivs) {
      console.log(`[PTMT] Moving ${eln.id} to ${SELECTORS.ST_MOVING_DIVS}`);
      movingDivs.appendChild(eln);
    }
  });
  return found;
}

export function overrideDelegatedEventHandler(eventType, selector, findFunction, newHandler) {
  if (!window.jQuery || !jQuery._data) {
    console.warn('[PTMT] Cannot override event handler: jQuery or jQuery._data not available.');
    return;
  }

  try {
    const delegatedEvents = jQuery._data(document, 'events');
    if (!delegatedEvents || !delegatedEvents[eventType]) {
      return;
    }

    const handlersForType = delegatedEvents[eventType];
    let handlerToRemove = null;

    for (const handler of handlersForType) {

      if (handler.selector === selector && findFunction(handler.handler.toString())) {
        handlerToRemove = handler.handler;
        break;
      }
    }

    if (handlerToRemove) {
      console.log(`[PTMT] Overriding delegated '${eventType}' event on selector '${selector}'.`);

      jQuery(document).off(eventType, selector, handlerToRemove);


      jQuery(document).on(eventType, selector, newHandler);
    }
  } catch (e) {
    console.error('[PTMT] Error while overriding event handler:', e);
  }
}

// ── public API ───────────────────────────────────────────────
