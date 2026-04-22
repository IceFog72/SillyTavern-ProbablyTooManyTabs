// utils.js
import { SELECTORS, LAYOUT } from './constants.js';


let _refs = null;

export const isElement = (v) => v && (v.nodeType === 1 || v === document);

/**
 * Convert hex8 (#RRGGBBAA) or hex6 (#RRGGBB) to rgba() format
 * Ensures alpha channel is properly applied in CSS
 * @param {string} hex - Hex color with optional alpha (#RRGGBBAA or #RRGGBB)
 * @returns {string} - rgba(r, g, b, a) format or empty string
 */
export function hexToRgba(hex) {
    if (!hex || typeof hex !== 'string') return '';
    
    hex = hex.replace('#', '');
    
    // Handle 8-char hex (with alpha)
    if (hex.length === 8) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const a = parseInt(hex.substring(6, 8), 16) / 255;
        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
    
    // Handle 6-char hex (no alpha)
    if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 1)`;
    }
    
    return '';
}

// Moved here to prevent circular dependency cycles between layout.js and pane.js
export function getRefs() {
    if (_refs) {
        const ok = _refs.main && document.querySelector(SELECTORS.MAIN) === _refs.main && _refs.centerBody && document.querySelector(SELECTORS.CENTER_BODY) === _refs.centerBody;
        if (ok) return _refs;
        _refs = null;
    }
    _refs = {
        main: document.querySelector(SELECTORS.MAIN),
        mainBody: document.querySelector(SELECTORS.MAIN_BODY),
        leftBody: document.querySelector(SELECTORS.LEFT_BODY),
        centerBody: document.querySelector(SELECTORS.CENTER_BODY),
        rightBody: document.querySelector(SELECTORS.RIGHT_BODY),
        dropIndicator: document.querySelector(SELECTORS.DROP_INDICATOR),
        splitOverlay: document.querySelector(SELECTORS.SPLIT_OVERLAY)
    };
    return _refs;
}

export const getPanelById = pid => document.querySelector(`[data-panel-id="${CSS.escape(pid)}"]`);
export const getTabById = pid => document.querySelector(`.ptmt-tab[data-for="${CSS.escape(pid)}"]`);

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle(func, wait) {
    let context, args, result;
    let timeout = null;
    let previous = 0;
    const later = function () {
        previous = Date.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
    };
    return function () {
        const now = Date.now();
        if (!previous) previous = now;
        const remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            result = func.apply(context, args);
            if (!timeout) context = args = null;
        } else if (!timeout) {
            timeout = setTimeout(later, remaining);
        }
        return result;
    };
}

export const qs = (sel, root = document) => (isElement(sel) || sel === document ? sel : sel ? (root || document).querySelector(sel) : null);
export const $$ = (sel, root = document) => sel ? Array.from((root || document).querySelectorAll(sel)) : [];

export const el = (tag, props = {}, ...children) => {
    const n = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (k === 'style') {
                if (typeof v === 'object' && v !== null) { Object.assign(n.style, v); }
                else if (typeof v === 'string') { n.style.cssText += v.trim().endsWith(';') ? v : `${v.trim()};`; }
            } else if (k === 'dataset' && typeof v === 'object') { Object.assign(n.dataset, v); }
            else if (k in n && k !== 'dataset') { n[k] = v; }
            else { n.setAttribute(k, v); }
        }
    }
    if (children) {
        children.flat().forEach(c => c != null && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    }
    return n;
};

export const getSplitOrientation = (splitEl) => splitEl?.classList.contains('horizontal') ? 'horizontal' : 'vertical';
export const getPanelBySourceId = (id) => document.querySelector(`.ptmt-panel[data-source-id="${CSS.escape(id)}"]`);

export function getElementDepth(element) {
    let depth = 0;
    let current = element.parentElement;
    while (current) {
        if (current.classList?.contains('ptmt-split')) {
            depth++;
        }
        current = current.parentElement;
    }
    return depth;
}


export function createIconElement(icon, className = 'ptmt-tab-icon') {
    if (!icon) return null;
    const iconEl = document.createElement('span');
    iconEl.className = className;
    if (icon.startsWith('fa-')) {
        iconEl.classList.add('fa-solid');
        iconEl.classList.add(...icon.split(' '));
    } else {
        iconEl.textContent = icon;
    }
    return iconEl;
}

export const defaultViewSettings = {
    minimalPanelSize: 250,
    defaultOrientation: 'auto',
    collapsedOrientation: 'auto',
    contentFlow: 'default',
    iconOnly: false,
};

export function readPaneViewSettings(pane) {
    try {
        if (!pane) return { ...defaultViewSettings };
        if (pane._viewSettingsCache) return pane._viewSettingsCache;

        const raw = pane.dataset.viewSettings;
        if (!raw) {
            pane._viewSettingsCache = { ...defaultViewSettings };
            return pane._viewSettingsCache;
        }

        pane._viewSettingsCache = { ...defaultViewSettings, ...JSON.parse(raw) };
        return pane._viewSettingsCache;
    } catch {
        return { ...defaultViewSettings };
    }
}

export function writePaneViewSettings(pane, newPaneSettings) {
    try {
        const currentSettings = readPaneViewSettings(pane);
        const updated = { ...defaultViewSettings, ...currentSettings, ...newPaneSettings };
        pane.dataset.viewSettings = JSON.stringify(updated);
        pane._viewSettingsCache = updated;
    } catch (e) {
        console.warn('[PTMT] Failed to write pane view settings to dataset:', e);
    }
}

// --- Move calculateElementMinWidth here to break circular dependency ---

const minWidthCache = new WeakMap();

export function invalidateMinWidthCache(element) {
    if (!element) return;
    minWidthCache.delete(element);
    if (element.parentElement) invalidateMinWidthCache(element.parentElement);
}

export function calculateElementMinWidth(element) {
    if (!element) return 0;
    if (minWidthCache.has(element)) return minWidthCache.get(element);

    let minWidth = 0;
    if (element.classList.contains(SELECTORS.PANE.substring(1))) {
        const vs = readPaneViewSettings(element);
        minWidth = Number(vs.minimalPanelSize) || LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;
    } else if (element.classList.contains(SELECTORS.SPLIT.substring(1))) {
        const children = Array.from(element.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
        const resizers = Array.from(element.children).filter(c => c.tagName === 'SPLITTER');

        if (element.classList.contains('horizontal')) {
            let maxMinWidth = 0;
            children.forEach(child => maxMinWidth = Math.max(maxMinWidth, calculateElementMinWidth(child)));
            minWidth = maxMinWidth;
        } else {
            let totalMinWidth = 0;
            children.forEach(child => totalMinWidth += calculateElementMinWidth(child));
            resizers.forEach(resizer => {
                const width = resizer.classList.contains('disabled') ? 0 : 6;
                totalMinWidth += width;
            });
            minWidth = totalMinWidth;
        }
    }

    minWidthCache.set(element, minWidth);
    return minWidth;
}

export function clearDropIndicators(element) {
    if (!element) return;
    element.querySelectorAll(SELECTORS.DROP_INDICATOR_CLASS).forEach(i => i.remove());
}

// ─── Observer & Listener Lifecycle Tracking ──────────────────────────────────

const trackedObservers = [];
const trackedListeners = [];

/**
 * Registers an observer (MutationObserver, ResizeObserver, etc.) for cleanup.
 * Returns the observer for chaining: `trackObserver(new MutationObserver(fn))`.
 */
export function trackObserver(observer) {
    trackedObservers.push(observer);
    return observer;
}

/**
 * Registers a window/document event listener for cleanup.
 * { target, event, handler, options }
 */
export function trackListener(target, event, handler, options) {
    trackedListeners.push({ target, event, handler, options });
}

/**
 * Disconnects all tracked observers and removes all tracked listeners.
 * Call from the extension's disable/destroy lifecycle hook.
 */
export function cleanupAllObservers() {
    trackedObservers.forEach(obs => {
        try { obs.disconnect(); } catch { /* already disconnected */ }
    });
    trackedObservers.length = 0;

    trackedListeners.forEach(({ target, event, handler, options }) => {
        try { target.removeEventListener(event, handler, options); } catch { /* already removed */ }
    });
    trackedListeners.length = 0;

    // Also clean up the unified body observer
    cleanupBodyObserver();
}

// ─── Unified Body MutationObserver ────────────────────────────────────────────
// Multiple features observe document.body with subtree:true. Instead of N
// separate observers all firing on every DOM mutation, we use one observer
// with a dispatcher that routes mutations to registered handlers.
//
// OPTIMIZATION: Mutations are batched and debounced per-handler to avoid
// thrashing the UI thread on rapid DOM changes. Handlers are only invoked
// when they have relevant mutations (early exit for uninterested handlers).

let bodyObserver = null;
let bodyObserverStarted = false;
const bodyHandlers = new Map(); // id → { filter, callback, pendingMutations, debounceTimer }

/**
 * Registers a handler with the unified body MutationObserver.
 * @param {string} id - Unique ID for this handler (used for removal)
 * @param {object} filter - MutationObserverInit options (attributes/childList/subtree/etc)
 * @param {function} callback - Called with filtered mutations (batched & debounced)
 * @returns {function} Unregister function
 */
export function registerBodyObserver(id, filter, callback) {
    const handler = { filter, callback, pendingMutations: [], debounceTimer: null };
    bodyHandlers.set(id, handler);

    // Lazy-start the observer on first registration
    if (bodyObserverStarted && bodyObserver) {
        // Already observing — handler will be picked up on next mutation
    } else if (document.body) {
        startBodyObserver();
    }

    return () => {
        const h = bodyHandlers.get(id);
        if (h?.debounceTimer) clearTimeout(h.debounceTimer);
        bodyHandlers.delete(id);
    };
}

function startBodyObserver() {
    if (bodyObserverStarted) return;

    bodyObserver = new MutationObserver((mutations) => {
        // Early exit: if no handlers, don't process
        if (bodyHandlers.size === 0) return;

        // Quick scan: do ANY handlers care about these mutations?
        const hasChildList = mutations.some(m => m.type === 'childList');
        const hasAttributes = mutations.some(m => m.type === 'attributes');
        
        if (!hasChildList && !hasAttributes) return;

        // Route mutations to interested handlers
        for (const [id, handler] of bodyHandlers) {
            const { filter, callback, pendingMutations } = handler;

            // Skip if handler doesn't care about these mutation types
            if (!filter.childList && !filter.attributes) continue;

            try {
                // Accumulate relevant mutations for this handler
                const relevant = mutations.filter(m => {
                    if (filter.childList && m.type === 'childList') return true;
                    if (filter.attributes && m.type === 'attributes') {
                        if (filter.attributeFilter?.length > 0 && !filter.attributeFilter.includes(m.attributeName)) return false;
                        return true;
                    }
                    return false;
                });

                if (relevant.length > 0) {
                    pendingMutations.push(...relevant);

                    // Debounce callback: batch mutations before firing
                    if (handler.debounceTimer) clearTimeout(handler.debounceTimer);
                    handler.debounceTimer = setTimeout(() => {
                        try {
                            if (pendingMutations.length > 0) {
                                callback(pendingMutations.splice(0));
                            }
                        } catch (e) {
                            console.warn(`[PTMT] Body observer handler '${id}' callback error:`, e);
                        }
                        handler.debounceTimer = null;
                    }, 16); // ~60fps throttle
                }
            } catch (e) {
                console.warn(`[PTMT] Body observer handler '${id}' filter error:`, e);
            }
        }
    });

    bodyObserver.observe(document.body, {
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: true,
    });

    bodyObserverStarted = true;
}

function cleanupBodyObserver() {
    if (bodyObserver) {
        bodyObserver.disconnect();
        bodyObserver = null;
    }
    // Clean up any pending debounce timers
    for (const handler of bodyHandlers.values()) {
        if (handler.debounceTimer) {
            clearTimeout(handler.debounceTimer);
            handler.debounceTimer = null;
        }
    }
    bodyObserverStarted = false;
    bodyHandlers.clear();
}

