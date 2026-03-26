// index.js 

import { eventSource, event_types, characters, animation_duration, swipe, isSwipingAllowed } from '../../../../script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from '../../../../scripts/constants.js';
import { SELECTORS, EVENTS, MESSAGES } from './constants.js';
import { power_user } from '../../../power-user.js';

import { isDataURL } from '../../../utils.js';
import { getUserAvatar } from '../../../personas.js';
import { settings, SettingsManager } from './settings.js';

import { el, debounce, getPanelById, getTabById, getRefs, readPaneViewSettings, writePaneViewSettings, cleanupAllObservers, trackListener } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot } from './snapshot.js';
import { createLayoutIfMissing, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, openViewSettingsDialog, updateSplitCollapsedState } from './pane.js';
import {
    createTabFromContent, moveNodeIntoTab, listTabs,
    openTab, closeTabById, setDefaultPanelById, isTabHidden,
    moveTabIntoPaneAtIndex, destroyTabById,
    setActivePanelInPane, setTabCollapsed, getActivePane,
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates, validateAndCorrectAllMinSizes, checkPaneForIconMode, initGlobalResizeObserver } from './resizer.js';
import { recalculateAllSplitsRecursively } from './layout-math.js';
import { enableInteractions } from './drag-drop.js';
import { removeMouseDownDrawerHandler, openAllDrawersJq, moveToMovingDivs, overrideDelegatedEventHandler, initDrawerObserver } from './misc-helpers.js';
import { initDemotionObserver, updatePendingTabColumn } from './pending-tabs.js';
import { positionAnchor } from './positionAnchor.js';
import { initStatusBar } from './context-status-bar.js';
import { themeEngine } from './theme-engine.js';
import { initColorizer } from './dialogue-colorizer.js';
import { initAvatarExpressionSync } from './avatar-expression-sync.js';

// ─── Subsystem Init ──────────────────────────────────────────────────────────

function initSubsystems() {
    positionAnchor();
    initStatusBar();
    themeEngine.init();
    initColorizer();
    initAvatarExpressionSync();
    createLayoutIfMissing();
}

// ─── Save Handler ────────────────────────────────────────────────────────────

function createSaveHandler(state) {
    return debounce(() => {
        const doSave = () => {
            if (state.isPTMTResetting) {
                console.log('[PTMT Layout] Save blocked due to active reset.');
                return;
            }
            if (state.isHydrating) {
                console.log('[PTMT Layout] Save skipped during hydration.');
                return;
            }
            const layout = generateLayoutSnapshot();
            const isMobile = settings.get('isMobile');
            const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
            console.log(`[PTMT Layout] Auto-saving ${isMobile ? 'Mobile' : 'Desktop'} layout to ${key}.`);
            settings.update({ [key]: layout });
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(doSave, { timeout: 800 });
        } else {
            setTimeout(doSave, 0);
        }
    }, 300);
}

// ─── Public API ──────────────────────────────────────────────────────────────

function createApi(state) {
    const api = {
        createTabFromContent, moveNodeIntoTab, listTabs,
        openTab, closeTabById, getPanelById, getTabById, setDefaultPanelById, isTabHidden, _refs: getRefs,
        moveTabIntoPaneAtIndex, openViewSettingsDialog, readPaneViewSettings, writePaneViewSettings,
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
            if (layout) {
                applyLayoutSnapshot(layout, api, settings);
            } else {
                window.toastr?.error(MESSAGES.LAYOUT_NOT_FOUND(isMobile ? 'mobile' : 'desktop'), 'Layout Not Found');
            }
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
        deletePreset: (id) => {
            const presets = settings.get('presets').filter(p => p.id !== id);
            settings.update({ presets });
        },
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
            await settings.update({ [oldKey]: currentSnapshot, isMobile: !isMobile }, true);
            window.location.reload();
        }
    };
    return api;
}

// ─── Event Bindings ──────────────────────────────────────────────────────────

function bindLayoutReactions(api, saveCurrentLayoutDebounced) {
    const debouncedLayoutReaction = debounce((event) => {
        const reason = event.detail?.reason || 'unknown';
        if (reason === 'snapshotApplied') return;

        console.log(`[PTMT Layout] debouncedLayoutReaction executing. Reason: ${reason}`);
        document.querySelectorAll(SELECTORS.SPLIT).forEach(applySplitOrientation);
        document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);
        applyColumnVisibility();
        if (reason !== 'manualResize' && reason !== 'tabSwitch') {
            recalculateColumnSizes();
        }
        updateResizerDisabledStates();
        saveCurrentLayoutDebounced();
    }, 50);

    const handleLayoutChanged = (event) => {
        if (event.detail?.pane) {
            applyPaneOrientation(event.detail.pane);
        } else {
            document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);
        }
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
        } else if (link) {
            link.remove();
            for (const [cssVar] of avatarVars) {
                document.documentElement.style.removeProperty(cssVar);
            }
        }
    };

    const handleSettingsChanged = () => {
        document.body.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
        document.body.classList.toggle('ptmt-mobile', !!settings.get('isMobile'));
        document.body.classList.toggle('ptmt-auto-contrast', !!settings.get('enableOverride1') && !!settings.get('enableAutoContrast'));
        document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));
        applyOverrides();
        document.querySelectorAll(SELECTORS.PANE).forEach(checkPaneForIconMode);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
    };
    window.addEventListener(EVENTS.SETTINGS_CHANGED, handleSettingsChanged);
    trackListener(window, EVENTS.SETTINGS_CHANGED, handleSettingsChanged);

    return applyOverrides;
}

function bindSwipeHandlers() {
    // Keyboard-driven swipe — routes arrow keys to active pane
    $(document).on('keydown', async (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const focused = $(':focus');
        if (focused.is('input') || focused.is('textarea') || focused.prop('contenteditable') == 'true') return;
        if (typeof isSwipingAllowed === 'function' && !isSwipingAllowed()) return;

        const activePane = getActivePane();
        if (!activePane) return;

        e.stopImmediatePropagation();
        e.preventDefault();

        const direction = e.key === 'ArrowRight' ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
        const swipeBtn = activePane.querySelector(e.key === 'ArrowRight' ? SELECTORS.ST_SWIPE_RIGHT : SELECTORS.ST_SWIPE_LEFT);
        console.log(`[PTMT] Keyboard swipe ${e.key === 'ArrowRight' ? 'right' : 'left'} on active pane`);
        await swipe({ target: swipeBtn || activePane }, direction, { source: SWIPE_SOURCE.KEYBOARD });
    });

    // Touch swipe — routes to active pane
    const createSwipeHandler = (eventName, swipeSelector, direction, label) => {
        document.addEventListener(eventName, async (e) => {
            if (power_user.gestures === false) return;
            if (typeof Popup !== 'undefined' && Popup.util?.isPopupOpen()) return;
            if (!$(e.target).closest(SELECTORS.ST_CHAT_CONTAINER).length) return;
            if ($(SELECTORS.ST_TEXTAREA).length) return;

            const activePane = getActivePane();
            if (!activePane) return;

            const targetMes = $(e.target).closest(SELECTORS.ST_MESSAGE)[0];
            if (!targetMes || !activePane.contains(targetMes)) return;

            const swipeBtn = activePane.querySelector(swipeSelector);
            if (!swipeBtn || !$(swipeBtn).is(':visible')) return;

            console.log(`[PTMT] Touch ${label} on active pane`);
            await swipe({ target: swipeBtn }, direction, { source: 'touch' });
        });
    };

    createSwipeHandler('swiped-left', SELECTORS.ST_SWIPE_RIGHT, SWIPE_DIRECTION.RIGHT, 'swipe left (swipe right)');
    createSwipeHandler('swiped-right', SELECTORS.ST_SWIPE_LEFT, SWIPE_DIRECTION.LEFT, 'swipe right (swipe left)');
}

function bindAvatarClickOverride() {
    overrideDelegatedEventHandler(
        'click',
        `${SELECTORS.ST_MESSAGE} ${SELECTORS.ST_AVATAR}`,
        (handlerString) => handlerString.includes(`$('${SELECTORS.ST_ZOOMED_AVATAR_TEMPLATE}').html()`),
        function () {
            const messageElement = $(this).closest(SELECTORS.ST_MESSAGE);
            const thumbURL = $(this).children('img').attr('src');
            const charsPath = '/characters/';
            const targetAvatarImg = thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
            const charname = targetAvatarImg.replace('.png', '');
            const isValidCharacter = characters.some(x => x.avatar === decodeURIComponent(targetAvatarImg));

            if (!power_user.movingUI) {
                $(SELECTORS.ST_ZOOMED_AVATAR).each(function () {
                    const currentForChar = $(this).attr('forChar');
                    if (currentForChar !== charname && typeof currentForChar !== 'undefined') {
                        $(this).remove();
                    }
                });
            }

            const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
            if ($(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).length) {
                $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).fadeOut(animation_duration, () => {
                    $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).remove();
                });
            } else {
                const template = $(SELECTORS.ST_ZOOMED_AVATAR_TEMPLATE).html();
                const newElement = $(template);
                newElement.attr('forChar', charname);
                newElement.attr('id', `zoomFor_${charname}`);
                newElement.addClass('draggable');
                newElement.find(SELECTORS.ST_DRAG_GRABBER).attr('id', `zoomFor_${charname}header`);

                let movingDivsContainer = $(SELECTORS.ST_MOVING_DIVS);
                if (movingDivsContainer.length === 0) {
                    movingDivsContainer = $(`<div id="${SELECTORS.ST_MOVING_DIVS.split(',')[0].trim().substring(1)}"></div>`);
                    $('body').append(movingDivsContainer);
                }
                movingDivsContainer.append(newElement);

                newElement.fadeIn(animation_duration);
                const zoomedAvatarImgElement = $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"] img`);

                if (messageElement.attr('is_user') == 'true' || (messageElement.attr('is_system') == 'true' && !isValidCharacter)) {
                    const isValidPersona = decodeURIComponent(targetAvatarImg) in power_user.personas;
                    if (isValidPersona) {
                        const personaSrc = getUserAvatar(targetAvatarImg);
                        zoomedAvatarImgElement.attr('src', personaSrc);
                        zoomedAvatarImgElement.attr('data-izoomify-url', personaSrc);
                    } else {
                        zoomedAvatarImgElement.attr('src', thumbURL);
                        zoomedAvatarImgElement.attr('data-izoomify-url', thumbURL);
                    }
                } else if (messageElement.attr('is_user') == 'false') {
                    zoomedAvatarImgElement.attr('src', avatarSrc);
                    zoomedAvatarImgElement.attr('data-izoomify-url', avatarSrc);
                }

                $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).css('display', 'flex');
                if (power_user.zoomed_avatar_magnification) {
                    $(`${SELECTORS.ST_ZOOMED_AVATAR}_container`).izoomify();
                }
                newElement.on('click touchend', (e) => {
                    if (e.target.closest(SELECTORS.ST_DRAG_CLOSE)) {
                        newElement.fadeOut(animation_duration, () => newElement.remove());
                    }
                });
            }
        }
    );
}

// ─── Layout Loading ──────────────────────────────────────────────────────────

function loadInitialLayout(api) {
    const isMobile = settings.get('isMobile');
    const savedLayout = isMobile ? settings.get('savedLayoutMobile') : settings.get('savedLayoutDesktop');
    const defaultLayout = settings.get('defaultLayout');

    if (savedLayout) {
        console.log(`[PTMT Layout] Loading saved ${isMobile ? 'mobile' : 'desktop'} layout.`);
        applyLayoutSnapshot(savedLayout, api, settings);
    } else {
        console.log('[PTMT Layout] No saved layout found, checking for mobile device.');
        if (SettingsManager.isMobile() || isMobile) {
            console.log('[PTMT Layout] Mobile mode active, applying optimized mobile layout.');
            const mobileLayout = settings.get('mobileLayout') || SettingsManager.getMobileLayout(defaultLayout);
            settings.update({ isMobile: true, showIconsOnly: true });
            applyLayoutSnapshot(mobileLayout, api, settings);
        } else {
            console.log('[PTMT Layout] Applying default desktop layout.');
            applyLayoutSnapshot(defaultLayout, api, settings);
        }
    }
}

// ─── Post-Init ───────────────────────────────────────────────────────────────

function postInit(state, applyOverrides) {
    try { openAllDrawersJq(); } catch (e) {
        console.warn('[PTMT] Failed to open all drawers:', e);
    }
    try { removeMouseDownDrawerHandler(); } catch (e) {
        console.warn('[PTMT] Failed to remove mouse down drawer handler:', e);
    }

    const isMobile = settings.get('isMobile');
    document.body.classList.toggle('ptmt-mobile', !!isMobile);
    document.body.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
    document.body.classList.toggle('ptmt-auto-contrast', !!settings.get('enableOverride1') && !!settings.get('enableAutoContrast'));
    document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));

    enableInteractions();
    recalculateColumnSizes();
    updateResizerDisabledStates();

    state.isHydrating = false;
    console.log('[PTMT Layout] Hydration complete. Monitoring layout changes.');
    initDrawerObserver();
    applyOverrides();
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(function () {
    function initApp() {
        const state = { isPTMTResetting: false, isHydrating: true };

        initSubsystems();
        const saveCurrentLayoutDebounced = createSaveHandler(state);
        const api = createApi(state);
        window.ptmtTabs = api;
        const applyOverrides = bindLayoutReactions(api, saveCurrentLayoutDebounced);
        initGlobalResizeObserver();
        moveToMovingDivs(['expression-plus-wrapper', 'charlib-embedded-container']);
        loadInitialLayout(api);
        postInit(state, applyOverrides);
        bindSwipeHandlers();
        bindAvatarClickOverride();
        initDemotionObserver(api);

        return api;
    }

    document.body.insertAdjacentHTML('beforeend', `<div id="${SELECTORS.SETTINGS_WRAPPER.substring(1)}" style="display:none;"></div>`);
    eventSource.on(event_types.APP_READY, () => { initApp(); });
})();

// ─── Lifecycle Hooks ─────────────────────────────────────────────────────────

export async function onActivate() {
    console.log('[PTMT] Extension activated');
}

export async function onInstall() {
    console.log('[PTMT] Extension installed');
}

export async function onDelete() {
    console.log('[PTMT] Extension deleted, cleaning up settings');
    cleanupAllObservers();
    await settings.cleanup();
}

export async function onEnable() {
    console.log('[PTMT] Extension enabled');
}

export async function onDisable() {
    console.log('[PTMT] Extension disabled');
    cleanupAllObservers();
}

export async function onUpdate() {
    console.log('[PTMT] Extension updated');
}
