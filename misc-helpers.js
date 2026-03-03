// misc-helpers.js

import { isElement } from './utils.js';
import { SELECTORS } from './constants.js';

let drawerObserver = null;

export function removeMouseDownDrawerHandler() {
  try {
    if (window.jQuery && jQuery && jQuery._data) {
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

export function moveBgDivs(ids = ['bg_custom', 'bg1']) {
  if (!document?.body) return [];
  /*const found = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (!found.length) return [];
  const mainEl = document.getElementById('ptmt-main');
  const insertBeforeNode = mainEl || document.body.firstChild;
  found.reverse().forEach(eln => {
    if (eln.parentElement !== document.body) document.body.appendChild(eln);
    try {
      document.body.insertBefore(eln, insertBeforeNode);
    } catch {
      try {
        document.body.appendChild(eln);
      } catch (e) {
  console.warn('[PTMT] Failed :', e);
}
    }
  });
  return found;*/
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

      $(document).off(eventType, selector, handlerToRemove);


      $(document).on(eventType, selector, newHandler);
    }
  } catch (e) {
    console.error('[PTMT] Error while overriding event handler:', e);
  }
}

/**
 * Watches for drawers being closed and immediately re-opens them.
 */
export function initDrawerObserver() {
  // Disconnect existing observer to prevent memory leaks
  if (drawerObserver) {
    drawerObserver.disconnect();
    drawerObserver = null;
  }

  drawerObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.nodeType === 1 && target.classList.contains(SELECTORS.ST_DRAWER_CLOSED.substring(1))) {
          target.classList.remove(SELECTORS.ST_DRAWER_CLOSED.substring(1));
          target.classList.add(SELECTORS.ST_DRAWER_OPEN.substring(1));
        }
      }
    }
  });

  drawerObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  console.log('[PTMT] Drawer state observer initialized.');
  return drawerObserver;
}

export function cleanupDrawerObserver() {
  if (drawerObserver) {
    drawerObserver.disconnect();
    drawerObserver = null;
    console.log('[PTMT] Drawer state observer cleaned up.');
  }
}
