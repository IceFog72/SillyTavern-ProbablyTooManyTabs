import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, FakeElement, el as tree } from './module-harness.mjs';

function el(tag, props = {}, ...children) {
    const node = new FakeElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'className') node.className = value;
        else if (key === 'style') node.style = {};
        else { node[key] = value; if (typeof value === 'string') node.setAttribute(key, value); }
    }
    node.append(...children.filter(child => typeof child === 'object'));
    return node;
}

test('changing a split expanded orientation in the editor triggers a layout save', async () => {
    const events = [];
    const applied = [];
    const constants = await import('../src/core/constants.js');
    const api = await loadModule('src/editor/EditorRenderer.js', {
        '../core/utils.js': { el, createIconElement: () => new FakeElement('i'), hexToRgba: () => '', readPaneViewSettings: () => ({}) },
        '../core/constants.js': constants,
    }, {
        window: { dispatchEvent: event => events.push(event) },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    });
    const split = tree('div', { className: 'ptmt-split' });
    const column = id => tree('div', { id }, ...(id === 'left' ? [split] : []));
    const manager = {
        rootElement: new FakeElement('div'),
        settings: { getActiveLayout: () => ({ hiddenTabs: [], columns: {} }), get: () => undefined },
        attachDragListeners() {}, attachTouchDragListeners() {}, attachSettingsButtonListener() {}, handleDragStart() {}, handleDrop() {},
        appApi: { _refs: () => ({ leftBody: column('left'), centerBody: column('center'), rightBody: column('right') }), applySplitOrientation: element => applied.push(element) },
    };
    api.renderUnifiedEditor(manager);
    const select = manager.rootElement.querySelector('select');
    select.value = 'horizontal';
    select.dispatchEvent({ type: 'change', target: select });
    assert.deepEqual(applied, [split]);
    assert.equal(split.dataset.orientationExpanded, 'horizontal');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, constants.EVENTS.LAYOUT_CHANGED);
});
