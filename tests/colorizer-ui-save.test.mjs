import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, scheduler, FakeElement, fakeDocument } from './module-harness.mjs';

function el(tag, props = {}, ...children) {
    const node = new FakeElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'className') node.className = value;
        else if (key === 'style') node.style = {};
        else node[key] = value;
    }
    if (tag === 'select') {
        Object.defineProperty(node, 'value', {
            get() { return this._value ?? this.children.find(option => option.selected)?.value; },
            set(value) { this._value = value; },
        });
    }
    node.append(...children.filter(child => typeof child === 'object'));
    return node;
}

async function fixture() {
    const document = fakeDocument();
    const resolved = { enabled: true, raw: {}, value: { dialogSource: 'static_color', bubbleMode: 'static_color', bubbleOpacity: 0.1 } };
    const timers = scheduler();
    const saves = [];
    const handlers = {};
    const refreshes = [];
    const preview = new FakeElement('img', { id: 'avatar_load_preview', attrs: { src: '/thumbnail?file=alice.png' } });
    const desc = new FakeElement('div', { id: 'spoiler_free_desc' });
    const editor = new FakeElement('div');
    editor.append(preview, desc);
    document.body.append(editor);
    const api = await loadModule('src/colorizer/character-colorizer-ui.js', {
        '../../../../../../script.js': {
            eventSource: { on: (type, handler) => { handlers[type] = handler; }, off: () => {} },
            event_types: { CHARACTER_EDITOR_OPENED: 'opened', CHARACTER_EDITED: 'edited', PERSONA_CHANGED: 'persona', APP_READY: 'ready' },
            user_avatar: '',
        },
        '../core/settings.js': { settings: { get: () => true } },
        '../core/utils.js': { el, extractColorsFromImage: () => [], sortColorsByLightness: colors => colors },
        './gradient-editor.js': { GradientEditor: class { constructor(options) { this.stops = []; this.angle = options.angle; } mount() {} destroy() {} } },
        './colorizer-helpers.js': { extractAvatarFilenameFromUrl: src => src.split('=').pop() },
        './colorizer-settings.js': {
            buildCharacterCustomColorizerKey: (name, avatar) => `avatar:${avatar}`,
            buildColorizerCustomEntry: () => ({}),
            resolveCustomColorizerSettings: () => resolved,
            updateCustomColorizerSettings: async (store, type, key, options) => { saves.push({ key, patch: options.patch }); return true; },
        },
    }, {
        document, customElements: { get: () => true },
        window: { addEventListener() {}, removeEventListener() {}, dispatchEvent: event => { if (event.type === 'ptmt:colorizer:refresh') refreshes.push(event.detail); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        setTimeout: callback => timers.set(callback), clearTimeout: id => timers.clear(id),
        queueMicrotask: callback => callback(),
    });
    api.initCharacterColorizerUI();
    const picker = document.querySelector('#ptmt-char-col-bubble-static-1');
    const drag = hexes => hexes.forEach(hex => picker.dispatchEvent({ type: 'change', detail: { hex8: hex } }));
    const enable = document.querySelector('#ptmt-char-col-enable');
    return { timers, saves, handlers, preview, drag, enable, refreshes, resolved };
}

test('a picker drag coalesces into one save of the final colour', async () => {
    const f = await fixture();
    f.drag(['#100000ff', '#200000ff', '#300000ff', '#400000ff', '#500000ff']);
    assert.equal(f.saves.length, 0);
    f.timers.flush();
    assert.equal(f.saves.length, 1);
    assert.equal(f.saves[0].patch.bubbleStatic1, '#500000ff');
});

test('switching character saves a pending picker change to the previous character', async () => {
    const f = await fixture();
    f.drag(['#123456ff']);
    f.preview.setAttribute('src', '/thumbnail?file=bob.png');
    f.handlers.opened();
    assert.equal(f.saves.length, 1);
    assert.equal(f.saves[0].key, 'avatar:alice.png');
    assert.equal(f.saves[0].patch.bubbleStatic1, '#123456ff');
    f.timers.flush();
    assert.equal(f.saves.length, 1);
});
