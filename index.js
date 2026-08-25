// index.js

import { eventSource, event_types, swipe, isSwipingAllowed } from '../../../../script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from '../../../../scripts/constants.js';
import { SELECTORS, EVENTS, MESSAGES } from './constants.js';
import { settings, SettingsManager } from './settings.js';
import { debounce, getPanelById, getTabById, getRefs, readPaneViewSettings, writePaneViewSettings, cleanupAllObservers, trackListener, registerBodyObserver } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot, migrateSavedLayouts } from './snapshot.js';
import { createLayoutIfMissing, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, openViewSettingsDialog, updateSplitCollapsedState } from './pane.js';
import {
    createTabFromContent, moveNodeIntoTab, listTabs,
    openTab, closeTabById, setDefaultPanelById, isTabHidden,
    destroyTabById, setActivePanelInPane, setTabCollapsed, getActivePane,
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates, checkPaneForIconMode, initGlobalResizeObserver } from './resizer.js';
import { enableInteractions } from './drag-drop.js';
import { moveTabTransaction } from './layout-transactions.js';
import { moveToMovingDivs, initDrawerObserver, cleanupDrawerObserver, moveBg1ToSheld } from './misc-helpers.js';
import { initDemotionObserver, updatePendingTabColumn } from './pending-tabs.js';
import { positionAnchor, cleanupPositionAnchor } from './positionAnchor.js';
import { initStatusBar, initWorldInfoStatusBar, cleanupStatusBars } from './context-status-bar.js';
import { themeEngine } from './theme-engine.js';
import { initColorizer } from './dialogue-colorizer.js';
import { initCharacterColorizerUI } from './character-colorizer-ui.js';
import { initAvatarExpressionSync, cleanupAvatarExpressionSync } from './avatar-expression-sync.js';
import { initInspectorScaleControl, cleanupInspectorScaleControl } from './ui-injection.js';
import { initThemeColors } from './theme-colors.js';
import { initMessageRail, cleanupMessageRail } from './message-rail.js';
import { initStMobileStylesBlocker, cleanupStMobileStylesBlocker } from './st-mobile-styles.js';

// ─── Subsystem Init ──────────────────────────────────────────────────────────
function initSubsystems() {
    initStMobileStylesBlocker();
    positionAnchor();
    initStatusBar();
    initWorldInfoStatusBar();
    themeEngine.init();
    initColorizer();
    initCharacterColorizerUI();
    initAvatarExpressionSync();
    initInspectorScaleControl();
    initMessageRail();
    initRangeStyleSync();
    createLayoutIfMissing();
}

function updateRangeStyle(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
    const max = Number.isFinite(Number(input.max)) ? Number(input.max) : 100;
    const value = Number.isFinite(Number(input.value)) ? Number(input.value) : min;
    const span = Math.max(1, max - min);
    const percent = Math.max(0, Math.min(100, ((value - min) / span) * 100));
    input.style.setProperty('--value', `${percent}%`);
}

function updateRangesIn(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'range') {
        updateRangeStyle(root);
        return;
    }
    root.querySelectorAll?.('input[type="range"]').forEach(updateRangeStyle);
}

function initRangeStyleSync() {
    updateRangesIn();
    const updateFromEvent = (event) => updateRangeStyle(event.target);
    document.addEventListener('input', updateFromEvent, true);
    document.addEventListener('change', updateFromEvent, true);
    trackListener(document, 'input', updateFromEvent, true);
    trackListener(document, 'change', updateFromEvent, true);

    registerBodyObserver(
        'range-style-sync',
        { childList: true, attributes: true, attributeFilter: ['value', 'min', 'max'] },
        (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    updateRangesIn(mutation.target);
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) updateRangesIn(node);
                }
            }
        }
    );
}

// ─── Tab Strip Mode ──────────────────────────────────────────────────────────
function getGlobalTabStripMode() {
    const explicit = settings.get('tabStripMode');
    if (explicit && explicit !== 'normal') return explicit;
    if (settings.get('tabStripAutoHide')) return 'auto-hide';
    return 'normal';
}

function getEffectiveTabStripMode(pane) {
    const isCollapsed = pane.classList.contains('view-collapsed');
    const vs = readPaneViewSettings(pane);
    const paneMode = vs.tabStripMode || 'normal';
    const globalMode = getGlobalTabStripMode();
    const mode = paneMode !== 'normal' ? paneMode : globalMode;
    if (mode === 'auto-hide' && isCollapsed) return 'normal';
    return mode;
}

function ensureShyIndicator(pane, shouldExist) {
    const grid = pane.querySelector('.ptmt-pane-grid');
    if (!grid) return;
    const existing = grid.querySelector('.ptmt-shy-indicator');
    if (shouldExist && !existing) {
        const indicator = document.createElement('div');
        indicator.className = 'ptmt-shy-indicator';
        grid.prepend(indicator);
    } else if (!shouldExist && existing) {
        existing.remove();
    }
}

function applyTabStripMode(pane) {
    const mode = getEffectiveTabStripMode(pane);
    const shouldMinimize = mode === 'auto-hide' || mode === 'shy';
    pane.classList.toggle('ptmt-tabstrip-minimized', shouldMinimize);
    ensureShyIndicator(pane, shouldMinimize);
}

function initTabStripMode() {
    const updateAll = () => document.querySelectorAll(SELECTORS.PANE).forEach(applyTabStripMode);
    updateAll();
    registerBodyObserver(
        'tab-strip-mode',
        { childList: true, attributes: true, attributeFilter: ['class'] },
        (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node instanceof Element && node.classList.contains(SELECTORS.PANE.substring(1))) applyTabStripMode(node);
                    }
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target instanceof Element && target.classList.contains(SELECTORS.PANE.substring(1))) applyTabStripMode(target);
                }
            }
        }
    );
    return updateAll;
}

// ─── Save Handler ────────────────────────────────────────────────────────────
function createSaveHandler(state) {
    return debounce(() => {
        if (state.isPTMTResetting || state.isHydrating) return;
        const layout = generateLayoutSnapshot();
        const isMobile = settings.get('isMobile');
        const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
        settings.update({ [key]: layout });
    }, 300);
}

// ─── Public API ──────────────────────────────────────────────────────────────
function createApi(state) {
    const hideTabById = (pid, index = null) => {
        const panel = getPanelById(pid);
        const sourceId = panel?.dataset?.sourceId;
        if (!pid || !sourceId) return false;
        if (sourceId === 'ptmt-settings-wrapper-content' || sourceId === 'ptmt-info-wrapper-content') {
            alert('This PTMT panel cannot be hidden. It must remain in one of the columns.');
            return false;
        }

        const tab = getTabById(pid);
        const hiddenInfo = {
            sourceId,
            active: tab?.classList.contains('active') === true,
            collapsed: tab?.classList.contains('collapsed') === true
        };

        const contentRoot = panel.querySelector('.ptmt-panel-content');
        const contents = contentRoot ? Array.from(contentRoot.children).filter(node => node.tagName !== 'SCRIPT') : [];
        if (contents.length) {
            let stagingArea = document.querySelector(SELECTORS.STAGING_AREA);
            if (!stagingArea) {
                stagingArea = document.createElement('div');
                stagingArea.id = SELECTORS.STAGING_AREA.substring(1);
                stagingArea.style.display = 'none';
                document.body.appendChild(stagingArea);
            }
            stagingArea.append(...contents);
        }

        destroyTabById(pid);
        const layout = generateLayoutSnapshot();
        if (!layout) return false;
        if (!layout.hiddenTabs) layout.hiddenTabs = [];
        layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== sourceId);
        const insertIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, layout.hiddenTabs.length)) : layout.hiddenTabs.length;
        layout.hiddenTabs.splice(insertIndex, 0, hiddenInfo);
        settings.update({ [settings.getActiveLayoutKey()]: layout });
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'tabHidden' } }));
        return true;
    };

    const api = {
        createTabFromContent, moveNodeIntoTab, listTabs,
        openTab, closeTabById, hideTabById, getPanelById, getTabById, setDefaultPanelById, isTabHidden, _refs: getRefs,
        moveTabIntoPaneAtIndex: (panel, pane, index) => moveTabTransaction({ panel, pane, index }),
        openViewSettingsDialog, readPaneViewSettings, writePaneViewSettings,
        setActivePanelInPane, setTabCollapsed,
        applyPaneOrientation, attachResizer, setSplitOrientation, updateSplitCollapsedState, applySplitOrientation,
        generateLayoutSnapshot, destroyTabById, updatePendingTabColumn, checkPaneForIconMode,
        saveLayout: () => {
            const layout = generateLayoutSnapshot();
            const isMobile = settings.get('isMobile');
            const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
            settings.update({ [key]: layout });
            window.toastr?.success(MESSAGES.LAYOUT_SAVED(isMobile ? 'Mobile' : 'Desktop'), 'Layout Saved');
        },
        loadLayout: () => {
            const isMobile = settings.get('isMobile');
            const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
            const layout = settings.get(key);
            if (layout) applyLayoutSnapshot(layout, api, settings);
            else window.toastr?.error(MESSAGES.LAYOUT_NOT_FOUND(isMobile ? 'mobile' : 'desktop'), 'Layout Not Found');
        },
        resetLayout: async () => {
            if (confirm(MESSAGES.RESET_CONFIRMATION)) {
                state.isPTMTResetting = true;
                await settings.reset(true);
                window.location.reload();
            }
        },
        savePreset: (name) => {
            const layout = generateLayoutSnapshot();
            const presets = settings.get('presets').slice();
            const existingPresetIndex = presets.findIndex(p => p.name === name);
            if (existingPresetIndex !== -1) {
                presets[existingPresetIndex].layout = layout;
                window.toastr?.success(`Preset '${name}' has been updated.`, 'Preset Updated');
            } else {
                presets.push({ id: Date.now().toString(), name, layout });
            }
            settings.update({ presets });
        },
        loadPreset: (id) => {
            const preset = settings.get('presets').find(p => p.id === id);
            if (preset) applyLayoutSnapshot(preset.layout, api, settings);
        },
        deletePreset: (id) => settings.update({ presets: settings.get('presets').filter(p => p.id !== id) }),
        switchToMobileLayout: (sourceLayout) => {
            const source = sourceLayout || generateLayoutSnapshot();
            settings.update({ showIconsOnly: true });
            applyLayoutSnapshot(SettingsManager.getMobileLayout(source), api, settings);
        },
        switchToDesktopLayout: (sourceLayout) => {
            const source = sourceLayout || generateLayoutSnapshot();
            settings.update({ showIconsOnly: false });
            applyLayoutSnapshot(SettingsManager.getDesktopLayout(source), api, settings);
        },
        toggleMobileMode: async () => {
            const currentSnapshot = generateLayoutSnapshot();
            const isMobile = settings.get('isMobile');
            const oldKey = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
            const extraUpdates = isMobile ? { showIconsOnly: false } : {};
            await settings.update({ [oldKey]: currentSnapshot, isMobile: !isMobile, ...extraUpdates }, true);
            window.location.reload();
        },
        getAvailableThemes: () => Object.entries(SettingsManager.themes).map(([key, config]) => ({
            id: key, name: config.name, description: config.description
        })),
        setUITheme: (themeName) => {
            if (!SettingsManager.themes[themeName]) {
                console.error(`[PTMT] Unknown theme: ${themeName}`);
                return;
            }
            settings.update({ uiTheme: themeName });
        },
        getCurrentUITheme: () => settings.get('uiTheme') || 'sharp'
    };
    return api;
}

// ─── Event Bindings ──────────────────────────────────────────────────────────
function bindLayoutReactions(state, api, saveCurrentLayoutDebounced) {
    const debouncedLayoutReaction = debounce((event) => {
        const reason = event.detail?.reason || 'unknown';
        if (reason === 'snapshotApplied') return;
        document.querySelectorAll(SELECTORS.SPLIT).forEach(applySplitOrientation);
        document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);
        applyColumnVisibility();
        if (!['manualResize', 'tabSwitch', 'paneCollapsed', 'splitStructuralChange'].includes(reason)) recalculateColumnSizes();
        updateResizerDisabledStates();
        state.updateTabStripMode?.();
        saveCurrentLayoutDebounced();
    }, 50);

    const handleLayoutChanged = (event) => {
        if (event.detail?.pane) applyPaneOrientation(event.detail.pane);
        else document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);
        debouncedLayoutReaction(event);
    };
    window.addEventListener(EVENTS.LAYOUT_CHANGED, handleLayoutChanged, { passive: true });
    trackListener(window, EVENTS.LAYOUT_CHANGED, handleLayoutChanged, { passive: true });

    const extensionPath = '/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs';
    const avatarVars = [
        ['--ptmt-avatar-base-height', 'avatarBaseHeight', '14vh'],
        ['--ptmt-avatar-base-width', 'avatarBaseWidth', '8vw'],
        ['--ptmt-avatar-base-border-radius', 'avatarBaseBorderRadius', '0.5rem'],
        ['--ptmt-normal-avatar-size', 'normalAvatarSize', '48px'],
        ['--ptmt-avatar-scale-width', 'avatarScaleWidth', '1'],
        ['--ptmt-avatar-scale-height', 'avatarScaleHeight', '1.6'],
        ['--ptmt-char-list-avatar-width', 'charListAvatarWidth', '4vw'],
        ['--ptmt-char-list-avatar-height', 'charListAvatarHeight', 'auto'],
        ['--ptmt-char-list-avatar-scale', 'charListAvatarScale', '1'],
    ];

    const applyOverrides = () => {
        const enabled = settings.get('enableOverride1');
        let link = document.querySelector(SELECTORS.OVERRIDES_LINK);
        if (enabled) {
            if (!link) {
                link = document.createElement('link');
                link.id = SELECTORS.OVERRIDES_LINK.substring(1);
                link.rel = 'stylesheet';
                link.href = `${extensionPath}/overrides-1.css`;
                document.head.appendChild(link);
            }
            for (const [cssVar, settingKey, fallback] of avatarVars) {
                document.documentElement.style.setProperty(cssVar, settings.get(settingKey) || fallback);
            }
        } else {
            link?.remove();
            for (const [cssVar] of avatarVars) document.documentElement.style.removeProperty(cssVar);
        }
    };

    const handleSettingsChanged = () => {
        document.body.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
        document.body.classList.toggle('ptmt-mobile', !!settings.get('isMobile'));
        document.body.classList.toggle('ptmt-auto-contrast', !!settings.get('enableOverride1') && !!settings.get('enableAutoContrast'));
        document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));
        document.body.classList.toggle('ptmt-enable-animations', !!settings.get('enableAnimations'));
        document.body.classList.toggle('ptmt-enable-shadows', !!settings.get('enableShadows'));
        const bodyBgColor = settings.get('bodyBgColor') || 'rgb(29, 29, 29)';
        document.documentElement.style.setProperty('--ptmt-body-bg-color', bodyBgColor);
        const bodyBgAlpha = themeEngine.setBodyBgColor(bodyBgColor);
        document.body.classList.toggle('ptmt-bg-under-chat', !!settings.get('moveBg1ToSheld') && bodyBgAlpha > 0.05);
        SettingsManager.applyTheme(settings.get('uiTheme') || 'sharp');
        applyOverrides();
        state.updateTabStripMode?.();
        document.querySelectorAll(SELECTORS.PANE).forEach(checkPaneForIconMode);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
    };
    window.addEventListener(EVENTS.SETTINGS_CHANGED, handleSettingsChanged);
    trackListener(window, EVENTS.SETTINGS_CHANGED, handleSettingsChanged);
    return applyOverrides;
}

function isEditableShortcutTarget(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
}

function initLayoutResetShortcut(appApi) {
    const handler = (event) => {
        if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
        if (event.key.toLowerCase() !== 'r') return;
        if (isEditableShortcutTarget(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        appApi.resetLayout();
    };
    document.addEventListener('keydown', handler, true);
    trackListener(document, 'keydown', handler, true);
}

function initActivePaneKeyboardSwipe() {
    const handler = async (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (isEditableShortcutTarget(event.target)) return;
        if (typeof isSwipingAllowed === 'function' && !isSwipingAllowed()) return;

        const activePane = getActivePane();
        if (!activePane) return;

        const isRight = event.key === 'ArrowRight';
        const selector = isRight ? SELECTORS.ST_SWIPE_RIGHT : SELECTORS.ST_SWIPE_LEFT;
        const swipeButton = activePane.querySelector(selector);

        // Only take ownership when the active pane actually contains ST's swipe UI.
        // This avoids stealing arrow keys from unrelated tabs while preventing ST's
        // global keyboard handler from swiping a different/hidden chat instance.
        if (!swipeButton || swipeButton.getClientRects().length === 0) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const direction = isRight ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
        await swipe({ target: swipeButton }, direction, { source: SWIPE_SOURCE.KEYBOARD });
    };

    // Capture phase is intentional: SillyTavern also has a global arrow-key
    // handler. PTMT must route the key to the active pane before that runs.
    document.addEventListener('keydown', handler, true);
    trackListener(document, 'keydown', handler, true);
}

// SillyTavern owns zoomed-avatar creation/configuration. PTMT's pending-tab
// manager already observes direct body additions and will hydrate `.zoomed_avatar`
// into the configured Avatar tab after the native handler finishes.

// ─── Layout Loading ──────────────────────────────────────────────────────────
function loadInitialLayout(api) {
    migrateSavedLayouts(settings);
    const isMobile = settings.get('isMobile');
    const savedLayout = isMobile ? settings.get('savedLayoutMobile') : settings.get('savedLayoutDesktop');
    const defaultLayout = settings.get('defaultLayout');

    if (savedLayout) {
        applyLayoutSnapshot(savedLayout, api, settings);
    } else if (SettingsManager.isMobile() || isMobile) {
        const mobileLayout = settings.get('mobileLayout') || SettingsManager.getMobileLayout(defaultLayout);
        settings.update({ isMobile: true, showIconsOnly: true });
        applyLayoutSnapshot(mobileLayout, api, settings);
    } else {
        applyLayoutSnapshot(defaultLayout, api, settings);
    }
}

// ─── Post-Init ───────────────────────────────────────────────────────────────
function postInit(state, applyOverrides) {
    const isMobile = settings.get('isMobile');
    document.body.classList.toggle('ptmt-mobile', !!isMobile);
    document.body.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
    document.body.classList.toggle('ptmt-auto-contrast', !!settings.get('enableOverride1') && !!settings.get('enableAutoContrast'));
    document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));
    document.body.classList.toggle('ptmt-enable-animations', !!settings.get('enableAnimations'));
    document.body.classList.toggle('ptmt-enable-shadows', !!settings.get('enableShadows'));
    document.body.classList.toggle('ptmt-enable-blur-effect', !!settings.get('enableBlurEffect'));

    const bodyBgColor = settings.get('bodyBgColor') || 'rgb(29, 29, 29)';
    document.documentElement.style.setProperty('--ptmt-body-bg-color', bodyBgColor);
    const bodyBgAlpha = themeEngine.setBodyBgColor(bodyBgColor);
    document.body.classList.toggle('ptmt-bg-under-chat', !!settings.get('moveBg1ToSheld') && bodyBgAlpha > 0.05);
    SettingsManager.applyTheme(settings.get('uiTheme') || 'sharp');
    if (settings.get('moveBg1ToSheld')) moveBg1ToSheld();

    enableInteractions();
    recalculateColumnSizes();
    updateResizerDisabledStates();
    state.isHydrating = false;
    initDrawerObserver();
    applyOverrides();
    state.updateTabStripMode = initTabStripMode();
}

function cleanupRuntimeSubsystems() {
    cleanupInspectorScaleControl();
    cleanupAvatarExpressionSync();
    cleanupMessageRail();
    cleanupStMobileStylesBlocker();
    cleanupPositionAnchor();
    cleanupDrawerObserver();
    cleanupStatusBars();
    cleanupAllObservers();
    document.querySelector(SELECTORS.OVERRIDES_LINK)?.remove();
    document.body?.classList.remove(
        'ptmt-mobile', 'ptmt-global-icons-only', 'ptmt-auto-contrast', 'ptmt-optimize-visibility',
        'ptmt-enable-animations', 'ptmt-enable-shadows', 'ptmt-enable-blur-effect', 'ptmt-bg-under-chat'
    );
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
(function () {
    function initApp() {
        if (window.ptmtTabs) cleanupRuntimeSubsystems();
        const state = { isPTMTResetting: false, isHydrating: true };

        initSubsystems();
        initThemeColors();
        const saveCurrentLayoutDebounced = createSaveHandler(state);
        const api = createApi(state);
        window.ptmtTabs = api;
        const applyOverrides = bindLayoutReactions(state, api, saveCurrentLayoutDebounced);
        initGlobalResizeObserver();
        moveToMovingDivs(['expression-plus-wrapper', 'charlib-embedded-container']);
        loadInitialLayout(api);
        postInit(state, applyOverrides);
        initLayoutResetShortcut(api);
        initActivePaneKeyboardSwipe();
        initDemotionObserver(api);
        return api;
    }

    if (!document.getElementById(SELECTORS.SETTINGS_WRAPPER.substring(1))) {
        document.body.insertAdjacentHTML('beforeend', `<div id="${SELECTORS.SETTINGS_WRAPPER.substring(1)}" style="display:none;"></div>`);
    }
    eventSource.on(event_types.APP_READY, initApp);
})();

// ─── Lifecycle Hooks ─────────────────────────────────────────────────────────
export async function onActivate() {}
export async function onInstall() {}

export async function onDelete() {
    cleanupRuntimeSubsystems();
    await settings.cleanup();
}

export async function onEnable() {
    window.location.reload();
}

export async function onDisable() {
    cleanupRuntimeSubsystems();
}

export async function onUpdate() {}
