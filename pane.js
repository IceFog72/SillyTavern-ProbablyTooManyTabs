import { el, getSplitOrientation, getPanelById, getTabById, getRefs, readPaneViewSettings, writePaneViewSettings, defaultViewSettings, invalidateMinWidthCache, trackObserver } from './utils.js';
import { showContextMenu } from './context-menu.js';
import { settings } from './settings.js';
import { recalculateColumnSizes } from './layout.js';
import { setActivePanelInPane, getPaneForPanel, moveTabIntoPaneAtIndex } from './tabs.js';
import { updateResizerDisabledStates, attachResizer, setSplitOrientation } from './resizer.js';
import { recalculateSplitSizes, recalculateAllSplitsRecursively, setFlexBasisPercent, parseFlexBasis } from './layout-math.js';
import { SELECTORS, EVENTS, LAYOUT } from './constants.js';

/** @typedef {import('./types.js').ViewSettings} ViewSettings */
/** @typedef {import('./types.js').PaneNode} PaneNode */
/** @typedef {import('./types.js').SplitNode} SplitNode */
/** @typedef {import('./types.js').PTMTRefs} PTMTRefs */

export const MAX_PANE_LAYERS = LAYOUT.MAX_PANE_LAYERS;
export const NARROW_PANE_THRESHOLD_PX = LAYOUT.NARROW_PANE_THRESHOLD_PX;

const tabStripOverflowObserver = trackObserver(new ResizeObserver(entries => {
  for (const entry of entries) {
    const tabStrip = entry.target;
    // tabStrip is the .ptmt-tabStrip
    const isVertical = tabStrip.classList.contains('vertical') || tabStrip.closest('.vertical');
    const hasOverflow = isVertical
      ? tabStrip.scrollHeight > tabStrip.clientHeight
      : tabStrip.scrollWidth > tabStrip.clientWidth;

    tabStrip.classList.toggle('ptmt-has-overflow', hasOverflow);
    updateArrowVisibility(tabStrip);
  }
}));

function updateArrowVisibility(tabStrip) {
  const isVertical = tabStrip.classList.contains('vertical');
  if (isVertical) {
    const scrollTop = tabStrip.scrollTop;
    const scrollHeight = tabStrip.scrollHeight;
    const clientHeight = tabStrip.clientHeight;

    const canScrollUp = scrollTop > 2;
    const canScrollDown = scrollTop + clientHeight < scrollHeight - 2;

    tabStrip.classList.toggle('can-scroll-up', canScrollUp);
    tabStrip.classList.toggle('can-scroll-down', canScrollDown);
    tabStrip.classList.remove('can-scroll-left', 'can-scroll-right');
  } else {
    const scrollLeft = tabStrip.scrollLeft;
    const scrollWidth = tabStrip.scrollWidth;
    const clientWidth = tabStrip.clientWidth;

    const canScrollLeft = scrollLeft > 2;
    const canScrollRight = scrollLeft + clientWidth < scrollWidth - 2;

    tabStrip.classList.toggle('can-scroll-left', canScrollLeft);
    tabStrip.classList.toggle('can-scroll-right', canScrollRight);
    tabStrip.classList.remove('can-scroll-up', 'can-scroll-down');
  }
}

export function findPreferredDescendentOrientation(element) {
  if (!element) return null;
  if (element.classList.contains(SELECTORS.PANE.substring(1))) {
    const vs = readPaneViewSettings(element);
    if (vs.collapsedOrientation && vs.collapsedOrientation !== 'auto') {
      return vs.collapsedOrientation;
    }
  }
  const panes = element.querySelectorAll(SELECTORS.PANE);
  for (const p of panes) {
    const vs = readPaneViewSettings(p);
    if (vs.collapsedOrientation && vs.collapsedOrientation !== 'auto') {
      return vs.collapsedOrientation;
    }
  }
  return null;
}

export function applySplitOrientation(split) {
  if (!split) return;

  const parentColumn = split.closest(SELECTORS.COLUMN);
  const isParentColumnCollapsed = parentColumn?.dataset.isColumnCollapsed === 'true';

  // Check if ALL children are collapsed
  const children = Array.from(split.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
  const allChildrenCollapsed = children.length > 0 && children.every(child =>
    child.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || child.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1))
  );

  let targetOrientation;

  if (allChildrenCollapsed) {
    const setting = split.dataset.orientationCollapsed || 'auto';
    if (setting !== 'auto') {
      targetOrientation = setting;
    } else {
      if (isParentColumnCollapsed) {
        targetOrientation = 'horizontal';
      } else {
        const parent = split.parentElement;
        const rect = parent.getBoundingClientRect();
        targetOrientation = rect.height > rect.width ? 'horizontal' : 'vertical';

        const preferred = findPreferredDescendentOrientation(split);
        if (preferred) {
          targetOrientation = preferred;
        }
      }
    }
  } else if (isParentColumnCollapsed) {
    // Splits in collapsed sidebars MUST be horizontal to stack panes vertically
    targetOrientation = 'horizontal';
  } else {
    // Apply orientation rule for expanded state (whenever any child is expanded)
    const setting = split.dataset.orientationExpanded || 'auto';
    if (setting === 'auto') {
      targetOrientation = split.dataset.naturalOrientation || 'vertical';

      // Check if any descendant pane has a specific preference that should govern the split
      const preferred = findPreferredDescendentOrientation(split);
      if (preferred) {
        targetOrientation = preferred;
      }
    } else {
      targetOrientation = setting;
    }
  }

  setSplitOrientation(split, targetOrientation);

  // After rotation, children might need to re-evaluate their internal orientation (e.g. tabstrip flip)
  const childPanesArr = split.querySelectorAll(SELECTORS.PANE);
  childPanesArr.forEach(p => applyPaneOrientation(p));
}

export function createPane(initialSettings = {}, options = {}) {
  const pane = el('div', { className: SELECTORS.PANE.substring(1), style: { position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: '0', minWidth: '0', overflow: 'hidden' } });
  const tabStrip = el('div', { className: SELECTORS.TAB_STRIP.substring(1) });
  const scrollBtnLeft = el('button', { className: 'ptmt-scrollbutton-left', title: 'Scroll Left' });
  const scrollBtnRight = el('button', { className: 'ptmt-scrollbutton-right', title: 'Scroll Right' });
  const scrollBtnUp = el('button', { className: 'ptmt-scrollbutton-up', title: 'Scroll Up' });
  const scrollBtnDown = el('button', { className: 'ptmt-scrollbutton-down', title: 'Scroll Down' });

  tabStrip.append(scrollBtnUp, scrollBtnLeft, scrollBtnRight, scrollBtnDown);

  const panelContainer = el('div', { className: SELECTORS.PANEL_CONTAINER.substring(1) });
  const grid = el('div', { className: 'ptmt-pane-grid', style: { width: '100%', height: '100%' } });

  pane.dataset.paneId = `ptmt-pane-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  grid.append(tabStrip, panelContainer);
  pane.appendChild(grid);

  pane._grid = grid;
  pane._tabStrip = tabStrip;
  pane._tabStripOuter = tabStrip;
  pane._panelContainer = panelContainer;

  tabStrip.addEventListener('wheel', (e) => {
    if (!tabStrip.classList.contains('vertical') && e.deltaY !== 0) {
      tabStrip.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  tabStrip.addEventListener('scroll', () => {
    updateArrowVisibility(tabStrip);
  }, { passive: true });

  const scrollStep = 200;
  scrollBtnLeft.addEventListener('click', () => tabStrip.scrollBy({ left: -scrollStep, behavior: 'smooth' }));
  scrollBtnRight.addEventListener('click', () => tabStrip.scrollBy({ left: scrollStep, behavior: 'smooth' }));
  scrollBtnUp.addEventListener('click', () => tabStrip.scrollBy({ top: -scrollStep, behavior: 'smooth' }));
  scrollBtnDown.addEventListener('click', () => tabStrip.scrollBy({ top: scrollStep, behavior: 'smooth' }));

  tabStrip.addEventListener('contextmenu', (e) => {
    if (e.target !== tabStrip) return;
    showContextMenu(e, [
      {
        label: 'Edit Pane',
        icon: '⚙',
        onClick: () => openViewSettingsDialog(pane)
      }
    ]);
  });

  tabStripOverflowObserver.observe(tabStrip);

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
    if (eln.classList?.contains(SELECTORS.SPLIT.substring(1))) splitCount++;
  }
  return splitCount + 1;
}

export function getParentSplitOrientation(pane) {
  if (!pane) return null;
  const parentSplit = pane.parentElement;
  if (!parentSplit || !parentSplit.classList?.contains(SELECTORS.SPLIT.substring(1))) {
    return null;
  }
  return getSplitOrientation(parentSplit);
}

function findGoverningOrientation(pane) {
  const rect = (pane._panelContainer || pane).getBoundingClientRect();

  if (rect.width > 0 && rect.height > 0) {
    if (rect.width < NARROW_PANE_THRESHOLD_PX) return 'vertical';
    return (rect.width >= rect.height) ? 'horizontal' : 'vertical';
  }

  const column = pane.closest(SELECTORS.COLUMN);
  if (column?.dataset.isColumnCollapsed === 'true') {
    const preferred = findPreferredDescendentOrientation(pane);
    if (preferred && preferred !== 'auto') return preferred;
    return 'vertical';
  }

  let current = pane.parentElement;
  while (current && !current.classList.contains(SELECTORS.COLUMN.substring(1))) {
    if (current.classList.contains(SELECTORS.SPLIT.substring(1))) {
      return current.classList.contains('horizontal') ? 'horizontal' : 'vertical';
    }
    current = current.parentElement;
  }

  return 'vertical';
}

export function applyPaneOrientation(pane) {
  if (!pane) return;
  const vs = readPaneViewSettings(pane) || {};
  const isCollapsed = pane.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1));
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
  const tsOuter = pane._tabStripOuter || pane._tabStrip || pane;
  const isVert = orientation === 'vertical';

  gridEl.classList.toggle('grid-vertical', isVert);
  gridEl.classList.toggle('grid-horizontal', orientation === 'horizontal');
  tsOuter.classList.toggle('vertical', isVert);
  gridEl.classList.toggle('flow-reversed', vs.contentFlow === 'reversed');

  updateArrowVisibility(tsOuter);
}

export function setPaneCollapsedView(pane, collapsed) {
  if (!pane) return;

  const parentSplit = pane.parentElement;

  if (collapsed) {
    const vs = readPaneViewSettings(pane);
    const minSizePx = vs.minimalPanelSize || LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;
    const rect = pane.getBoundingClientRect();
    const currentFlex = pane.style.flex;
    const currentBasisPercent = parseFlexBasis(currentFlex) ?? 0;

    const existingLastFlex = pane.dataset.lastFlex;
    const existingBasisPercent = parseFlexBasis(existingLastFlex) ?? 0;

    if (existingBasisPercent <= 5) {
      let shouldResetToMin = false;
      if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
        const isHorizontal = parentSplit.classList.contains('horizontal');
        const currentSize = isHorizontal ? rect.height : rect.width;
        if (currentSize < minSizePx || currentBasisPercent >= 99.9) {
          shouldResetToMin = true;
        }
      } else if (currentBasisPercent >= 99.9) {
        shouldResetToMin = true;
      }

      if (shouldResetToMin && parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
        const isHorizontal = parentSplit.classList.contains('horizontal');
        const parentRect = parentSplit.getBoundingClientRect();
        const totalParentSize = isHorizontal ? parentRect.height : parentRect.width;
        if (totalParentSize > 0) {
          const minBasisPercent = (minSizePx / totalParentSize) * 100;
          pane.dataset.lastFlex = `1 1 ${Math.min(100, minBasisPercent).toFixed(4)}%`;
        } else if (!pane.dataset.lastFlex) {
          pane.dataset.lastFlex = '1 1 30%';
        }
      } else if (currentFlex && currentBasisPercent > 5) {
        pane.dataset.lastFlex = currentFlex;
      }
    }

    pane.classList.add(SELECTORS.VIEW_COLLAPSED.substring(1));
    if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
      updateSplitCollapsedState(parentSplit);
    }
  } else {
    pane.classList.remove(SELECTORS.VIEW_COLLAPSED.substring(1));

    let lastFlex = pane.dataset.lastFlex;
    const isFlexInvalid = parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1)) && lastFlex && /\s0+(\.0*)?%$/.test(lastFlex);
    const vs = readPaneViewSettings(pane);
    const minSizePx = vs.minimalPanelSize || LAYOUT.DEFAULT_MIN_PANEL_SIZE_PX;

    if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
      const isHorizontal = parentSplit.classList.contains('horizontal');
      const parentRect = parentSplit.getBoundingClientRect();
      const totalParentSize = isHorizontal ? parentRect.height : parentRect.width;

      if (totalParentSize > 0) {
        const minBasisPercent = (minSizePx / totalParentSize) * 100;
        const lastBasisPercent = parseFlexBasis(lastFlex) ?? 0;

        if (Math.abs(lastBasisPercent - minBasisPercent) < 0.1) {
          const siblings = Array.from(parentSplit.children).filter(c => c !== pane && (c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1))));
          const totalSiblingLastFlex = siblings.reduce((sum, s) => {
            return sum + (parseFlexBasis(s.dataset.lastFlex) ?? 0);
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
          const lastBasisPercent = parseFlexBasis(lastFlex) ?? 0;
          targetBasisPercent = Math.max(minBasisPercent, lastBasisPercent);
        } else {
          targetBasisPercent = minBasisPercent;
        }
        setFlexBasisPercent(pane, Math.min(100, targetBasisPercent));
      } else {
        pane.style.flex = (lastFlex && !isFlexInvalid) ? lastFlex : LAYOUT.DEFAULT_PANE_FLEX_BASIS;
      }
    } else {
      pane.style.flex = LAYOUT.DEFAULT_PANE_FLEX_BASIS_FULL;
    }

    if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
      recalculateSplitSizes(parentSplit, pane);
    }
  }

  applyPaneOrientation(pane);

  if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
    updateSplitCollapsedState(parentSplit);
    recalculateAllSplitsRecursively();
  }

  invalidateMinWidthCache(pane);
  recalculateColumnSizes();
  updateResizerDisabledStates();
}

export function cleanupPaneObservers(pane) {
  if (pane && pane._tabStrip) {
    tabStripOverflowObserver.unobserve(pane._tabStrip);
  }
}

export function removePaneIfEmpty(pane, depth = 0) {
  if (!pane?.parentElement || depth > 10) return;
  // Guard: only operate on actual pane elements
  if (!pane.classList?.contains(SELECTORS.PANE.substring(1))) return;
  const tabs = pane._tabStrip?.querySelectorAll(SELECTORS.TAB);
  const panels = pane._panelContainer?.querySelectorAll(SELECTORS.PANEL);
  if (tabs?.length || panels?.length) return;

  cleanupPaneObservers(pane);

  const parent = pane.parentElement;
  if (!parent) return;

  const column = pane.closest(SELECTORS.COLUMN);
  const wasInLeftColumn = column?.id === 'ptmt-leftBody';
  const wasInRightColumn = column?.id === 'ptmt-rightBody';

  if (parent.classList.contains(SELECTORS.SPLIT.substring(1))) {
    const structuralChildren = Array.from(parent.children).filter(c => c !== pane && (c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1))));
    const grand = parent.parentElement;

    if (structuralChildren.length === 0) {
      if (grand) grand.removeChild(parent); else parent.remove();
      if (grand) removePaneIfEmpty(grand, depth + 1);
    } else if (structuralChildren.length === 1) {
      const remaining = structuralChildren[0];
      if (grand) {
        grand.replaceChild(remaining, parent);
        if (grand.classList.contains(SELECTORS.SPLIT.substring(1))) {
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

  if ((wasInLeftColumn || wasInRightColumn) && !column.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`)) {
    if (wasInLeftColumn) {
      settings.update({ showLeftPane: false });
    } else {
      settings.update({ showRightPane: false });
    }
  }

  const refs = getRefs();
  if (!refs.centerBody.querySelector(SELECTORS.PANE)) {
    refs.centerBody.appendChild(createPane());
  }

  try { window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED)); } catch (e) {
    console.warn('[PTMT] Failed to dispatch LAYOUT_CHANGED event:', e);
  }
}

export function splitPaneWithPane(targetPane, movingPanel, vertical = true, newFirst = true) {
  if (!targetPane || !movingPanel) return;

  const column = targetPane.closest(SELECTORS.COLUMN);
  const columnKey = column.id.replace('ptmt-', '').replace('Body', '');
  const maxLayers = settings.get(`maxLayers${columnKey.charAt(0).toUpperCase() + columnKey.slice(1)}`) || LAYOUT.MAX_PANE_LAYERS;

  const layers = getPaneLayerCount(targetPane);
  if (layers >= maxLayers) {
    moveTabIntoPaneAtIndex(movingPanel, targetPane, null);
    return;
  }

  const originalSettings = readPaneViewSettings(targetPane);

  const srcPane = getPaneForPanel(movingPanel);
  const parent = targetPane.parentElement;

  const split = el('div', { className: SELECTORS.SPLIT.substring(1) });
  split.dataset.naturalOrientation = vertical ? 'vertical' : 'horizontal';
  split.dataset.orientationExpanded = vertical ? 'vertical' : 'horizontal';
  split.dataset.orientationCollapsed = 'auto';

  if (!vertical) {
    split.classList.add('horizontal');
  }

  const pane1 = createPane(originalSettings);
  const pane2 = createPane(originalSettings);

  const existingPanels = Array.from(targetPane._panelContainer.children);
  const existingTabs = Array.from(targetPane._tabStrip.children).filter(c => c.classList.contains(SELECTORS.TAB.substring(1)));

  const destinationPaneForExisting = newFirst ? pane2 : pane1;
  existingPanels.forEach(p => destinationPaneForExisting._panelContainer.appendChild(p));
  existingTabs.forEach(t => destinationPaneForExisting._tabStrip.appendChild(t));

  parent.replaceChild(split, targetPane);

  const resizer = el('splitter', { className: vertical ? SELECTORS.RESIZER_V.substring(1) : SELECTORS.RESIZER_H.substring(1) });
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
    window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
  });
}

function normalizeLiftedElement(el) {
  if (!el) return;
  try {
    if (el.classList.contains(SELECTORS.PANE.substring(1))) {
      el.style.flex = '1 1 0%';
      el.querySelectorAll(SELECTORS.PANE).forEach(p => {
        p.style.flex = p.style.flex?.indexOf('0 0') === 0 ? '1 1 0%' : p.style.flex;
      });
      return;
    }

    if (el.classList.contains(SELECTORS.SPLIT.substring(1))) {
      el.style.flex = '1 1 0%';
      Array.from(el.children).forEach(c => {
        if (!c) return;
        if (c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1))) {
          if (!c.style.flex || c.style.flex.includes('0 0') === false) {
            c.style.flex = '1 1 0%';
          }
        } else {
          try { c.style.flex = ''; } catch (e) {
            console.warn('[PTMT] Failed to clear flex style on element:', e);
          }
        }
      });
      return;
    }
    try { el.style.flex = ''; } catch (e) {
      console.warn('[PTMT] Failed to clear flex style on element:', e);
    }
  } catch (e) {
    console.warn('normalizeLiftedElement error', e);
  }
}

export function checkAndCollapsePaneIfAllTabsCollapsed(pane) {
  try {
    if (!pane) return;
    const tabs = Array.from(pane._tabStrip.querySelectorAll(`${SELECTORS.TAB}:not(.ptmt-view-settings)`));
    const allCollapsed = tabs.length > 0 && tabs.every(tab => tab.classList.contains('collapsed'));

    const wasCollapsed = pane.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1));
    if (allCollapsed === wasCollapsed) return;

    setPaneCollapsedView(pane, allCollapsed);
    const parentSplit = pane.parentElement;
    if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
      updateSplitCollapsedState(parentSplit);
    }

    window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'paneCollapsed', pane } }));
  } catch (e) {
    console.warn('checkAndCollapsePaneIfAllTabsCollapsed error:', e);
  }
}

export function updateSplitCollapsedState(split) {
  if (!split || !split.classList.contains(SELECTORS.SPLIT.substring(1))) return;

  const children = Array.from(split.children).filter(c => c.classList.contains(SELECTORS.PANE.substring(1)) || c.classList.contains(SELECTORS.SPLIT.substring(1)));
  if (children.length === 0) return;

  const allChildrenCollapsed = children.every(child =>
    child.classList.contains(SELECTORS.VIEW_COLLAPSED.substring(1)) || child.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1))
  );
  const isCurrentlyCollapsed = split.classList.contains(SELECTORS.CONTAINER_COLLAPSED.substring(1));

  if (allChildrenCollapsed && !isCurrentlyCollapsed) {
    const currentFlex = split.style.flex;
    if (currentFlex && currentFlex.includes('%')) {
      split.dataset.lastFlex = currentFlex;
    }
    split.classList.add(SELECTORS.CONTAINER_COLLAPSED.substring(1));
    applySplitOrientation(split);
  } else if (!allChildrenCollapsed && isCurrentlyCollapsed) {
    split.style.flex = split.dataset.lastFlex || LAYOUT.DEFAULT_PANE_FLEX_BASIS_FULL;
    split.classList.remove(SELECTORS.CONTAINER_COLLAPSED.substring(1));
    applySplitOrientation(split);
  } else {
    applySplitOrientation(split);
  }

  const parentSplit = split.parentElement;
  if (parentSplit?.classList.contains(SELECTORS.SPLIT.substring(1))) {
    updateSplitCollapsedState(parentSplit);
  } else {
    window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'splitStructuralChange' } }));
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

  const dialog = el('div', { id: 'ptmt-view-settings-dialog', className: 'ptmt-view-settings-dialog' },
    el('div', null,
      el('h3', null, 'Pane Settings'),
      el('div', { className: 'ptmt-vs-row ptmt-vs-id-row' },
        el('label', null, 'Internal ID: '),
        el('span', { className: 'ptmt-vs-id-value' }, pane.dataset.paneId || pane.id)
      ),
      el('div', { className: 'ptmt-vs-row' },
        el('label', { for: 'ptmt-vs-minimal-panel' }, 'Min. Panel Size (px): '),
        el('input', { type: 'number', value: vs.minimalPanelSize || defaultViewSettings.minimalPanelSize, id: 'ptmt-vs-minimal-panel', className: 'text_edit' })
      ),
      el('div', { className: 'ptmt-vs-row' },
        el('label', { for: 'ptmt-vs-default' }, 'Default orientation: '),
        createSelect('ptmt-vs-default', [
          { value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' },
        ], vs.defaultOrientation || 'auto')
      ),
      el('div', { className: 'ptmt-vs-row' },
        el('label', { for: 'ptmt-vs-collapsed' }, 'Collapsed orientation: '),
        createSelect('ptmt-vs-collapsed', [
          { value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' },
        ], vs.collapsedOrientation || 'auto')
      ),
      el('div', { className: 'ptmt-vs-row' },
        el('label', { for: 'ptmt-vs-flow' }, 'Content Flow: '),
        createSelect('ptmt-vs-flow', [
          { value: 'default', label: 'Default (Tabs First)' }, { value: 'reversed', label: 'Reversed (Content First)' },
        ], vs.contentFlow || 'default')
      ),
      el('div', { className: 'ptmt-vs-footer' },
        el('button', { id: 'ptmt-vs-save', className: 'ptmt-vs-button primary' }, 'Save'),
        el('button', { id: 'ptmt-vs-cancel', className: 'ptmt-vs-button' }, 'Cancel')
      )
    )
  );

  document.body.appendChild(dialog);
  dialog.querySelector('#ptmt-vs-cancel').addEventListener('click', () => dialog.remove());
  dialog.querySelector('#ptmt-vs-save').addEventListener('click', () => {
    const minVal = dialog.querySelector('#ptmt-vs-minimal-panel').value;
    const minimal = Math.max(20, parseInt(minVal, 10)) || defaultViewSettings.minimalPanelSize;
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
    window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
  });
}
