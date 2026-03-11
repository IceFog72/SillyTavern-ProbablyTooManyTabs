// utils.js
import { SELECTORS, LAYOUT } from './constants.js';


let _refs = null;

export const isElement = (v) => v && (v.nodeType === 1 || v === document);

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

export const $ = (sel, root = document) => (isElement(sel) || sel === document ? sel : sel ? (root || document).querySelector(sel) : null);
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
        iconEl.classList.add(icon);
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
    element.querySelectorAll('.drop-indicator').forEach(i => i.remove());
}


