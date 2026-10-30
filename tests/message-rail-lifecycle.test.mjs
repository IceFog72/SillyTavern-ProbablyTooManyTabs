import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, scheduler, FakeElement, el, fakeDocument } from './module-harness.mjs';

async function fixture(enabled) {
    const document = fakeDocument();
    document.scrollingElement = document.documentElement;
    const timers = scheduler();
    const handlers = {};
    const window = new FakeElement('window');
    window.getComputedStyle = () => ({ overflowY: 'visible' });
    const chat = el('div', { id: 'chat' });
    document.body.append(chat);
    const api = await loadModule('src/integrations/message-rail.js', {
        '../../../../../../script.js': {
            eventSource: { on: (type, handler) => { handlers[type] = handler; }, off() {} },
            event_types: { CHAT_CHANGED: 'chat_changed' },
        },
        '../core/settings.js': { settings: { get: key => key === 'messageRailEnabled' ? enabled : undefined } },
    }, {
        document, window, performance,
        setTimeout: callback => timers.set(callback), clearTimeout: id => timers.clear(id),
        requestAnimationFrame: callback => timers.set(callback), cancelAnimationFrame: id => timers.clear(id),
        MutationObserver: class { observe() {} disconnect() {} },
    });
    api.initMessageRail();
    timers.flush();
    const switchChat = () => {
        chat.children.slice().forEach(child => child.remove()); // ST clearChat()
        handlers.chat_changed();
        timers.flush();
    };
    return { api, chat, window, switchChat, rail: () => chat.querySelector('#gpt-message-rail') };
}

test('chat switches recreate the rail without accumulating listeners', async () => {
    const f = await fixture(true);
    const first = f.rail();
    assert.ok(first);
    assert.equal(f.window.listenerCount('mouseup'), 1);
    for (let i = 0; i < 3; i++) f.switchChat();
    assert.ok(f.rail());
    assert.notEqual(f.rail(), first);
    assert.equal(f.window.listenerCount('mouseup'), 1);
    assert.equal(first.listenerCount('mouseenter'), 0);
    f.api.cleanupMessageRail();
    assert.equal(f.window.listenerCount('mouseup'), 0);
});

test('a disabled rail builds no UI and adds no drag listeners', async () => {
    const f = await fixture(false);
    f.switchChat();
    assert.equal(f.rail(), null);
    assert.equal(f.window.listenerCount('mouseup'), 0);
});
