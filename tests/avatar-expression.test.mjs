import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

async function fixture() {
    let callback;
    class Element {
        constructor(src, id = '') { this.src = src; this.id = id; }
        matches(selector) { return selector.split(',').some(part => part.trim() === '.expression' || part.trim() === `#${this.id}`); }
        getAttribute() { return 'Alice'; }
    }
    const old = new Element('old.png', 'expression-image');
    const replacement = new Element('new.png');
    let current = old;
    const avatar = { src: 'avatar.png' };
    const module = await loadModule('src/integrations/avatar-expression-sync.js', {
        '../core/settings.js': { settings: { get: () => true } },
        '../core/constants.js': { SELECTORS: { ST_EXPRESSION_IMAGE: '#expression-image', ST_MESSAGE: '.mes', ST_AVATAR: '.avatar' } },
        '../../../../../../script.js': { eventSource: { on() {}, off() {} }, event_types: {} },
    }, {
        Element, window: { addEventListener() {}, removeEventListener() {} },
        document: {
            querySelector: selector => selector.includes('holder') ? {} : current,
            querySelectorAll: () => [{ getAttribute: () => 'Alice', querySelector: () => avatar }],
        },
        MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() {} },
        clearTimeout() {},
    });
    module.initAvatarExpressionSync();
    return { module, old, replacement, avatar, notify: records => callback(records), setCurrent: node => current = node };
}
test('native animated replacement refreshes the avatar after the old expression is removed', async () => {
    const f = await fixture();
    f.notify([{ type: 'childList', addedNodes: [f.replacement], removedNodes: [] }]);
    assert.equal(f.avatar.src, 'old.png');
    f.replacement.id = 'expression-image';
    f.setCurrent(f.replacement);
    f.notify([{ type: 'childList', addedNodes: [], removedNodes: [f.old] }]);
    assert.equal(f.avatar.src, 'new.png');
    f.module.cleanupAvatarExpressionSync();
});
test('direct expression source changes still refresh the avatar', async () => {
    const f = await fixture();
    f.old.src = 'changed.png';
    f.notify([{ type: 'attributes', attributeName: 'src', target: f.old }]);
    assert.equal(f.avatar.src, 'changed.png');
    f.module.cleanupAvatarExpressionSync();
});
