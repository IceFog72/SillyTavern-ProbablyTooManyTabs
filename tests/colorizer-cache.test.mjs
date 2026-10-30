import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';
import * as helpers from '../src/colorizer/colorizer-helpers.js';
import * as colorizerSettings from '../src/colorizer/colorizer-settings.js';

async function fixture() {
    const document = fakeDocument();
    const listeners = {};
    let extractions = 0;
    const img = el('img', { attrs: { src: '/thumbnail?type=avatar&file=alice.png' } });
    Object.assign(img, { complete: true, naturalWidth: 10, naturalHeight: 10 });
    const message = el('div', { className: 'mes', attrs: { ch_name: 'Alice', is_user: 'false', is_system: 'false' } }, el('div', { className: 'avatar' }, img));
    document.body.append(el('div', { id: 'chat' }, message));
    const data = { enableDialogueColorizer: true, dialogueColorizerSource: 'avatar_vibrant', dialogueColorizerBubbleMode: 'avatar_dark' };
    const api = await loadModule('src/colorizer/dialogue-colorizer.js', {
        '../../../../../../script.js': { eventSource: { on() {}, off() {} }, event_types: { CHAT_CHANGED: 'chat' }, user_avatar: '' },
        '../../../../../extensions.js': { getContext: () => ({}) },
        '../core/settings.js': { settings: { get: key => data[key] } },
        '../core/utils.js': { debounce: fn => fn, trackObserver: observer => observer, extractColorsFromImage: () => { extractions++; return ['#112233', '#445566']; }, sortColorsByLightness: colors => colors },
        './colorizer-helpers.js': helpers,
        './colorizer-settings.js': colorizerSettings,
    }, {
        TextEncoder, document, setTimeout, clearTimeout,
        MutationObserver: class { observe() {} disconnect() {} },
        window: { addEventListener: (type, handler) => { listeners[type] = handler; }, removeEventListener() {} },
    });
    api.initColorizer();
    await new Promise(setImmediate);
    const emit = async (type, detail) => { listeners[type]({ detail }); await new Promise(setImmediate); };
    return { emit, extractions: () => extractions, css: () => document.getElementById('ptmt-colorizer-chars').innerHTML };
}

test('personal colorizer saves restyle without re-extracting avatar palettes', async () => {
    const f = await fixture();
    assert.equal(f.extractions(), 1);
    assert.ok(f.css().includes('#112233'));
    for (const key of ['charCustomColorizerSettings', 'charCustomColorizerEnabled', 'personaCustomColorizerSettings', 'personaCustomColorizerEnabled']) {
        await f.emit('ptmt:settingsChanged', { changed: [key] });
    }
    await f.emit('ptmt:colorizer:refresh', { fullRefresh: false });
    assert.equal(f.extractions(), 1);
});

test('extraction-affecting changes still re-extract', async () => {
    const f = await fixture();
    await f.emit('ptmt:colorizer:refresh', { fullRefresh: true });
    assert.equal(f.extractions(), 2);
    await f.emit('ptmt:settingsChanged', { changed: ['dialogueColorizerSource'] });
    assert.equal(f.extractions(), 3);
});
