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

function hexToLuminance(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length !== 6) return 0;
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function sortColorsByLightness(hexColors) {
    return [...hexColors].sort((a, b) => hexToLuminance(a) - hexToLuminance(b));
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

// ─── Color extraction from images ─────────────────────────────────────────
// Adapted from theme-creator.js — k-means clustering in CIELAB space

const DEFAULT_RGB = [225, 138, 36]; // Orange

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function rgbToLab({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    r *= 100; g *= 100; b *= 100;
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
    const fx = x / 95.047 > 0.008856 ? Math.pow(x / 95.047, 1/3) : (7.787 * x / 95.047) + 16/116;
    const fy = y / 100.000 > 0.008856 ? Math.pow(y / 100.000, 1/3) : (7.787 * y / 100.000) + 16/116;
    const fz = z / 108.883 > 0.008856 ? Math.pow(z / 108.883, 1/3) : (7.787 * z / 108.883) + 16/116;
    return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToRgb({ l, a, b }) {
    let y = (l + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;
    const x3 = Math.pow(x, 3), y3 = Math.pow(y, 3), z3 = Math.pow(z, 3);
    x = x3 > 0.008856 ? x3 : (x - 16/116) / 7.787;
    y = y3 > 0.008856 ? y3 : (y - 16/116) / 7.787;
    z = z3 > 0.008856 ? z3 : (z - 16/116) / 7.787;
    x *= 95.047; y *= 100.000; z *= 108.883;
    let r = (x * 3.2404542 + y * -1.5371385 + z * -0.4985314) / 100;
    let g = (x * -0.9692660 + y * 1.8760108 + z * 0.0415560) / 100;
    let b2 = (x * 0.0556434 + y * -0.2040259 + z * 1.0572252) / 100;
    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : r * 12.92;
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : g * 12.92;
    b2 = b2 > 0.0031308 ? 1.055 * Math.pow(b2, 1/2.4) - 0.055 : b2 * 12.92;
    return [Math.max(0, Math.min(255, Math.round(r * 255))), Math.max(0, Math.min(255, Math.round(g * 255))), Math.max(0, Math.min(255, Math.round(b2 * 255)))];
}

function distanceLab(lab1, lab2) {
    return Math.sqrt(Math.pow(lab1.l - lab2.l, 2) + Math.pow(lab1.a - lab2.a, 2) + Math.pow(lab1.b - lab2.b, 2));
}

function kmeans(colors, k, maxIterations = 20) {
    const n = colors.length;
    k = Math.min(k, n);
    if (k < 1) return [];
    const labs = colors.map(c => rgbToLab(c));
    let centroids = colors.slice(0, k).map(c => rgbToLab(c));
    let finalCounts = new Array(k).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
        const assignments = new Array(n).fill(0);
        const sums = Array.from({ length: k }, () => ({ l: 0, a: 0, b: 0, count: 0 }));

        for (let i = 0; i < n; i++) {
            const lab = labs[i];
            let minDist = Infinity;
            for (let j = 0; j < k; j++) {
                const dist = distanceLab(lab, centroids[j]);
                if (dist < minDist) { minDist = dist; assignments[i] = j; }
            }
            sums[assignments[i]].l += lab.l;
            sums[assignments[i]].a += lab.a;
            sums[assignments[i]].b += lab.b;
            sums[assignments[i]].count++;
        }

        finalCounts = sums.map(s => s.count);

        let changed = false;
        for (let j = 0; j < k; j++) {
            if (sums[j].count > 0) {
                const newCentroid = { l: sums[j].l / sums[j].count, a: sums[j].a / sums[j].count, b: sums[j].b / sums[j].count };
                if (distanceLab(newCentroid, centroids[j]) > 0.1) changed = true;
                centroids[j] = newCentroid;
            }
        }
        if (!changed) break;
    }

    const indexed = centroids.map((c, i) => ({ centroid: c, size: finalCounts[i] }));
    indexed.sort((a, b) => b.size - a.size);

    return indexed.map(item => labToRgb(item.centroid));
}

/**
 * Extract dominant colors from an image element using k-means in LAB space.
 * @param {HTMLImageElement} img - The image element to extract from
 * @param {number} [numColors=5] - Number of dominant colors to extract
 * @returns {string[]} Array of hex color strings (e.g. ["#e18a24", ...])
 */
export function extractColorsFromImage(img, numColors = 5) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return [rgbToHex(DEFAULT_RGB)];

        const MAX_DIM = 100;
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h, 1);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const pixelCount = canvas.width * canvas.height;

        const colors = [];
        let greyR = 0, greyG = 0, greyB = 0, greyCount = 0;

        for (let i = 0; i < pixelCount; i++) {
            const off = i * 4;
            const r = data[off];
            const g = data[off + 1];
            const b = data[off + 2];
            const a = data[off + 3];

            if (a < 128) continue;
            if (r > 250 && g > 250 && b > 250) continue;
            if (r < 5 && g < 5 && b < 5) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const chroma = max - min;

            if (max === 0 || chroma * 10 < max) {
                greyR += r; greyG += g; greyB += b; greyCount++;
                continue;
            }

            const luma = r + g + b;
            if (luma < 76 || luma > 688) continue;

            colors.push({ r, g, b });
        }

        if (colors.length === 0) {
            if (greyCount > 0) {
                return [rgbToHex([Math.round(greyR / greyCount), Math.round(greyG / greyCount), Math.round(greyB / greyCount)])];
            }
            return [rgbToHex(DEFAULT_RGB)];
        }

        const step = Math.max(1, Math.floor(colors.length / 10000));
        const sampled = step > 1 ? colors.filter((_, i) => i % step === 0) : colors;

        const k = Math.min(numColors, sampled.length);
        const centroids = kmeans(sampled, k);

        if (centroids.length > 0) return centroids.map(rgb => rgbToHex(rgb));
        return [rgbToHex(DEFAULT_RGB)];
    } catch (e) {
        console.error('[PTMT] Color extraction failed:', e);
        return [rgbToHex(DEFAULT_RGB)];
    }
}

