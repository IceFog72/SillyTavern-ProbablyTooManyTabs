// misc-helpers.js

import { isElement } from './utils.js';

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
      return jQuery(context).find('.closedDrawer').not('.openDrawer').removeClass('closedDrawer').addClass('openDrawer').length;
    }
    const rootEl = isElement(context) ? context : document;
    let changed = 0;
    rootEl.querySelectorAll('.closedDrawer').forEach(e => {
      if (!e.classList.contains('openDrawer')) {
        e.classList.remove('closedDrawer');
        e.classList.add('openDrawer');
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
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.nodeType === 1 && target.classList.contains('closedDrawer')) {
                    target.classList.remove('closedDrawer');
                    target.classList.add('openDrawer');
                }
            }
        }
    });

    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    console.log('[PTMT] Drawer state observer initialized.');
    return observer;
}

/*
export function hideTemplatesAndPopupsWrapper() {
    try {
        const wrapper = document.querySelector('div[name="templatesAndPopupsWrapper"]');
        if (wrapper) {
            wrapper.style.cssText += 'display: none !important;';
            console.log('[PTMT] Hid templatesAndPopupsWrapper.');
            return true;
        }
        return false;
    } catch (e) {
        console.error('[PTMT] Error hiding templatesAndPopupsWrapper:', e);
        return false;
    }
}*/