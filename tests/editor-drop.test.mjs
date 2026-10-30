import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el } from './module-harness.mjs';

async function fixture() {
    const api = await loadModule('src/editor/EditorDragDrop.js', {
        '../core/utils.js': { clearDropIndicators() {} },
        '../core/constants.js': await import('../src/core/constants.js'),
        '../tabs/pending-tabs.js': { getTabIdentifier: () => '' },
    });
    const tab = el('div', { className: 'ptmt-editor-tab' });
    const container = el('div', { className: 'ptmt-editor-tabs-container' }, tab);
    const root = el('div', {}, container);
    const manager = { rootElement: root, indicator: el('div', { className: 'ptmt-drop-indicator' }), draggedTabInfo: null };
    const event = target => ({ target, currentTarget: container, clientY: 0, preventDefault() {}, stopPropagation() {}, dataTransfer: {} });
    return { api, manager, container, tab, event };
}

test('dragging something that is not an editor tab over the editor shows no indicator', async () => {
    const f = await fixture();
    f.api.handleDragOver(f.manager, f.event(f.tab));
    assert.equal(f.manager.indicator.parentElement, null);
});

test('dropping something that is not an editor tab on the editor does nothing', async () => {
    const f = await fixture();
    f.container.append(f.manager.indicator);
    assert.doesNotThrow(() => f.api.handleDrop(f.manager, f.event(f.tab)));
    assert.equal(f.manager.indicator.parentElement, null);
    assert.equal(f.manager.draggedTabInfo, null);
});
