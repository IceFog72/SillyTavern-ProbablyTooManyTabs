import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

test('Toolcool selection adds one gradient stop only when Add is pressed', async () => {
    const elements = [];
    function el(tag, props = {}) {
        const node = {
            tag, ...props, listeners: {}, children: [],
            addEventListener(name, handler) { this.listeners[name] = handler; },
            appendChild(child) { this.children.push(child); },
            setAttribute(name, value) { this[name] = value; },
            replaceChildren() { this.children = []; },
        };
        elements.push(node);
        return node;
    }
    const changes = [];
    const { GradientEditor } = await loadModule('src/colorizer/gradient-editor.js', { '../core/utils.js': { el } });
    const editor = new GradientEditor({ stops: [{ color: '#123456', position: 0 }], showTrack: false, showAngle: false, onChange: value => changes.push(value) });
    editor.mount(el('div'));
    const picker = elements.find(node => node.tag === 'toolcool-color-picker');
    const add = elements.find(node => node.className === 'ptmt-ge-add-btn');
    assert.ok(picker);
    assert.equal(elements.some(node => node.tag === 'input' && node.type === 'color'), false);
    picker.listeners.change({ detail: { hex: '#abcdef', hex8: '#abcdef40' } });
    assert.equal(editor.stops.length, 1);
    assert.equal(changes.length, 0);
    add.listeners.click();
    assert.equal(editor.stops.length, 2);
    assert.equal(editor.stops[1].color, '#abcdef40');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].stops[1].color, '#abcdef40');
    assert.equal(elements.filter(node => node.tag === 'toolcool-color-picker').at(-1).color, '#abcdef40');
});

 test('saved transparent stops survive editor normalization and multiply bubble opacity', async () => {
    const { GradientEditor } = await loadModule('src/colorizer/gradient-editor.js', { '../core/utils.js': { el() {} } });
    const { hexToRgbaWithAlpha } = await import('../src/colorizer/colorizer-helpers.js');
    const editor = new GradientEditor({ stops: [{ color: '#12345600', position: 0 }, { color: '#abcdef80', position: 1 }] });
    assert.equal(editor.stops[0].color, '#12345600');
    assert.equal(editor.stops[1].color, '#abcdef80');
    assert.equal(hexToRgbaWithAlpha(editor.stops[0].color, 0.5), 'rgba(18, 52, 86, 0)');
    assert.equal(hexToRgbaWithAlpha(editor.stops[1].color, 0.5), `rgba(171, 205, 239, ${128 / 255 * 0.5})`);
});
