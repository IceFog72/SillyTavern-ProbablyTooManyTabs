import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, scheduler } from './module-harness.mjs';

async function fixture() {
    const timers = scheduler(), handlers = new Map();
    function element() {
        return { children: [], style: {}, dataset: {}, appendChild(node) { this.children.push(node); }, before() {}, addEventListener() {}, set innerHTML(value) { this.children = []; }, remove() {} };
    }
    const status = element();
    const module = await loadModule('src/integrations/context-status-bar.js', {
        '../../../../../../script.js': { eventSource: { on: (type, fn) => handlers.set(type, fn), off() {} }, event_types: { WORLD_INFO_ACTIVATED: 'wi', CHAT_CHANGED: 'chat' }, chat: [] },
        '../core/utils.js': { debounce: fn => (...args) => timers.set(() => fn(...args)) },
        '../core/settings.js': { settings: { get: () => true } },
        '../../../../../../scripts/itemized-prompts.js': { itemizedPrompts: [], itemizedParams() {}, findItemizedPromptSet() {} },
    }, {
        document: { getElementById: id => id === 'world-info-status-bar' ? status : element(), createElement: element, querySelector: () => null },
        window: { addEventListener() {}, removeEventListener() {} },
    });
    module.initWorldInfoStatusBar();
    timers.flush();
    return { status, render(entries) { handlers.get('wi')(entries); timers.flush(); } };
}
test('World Info groups ordinary and inherited-property names and retains every entry', async () => {
    const f = await fixture();
    const worlds = ['ordinary', 'constructor', 'toString', '__proto__'];
    f.render(worlds.flatMap(world => [{ world, key: ['first'] }, { world, key: ['second'] }]));
    assert.equal(f.status.children.length, worlds.length);
    assert.deepEqual(f.status.children.map(group => group.children[0].textContent), worlds.map(world => `📚 ${world}`));
    assert.ok(f.status.children.every(group => group.children[1].children.length === 2));
});
test('empty World Info activation clears the status bar', async () => {
    const f = await fixture();
    f.render([{ world: 'ordinary', key: ['one'] }]);
    f.render([]);
    assert.equal(f.status.children.length, 0);
    assert.equal(f.status.style.display, 'none');
});
