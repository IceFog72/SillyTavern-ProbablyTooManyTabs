import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

export async function loadModule(file, imports, globals = {}) {
    const context = createContext({ console, ...globals });
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const module = new SourceTextModule(source, { context, identifier: file });
    await module.link(specifier => {
        const values = imports[specifier];
        if (!values) throw new Error(`Missing test dependency: ${specifier}`);
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

export function scheduler() {
    let nextId = 1;
    const pending = new Map();
    return {
        pending,
        set(callback) { const id = nextId++; pending.set(id, callback); return id; },
        clear(id) { pending.delete(id); },
        flush() {
            const callbacks = [...pending.values()];
            pending.clear();
            callbacks.forEach(callback => callback());
        },
    };
}

// Minimal DOM for module fixtures: tree edits, simple selectors, listeners.
// Selectors: comma lists, descendant combinators, tag, #id, .class,
// [attr] / [attr="value"] and :not(<simple>).
function parseCompound(text) {
    const parts = [];
    const re = /:not\(([^)]*)\)|\[([\w-]+)(?:="([^"]*)")?\]|#([\w-]+)|\.([\w-]+)|([\w-]+|\*)/g;
    let match;
    while ((match = re.exec(text))) {
        if (match[1] !== undefined) parts.push({ not: parseCompound(match[1]) });
        else if (match[2] !== undefined) parts.push({ attr: match[2], value: match[3] });
        else if (match[4] !== undefined) parts.push({ id: match[4] });
        else if (match[5] !== undefined) parts.push({ cls: match[5] });
        else if (match[6] !== '*') parts.push({ tag: match[6].toUpperCase() });
    }
    return parts;
}

function matchesCompound(node, parts) {
    return parts.every(part => {
        if (part.not) return !matchesCompound(node, part.not);
        if (part.tag) return node.tagName === part.tag;
        if (part.id) return node.id === part.id;
        if (part.cls) return node.classList.contains(part.cls);
        const value = node.getAttribute(part.attr);
        return part.value === undefined ? value !== null : value === part.value;
    });
}

function matchesComplex(node, chain) {
    if (!matchesCompound(node, chain.at(-1))) return false;
    let index = chain.length - 2;
    for (let ancestor = node.parentElement; ancestor && index >= 0; ancestor = ancestor.parentElement) {
        if (matchesCompound(ancestor, chain[index])) index--;
    }
    return index < 0;
}

const parseSelector = selector => selector.split(',').map(part => part.trim().split(/\s+/).map(parseCompound));

export class FakeElement {
    constructor(tag = 'div', { id = '', className = '', dataset = {}, attrs = {} } = {}) {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this._classes = new Set();
        this.className = className;
        this.dataset = { ...dataset };
        this.attrs = { ...attrs };
        this.style = {};
        this.children = [];
        this.parentElement = null;
        this.listeners = new Map();
        this.rect = { top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 };
        const classes = this._classes;
        this.classList = {
            contains: value => classes.has(value),
            add: (...items) => items.forEach(value => classes.add(value)),
            remove: (...items) => items.forEach(value => classes.delete(value)),
            toggle(value, force = !classes.has(value)) { force ? classes.add(value) : classes.delete(value); return force; },
        };
    }
    get className() { return [...this._classes].join(' '); }
    set className(value) { this._classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => this._classes.add(name)); }
    get isConnected() { let node = this; while (node.parentElement) node = node.parentElement; return !!node.isDocumentRoot; }
    get firstElementChild() { return this.children[0] || null; }
    get previousElementSibling() { const s = this.parentElement?.children; return s ? s[s.indexOf(this) - 1] || null : null; }
    get nextElementSibling() { const s = this.parentElement?.children; return s ? s[s.indexOf(this) + 1] || null : null; }
    getAttribute(name) {
        if (name === 'id') return this.id || null;
        if (name === 'class') return this.className;
        if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            return this.dataset[key] ?? null;
        }
        return this.attrs[name] ?? null;
    }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    _detach() { if (this.parentElement) { const s = this.parentElement.children; s.splice(s.indexOf(this), 1); this.parentElement = null; } }
    append(...nodes) { for (const node of nodes) { node._detach(); node.parentElement = this; this.children.push(node); } }
    appendChild(node) { this.append(node); return node; }
    prepend(...nodes) { for (const node of nodes.reverse()) { node._detach(); node.parentElement = this; this.children.unshift(node); } }
    insertBefore(node, ref) { if (!ref) return this.appendChild(node); node._detach(); node.parentElement = this; this.children.splice(this.children.indexOf(ref), 0, node); return node; }
    before(node) { this.parentElement.insertBefore(node, this); }
    after(node) { this.parentElement.insertBefore(node, this.nextElementSibling); }
    replaceChild(next, old) { const index = this.children.indexOf(old); next._detach(); this.children[this.children.indexOf(old)] = next; next.parentElement = this; old.parentElement = null; return index >= 0 ? old : null; }
    replaceWith(node) { this.parentElement.replaceChild(node, this); }
    removeChild(node) { node._detach(); return node; }
    remove() { this._detach(); }
    contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    matches(selector) { return parseSelector(selector).some(chain => matchesComplex(this, chain)); }
    closest(selector) { for (let n = this; n && !n.isDocumentRoot; n = n.parentElement) if (n.matches(selector)) return n; return null; }
    querySelectorAll(selector) { const chains = parseSelector(selector); return this.descendants().filter(node => chains.some(chain => matchesComplex(node, chain))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { ...this.rect }; }
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); }
    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
    listenerCount(type) { return this.listeners.get(type)?.size || 0; }
    dispatchEvent(event) { event.target ??= this; for (const handler of [...(this.listeners.get(event.type) || [])]) handler(event); return true; }
    setPointerCapture() {}
    releasePointerCapture() {}
}

export function fakeDocument() {
    const root = new FakeElement('html');
    root.isDocumentRoot = true;
    const head = new FakeElement('head');
    const body = new FakeElement('body');
    root.append(head, body);
    return {
        documentElement: root, head, body,
        createElement: tag => new FakeElement(tag),
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        getElementById: id => root.querySelector(`#${id}`),
        addEventListener: (...args) => root.addEventListener(...args),
        removeEventListener: (...args) => root.removeEventListener(...args),
    };
}

export const el = (tag, options, ...children) => { const node = new FakeElement(tag, options); node.append(...children); return node; };
