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
  const found = ids.map(id => document.getElementById(id)).filter(Boolean);
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
      } catch { }
    }
  });
  return found;
}