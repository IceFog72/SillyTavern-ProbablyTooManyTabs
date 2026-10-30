import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

async function fixture() {
    const calls = [];
    const imports = {};
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        imports[match[2]] = Object.fromEntries(match[1].split(',').map(name => {
            name = name.trim();
            return [name, (...args) => calls.push([name, ...args])];
        }));
    }
    imports['../../../../../script.js'].eventSource = { on() {} };
    imports['../../../../../script.js'].event_types = { APP_READY: 'ready' };
    imports['./core/constants.js'].SELECTORS = { SETTINGS_WRAPPER: '#settings', OVERRIDES_LINK: '#overrides' };
    imports['./core/settings.js'].settings = { async cleanup() { calls.push(['settings.cleanup']); } };
    imports['./theme/theme-engine.js'].themeEngine = { cleanup() { calls.push(['themeEngine.cleanup']); } };
    const document = {
        getElementById: () => ({}), querySelector: () => null,
        body: { classList: { remove() {} } },
    };
    const api = await loadModule('src/index.js', imports, {
        document,
        window: { ptmtTabs: { manager: { cleanup() { calls.push(['manager.cleanup']); } } } },
    });
    calls.length = 0;
    return { api, calls };
}

for (const hook of ['onDisable', 'onDelete']) {
    test(`${hook} releases colorizers, tab actions and the editor before returning`, async () => {
        const { api, calls } = await fixture();
        await api[hook]();
        for (const name of ['cleanupColorizer', 'cleanupCharacterColorizerUI', 'cleanupTabActions', 'manager.cleanup']) {
            assert.equal(calls.filter(([called]) => called === name).length, 1, `${hook} must call ${name}`);
        }
        assert.equal(calls.find(([name]) => name === 'cleanupColorizer')[1].clearStyles, true);
        assert.equal(calls.some(([name]) => name === 'settings.cleanup'), hook === 'onDelete');
    });
}
