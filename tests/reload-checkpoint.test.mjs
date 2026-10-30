import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

async function fixture() {
    const storage = new Map();
    const store = { PTMT: { bodyBgColor: '#111111', uiTheme: 'sharp' } };
    const power = { theme: 'Current', main_text_color: '#eeeeee' };
    const background = { name: 'chosen.png', url: 'url(chosen.png)' };
    const calls = [];
    let navigation = 'reload';
    let user = 'alice';
    const module = await loadModule('src/core/reload-checkpoint.js', {
        '../../../../../extensions.js': { extension_settings: store },
        '../../../../../user.js': { getCurrentUserHandle: () => user },
        '../../../../../power-user.js': {
            power_user: power,
            getThemeObject: name => ({ name, main_text_color: power.main_text_color }),
            applyPowerUserSettings: () => calls.push('theme'),
        },
        '../../../../../backgrounds.js': {
            background_settings: background,
            loadBackgroundSettings: state => calls.push(state.background.name),
        },
        './settings.js': { settings: {
            getActiveLayoutKey: () => 'savedLayoutDesktop',
            save: () => calls.push('save'),
        } },
        '../theme/theme-colors.js': {
            captureThemeAppearance: () => ({ theme: power.theme, colors: { main_text_color: power.main_text_color } }),
            restoreThemeAppearance: state => calls.push(state.colors.main_text_color),
        },
    }, {
        sessionStorage: {
            getItem: key => storage.get(key),
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
        },
        performance: { getEntriesByType: () => [{ type: navigation }] },
    });
    const layout = { version: 28, columns: { left: { tabs: [{ sourceId: 'History', active: true }] } } };
    return { module, store, power, calls, storage, layout,
        api: { generateLayoutSnapshot: () => layout },
        setNavigation: value => navigation = value,
        setUser: value => user = value,
    };
}

test('reload recovers final layout, settings, theme and background before delayed server save', async () => {
    const f = await fixture();
    f.module.captureReloadCheckpoint(f.api, {});
    f.layout.columns.left.tabs[0].active = false;
    f.store.PTMT.bodyBgColor = '#222222';
    f.power.theme = 'Old server theme';
    f.power.main_text_color = '#aaaaaa';
    assert.equal(f.module.restoreReloadCheckpoint(), true);
    assert.equal(f.store.PTMT.bodyBgColor, '#111111');
    assert.equal(f.store.PTMT.savedLayoutDesktop.columns.left.tabs[0].active, true);
    assert.equal(f.power.theme, 'Current');
    assert.equal(f.power.main_text_color, '#eeeeee');
    assert.deepEqual(f.calls, ['theme', '#eeeeee', 'chosen.png', 'save']);
    assert.equal(f.storage.size, 0);
    assert.equal(f.module.restoreReloadCheckpoint(), false, 'checkpoint is consumed once');
});

test('checkpoint is account scoped and does not replay after normal navigation or resets', async () => {
    const f = await fixture();
    f.module.captureReloadCheckpoint(f.api, { isHydrating: true });
    f.module.captureReloadCheckpoint(f.api, { isPTMTResetting: true });
    assert.equal(f.storage.size, 0);
    f.module.captureReloadCheckpoint(f.api, {});
    f.setUser('bob');
    assert.equal(f.module.restoreReloadCheckpoint(), false);
    f.setUser('alice');
    f.setNavigation('navigate');
    assert.equal(f.module.restoreReloadCheckpoint(), false);
    assert.equal(f.storage.size, 0);
    assert.deepEqual(f.calls, []);
});
