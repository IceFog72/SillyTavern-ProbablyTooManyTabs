// pane.js
import { el, getSplitOrientation, getPanelById, getTabById, getRefs } from './utils.js'; // Changed import
import { settings } from './settings.js';
import { recalculateColumnSizes } from './layout.js';
import { setActivePanelInPane, getPaneForPanel, moveTabIntoPaneAtIndex } from './tabs.js';
import { recalculateAllSplitsRecursively, recalculateSplitSizes, updateResizerDisabledStates, attachResizer, setSplitOrientation } from './resizer.js';
export const MAX_PANE_LAYERS = 3;

export const defaultViewSettings = {
  minimalPanelSize: 250,
  defaultOrientation: 'auto',
  collapsedOrientation: 'auto',
  contentFlow: 'default',
};

export function applySplitOrientation(split) {
  if (!split) return;

  const parentColumn = split.closest('.ptmt-body-column');
  const isParentColumnCollapsed = parentColumn?.dataset.isColumnCollapsed === 'true';

  let targetOrientation;
  if (isParentColumnCollapsed) {
    targetOrientation = 'horizontal';
  } else {
    targetOrientation = split.dataset.naturalOrientation || 'vertical';
  }

  setSplitOrientation(split, targetOrientation);
}

export function createPane(initialSettings = {}, options = {}) {
  const pane = el('div', { className: 'ptmt-pane', style: { position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: '0', minWidth: '0', overflow: 'hidden' } });
  const tabStrip = el('div', { className: 'ptmt-tabStrip' });
  const panelContainer = el('div', { className: 'ptmt-panelContainer' });
  const grid = el('div', { className: 'ptmt-pane-grid', style: { width: '100%', height: '100%' } });

  pane.dataset.paneId = `ptmt-pane-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  grid.append(tabStrip, panelContainer);
  pane.appendChild(grid);

  pane._grid = grid;
  pane._tabStrip = tabStrip;
  pane._panelContainer = panelContainer;

  tabStrip.addEventListener('wheel', (e) => {
    if (!tabStrip.classList.contains('vertical') && e.deltaY !== 0) {
      tabStrip.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  writePaneViewSettings(pane, initialSettings);

  if (!options.deferInitialCheck) {
    requestAnimationFrame(() => {
      applyPaneOrientation(pane);
      checkAndCollapsePaneIfAllTabsCollapsed(pane);
    });
  }

  return pane;
}

export function getPaneLayerCount(pane) {
  if (!pane) return 0;
  const refs = getRefs();
  let eln = pane;
  let splitCount = 0;
  while (eln && eln.parentElement && eln.parentElement !== refs.mainBody) {
    eln = eln.parentElement;
    if (!eln) break;
    if (eln.classList?.contains('ptmt-split')) splitCount++;
  }
  return splitCount + 1;
}

export function readPaneViewSettings(pane) {
  try {
    if (!pane) return { ...defaultViewSettings };
    if (pane._viewSettingsCache) return pane._viewSettingsCache;

    const raw = pane.dataset.viewSettings;
    if (!raw) {
      pane._viewSettingsCache = { ...defaultViewSettings };
      return pane._viewSettingsCache;
    }

    pane._viewSettingsCache = { ...defaultViewSettings, ...JSON.parse(raw) };
    return pane._viewSettingsCache;
  } catch {
    return { ...defaultViewSettings };
  }
}

export function writePaneViewSettings(pane, settings) {
  try {
    const newSettings = { ...defaultViewSettings, ...settings };
    pane.dataset.viewSettings = JSON.stringify(newSettings);
    pane._viewSettingsCache = newSettings;
  } catch (e) {
    console.warn('[PTMT] Failed :', e);
  }
}

export function getParentSplitOrientation(pane) {
  if (!pane) return null;
  const parentSplit = pane.parentElement;
  if (!parentSplit || !parentSplit.classList?.contains('ptmt-split')) {
    return null;
  }
  return getSplitOrientation(parentSplit);
}


function findGoverningOrientation(pane) {
  let current = pane.parentElement;

  while (current && !current.classList.contains('ptmt-body-column')) {
    if (current.classList.contains('ptmt-split') && !current.classList.contains('ptmt-container-collapsed')) {
      return current.classList.contains('horizontal') ? 'horizontal' : 'vertical';
    }
    current = current.parentElement;
  }
  return 'vertical';
}

export function applyPaneOrientation(pane) {
  if (!pane) return;
  const vs = readPaneViewSettings(pane) || {};
  const isCollapsed = pane.classList.contains('view-collapsed');
  let orientation;

  if (isCollapsed) {
    let collapsedOrientation = vs.collapsedOrientation || 'auto';
    if (collapsedOrientation === 'auto') {
      orientation = findGoverningOrientation(pane);
    } else {
      orientation = collapsedOrientation;
    }
  } else {
    orientation = vs.defaultOrientation || 'auto';
    if (orientation === 'auto') {
      const rect = (pane._panelContainer || pane).getBoundingClientRect();
      orientation = (rect.width >= rect.height) ? 'horizontal' : 'vertical';
    }
    pane.dataset.lastExpandedOrientation = orientation;
  }

  const gridEl = pane._grid || pane;
  gridEl.classList.toggle('grid-vertical', orientation === 'vertical');
  gridEl.classList.toggle('grid-horizontal', orientation === 'horizontal');
  (pane._tabStrip || pane).classList.toggle('vertical', orientation === 'vertical');
  gridEl.classList.toggle('flow-reversed', vs.contentFlow === 'reversed');
}


export function setPaneCollapsedView(pane, collapsed) {
  if (!pane) return;

  const parentSplit = pane.parentElement;

  if (collapsed) {
    const currentFlex = pane.style.flex;
    const vs = readPaneViewSettings(pane);
    const minSizePx = vs.minimalPanelSize || 250;
    const rect = pane.getBoundingClientRect();
    const basisMatch = currentFlex ? currentFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
    const currentBasisPercent = basisMatch ? parseFloat(basisMatch[1]) : 0;

    let shouldResetToMin = false;
    if (parentSplit?.classList.contains('ptmt-split')) {
      const isHorizontal = parentSplit.classList.contains('horizontal');
      const currentSize = isHorizontal ? rect.height : rect.width;
      if (currentSize < minSizePx || currentBasisPercent >= 99.9) {
        shouldResetToMin = true;
      }
    } else if (currentBasisPercent >= 99.9) { // Is the only pane in a column
      shouldResetToMin = true;
    }

    if (shouldResetToMin && parentSplit?.classList.contains('ptmt-split')) {
      const isHorizontal = parentSplit.classList.contains('horizontal');
      const parentRect = parentSplit.getBoundingClientRect();
      const totalParentSize = isHorizontal ? parentRect.height : parentRect.width;
      if (totalParentSize > 0) {
        const minBasisPercent = (minSizePx / totalParentSize) * 100;
        pane.dataset.lastFlex = `1 1 ${Math.min(100, minBasisPercent).toFixed(4)}%`;
      } else {
        pane.dataset.lastFlex = '1 1 30%'; // Fallback
      }
    } else if (currentFlex) {
      pane.dataset.lastFlex = currentFlex;
    }

    pane.classList.add('view-collapsed');
  } else {
    pane.classList.remove('view-collapsed');

    let lastFlex = pane.dataset.lastFlex;
    const isFlexInvalid = parentSplit?.classList.contains('ptmt-split') && lastFlex && /\s0+(\.0*)?%$/.test(lastFlex);
    const vs = readPaneViewSettings(pane);
    const minSizePx = vs.minimalPanelSize || 250;

    if (parentSplit?.classList.contains('ptmt-split')) {
      const isHorizontal = parentSplit.classList.contains('horizontal');
      const parentRect = parentSplit.getBoundingClientRect();
      const totalParentSize = isHorizontal ? parentRect.height : parentRect.width;

      if (totalParentSize > 0) {
        const minBasisPercent = (minSizePx / totalParentSize) * 100;
        const lastBasisMatch = lastFlex ? lastFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
        const lastBasisPercent = lastBasisMatch ? parseFloat(lastBasisMatch[1]) : 0;

        if (Math.abs(lastBasisPercent - minBasisPercent) < 0.1) {
          const siblings = Array.from(parentSplit.children).filter(c => c !== pane && (c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split')));
          const totalSiblingLastFlex = siblings.reduce((sum, s) => {
            if (s.dataset.lastFlex) {
              const match = s.dataset.lastFlex.match(/(\d+(?:\.\d+)?)\s*%/);
              return sum + (match ? parseFloat(match[1]) : 0);
            }
            return sum;
          }, 0);

          if (totalSiblingLastFlex > 0 && totalSiblingLastFlex < 100) {
            let targetBasis = 100.0 - totalSiblingLastFlex;
            targetBasis = Math.max(targetBasis, minBasisPercent);
            lastFlex = `1 1 ${targetBasis.toFixed(4)}%`;
          }
        }
      }

      let targetBasisPercent;
      if (totalParentSize > 0) {
        const minBasisPercent = (minSizePx / totalParentSize) * 100;
        if (lastFlex && !isFlexInvalid) {
          const basisMatch = lastFlex.match(/(\d+(?:\.\d+)?)\s*%/);
          const lastBasisPercent = basisMatch ? parseFloat(basisMatch[1]) : 0;
          targetBasisPercent = Math.max(minBasisPercent, lastBasisPercent);
        } else {
          targetBasisPercent = minBasisPercent;
        }
        pane.style.flex = `1 1 ${Math.min(100, targetBasisPercent).toFixed(4)}%`;
      } else {
        pane.style.flex = (lastFlex && !isFlexInvalid) ? lastFlex : '1 1 50%';
      }
    } else {
      pane.style.flex = '1 1 100%';
    }

    if (parentSplit?.classList.contains('ptmt-split')) {
      recalculateSplitSizes(parentSplit);
    }
  }

  applyPaneOrientation(pane);

  if (parentSplit?.classList.contains('ptmt-split')) {
    updateSplitCollapsedState(parentSplit);
    recalculateAllSplitsRecursively();
  }

  recalculateColumnSizes();
  updateResizerDisabledStates();
}

export function removePaneIfEmpty(pane, depth = 0) {
  if (!pane?.parentElement || depth > 10) return;
  const tabs = pane._tabStrip?.querySelectorAll('.ptmt-tab');
  const panels = pane._panelContainer?.querySelectorAll('.ptmt-panel');
  if (tabs?.length || panels?.length) return;

  const parent = pane.parentElement;
  if (!parent) return;

  const column = pane.closest('.ptmt-body-column');
  const wasInLeftColumn = column?.id === 'ptmt-leftBody';
  const wasInRightColumn = column?.id === 'ptmt-rightBody';

  if (parent.classList.contains('ptmt-split')) {
    const structuralChildren = Array.from(parent.children).filter(c => c !== pane && (c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split')));
    const grand = parent.parentElement;

    if (structuralChildren.length === 0) {
      if (grand) grand.removeChild(parent); else parent.remove();
      if (grand) removePaneIfEmpty(grand, depth + 1);
    } else if (structuralChildren.length === 1) {
      const remaining = structuralChildren[0];
      if (grand) {
        grand.replaceChild(remaining, parent);
        if (grand.classList.contains('ptmt-split')) {
          recalculateSplitSizes(grand);
        } else {
          normalizeLiftedElement(remaining);
        }
      } else {
        parent.replaceWith(remaining);
        normalizeLiftedElement(remaining);
      }
    } else {
      parent.removeChild(pane);
      recalculateSplitSizes(parent);
    }
  } else {
    pane.remove();
  }

  if ((wasInLeftColumn || wasInRightColumn) && !column.querySelector('.ptmt-pane, .ptmt-split')) {
    if (wasInLeftColumn) {
      settings.update({ showLeftPane: false });
    } else {
      settings.update({ showRightPane: false });
    }
  }

  const refs = getRefs();
  if (!refs.centerBody.querySelector('.ptmt-pane')) {
    refs.centerBody.appendChild(createPane());
  }

  try { window.dispatchEvent(new CustomEvent('ptmt:layoutChanged')); } catch (e) {
    console.warn('[PTMT] Failed :', e);
  }
}

export function splitPaneWithPane(targetPane, movingPanel, vertical = true, newFirst = true) {
  if (!targetPane || !movingPanel) return;

  const column = targetPane.closest('.ptmt-body-column');
  const columnKey = column.id.replace('ptmt-', '').replace('Body', '');
  const maxLayers = settings.get(`maxLayers${columnKey.charAt(0).toUpperCase() + columnKey.slice(1)}`) || 3;

  const layers = getPaneLayerCount(targetPane);
  if (layers >= maxLayers) {
    moveTabIntoPaneAtIndex(movingPanel, targetPane, null);
    return;
  }


  const originalSettings = readPaneViewSettings(targetPane);

  const srcPane = getPaneForPanel(movingPanel);
  const parent = targetPane.parentElement;

  const split = el('div', { className: 'ptmt-split' });
  split.dataset.naturalOrientation = vertical ? 'vertical' : 'horizontal';
  if (!vertical) {
    split.classList.add('horizontal');
  }


  const pane1 = createPane(originalSettings);
  const pane2 = createPane(originalSettings);


  const existingPanels = Array.from(targetPane._panelContainer.children);
  const existingTabs = Array.from(targetPane._tabStrip.children).filter(c => c.classList.contains('ptmt-tab'));

  const destinationPaneForExisting = newFirst ? pane2 : pane1;
  existingPanels.forEach(p => destinationPaneForExisting._panelContainer.appendChild(p));
  existingTabs.forEach(t => destinationPaneForExisting._tabStrip.appendChild(t));

  parent.replaceChild(split, targetPane);

  const resizer = el('splitter', { className: vertical ? 'ptmt-resizer-vertical' : 'ptmt-resizer-horizontal' });
  split.append(pane1, resizer, pane2);

  attachResizer(resizer, vertical ? 'vertical' : 'horizontal');

  const destinationPaneForDragged = newFirst ? pane1 : pane2;
  moveTabIntoPaneAtIndex(movingPanel, destinationPaneForDragged, 0);

  requestAnimationFrame(() => {
    setActivePanelInPane(pane1);
    setActivePanelInPane(pane2);
    if (srcPane && srcPane !== targetPane) {
      removePaneIfEmpty(srcPane);
    }
    recalculateAllSplitsRecursively();
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
  });
}

function updateTabsOrientation(pane, vertical) {
  pane._tabStrip.querySelectorAll('.ptmt-tab').forEach(t => t.classList.toggle('vertical', vertical));
}

function normalizeLiftedElement(el) {
  if (!el) return;
  try {
    if (el.classList.contains('ptmt-pane')) {
      el.style.flex = '1 1 0%';
      el.querySelectorAll('.ptmt-pane').forEach(p => {
        p.style.flex = p.style.flex?.indexOf('0 0') === 0 ? '1 1 0%' : p.style.flex;
      });
      return;
    }

    if (el.classList.contains('ptmt-split')) {
      el.style.flex = '1 1 0%';
      Array.from(el.children).forEach(c => {
        if (!c) return;
        if (c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split')) {
          if (!c.style.flex || c.style.flex.includes('0 0') === false) {
            c.style.flex = '1 1 0%';
          }
        } else {
          try { c.style.flex = ''; } catch (e) {
            console.warn('[PTMT] Failed :', e);
          }
        }
      });
      return;
    }
    try { el.style.flex = ''; } catch (e) {
      console.warn('[PTMT] Failed :', e);
    }
  } catch (e) {
    console.warn('normalizeLiftedElement error', e);
  }
}

export function checkAndCollapsePaneIfAllTabsCollapsed(pane) {
  try {
    if (!pane) return;
    const tabs = Array.from(pane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
    const allCollapsed = tabs.length > 0 && tabs.every(tab => tab.classList.contains('collapsed'));

    const wasCollapsed = pane.classList.contains('view-collapsed');
    if (allCollapsed === wasCollapsed) return;

    setPaneCollapsedView(pane, allCollapsed);
    const parentSplit = pane.parentElement;
    if (parentSplit?.classList.contains('ptmt-split')) {
      updateSplitCollapsedState(parentSplit);
    }

    if (allCollapsed) {
      recalculateAllSplitsRecursively();
    }

    recalculateColumnSizes();

    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));

  } catch (e) {
    console.warn('checkAndCollapsePaneIfAllTabsCollapsed error:', e);
  }
}

function updateSplitCollapsedState(split) {
  if (!split || !split.classList.contains('ptmt-split')) return;

  const children = Array.from(split.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
  if (children.length === 0) return;

  const allChildrenCollapsed = children.every(child =>
    child.classList.contains('view-collapsed') || child.classList.contains('ptmt-container-collapsed')
  );
  const isCurrentlyCollapsed = split.classList.contains('ptmt-container-collapsed');

  if (allChildrenCollapsed && !isCurrentlyCollapsed) {

    const currentFlex = split.style.flex;
    if (currentFlex && currentFlex.includes('%')) {
      split.dataset.lastFlex = currentFlex;
    }
    split.classList.add('ptmt-container-collapsed');


    const parent = split.parentElement;
    const rect = parent.getBoundingClientRect();


    const targetOrientation = rect.height > rect.width ? 'horizontal' : 'vertical';
    setSplitOrientation(split, targetOrientation);

  } else if (!allChildrenCollapsed && isCurrentlyCollapsed) {

    split.style.flex = split.dataset.lastFlex || '1 1 100%';
    split.classList.remove('ptmt-container-collapsed');


    const naturalOrientation = split.dataset.naturalOrientation || 'vertical';
    setSplitOrientation(split, naturalOrientation);
  }

  const parentSplit = split.parentElement;
  if (parentSplit?.classList.contains('ptmt-split')) {
    updateSplitCollapsedState(parentSplit);
  }
}

export function openViewSettingsDialog(pane) {
  if (!pane) return;
  const existing = document.getElementById('ptmt-view-settings-dialog');
  if (existing) existing.remove();

  const vs = readPaneViewSettings(pane);

  const createSelect = (id, options, current) => {
    const sel = el('select', { id });
    options.forEach(o => {
      const opt = el('option', { value: o.value, selected: o.value === current }, o.label);
      sel.appendChild(opt);
    });
    return sel;
  };

  const dialogStyles = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    background: 'var(--SmartThemeBlurTintColor)', padding: '20px', borderRadius: '8px',
    border: '1px solid #556', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
    zIndex: '10000', minWidth: '300px'
  };

  const buttonStyles = {
    marginLeft: '10px', padding: '5px 10px', borderRadius: '4px', border: '1px solid #556',
    background: '#3b4d61', color: '#eee', cursor: 'pointer'
  };

  const dialog = el('div', { id: 'ptmt-view-settings-dialog', style: dialogStyles },
    el('div', { style: { fontFamily: 'sans-serif' } },
      el('h3', { style: { marginTop: '0', marginBottom: '20px' } }, 'Pane Settings'),
      el('div', { style: { marginBottom: '12px' } },
        el('label', { for: 'ptmt-vs-minimal-panel' }, 'Min. Panel Size (px): '),
        el('input', { type: 'number', value: vs.minimalPanelSize || defaultViewSettings.minimalPanelSize, id: 'ptmt-vs-minimal-panel', class: 'neo-range-input' })
      ),
      el('div', { style: { marginBottom: '12px' } },
        el('label', { for: 'ptmt-vs-default' }, 'Default orientation: '),
        createSelect('ptmt-vs-default', [
          { value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' },
        ], vs.defaultOrientation || 'auto')
      ),
      el('div', { style: { marginBottom: '12px' } },
        el('label', { for: 'ptmt-vs-collapsed' }, 'Collapsed orientation: '),
        createSelect('ptmt-vs-collapsed', [
          { value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' },
        ], vs.collapsedOrientation || 'auto')
      ),
      el('div', { style: { marginBottom: '20px' } },
        el('label', { for: 'ptmt-vs-flow' }, 'Content Flow: '),
        createSelect('ptmt-vs-flow', [
          { value: 'default', label: 'Default (Tabs First)' }, { value: 'reversed', label: 'Reversed (Content First)' },
        ], vs.contentFlow || 'default')
      ),
      el('div', { style: { textAlign: 'right', marginTop: '10px' } },
        el('button', { id: 'ptmt-vs-save', style: { ...buttonStyles, background: '#3b82f6' } }, 'Save'),
        el('button', { id: 'ptmt-vs-cancel', style: buttonStyles }, 'Cancel')
      )
    )
  );

  document.body.appendChild(dialog);
  dialog.querySelector('#ptmt-vs-cancel').addEventListener('click', () => dialog.remove());
  dialog.querySelector('#ptmt-vs-save').addEventListener('click', () => {
    const minimal = Number(dialog.querySelector('#ptmt-vs-minimal-panel').value) || defaultViewSettings.minimalPanelSize;
    const def = dialog.querySelector('#ptmt-vs-default').value || 'auto';
    const col = dialog.querySelector('#ptmt-vs-collapsed').value || 'auto';
    const flow = dialog.querySelector('#ptmt-vs-flow').value || 'default';

    writePaneViewSettings(pane, {
      minimalPanelSize: minimal,
      defaultOrientation: def,
      collapsedOrientation: col,
      contentFlow: flow
    });
    applyPaneOrientation(pane);
    dialog.remove();
    window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
  });
}