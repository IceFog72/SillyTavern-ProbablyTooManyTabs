// index.js 

import { eventSource, event_types, characters, animation_duration } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { isDataURL } from '../../../utils.js';
import { getUserAvatar } from '../../../personas.js';
import { settings } from './settings.js';

import { el, debounce, getPanelById, getTabById, getRefs } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot } from './snapshot.js';
import { createLayoutIfMissing, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, readPaneViewSettings, writePaneViewSettings, openViewSettingsDialog } from './pane.js';
import {
  createTabFromContent, moveNodeIntoTab, listTabs,
  openTab, closeTabById, setDefaultPanelById,
  moveTabIntoPaneAtIndex, destroyTabById,
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates, recalculateAllSplitsRecursively, validateAndCorrectAllMinSizes } from './resizer.js';
import { enableInteractions } from './drag-drop.js';
import { removeMouseDownDrawerHandler, openAllDrawersJq, moveBgDivs, overrideDelegatedEventHandler, initDrawerObserver } from './misc-helpers.js';
import { initDemotionObserver, updatePendingTabColumn } from './pending-tabs.js';

(function () {
  function initApp() {
    createLayoutIfMissing();
    const refs = getRefs();

    let stagingArea = document.getElementById('ptmt-staging-area');
    if (!stagingArea) {
      stagingArea = el('div', { id: 'ptmt-staging-area', style: { display: 'none' } });
      document.body.appendChild(stagingArea);
    }

    const saveCurrentLayoutDebounced = debounce(() => {
      const layout = generateLayoutSnapshot();
      settings.update({ savedLayout: layout });
      console.log("[PTMT Layout] Layout automatically saved.");
    }, 750);

    const api = {
      createTabFromContent, moveNodeIntoTab, listTabs,
      openTab, closeTabById, getPanelById, getTabById, setDefaultPanelById, _refs: getRefs,
      moveTabIntoPaneAtIndex, openViewSettingsDialog, readPaneViewSettings, writePaneViewSettings,
      applyPaneOrientation, attachResizer, setSplitOrientation,
      generateLayoutSnapshot, destroyTabById, updatePendingTabColumn,
      saveLayout: () => {
        const layout = generateLayoutSnapshot();
        settings.update({ savedLayout: layout });
        alert('Layout saved manually.');
      },
      loadLayout: () => {
        const layout = settings.get('savedLayout');
        if (layout) {
          applyLayoutSnapshot(layout, api, settings);
        } else {
          alert('No saved layout found.');
        }
      },
      resetLayout: () => {
        if (confirm("Are you sure you want to reset the layout? This will reload the page.")) {
          settings.reset();
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
      }
    };
    window.ptmtTabs = api;

    window.addEventListener('ptmt:layoutChanged', (event) => {
      if (event.detail?.reason !== 'snapshotApplied') {
        applyColumnVisibility();
        if (event.detail?.reason !== 'manualResize') {
          recalculateColumnSizes();
        }
      }


      document.querySelectorAll('.ptmt-split').forEach(applySplitOrientation);
      document.querySelectorAll('.ptmt-pane').forEach(applyPaneOrientation);

      updateResizerDisabledStates();
      saveCurrentLayoutDebounced();
    });

    window.addEventListener('ptmt:settingsChanged', () => {

      const showIconsOnly = settings.get('showIconsOnly');
      getRefs().main.classList.toggle('ptmt-global-icons-only', showIconsOnly);


      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
    });

    window.addEventListener('resize', debounce(() => {
      document.querySelectorAll('.ptmt-pane').forEach(pane => delete pane.dataset.appliedOrientation);
      recalculateAllSplitsRecursively();
      validateAndCorrectAllMinSizes();
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
    }, 150));

    const savedLayout = settings.get('savedLayout');
    const defaultLayout = settings.get('defaultLayout');

    if (savedLayout) {
      console.log("[PTMT Layout] Applying user's saved layout.");
      applyLayoutSnapshot(savedLayout, api, settings);
    } else {
      console.log("[PTMT Layout] No saved layout found, applying default layout.");
      applyLayoutSnapshot(defaultLayout, api, settings);
    }


    try { openAllDrawersJq(); } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
    try { removeMouseDownDrawerHandler(); } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
    enableInteractions();
    moveBgDivs();
    initDrawerObserver();

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