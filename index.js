// index.js 

import { eventSource, event_types, characters, animation_duration, swipe, isSwipingAllowed } from '../../../../script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from '../../../../scripts/constants.js';
import { power_user } from '../../../power-user.js';
import { isDataURL } from '../../../utils.js';
import { getUserAvatar } from '../../../personas.js';
import { settings, SettingsManager } from './settings.js';

import { el, debounce, getPanelById, getTabById, getRefs } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot } from './snapshot.js';
import { createLayoutIfMissing, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, readPaneViewSettings, writePaneViewSettings, openViewSettingsDialog, updateSplitCollapsedState } from './pane.js';
import {
  createTabFromContent, moveNodeIntoTab, listTabs,
  openTab, closeTabById, setDefaultPanelById,
  moveTabIntoPaneAtIndex, destroyTabById,
  setActivePanelInPane, setTabCollapsed, getActivePane,
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates, recalculateAllSplitsRecursively, validateAndCorrectAllMinSizes, checkPaneForIconMode } from './resizer.js';
import { enableInteractions } from './drag-drop.js';
import { removeMouseDownDrawerHandler, openAllDrawersJq, moveBgDivs, overrideDelegatedEventHandler, initDrawerObserver } from './misc-helpers.js';
import { initDemotionObserver, updatePendingTabColumn } from './pending-tabs.js';
import { positionAnchor } from './positionAnchor.js';
import { initStatusBar } from './context-status-bar.js';
import { themeEngine } from './theme-engine.js';

(function () {
  function initApp() {
    let isHydrating = true;
    positionAnchor();
    initStatusBar();
    themeEngine.init();
    createLayoutIfMissing();
    const refs = getRefs();

    let stagingArea = document.getElementById('ptmt-staging-area');
    if (!stagingArea) {
      stagingArea = el('div', { id: 'ptmt-staging-area', style: { display: 'none' } });
      document.body.appendChild(stagingArea);
    }

    const saveCurrentLayoutDebounced = debounce(() => {
      if (isHydrating) {
        console.log(`[PTMT Layout] 🛡️ Save skipped during hydration.`);
        return;
      }
      const layout = generateLayoutSnapshot();
      const isMobile = settings.get('isMobile');
      const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
      console.log(`[PTMT Layout] 💾 Auto-saving ${isMobile ? 'Mobile' : 'Desktop'} layout to ${key}. Snapshot:`, layout);
      settings.update({ [key]: layout });
    }, 750);

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
        alert(`${isMobile ? 'Mobile' : 'Desktop'} layout saved manually to ${key}.`);
      },
      loadLayout: () => {
        const isMobile = settings.get('isMobile');
        const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';
        const layout = settings.get(key);
        if (layout) {
          applyLayoutSnapshot(layout, api, settings);
        } else {
          alert(`No saved ${isMobile ? 'mobile' : 'desktop'} layout found.`);
        }
      },
      resetLayout: () => {
        if (confirm("Are you sure you want to reset the current layout to default? This will reload the page.")) {
          const isMobile = settings.get('isMobile');
          const key = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';

          // Force reset to factory default
          const factoryDefault = isMobile ? SettingsManager.defaultSettings.mobileLayout : SettingsManager.defaultSettings.defaultLayout;
          settings.update({ [key]: factoryDefault }, true); // Force synchronous save

          window.location.reload();
        }
      },
      savePreset: (name) => {
        const layout = generateLayoutSnapshot();
        const presets = settings.get('presets').slice();
        const existingPresetIndex = presets.findIndex(p => p.name === name);
        if (existingPresetIndex !== -1) {
          presets[existingPresetIndex].layout = layout;
          alert(`Preset '${name}' has been updated.`);
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
      toggleMobileMode: () => {
        const currentSnapshot = generateLayoutSnapshot();
        const isMobile = settings.get('isMobile');
        const oldKey = isMobile ? 'savedLayoutMobile' : 'savedLayoutDesktop';

        // Save current to old slot and toggle mode
        settings.update({
          [oldKey]: currentSnapshot,
          isMobile: !isMobile
        }, true); // Force sync save

        window.location.reload();
      }
    };
    window.ptmtTabs = api;

    const debouncedLayoutReaction = debounce((reason) => {
      if (reason !== 'snapshotApplied') {
        applyColumnVisibility();
        if (reason !== 'manualResize' && reason !== 'tabSwitch') {
          recalculateColumnSizes();
        }
      }
      updateResizerDisabledStates();
      saveCurrentLayoutDebounced();
    }, 50);

    window.addEventListener('ptmt:layoutChanged', (event) => {
      const reason = event.detail?.reason || 'unknown';

      // First apply layout/orientation classes so sizes can be calculated correctly
      // These are relatively cheap
      document.querySelectorAll('.ptmt-split').forEach(applySplitOrientation);
      document.querySelectorAll('.ptmt-pane').forEach(applyPaneOrientation);

      console.log(`[PTMT Layout] 🔄 layoutChanged triggered. Reason: ${reason}`);

      if (reason === 'tabSwitch') {
        // Tab switching is high frequency. Recalculate column sizes ONLY if the pane was empty/filled
        // which applyColumnVisibility handles. Full column redistribution is usually overkill here.
        debouncedLayoutReaction(reason);
      } else {
        // For structural changes, we can be more synchronous but still careful
        if (reason !== 'snapshotApplied') {
          applyColumnVisibility();
          if (reason !== 'manualResize') {
            recalculateColumnSizes();
          }
        }
        updateResizerDisabledStates();
        saveCurrentLayoutDebounced();
      }
    }, { passive: true });

    const extensionPath = '/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs';
    const applyOverrides = () => {
      const enabled = settings.get('enableOverride1');
      let link = document.getElementById('ptmt-overrides-1');
      if (enabled) {
        if (!link) {
          link = document.createElement('link');
          link.id = 'ptmt-overrides-1';
          link.rel = 'stylesheet';
          link.href = `${extensionPath}/overrides-1.css`;
          document.head.appendChild(link);
        }
      } else if (link) {
        link.remove();
      }
    };

    window.addEventListener('ptmt:settingsChanged', (event) => {
      const { changed } = event.detail || {};
      const showIconsOnly = settings.get('showIconsOnly');
      const isMobile = settings.get('isMobile');

      const refs = getRefs();
      if (refs && refs.mainBody) {
        refs.mainBody.classList.toggle('ptmt-global-icons-only', !!showIconsOnly);
        refs.mainBody.classList.toggle('ptmt-mobile', !!isMobile);
      }

      applyOverrides();
      document.querySelectorAll('.ptmt-pane').forEach(checkPaneForIconMode);
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
    });

    window.addEventListener('resize', debounce(() => {
      document.querySelectorAll('.ptmt-pane').forEach(pane => delete pane.dataset.appliedOrientation);
      recalculateAllSplitsRecursively();
      validateAndCorrectAllMinSizes();
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
    }, 150));

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
      console.warn('[PTMT] Failed :', e);
    }
    try { removeMouseDownDrawerHandler(); } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
    const refsStartup = getRefs();
    if (refsStartup && refsStartup.mainBody) {
      refsStartup.mainBody.classList.toggle('ptmt-mobile', !!isMobile);
      refsStartup.mainBody.classList.toggle('ptmt-global-icons-only', !!settings.get('showIconsOnly'));
    }

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
      const swipeBtn = activePane.querySelector(e.key === 'ArrowRight' ? '.swipe_right' : '.swipe_left');

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
      if (!$(e.target).closest('#sheld').length) return;

      // Don't swipe while in text edit mode
      if ($('#curEditTextarea').length) return;

      // Get the active pane
      const activePane = getActivePane();
      if (!activePane) return;

      // Check if the swipe originated from within a .mes element in the active pane
      const targetMes = $(e.target).closest('.mes')[0];
      if (!targetMes || !activePane.contains(targetMes)) return;

      // Find the swipe button in the active pane
      const swipeBtn = activePane.querySelector('.swipe_right');
      if (!swipeBtn || !$(swipeBtn).is(':visible')) return;

      console.log('[PTMT] Touch swipe left (swipe right) triggered on active pane');
      await swipe({ target: swipeBtn }, SWIPE_DIRECTION.RIGHT, { source: 'touch' });
    });

    document.addEventListener('swiped-right', async (e) => {
      if (power_user.gestures === false) return;

      // Don't swipe if a popup is open
      if (typeof Popup !== 'undefined' && Popup.util?.isPopupOpen()) return;

      // Only handle swipes within the chat area
      if (!$(e.target).closest('#sheld').length) return;

      // Don't swipe while in text edit mode
      if ($('#curEditTextarea').length) return;

      // Get the active pane
      const activePane = getActivePane();
      if (!activePane) return;

      // Check if the swipe originated from within a .mes element in the active pane
      const targetMes = $(e.target).closest('.mes')[0];
      if (!targetMes || !activePane.contains(targetMes)) return;

      // Find the swipe button in the active pane
      const swipeBtn = activePane.querySelector('.swipe_left');
      if (!swipeBtn || !$(swipeBtn).is(':visible')) return;

      console.log('[PTMT] Touch swipe right (swipe left) triggered on active pane');
      await swipe({ target: swipeBtn }, SWIPE_DIRECTION.LEFT, { source: 'touch' });
    });
    // ------------------------------------


    overrideDelegatedEventHandler(
      'click',
      '.mes .avatar',
      (handlerString) => {
        return handlerString.includes("$('#zoomed_avatar_template').html()");
      },
      function () {
        const messageElement = $(this).closest('.mes');
        const thumbURL = $(this).children('img').attr('src');
        const charsPath = '/characters/';
        const targetAvatarImg = thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
        const charname = targetAvatarImg.replace('.png', '');
        const isValidCharacter = characters.some(x => x.avatar === decodeURIComponent(targetAvatarImg));

        if (!power_user.movingUI) {
          $('.zoomed_avatar').each(function () {
            const currentForChar = $(this).attr('forChar');
            if (currentForChar !== charname && typeof currentForChar !== 'undefined') {
              console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
              $(this).remove();
            }
          });
        }

        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        if ($(`.zoomed_avatar[forChar="${charname}"]`).length) {
          console.debug('removing container as it already existed');
          $(`.zoomed_avatar[forChar="${charname}"]`).fadeOut(animation_duration, () => {
            $(`.zoomed_avatar[forChar="${charname}"]`).remove();
          });
        } else {
          console.debug('making new container from template');
          const template = $('#zoomed_avatar_template').html();
          const newElement = $(template);
          newElement.attr('forChar', charname);
          newElement.attr('id', `zoomFor_${charname}`);
          newElement.addClass('draggable');
          newElement.find('.drag-grabber').attr('id', `zoomFor_${charname}header`);

          let movingDivsContainer = $('#movingDivs');
          if (movingDivsContainer.length === 0) {
            movingDivsContainer = $('<div id="movingDivs"></div>');
            $('body').append(movingDivsContainer);
          }
          movingDivsContainer.append(newElement);

          newElement.fadeIn(animation_duration);
          const zoomedAvatarImgElement = $(`.zoomed_avatar[forChar="${charname}"] img`);
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
          $(`.zoomed_avatar[forChar="${charname}"]`).css('display', 'flex');
          //dragElement(newElement);

          if (power_user.zoomed_avatar_magnification) {
            $('.zoomed_avatar_container').izoomify();
          }

          newElement.on('click touchend', (e) => {
            if (e.target.closest('.dragClose')) {
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

  document.body.insertAdjacentHTML('beforeend', '<div id="ptmt-settings-wrapper" style="display:none;"></div>');
  eventSource.on(event_types.APP_READY, () => { initApp(); });
})();