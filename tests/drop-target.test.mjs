import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, el, fakeDocument } from './module-harness.mjs';

function pane() {
    const node = el('div', { className: 'ptmt-pane' });
    node._tabStrip = el('div', { className: 'ptmt-tabStrip' });
    node._panelContainer = el('div', { className: 'ptmt-panel-container' });
    node.append(node._tabStrip, node._panelContainer);
    return node;
}

async function fixture() {
    const document = fakeDocument();
    const moves = [], splits = [];
    const left = pane(), right = pane();
    const splitter = el('splitter', { className: 'ptmt-resizer-vertical' });
    const mainBody = el('div', { id: 'ptmt-main' }, el('div', { className: 'ptmt-split' }, left, splitter, right));
    document.body.append(mainBody);
    let under = null;
    document.elementFromPoint = () => under;
    const api = await loadModule('src/tabs/drag-drop.js', {
        '../layout/pane.js': { getPaneLayerCount: () => 1, splitPaneWithPane: (...args) => splits.push(args), MAX_PANE_LAYERS: 3 },
        './tabs.js': { openTab() {}, getActivePane: () => left },
        '../layout/layout-transactions.js': { moveTabTransaction: args => moves.push(args) },
        '../core/utils.js': { getPanelById: () => el('div', { dataset: { panelId: 'p1' } }), throttle: fn => fn, getRefs: () => ({ mainBody }), trackListener() {} },
    }, { document, setTimeout: () => 0 });
    api.enableInteractions();
    const drop = target => {
        under = target;
        mainBody.dispatchEvent({ type: 'drop', target, clientX: 50, clientY: 50, preventDefault() {}, dataTransfer: { getData: () => 'p1' } });
    };
    return { drop, moves, splits, left, right, splitter };
}

test('a tab dropped on a splitter between panes moves nowhere', async () => {
    const f = await fixture();
    f.drop(f.splitter);
    assert.equal(f.moves.length, 0);
    assert.equal(f.splits.length, 0);
});

test('a tab dropped on a pane still moves into that pane', async () => {
    const f = await fixture();
    f.drop(f.right._panelContainer);
    assert.equal(f.moves.length, 1);
    assert.equal(f.moves[0].pane, f.right);
});
