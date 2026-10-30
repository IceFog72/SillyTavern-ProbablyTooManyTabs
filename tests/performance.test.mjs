import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, scheduler } from './module-harness.mjs';

const noop = () => {};

test('avatar event bursts schedule one scan and cleanup cancels it', async () => {
    const clock = scheduler();
    const events = new Map();
    let scans = 0;
    const avatar = { src: 'old' };
    const expression = { src: 'new', getAttribute: () => 'Alice' };
    const message = { getAttribute: name => name === 'ch_name' ? 'Alice' : null, querySelector: () => avatar };
    const module = await loadModule('src/integrations/avatar-expression-sync.js', {
        '../core/settings.js': { settings: { get: () => true } },
        '../core/constants.js': { SELECTORS: { ST_EXPRESSION_IMAGE: '#expression-image', ST_MESSAGE: '.mes', ST_AVATAR: '.avatar' } },
        '../../../../../../script.js': {
            eventSource: { on: (key, fn) => events.set(key, fn), off: key => events.delete(key) },
            event_types: { CHARACTER_MESSAGE_RENDERED: 'render', MESSAGE_UPDATED: 'update' },
        },
    }, {
        window: { addEventListener: noop, removeEventListener: noop },
        document: {
            querySelector: selector => selector.includes('holder') ? {} : expression,
            querySelectorAll: () => { scans++; return [message]; },
        },
        MutationObserver: class { observe() {} disconnect() {} },
        setTimeout: clock.set, clearTimeout: clock.clear,
    });
    module.initAvatarExpressionSync();
    for (let i = 0; i < 30; i++) { events.get('render')(); events.get('update')(); }
    assert.equal(clock.pending.size, 1);
    clock.flush();
    assert.equal(scans, 1);
    assert.equal(avatar.src, 'new');
    events.get('update')();
    module.cleanupAvatarExpressionSync();
    clock.flush();
    assert.equal(scans, 1);
    assert.equal(events.size, 0);
});

test('unchanged scalar settings neither save nor emit, object updates still emit', async () => {
    let saves = 0;
    const events = [];
    const store = { PTMT: { isMobile: false, tabStripMode: 'normal' } };
    const { settings } = await loadModule('src/core/settings.js', {
        '../../../../../../script.js': { saveSettingsDebounced: () => saves++, saveSettings: async () => saves++ },
        '../../../../../extensions.js': { extension_settings: store },
        '../colorizer/colorizer-settings.js': { migrateColorizerSettings: () => false },
    }, {
        navigator: { userAgent: '' },
        window: { matchMedia: () => ({ matches: false }), dispatchEvent: event => events.push(event) },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    });
    await settings.update({ enableAnimations: true });
    assert.equal(saves, 0);
    assert.equal(events.length, 0);
    await settings.update({ enableAnimations: false });
    assert.equal(saves, 1);
    assert.deepEqual([...events[0].detail.changed], ['enableAnimations']);
    await settings.update({ panelMappings: settings.get('panelMappings') });
    assert.equal(saves, 2, 'mutable object updates must remain observable');
    await settings.update({ savedLayoutDesktop: { version: 28 } });
    assert.equal(saves, 3);
    assert.equal(events.length, 2, 'layout saves must not trigger settings reactions');
});

test('editor coalesces visible renders, defers hidden work, and cancels on cleanup', async () => {
    const frames = scheduler();
    let renders = 0;
    let visible = false;
    const { LayoutManager } = await loadModule('src/editor/LayoutManager.js', {
        '../core/utils.js': { el: () => ({}), debounce: fn => fn, createIconElement: noop },
        '../core/constants.js': { SELECTORS: { DROP_INDICATOR_CLASS: '.drop' }, EVENTS: {} },
        './SettingsPanel.js': { createSettingsPanel: noop },
        './EditorRenderer.js': { renderUnifiedEditor: () => renders++ },
        './EditorDragDrop.js': Object.fromEntries(['handleDragStart', 'handleDragOver', 'handleDragLeave', 'handleDrop', 'handleTouchStart', 'handleTouchMove', 'handleTouchEnd'].map(key => [key, noop])),
        './TabSettings.js': { openTabSettingsDialog: noop, pickIcon: noop },
    }, {
        window: { addEventListener: noop, removeEventListener: noop },
        requestAnimationFrame: frames.set, cancelAnimationFrame: frames.clear,
    });
    const manager = new LayoutManager({}, {});
    manager.rootElement = { getClientRects: () => visible ? [{}] : [] };
    for (let i = 0; i < 20; i++) manager.scheduleEditorRender();
    assert.equal(frames.pending.size, 1);
    frames.flush();
    assert.equal(renders, 0);
    assert.equal(manager.editorDirty, true);
    visible = true;
    manager.scheduleEditorRender();
    manager.scheduleEditorRender();
    frames.flush();
    assert.equal(renders, 1);
    assert.equal(manager.editorDirty, false);
    manager.scheduleEditorRender();
    manager.cleanup();
    frames.flush();
    assert.equal(renders, 1);
});

test('mobile stylesheet blocking restores the original disabled/media state', async () => {
    class Link {
        constructor(disabled, media) { this.disabled = disabled; this.media = media; this.isConnected = true; }
        getAttribute(key) { return key === 'href' ? '/css/mobile-styles.css' : this.media; }
        setAttribute(key, value) { this[key] = value; }
        removeAttribute(key) { this[key] = null; }
    }
    const links = [new Link(false, null), new Link(true, 'screen')];
    const module = await loadModule('src/integrations/st-mobile-styles.js', {}, {
        HTMLLinkElement: Link,
        document: { documentElement: {}, querySelectorAll: () => links },
        MutationObserver: class { observe() {} disconnect() {} },
    });
    module.initStMobileStylesBlocker();
    assert.ok(links.every(link => link.disabled && link.media === 'not all'));
    module.cleanupStMobileStylesBlocker();
    assert.equal(links[0].disabled, false);
    assert.equal(links[0].media, null);
    assert.equal(links[1].disabled, true);
    assert.equal(links[1].media, 'screen');
});

test('panel reuse preserves content and restores tabs without placeholder nodes', async () => {
    const sourceNode = { id: 'source', getAttribute: () => null };
    const content = {
        contains: node => node === sourceNode,
        appendChild: () => { throw new Error('Existing content must not move'); },
    };
    const panel = { dataset: { panelId: 'panel-one', sourceId: 'source' }, querySelector: () => content };
    const appended = [];
    const target = {
        classList: { contains: name => name === 'ptmt-pane' },
        _panelContainer: { appendChild: node => appended.push(node) },
        _tabStrip: { querySelector: () => ({ querySelector: () => null }) },
    };
    const { createTabFromContent } = await loadModule('src/tabs/tabs.js', {
        '../core/utils.js': {
            el: noop, isElement: node => node === target,
            getPanelBySourceId: id => ['source', 'missing-placeholder'].includes(id) ? panel : null,
            getPanelById: noop, getTabById: noop, getRefs: () => ({}), createIconElement: noop, hexToRgba: noop,
        },
        '../layout/pane.js': { setPaneCollapsedView: noop, removePaneIfEmpty: noop, checkAndCollapsePaneIfAllTabsCollapsed: noop },
        './drag-drop.js': { hideCompass: noop, hideDropIndicator: noop },
        '../layout/resizer.js': { invalidatePaneTabSizeCache: noop },
        './tab-actions.js': { runTabAction: noop },
        '../core/settings.js': { settings: { getMapping: () => ({}) } },
        '../ui/context-menu.js': { showContextMenu: noop },
    }, {
        document: { getElementById: id => id === 'ptmt-staging-area' ? {} : id === 'source' ? sourceNode : null },
        window: { dispatchEvent: noop },
        CustomEvent: class {}, CSS: { escape: value => value },
    });
    assert.equal(createTabFromContent('source', { makeActive: false }, target), panel);
    assert.equal(createTabFromContent('missing-placeholder', { makeActive: false }, target), panel);
    assert.equal(appended.length, 2);
    assert.equal(createTabFromContent('absent', { makeActive: false }, target), null);
    assert.equal(appended.length, 2);
});
