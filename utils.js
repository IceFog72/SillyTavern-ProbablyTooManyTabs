// utils.js

export const isElement = (v) => v && (v.nodeType === 1 || v === document);

export const getPanelById = pid => document.querySelector(`[data-panel-id="${CSS.escape(pid)}"]`);
export const getTabById = pid => document.querySelector(`.sftnt-tab[data-for="${CSS.escape(pid)}"]`);

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
    const later = function() {
        previous = Date.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
    };
    return function() {
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
export const getPanelBySourceId = (id) => document.querySelector(`.sftnt-panel[data-source-id="${CSS.escape(id)}"]`);

export function getElementDepth(element) {
    let depth = 0;
    let current = element.parentElement;
    while (current) {
        if (current.classList?.contains('sftnt-split')) {
            depth++;
        }
        current = current.parentElement;
    }
    return depth;
}

export function setFlexBasisPercent(elem, percent) {
    const clampedPercent = Math.max(0, Math.min(100, percent));

    const isResizable = elem?.classList.contains('sftnt-pane') || elem?.classList.contains('sftnt-split') || elem?.classList.contains('sftnt-body-column');
    const isCollapsed = elem?.classList.contains('view-collapsed') || elem?.classList.contains('sftnt-container-collapsed');

    if (isResizable && !isCollapsed) {
        try {
            // UNIFIED LOGIC: All resizable elements should be able to grow and shrink from their basis.
            elem.style.flex = `1 1 ${clampedPercent.toFixed(4)}%`;
        } catch {
            // Also apply the unified logic to the fallback for older browsers.
            Object.assign(elem.style, {
                flexBasis: `${clampedPercent.toFixed(4)}%`,
                flexGrow: '1',
                flexShrink: '1'
            });
        }
    }
}