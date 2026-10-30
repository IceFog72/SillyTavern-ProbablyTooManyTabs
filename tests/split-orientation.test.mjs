import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';

async function fixture() {
    const document = fakeDocument();
    const oriented = [];
    const noop = () => {};
    const api = await loadModule('src/layout/resizer.js', {
        '../core/utils.js': { $$: noop, throttle: fn => fn, debounce: fn => fn, getRefs: () => ({}), invalidateMinWidthCache: noop, calculateElementMinWidth: () => 0, readPaneViewSettings: () => ({}), trackObserver: noop },
        './layout-math.js': { normalizeFlexBasis: noop, setFlexBasisPercent: noop, pxToPercent: () => 0, applyIntelligentExpansion: noop, recalculateAllSplitsRecursively: noop, recalculateMultipleSubtreesOptimized: noop },
        './pane.js': { setPaneCollapsedView: noop, applyPaneOrientation: pane => oriented.push(pane) },
        './layout.js': { recalculateColumnSizes: noop },
        '../core/constants.js': (await import('../src/core/constants.js')),
        '../core/settings.js': { settings: { get: () => false } },
    }, { document, window: { addEventListener: noop, removeEventListener: noop, dispatchEvent: noop }, CustomEvent: class {} });

    // outer: [inner split, outer splitter, pane C, second outer splitter, pane D]
    const paneA = el('div', { className: 'ptmt-pane' });
    const paneB = el('div', { className: 'ptmt-pane' });
    const innerResizer = el('splitter', { className: 'ptmt-resizer-horizontal' });
    const inner = el('div', { className: 'ptmt-split horizontal' }, paneA, innerResizer, paneB);
    const outerResizer = el('splitter', { className: 'ptmt-resizer-vertical disabled' });
    const secondResizer = el('splitter', { className: 'ptmt-resizer-vertical' });
    const paneC = el('div', { className: 'ptmt-pane' });
    const paneD = el('div', { className: 'ptmt-pane' });
    const outer = el('div', { className: 'ptmt-split' }, inner, outerResizer, paneC, secondResizer, paneD);
    document.body.append(outer);
    return { api, oriented, inner, innerResizer, outer, outerResizer, secondResizer, panes: [paneA, paneB, paneC, paneD] };
}

test('flipping a split re-orients its panes without throwing', async () => {
    const f = await fixture();
    f.api.setSplitOrientation(f.outer, 'horizontal');
    assert.equal(f.outer.classList.contains('horizontal'), true);
    assert.deepEqual(new Set(f.oriented), new Set(f.panes));
});

test('flipping a split updates only its own splitters and keeps disabled state', async () => {
    const f = await fixture();
    f.api.setSplitOrientation(f.outer, 'horizontal');
    assert.equal(f.outerResizer.className, 'ptmt-resizer-horizontal disabled');
    assert.equal(f.secondResizer.className, 'ptmt-resizer-horizontal');
    assert.equal(f.innerResizer.className, 'ptmt-resizer-horizontal');
    assert.equal(f.outerResizer.style.cursor, 'row-resize');
    assert.equal(f.secondResizer.style.cursor, 'row-resize');
    assert.equal(f.innerResizer.style.cursor, undefined);
});
