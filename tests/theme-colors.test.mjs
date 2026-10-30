import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';
import * as utils from '../src/core/utils.js';
import * as palette from '../src/theme/palette-generator.js';

async function fixture(themes) {
    const timers = [];
    const rootValues = new Map(), bodyValues = new Map();
    const style = values => ({ setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) });
    const listeners = {};
    const selector = { value: '', addEventListener: (event, handler) => listeners[event] = handler };
    const power = {};
    const fetch = async () => ({ ok: true, json: async () => ({ themes }) });
    const customCss = { sheet: { cssRules: [] } };
    const document = {
        documentElement: { style: style(rootValues) },
        body: { style: style(bodyValues), append() {} },
        querySelector: key => ({ '#themes': selector, '#color-picker-block': { append() {} }, '#custom-style': customCss, '#ptmt-bg-palette-button': {}, '#ptmt-char-palette-header': {} })[key] || null,
        createElement() {
            const attributes = {};
            return { style: {}, dataset: {}, classList: { add() {} }, append() {}, remove() {}, addEventListener() {}, getAttribute: key => attributes[key], setAttribute: (key, value) => attributes[key] = value };
        },
    };
    const module = await loadModule('src/theme/theme-colors.js', {
        '../../../../../../script.js': { getRequestHeaders: () => ({}), saveSettingsDebounced() {} },
        '../../../../../power-user.js': { power_user: power }, '../core/utils.js': utils, './palette-generator.js': palette,
    }, {
        document, window: { fetch, getComputedStyle: () => ({ backgroundColor: 'rgb(1, 2, 3)' }) }, fetch,
        setTimeout: callback => timers.push(callback), requestAnimationFrame() {},
        HTMLElement: class { dispatchEvent() {} },
    });
    module.initThemeColors();
    timers.length = 0;
    return {
        power, rootValues, bodyValues,
        async select(name) {
            selector.value = name;
            listeners.change();
            for (const callback of timers.splice(0)) await callback();
        },
    };
}
for (const format of ['nested', 'top-level']) {
    test(`a partial ${format} theme clears old overrides and keeps explicit colors`, async () => {
        const a = format === 'nested' ? { ptmt_theme_colors: { '--ST-Tabs-Color': '#eeeeee', '--ST-Tabs-Background': '#222222' } } : { ptmt_tabs_color: '#eeeeee', ptmt_tabs_background: '#222222' };
        const b = format === 'nested' ? { ptmt_theme_colors: { '--ST-Tabs-Color': '#abcdef' } } : { ptmt_tabs_color: '#abcdef' };
        const f = await fixture([{ name: 'A', ...a }, { name: 'B', ...b }, { name: 'Empty' }]);
        await f.select('A');
        assert.equal(f.power.ptmt_tabs_background, '#222222');
        f.bodyValues.set('--ST-Tabs-Background', '#222222');
        await f.select('B');
        assert.equal(f.power.ptmt_tabs_color, '#abcdef');
        assert.equal(f.rootValues.get('--ST-Tabs-Color'), '#abcdef');
        assert.equal('ptmt_tabs_background' in f.power, false);
        assert.equal(f.rootValues.has('--ST-Tabs-Background'), false);
        assert.equal(f.bodyValues.has('--ST-Tabs-Background'), false);
        await f.select('Empty');
        assert.equal('ptmt_tabs_color' in f.power, false);
    });
}
