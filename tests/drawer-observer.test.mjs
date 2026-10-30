import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';

async function fixture() {
    const document = fakeDocument();
    let callback = null;
    const api = await loadModule('src/integrations/misc-helpers.js', {
        '../core/utils.js': { isElement: () => true, registerBodyObserver: (id, filter, handler) => { callback = handler; return () => {}; } },
        '../core/constants.js': await import('../src/core/constants.js'),
    }, { document, Element: (await import('./module-harness.mjs')).FakeElement });
    const chat = el('div', { id: 'chat' });
    const panel = el('div', { className: 'ptmt-panel-content' }, chat);
    document.body.append(panel);
    api.initDrawerObserver();
    return { api, document, panel, chat, mutate: nodes => callback([{ type: 'childList', addedNodes: nodes }]) };
}

function countScans(element) {
    let scans = 0;
    const original = element.querySelectorAll.bind(element);
    element.querySelectorAll = selector => { scans++; return original(selector); };
    return () => scans;
}

test('a message inserted into a panel scans only the inserted node', async () => {
    const f = await fixture();
    const scans = countScans(f.panel);
    const drawer = el('div', { className: 'drawer-content closedDrawer' });
    const message = el('div', { className: 'mes' }, drawer);
    f.chat.append(message);
    f.mutate([message]);
    assert.equal(scans(), 0);
    assert.equal(drawer.classList.contains('openDrawer'), true);
    assert.equal(drawer.classList.contains('pinnedOpen'), true);
});

test('a panel moved into the page pins its drawers', async () => {
    const f = await fixture();
    const drawer = el('div', { className: 'drawer-content closedDrawer' });
    const wrapper = el('div', {}, el('div', { className: 'ptmt-panel-content' }, drawer));
    f.document.body.append(wrapper);
    f.mutate([wrapper]);
    assert.equal(drawer.classList.contains('openDrawer'), true);
    assert.equal(drawer.classList.contains('closedDrawer'), false);
});

test('drawers outside PTMT panels stay untouched', async () => {
    const f = await fixture();
    const drawer = el('div', { className: 'drawer-content closedDrawer' });
    f.document.body.append(drawer);
    f.mutate([drawer]);
    assert.equal(drawer.classList.contains('closedDrawer'), true);
});
