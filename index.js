// index.js 

import { eventSource, event_types, characters, animation_duration, swipe, isSwipingAllowed } from '../../../../script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from '../../../../scripts/constants.js';
import { SELECTORS, EVENTS, MESSAGES } from './constants.js';
import { power_user } from '../../../power-user.js';

import { isDataURL } from '../../../utils.js';
import { getUserAvatar } from '../../../personas.js';
import { settings, SettingsManager } from './settings.js';

import { el, debounce, getPanelById, getTabById, getRefs, readPaneViewSettings, writePaneViewSettings } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot } from './snapshot.js';
import { createLayoutIfMissing, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, openViewSettingsDialog, updateSplitCollapsedState } from './pane.js';
import {
  createTabFromContent, moveNodeIntoTab, listTabs,
  openTab, closeTabById, setDefaultPanelById,
  moveTabIntoPaneAtIndex, destroyTabById,
  setActivePanelInPane, setTabCollapsed, getActivePane,
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates, validateAndCorrectAllMinSizes, checkPaneForIconMode, initGlobalResizeObserver } from './resizer.js';
import { recalculateAllSplitsRecursively } from './layout-math.js';
import { enableInteractions } from './drag-drop.js';
import { removeMouseDownDrawerHandler, openAllDrawersJq, moveBgDivs, moveToMovingDivs, overrideDelegatedEventHandler, initDrawerObserver } from './misc-helpers.js';
import { initDemotionObserver, updatePendingTabColumn } from './pending-tabs.js';
import { positionAnchor } from './positionAnchor.js';
import { initStatusBar } from './context-status-bar.js';
import { themeEngine } from './theme-engine.js';
import { initColorizer } from './dialogue-colorizer.js';
import { initAvatarExpressionSync } from './avatar-expression-sync.js';

(function () {
  function initApp() {
    let isPTMTResetting = false;
    let isHydrating = true;
    positionAnchor();
    initStatusBar();
    themeEngine.init();
    initColorizer();
    initAvatarExpressionSync();
    createLayoutIfMissing();
    const refs = getRefs();

    let stagingArea = document.querySelector(SELECTORS.STAGING_AREA);
    if (!stagingArea) {
      stagingArea = el('div', { id: SELECTORS.STAGING_AREA.substring(1), style: { display: 'none' } });
      document.body.appendChild(stagingArea);
    }


    const saveCurrentLayoutDebounced = debounce(() => {
      const doSave = () => {
        if (isPTMTResetting) {
          console.log(`[PTMT Layout] 🛡️ Save blocked due to active reset.`);
          return;
        }
        if (isHydrating) {
          console.log(`[PTMT Layout] 🛡️ Save skipped during hydration.`);
          return;
        }
        const layout = generateLayoutSnapshot();
        const isMobile = settings.get('isMobile');
        const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
        console.log(`[PTMT Layout] 💾 Auto-saving ${isMobile ? 'Mobile' : 'Desktop'} layout to ${key}.`);
        settings.update({ [key]: layout });
      };
      // Run during browser idle time to avoid blocking UI interactions
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(doSave, { timeout: 800 });
      } else {
        setTimeout(doSave, 0);
      }
    }, 300);

    const api = {
      createTabFromContent, moveNodeIntoTab, listTabs,
      openTab, closeTabById, getPanelById, getTabById, setDefaultPanelById, _refs: getRefs,
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
          isPTMTResetting = true;
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
          const newPreset = { id: Date.now().toString(), name, layout };
          presets.push(newPreset);
        }
        settings.update({ presets });
      },
      loadPreset: (id) => {
        const preset = settings.get('presets').find(p => p.id === id);
        if (preset) {
          applyLayoutSnapshot(preset.layout, api, settings);
        }
      },
      deletePreset: (id) => {
        const presets = settings.get('presets').filter(p => p.id !== id);
        settings.update({ presets });
      },
      switchToMobileLayout: (sourceLayout) => {
        const source = sourceLayout || generateLayoutSnapshot();
        const mobileLayout = SettingsManager.getMobileLayout(source);
        settings.update({ showIconsOnly: true });
        applyLayoutSnapshot(mobileLayout, api, settings);
      },
      switchToDesktopLayout: (sourceLayout) => {
        const source = sourceLayout || generateLayoutSnapshot();
        const desktopLayout = SettingsManager.getDesktopLayout(source);
        settings.update({ showIconsOnly: false });
        applyLayoutSnapshot(desktopLayout, api, settings);
      },
      toggleMobileMode: async () => {
        const currentSnapshot = generateLayoutSnapshot();
        const isMobile = settings.get('isMobile');
        const oldKey = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';

        // Save current to old slot and toggle mode
        await settings.update({
          [oldKey]: currentSnapshot,
          isMobile: !isMobile
        }, true); // Force sync save

        window.location.reload();
      }
    };
    window.ptmtTabs = api;

    const debouncedLayoutReaction = debounce((event) => {
      const reason = event.detail?.reason || 'unknown';
      if (reason === 'snapshotApplied') return;

      console.log(`[PTMT Layout] 🔄 debouncedLayoutReaction executing. Reason: ${reason}`);

      // First apply layout/orientation classes so sizes can be calculated correctly
      document.querySelectorAll(SELECTORS.SPLIT).forEach(applySplitOrientation);
      document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);


      applyColumnVisibility();

      if (reason !== 'manualResize' && reason !== 'tabSwitch') {
        recalculateColumnSizes();
      }

      updateResizerDisabledStates();
      saveCurrentLayoutDebounced();
    }, 50);

    window.addEventListener(EVENTS.LAYOUT_CHANGED, (event) => {

      const reason = event.detail?.reason || 'unknown';

      // Always update orientations immediately (cheap, no reflow usually)
      if (event.detail?.pane) {
        applyPaneOrientation(event.detail.pane);
      } else {
        document.querySelectorAll(SELECTORS.PANE).forEach(applyPaneOrientation);
      }


      // Batch everything else
      debouncedLayoutReaction(event);
    }, { passive: true });

    const extensionPath = '/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs';
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
      } else if (link) {
        link.remove();
      }
    };


    window.addEventListener(EVENTS.SETTINGS_CHANGED, (event) => {

      const { changed } = event.detail || {};
      const showIconsOnly = settings.get('showIconsOnly');
      const isMobile = settings.get('isMobile');

      const refs = getRefs();
      document.body.classList.toggle('ptmt-global-icons-only', !!showIconsOnly);
      document.body.classList.toggle('ptmt-mobile', !!isMobile);
      document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));


      applyOverrides();
      document.querySelectorAll(SELECTORS.PANE).forEach(checkPaneForIconMode);
      window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
    });


    initGlobalResizeObserver();

    moveToMovingDivs();
    const isMobile = settings.get('isMobile');
    const savedLayout = isMobile ? settings.get('savedLayoutMobile') : settings.get('savedLayoutDesktop');
    const defaultLayout = settings.get('defaultLayout');
    const mobileLayout = settings.get('mobileLayout');

    if (savedLayout) {
      console.log(`[PTMT Layout] Loading saved ${isMobile ? 'mobile' : 'desktop'} layout.`);
      applyLayoutSnapshot(savedLayout, api, settings);
    } else {
      console.log("[PTMT Layout] No saved layout found, checking for mobile device.");
      if (SettingsManager.isMobile() || isMobile) {
        console.log("[PTMT Layout] Mobile mode active, applying optimized mobile layout.");
        const targetMobileLayout = mobileLayout || SettingsManager.getMobileLayout(defaultLayout);
        settings.update({ isMobile: true, showIconsOnly: true });
        applyLayoutSnapshot(targetMobileLayout, api, settings);
      } else {
        console.log("[PTMT Layout] Applying default desktop layout.");
        applyLayoutSnapshot(defaultLayout, api, settings);
      }
    }


    try { openAllDrawersJq(); } catch (e) {
      console.warn('[PTMT] Failed to open all drawers:', e);
    }
    try { removeMouseDownDrawerHandler(); } catch (e) {
      console.warn('[PTMT] Failed to remove mouse down drawer handler:', e);
    }
    document.body.classList.toggle('ptmt-mobile', !!isMobile);
    document.body.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
    document.body.classList.toggle('ptmt-optimize-visibility', !!settings.get('enableOverride1') && !!settings.get('optimizeMessageVisibility'));


    enableInteractions();

    recalculateColumnSizes();
    updateResizerDisabledStates();

    isHydrating = false;
    console.log(`[PTMT Layout] ✨ Hydration complete. Monitoring layout changes.`);
    moveBgDivs();
    initDrawerObserver();
    applyOverrides();

    // --- Keyboard-Driven Swipe Event Handling ---
    // Handle Arrow key swipes by routing them to the active pane.
    // This fixes the issue where ST's default keyboard handler uses ':last' selector
    // which doesn't work correctly in PTMT's multi-pane layout.

    $(document).on('keydown', async (e) => {
      // Only handle arrow keys
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Check if any input is focused - don't swipe while user is typing
      const focused = $(':focus');
      if (focused.is('input') || focused.is('textarea') || focused.prop('contenteditable') == 'true') {
        return; // Don't swipe while typing
      }

      // Check if swiping is allowed (respects ST's generation state, etc.)
      if (typeof isSwipingAllowed === 'function' && !isSwipingAllowed()) {
        return;
      }

      // Get the active pane
      const activePane = getActivePane();
      if (!activePane) return;

      // Prevent ST's default keyboard handler from also triggering
      e.stopImmediatePropagation();
      e.preventDefault();

      // Find the swipe button in the active pane to use as event target
      const direction = e.key === 'ArrowRight' ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
      const swipeBtn = activePane.querySelector(e.key === 'ArrowRight' ? SELECTORS.ST_SWIPE_RIGHT : SELECTORS.ST_SWIPE_LEFT);

      console.log(`[PTMT] Keyboard swipe ${e.key === 'ArrowRight' ? 'right' : 'left'} triggered on active pane`);

      // Call swipe function directly - if no button exists, pass the pane as target
      await swipe({ target: swipeBtn || activePane }, direction, { source: SWIPE_SOURCE.KEYBOARD });

    });
    // ------------------------------------

    // --- Touchscreen Swipe Gesture Handling ---
    // Handle touch swipe gestures by routing them to the active pane.
    // Uses the swiped-events library that ST already includes.

    document.addEventListener('swiped-left', async (e) => {
      if (power_user.gestures === false) return;

      // Don't swipe if a popup is open
      if (typeof Popup !== 'undefined' && Popup.util?.isPopupOpen()) return;

      // Only handle swipes within the chat area
      if (!$(e.target).closest(SELECTORS.ST_CHAT_CONTAINER).length) return;

      // Don't swipe while in text edit mode
      if ($(SELECTORS.ST_TEXTAREA).length) return;


      // Get the active pane
      const activePane = getActivePane();
      if (!activePane) return;

      // Check if the swipe originated from within a .mes element in the active pane
      const targetMes = $(e.target).closest(SELECTORS.ST_MESSAGE)[0];
      if (!targetMes || !activePane.contains(targetMes)) return;

      // Find the swipe button in the active pane
      const swipeBtn = activePane.querySelector(SELECTORS.ST_SWIPE_RIGHT);

      if (!swipeBtn || !$(swipeBtn).is(':visible')) return;

      console.log('[PTMT] Touch swipe left (swipe right) triggered on active pane');
      await swipe({ target: swipeBtn }, SWIPE_DIRECTION.RIGHT, { source: 'touch' });
    });

    document.addEventListener('swiped-right', async (e) => {
      if (power_user.gestures === false) return;

      // Don't swipe if a popup is open
      if (typeof Popup !== 'undefined' && Popup.util?.isPopupOpen()) return;

      // Only handle swipes within the chat area
      if (!$(e.target).closest(SELECTORS.ST_CHAT_CONTAINER).length) return;

      // Don't swipe while in text edit mode
      if ($(SELECTORS.ST_TEXTAREA).length) return;


      // Get the active pane
      const activePane = getActivePane();
      if (!activePane) return;

      // Check if the swipe originated from within a .mes element in the active pane
      const targetMes = $(e.target).closest(SELECTORS.ST_MESSAGE)[0];
      if (!targetMes || !activePane.contains(targetMes)) return;

      // Find the swipe button in the active pane
      const swipeBtn = activePane.querySelector(SELECTORS.ST_SWIPE_LEFT);

      if (!swipeBtn || !$(swipeBtn).is(':visible')) return;

      console.log('[PTMT] Touch swipe right (swipe left) triggered on active pane');
      await swipe({ target: swipeBtn }, SWIPE_DIRECTION.LEFT, { source: 'touch' });
    });
    // ------------------------------------


    overrideDelegatedEventHandler(
      'click',
      `${SELECTORS.ST_MESSAGE} ${SELECTORS.ST_AVATAR}`,
      (handlerString) => {
        return handlerString.includes(`$('${SELECTORS.ST_ZOOMED_AVATAR_TEMPLATE}').html()`);
      },
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
              console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
              $(this).remove();
            }
          });
        }


        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        if ($(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).length) {
          console.debug('removing container as it already existed');
          $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).fadeOut(animation_duration, () => {
            $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).remove();
          });
        } else {
          console.debug('making new container from template');
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
          //loadMovingUIState();
          $(`${SELECTORS.ST_ZOOMED_AVATAR}[forChar="${charname}"]`).css('display', 'flex');
          //dragElement(newElement);

          if (power_user.zoomed_avatar_magnification) {
            $(`${SELECTORS.ST_ZOOMED_AVATAR}_container`).izoomify();
          }

          newElement.on('click touchend', (e) => {
            if (e.target.closest(SELECTORS.ST_DRAG_CLOSE)) {
              newElement.fadeOut(animation_duration, () => {
                newElement.remove();
              });
            }
          });


          /*zoomedAvatarImgElement.on('dragstart', (e) => {
              console.log('saw drag on avatar!');
              e.preventDefault();
              return false;
          });*/
        }
      }
    );

    initDemotionObserver(api);

    return api;
  }

  document.body.insertAdjacentHTML('beforeend', `<div id="${SELECTORS.SETTINGS_WRAPPER.substring(1)}" style="display:none;"></div>`);


  eventSource.on(event_types.APP_READY, () => { initApp(); });
})();