import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

function classes(...initial) {
    const values = new Set(initial);
    return {
        contains: value => values.has(value),
        add: (...items) => items.forEach(value => values.add(value)),
        remove: (...items) => items.forEach(value => values.delete(value)),
        toggle(value, force = !values.has(value)) { force ? values.add(value) : values.delete(value); },
    };
}
async function fixture(otherCollapsed = null, autoOpen = false, center = false) {
    const noop = () => {};
    const pane = { classList: classes(), closest: () => center ? {} : null };
    const tabs = [], panels = [];
    for (const [index, collapsed] of [false, ...(otherCollapsed === null ? [] : [otherCollapsed])].entries()) {
        const pid = `p${index}`;
        const tab = { dataset: { for: pid }, classList: classes(index ? 'inactive' : 'active', ...(collapsed ? ['collapsed'] : [])), closest: () => pane, setAttribute(name, value) { this[name] = value; }, scrollIntoView: noop };
        const panel = { dataset: { panelId: pid, sourceId: pid }, classList: classes(index ? 'hidden' : 'active', ...(collapsed ? ['collapsed'] : [])), closest: () => pane };
        tab._panelRef = panel;
        tabs.push(tab); panels.push(panel);
    }
    pane._tabStrip = {
        querySelector: selector => selector.includes(':not(.collapsed)') ? tabs.find(tab => !tab.classList.contains('collapsed')) : tabs[0],
        querySelectorAll: () => tabs,
    };
    pane._panelContainer = { querySelector: () => panels[0] };
    const api = await loadModule('src/tabs/tabs.js', {
        '../core/utils.js': { el: noop, isElement: noop, getPanelBySourceId: noop, getPanelById: pid => panels.find(p => p.dataset.panelId === pid), getTabById: pid => tabs.find(t => t.dataset.for === pid), getRefs: () => ({}), createIconElement: noop, hexToRgba: noop },
        '../layout/pane.js': { setPaneCollapsedView: noop, removePaneIfEmpty: noop, checkAndCollapsePaneIfAllTabsCollapsed: () => pane.classList.toggle('view-collapsed', tabs.every(tab => tab.classList.contains('collapsed'))) },
        './drag-drop.js': { hideCompass: noop, hideDropIndicator: noop },
        '../layout/resizer.js': { invalidatePaneTabSizeCache: noop },
        './tab-actions.js': { runTabAction: noop },
        '../core/settings.js': { settings: { get: () => autoOpen } },
        '../ui/context-menu.js': { showContextMenu: noop },
    }, {
        document: { body: { classList: classes() }, querySelectorAll: () => tabs, querySelector: () => tabs[0] },
        window: { dispatchEvent: noop }, CustomEvent: class {},
    });
    return { api, pane, tabs, panels };
}
for (const other of [null, true]) {
    test(`closing the last open tab stays closed with otherCollapsed=${other}`, async () => {
        const f = await fixture(other);
        f.api.closeTabById('p0');
        assert.equal(f.tabs[0].classList.contains('collapsed'), true);
        assert.equal(f.tabs[0].classList.contains('active'), false);
        assert.equal(f.panels[0].classList.contains('hidden'), true);
        assert.equal(f.panels[0].classList.contains('active'), false);
        assert.equal(f.tabs[0]['aria-selected'], 'false');
        assert.equal(f.pane.classList.contains('view-collapsed'), true);
    });
}
test('closing selects another already open tab', async () => {
    const f = await fixture(false);
    f.api.closeTabById('p0');
    assert.equal(f.tabs[1].classList.contains('active'), true);
    assert.equal(f.tabs[0].classList.contains('collapsed'), true);
    assert.equal(f.panels[0].classList.contains('hidden'), true);
});
test('explicit center auto-open policy keeps its first tab open', async () => {
    const f = await fixture(null, true, true);
    f.api.closeTabById('p0');
    assert.equal(f.tabs[0].classList.contains('active'), true);
    assert.equal(f.tabs[0].classList.contains('collapsed'), false);
});
