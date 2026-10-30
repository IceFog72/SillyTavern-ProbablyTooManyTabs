import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';
import * as helpers from '../src/colorizer/colorizer-helpers.js';
import * as colorizerSettings from '../src/colorizer/colorizer-settings.js';

function message(name, file) {
    const img = el('img', { attrs: { src: `/thumbnail?type=avatar&file=${file}` } });
    Object.assign(img, { complete: true, naturalWidth: 10, naturalHeight: 10 });
    return el('div', { className: 'mes', attrs: { ch_name: name, is_user: 'false', is_system: 'false' } }, el('div', { className: 'avatar' }, img));
}

test('colorizer restyles with custom and global authors write no console.log', async () => {
    const document = fakeDocument();
    document.body.append(el('div', { id: 'chat' }, message('Alice', 'alice.png'), message('Bob', 'bob.png')));
    const aliceKey = colorizerSettings.buildCharacterCustomColorizerKey('Alice', 'alice.png');
    const data = {
        enableDialogueColorizer: true, dialogueColorizerSource: 'avatar_vibrant', dialogueColorizerBubbleMode: 'avatar_dark',
        charCustomColorizerEnabled: [aliceKey],
        charCustomColorizerSettings: { [aliceKey]: colorizerSettings.buildColorizerCustomEntry('character', { dialogSource: 'avatar_vibrant', bubbleMode: 'avatar_light' }) },
    };
    const logs = [];
    const { initColorizer, cleanupColorizer } = await loadModule('src/colorizer/dialogue-colorizer.js', {
        '../../../../../../script.js': { eventSource: { on() {}, off() {} }, event_types: { CHAT_CHANGED: 'chat' }, user_avatar: '' },
        '../../../../../extensions.js': { getContext: () => ({}) },
        '../core/settings.js': { settings: { get: key => data[key] } },
        '../core/utils.js': { debounce: fn => fn, trackObserver: observer => observer, extractColorsFromImage: () => ['#112233', '#445566'], sortColorsByLightness: colors => colors },
        './colorizer-helpers.js': helpers,
        './colorizer-settings.js': colorizerSettings,
    }, {
        TextEncoder, document, setTimeout, clearTimeout,
        console: { ...console, log: (...args) => logs.push(args.join(' ')) },
        MutationObserver: class { observe() {} disconnect() {} },
        window: { addEventListener() {}, removeEventListener() {} },
    });
    initColorizer();
    await new Promise(setImmediate);
    const css = document.getElementById('ptmt-colorizer-chars').innerHTML;
    assert.ok(css.includes('#112233'), 'both authors are styled');
    cleanupColorizer();
    assert.deepEqual(logs, []);
});

test('the colorizer source has no console.log calls left', async () => {
    const source = await readFile(new URL('../src/colorizer/dialogue-colorizer.js', import.meta.url), 'utf8');
    assert.equal(source.match(/console\.log\(/g)?.length ?? 0, 0);
});
