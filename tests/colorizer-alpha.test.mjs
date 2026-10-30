import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';
import * as helpers from '../src/colorizer/colorizer-helpers.js';
import * as colorizerSettings from '../src/colorizer/colorizer-settings.js';

test('colorizer generated styles preserve dialogue and gradient alpha', async () => {
    const nodes = new Map();
    const attributes = { is_system: 'true' };
    const message = {
        querySelector() { return null; },
        getAttribute(key) { return attributes[key]; },
        setAttribute(key, value) { attributes[key] = value; },
    };
    const data = {
        enableDialogueColorizer: true,
        dialogueColorizerSource: 'static_color',
        dialogueColorizerStaticColor: '#abcdef80',
        dialogueColorizerBubbleMode: 'gradient',
        dialogueColorizerBubbleOpacityBot: 0.5,
        dialogueColorizerBubbleGradientStops: [
            { color: '#ff0000ff', position: 0 },
            { color: '#0000ff00', position: 1 },
        ],
    };
    const { initColorizer, cleanupColorizer } = await loadModule('src/colorizer/dialogue-colorizer.js', {
        '../../../../../../script.js': { eventSource: { on() {}, off() {} }, event_types: { CHAT_CHANGED: 'chat' }, user_avatar: '' },
        '../../../../../extensions.js': { getContext: () => ({}) },
        '../core/settings.js': { settings: { get: key => data[key] } },
        '../core/utils.js': { debounce: fn => fn, trackObserver: observer => observer, extractColorsFromImage() {}, sortColorsByLightness: colors => colors },
        './colorizer-helpers.js': helpers,
        './colorizer-settings.js': colorizerSettings,
    }, {
        TextEncoder,
        MutationObserver: class { observe() {} disconnect() {} },
        window: { addEventListener() {}, removeEventListener() {} },
        document: {
            getElementById: id => nodes.get(id),
            querySelector: () => null,
            querySelectorAll: selector => selector === '.mes' ? [message] : [],
            createElement: () => ({}),
            body: { appendChild(node) { nodes.set(node.id, node); } },
        },
    });
    initColorizer();
    await new Promise(setImmediate);
    let css = nodes.get('ptmt-colorizer-chars').innerHTML;
    assert.ok(css.includes('color: #abcdef80 !important'));
    assert.ok(css.includes(`r g b / ${128 / 255}) !important`));
    assert.ok(css.includes('rgba(255, 0, 0, 0.5) 0%'));
    assert.ok(css.includes('rgba(0, 0, 255, 0) 100%'));
    assert.ok(css.includes(`--ptmt-mes-colorizer-color: rgba(255, 0, 0, ${128 / 255 * 0.5})`));
    data.dialogueColorizerStaticColor = '#abcdef00';
    data.dialogueColorizerBubbleGradientStops = [{ color: '#ff000000', position: 0 }, { color: '#0000ff00', position: 1 }];
    initColorizer();
    await new Promise(setImmediate);
    css = nodes.get('ptmt-colorizer-chars').innerHTML;
    assert.ok(css.includes('r g b / 0) !important'));
    assert.ok(css.includes('--ptmt-mes-colorizer-color: rgba(0, 0, 0, 0)'));
    cleanupColorizer();
});
