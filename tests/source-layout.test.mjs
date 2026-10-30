import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const extension = new URL('https://ptmt.test/scripts/extensions/third-party/NAME/');
const hostContracts = {
    "src/core/settings.js": {
        "/script.js": [
            "saveSettingsDebounced",
            "saveSettings"
        ],
        "/scripts/extensions.js": [
            "extension_settings"
        ]
    },
    "src/core/reload-checkpoint.js": {
        "/scripts/extensions.js": [
            "extension_settings"
        ],
        "/scripts/user.js": [
            "getCurrentUserHandle"
        ],
        "/scripts/power-user.js": [
            "power_user",
            "getThemeObject",
            "applyPowerUserSettings"
        ],
        "/scripts/backgrounds.js": [
            "background_settings",
            "loadBackgroundSettings"
        ]
    },
    "src/theme/theme-colors.js": {
        "/script.js": [
            "getRequestHeaders",
            "saveSettingsDebounced"
        ],
        "/scripts/power-user.js": [
            "power_user"
        ]
    },
    "src/colorizer/dialogue-colorizer.js": {
        "/script.js": [
            "eventSource",
            "event_types",
            "user_avatar"
        ],
        "/scripts/extensions.js": [
            "getContext"
        ]
    },
    "src/colorizer/character-colorizer-ui.js": {
        "/script.js": [
            "eventSource",
            "event_types",
            "user_avatar"
        ]
    },
    "src/integrations/avatar-expression-sync.js": {
        "/script.js": [
            "eventSource",
            "event_types"
        ]
    },
    "src/integrations/context-status-bar.js": {
        "/script.js": [
            "eventSource",
            "event_types",
            "chat"
        ],
        "/scripts/itemized-prompts.js": [
            "itemizedPrompts",
            "itemizedParams",
            "findItemizedPromptSet"
        ]
    },
    "src/integrations/message-rail.js": {
        "/script.js": [
            "eventSource",
            "event_types"
        ]
    },
    "src/index.js": {
        "/script.js": [
            "eventSource",
            "event_types",
            "swipe",
            "isSwipingAllowed"
        ],
        "/scripts/constants.js": [
            "SWIPE_DIRECTION",
            "SWIPE_SOURCE"
        ]
    },
    "src/editor/TabSettings.js": {
        "/scripts/utils.js": [
            "showFontAwesomePicker"
        ]
    }
};
async function sourceFiles(directory) {
    const entries = await readdir(new URL('../' + directory, import.meta.url), { withFileTypes: true });
    return (await Promise.all(entries.map(async entry => {
        const path = directory + '/' + entry.name;
        return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.js') ? [path] : [];
    }))).flat();
}
test('manifest loads the folder entry point and root has no JavaScript', async () => {
    const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
    assert.equal(manifest.js, 'src/index.js');
    assert.equal((await readdir(new URL('../', import.meta.url))).some(file => file.endsWith('.js')), false);
    await readFile(new URL('../' + manifest.js, import.meta.url));
    await readFile(new URL('../' + manifest.css, import.meta.url));
});
test('every source import links and SillyTavern import URLs and names remain compatible', async () => {
    const context = createContext({});
    const modules = new Map();
    const files = await sourceFiles('src');
    for (const file of files) {
        const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
        for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)) {
            await readFile(new URL(match[1], new URL('../' + file, import.meta.url)));
        }
        modules.set(new URL(file, extension).href, new SourceTextModule(source, { context, identifier: file }));
    }
    const hosts = new Map();
    for (const dependencies of Object.values(hostContracts)) for (const [url, names] of Object.entries(dependencies)) {
        if (!hosts.has(url)) hosts.set(url, new Set());
        names.forEach(name => hosts.get(url).add(name));
    }
    const hostModules = new Map(Array.from(hosts, ([url, names]) => [url, new SyntheticModule([...names], function () {}, { context })]));
    const seen = new Map();
    const linker = (specifier, referencing) => {
        const resolved = new URL(specifier, new URL(referencing.identifier, extension));
        const local = modules.get(resolved.href);
        if (local) return local;
        assert.ok(hostContracts[referencing.identifier]?.[resolved.pathname], `${referencing.identifier}: unexpected external dependency ${resolved.pathname}`);
        if (!seen.has(referencing.identifier)) seen.set(referencing.identifier, new Set());
        seen.get(referencing.identifier).add(resolved.pathname);
        assert.ok(hostModules.has(resolved.pathname), `missing host module ${resolved.pathname}`);
        return hostModules.get(resolved.pathname);
    };
    for (const module of modules.values()) if (module.status === 'unlinked') await module.link(linker);
    for (const [file, dependencies] of Object.entries(hostContracts)) {
        assert.deepEqual([...seen.get(file) || []].sort(), Object.keys(dependencies).sort(), file);
    }
});
