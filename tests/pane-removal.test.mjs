import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';

function pane(flex) {
    const node = el('div', { className: 'ptmt-pane' });
    node._tabStrip = el('div', { className: 'ptmt-tabStrip' });
    node._panelContainer = el('div', { className: 'ptmt-panel-container' });
    node.append(node._tabStrip, node._panelContainer);
    if (flex) { node.style.flex = flex; node.dataset.lastFlex = flex; }
    return node;
}

test('collapsing a nested split gives the surviving pane the split slot size', async () => {
    const document = fakeDocument();
    const recalculated = [];
    const noop = () => {};
    const api = await loadModule('src/layout/pane.js', {
        '../core/utils.js': { el, getSplitOrientation: noop, getPanelById: noop, getTabById: noop, getRefs: () => ({ centerBody: center }), readPaneViewSettings: () => ({}), writePaneViewSettings: noop, defaultViewSettings: {}, invalidateMinWidthCache: noop, trackObserver: observer => observer },
        '../ui/context-menu.js': { showContextMenu: noop },
        '../core/settings.js': { settings: { get: noop, update: noop } },
        './layout.js': { recalculateColumnSizes: noop },
        '../tabs/tabs.js': { setActivePanelInPane: noop, getPaneForPanel: noop, moveTabIntoPaneAtIndex: noop },
        './resizer.js': { updateResizerDisabledStates: noop, attachResizer: noop, setSplitOrientation: noop },
        './layout-math.js': { recalculateSplitSizes: split => recalculated.push([split, split.children.map(child => child.dataset.lastFlex || child.style.flex)]), recalculateAllSplitsRecursively: noop, setFlexBasisPercent: noop, parseFlexBasis: noop },
        '../core/constants.js': await import('../src/core/constants.js'),
    }, {
        document, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
        window: { dispatchEvent: noop }, CustomEvent: class {},
    });
    const empty = pane('1 1 70%');
    const survivor = pane('1 1 30%');
    const nested = el('div', { className: 'ptmt-split' }, empty, el('splitter', { className: 'ptmt-resizer-horizontal' }), survivor);
    nested.style.flex = '1 1 50%';
    nested.dataset.lastFlex = '1 1 50%';
    const neighbour = pane('1 1 50%');
    const outer = el('div', { className: 'ptmt-split' }, neighbour, el('splitter', { className: 'ptmt-resizer-vertical' }), nested);
    const center = el('div', { id: 'ptmt-centerBody', className: 'ptmt-body-column' }, outer);
    document.body.append(center);

    api.removePaneIfEmpty(empty);

    assert.equal(survivor.parentElement, outer);
    assert.equal(survivor.style.flex, '1 1 50%');
    assert.equal(survivor.dataset.lastFlex, '1 1 50%');
    assert.equal(recalculated.length, 1);
    assert.equal(recalculated[0][0], outer);
    assert.deepEqual([...recalculated[0][1]], ['1 1 50%', undefined, '1 1 50%']);
});
