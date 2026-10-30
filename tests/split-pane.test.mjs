import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';

test('splitting a pane stops observing the replaced pane tab strip', async () => {
    const document = fakeDocument();
    const observed = new Set();
    const noop = () => {};
    const constants = await import('../src/core/constants.js');
    const mainBody = el('div', { id: 'ptmt-main' });
    const api = await loadModule('src/layout/pane.js', {
        '../core/utils.js': { el, getSplitOrientation: noop, getPanelById: noop, getTabById: noop, getRefs: () => ({ mainBody }), readPaneViewSettings: () => ({}), writePaneViewSettings: noop, defaultViewSettings: {}, invalidateMinWidthCache: noop, trackObserver: observer => observer },
        '../ui/context-menu.js': { showContextMenu: noop },
        '../core/settings.js': { settings: { get: () => undefined, update: noop } },
        './layout.js': { recalculateColumnSizes: noop },
        '../tabs/tabs.js': { setActivePanelInPane: noop, getPaneForPanel: () => null, moveTabIntoPaneAtIndex: noop },
        './resizer.js': { updateResizerDisabledStates: noop, attachResizer: noop, setSplitOrientation: noop },
        './layout-math.js': { recalculateSplitSizes: noop, recalculateAllSplitsRecursively: noop, setFlexBasisPercent: noop, parseFlexBasis: noop },
        '../core/constants.js': constants,
    }, {
        document, requestAnimationFrame: noop,
        ResizeObserver: class { observe(target) { observed.add(target); } unobserve(target) { observed.delete(target); } disconnect() {} },
        window: { dispatchEvent: noop, addEventListener: noop }, CustomEvent: class {},
    });
    const target = api.createPane();
    const column = el('div', { id: 'ptmt-centerBody', className: 'ptmt-body-column' }, target);
    mainBody.append(column);
    document.body.append(mainBody);
    target._panelContainer.append(el('div', { className: 'ptmt-panel', dataset: { panelId: 'a' } }));
    target._tabStrip.append(el('div', { className: 'ptmt-tab', dataset: { for: 'a' } }));
    assert.equal(observed.has(target._tabStrip), true);

    api.splitPaneWithPane(target, el('div', { className: 'ptmt-panel', dataset: { panelId: 'b' } }), true, true);

    assert.equal(target.parentElement, null);
    assert.equal(observed.has(target._tabStrip), false);
});
