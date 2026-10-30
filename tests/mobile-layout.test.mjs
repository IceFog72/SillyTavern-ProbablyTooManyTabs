import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

async function fixture() {
    return loadModule('src/core/settings.js', {
        '../../../../../../script.js': { saveSettingsDebounced() {}, saveSettings() {} },
        '../../../../../extensions.js': { extension_settings: { PTMT: {} } },
        '../colorizer/colorizer-settings.js': { migrateColorizerSettings: () => false },
    }, { navigator: { userAgent: '' }, window: { matchMedia: () => ({ matches: false }) }, structuredClone });
}
test('mobile conversion merges and deduplicates deferred ID and class tabs without mutating input', async () => {
    const { SettingsManager } = await fixture();
    const source = { columns: Object.fromEntries(['left', 'center', 'right'].map((name, i) => [name, {
        content: { type: 'pane', paneId: name, tabs: [{ sourceId: `live-${name}` }] },
        ghostTabs: [{ searchId: `late-${i}`, paneId: name, title: name }, { searchClass: 'zoomed_avatar', paneId: name }],
    }])) };
    const before = JSON.stringify(source);
    const mobile = SettingsManager.getMobileLayout(source);
    const ghosts = mobile.columns.center.ghostTabs;
    assert.equal(ghosts.length, 4);
    assert.deepEqual(Array.from(ghosts, tab => tab.searchId || tab.searchClass), ['late-0', 'zoomed_avatar', 'late-1', 'late-2']);
    assert.ok(ghosts.every(tab => tab.paneId === mobile.columns.center.content.paneId));
    assert.equal(mobile.columns.left.ghostTabs.length, 0);
    assert.equal(mobile.columns.right.ghostTabs.length, 0);
    assert.equal(mobile.columns.center.content.tabs.length, 3);
    assert.equal(JSON.stringify(source), before);
    assert.equal(mobile.showLeft, false);
    assert.equal(mobile.showRight, false);
});
test('mobile conversion accepts layouts without deferred tabs', async () => {
    const { SettingsManager } = await fixture();
    const source = { columns: Object.fromEntries(['left', 'center', 'right'].map(name => [name, { content: { type: 'pane', tabs: [] } }])) };
    const mobile = SettingsManager.getMobileLayout(source);
    assert.equal(mobile.columns.center.ghostTabs.length, 0);
});
