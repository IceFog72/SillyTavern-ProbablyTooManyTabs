
// index.js 

import { eventSource, event_types } from '../../../../script.js';
import { settings } from './settings.js';
import { LayoutManager } from './LayoutManager.js';
import { el, debounce, getPanelById, getTabById } from './utils.js';
import { generateLayoutSnapshot, applyLayoutSnapshot } from './snapshot.js';
import { createLayoutIfMissing, getRefs, applyColumnVisibility, recalculateColumnSizes } from './layout.js';
import { applyPaneOrientation, applySplitOrientation, readPaneViewSettings, writePaneViewSettings, openViewSettingsDialog } from './pane.js';
import {
  createTabFromElementId, createTabForBodyContent, moveNodeIntoTab, listTabs,
  openTab, closeTabById, setDefaultPanelById,
  setActivePanelInPane, moveTabIntoPaneAtIndex
} from './tabs.js';
import { attachResizer, setSplitOrientation, updateResizerDisabledStates } from './resizer.js';
import { enableInteractions } from './drag-drop.js';
import { removeMouseDownDrawerHandler, openAllDrawersJq, moveBgDivs } from './misc-helpers.js';

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
      console.log("[SFT Layout] Layout automatically saved.");
    }, 750);

    const api = {
      createTabFromElementId, createTabForBodyContent, moveNodeIntoTab, listTabs,
      openTab, closeTabById, getPanelById, getTabById, setDefaultPanelById, _refs: getRefs,
      moveTabIntoPaneAtIndex, openViewSettingsDialog, readPaneViewSettings, writePaneViewSettings,
      applyPaneOrientation, attachResizer, setSplitOrientation,
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
          setTimeout(() => {
            window.location.reload();
          }, 500);
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
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
    }, 150));

    const savedLayout = settings.get('savedLayout');
    const defaultLayout = settings.get('defaultLayout');

    if (savedLayout) {
      console.log("[SFT Layout] Applying user's saved layout.");
      applyLayoutSnapshot(savedLayout, api, settings);
    } else {
      console.log("[SFT Layout] No saved layout found, applying default layout.");
      applyLayoutSnapshot(defaultLayout, api, settings);
    }


    try { openAllDrawersJq(); } catch { }
    try { removeMouseDownDrawerHandler(); } catch { }
    enableInteractions();
    moveBgDivs();

 
    return api;
  }

  document.body.insertAdjacentHTML('beforeend', '<div id="ptmt-settings-wrapper" style="display:none;"></div>');
  eventSource.on(event_types.APP_READY, () => { initApp(); });
})();