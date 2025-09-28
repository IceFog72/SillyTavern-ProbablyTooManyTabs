import { $$, getElementDepth, setFlexBasisPercent, throttle } from './utils.js';
import { getRefs } from './layout.js';
import { readPaneViewSettings, defaultViewSettings } from './pane.js';

/**
 * Checks if a pane has enough space for its tab text. If not, it applies
 * the 'ptmt-pane-icons-only' class to that specific pane. This function is
 * throttled to ensure performance during drag operations.
 * @param {HTMLElement} pane The pane element to check.
 */
function checkPaneForIconMode(pane) {
    if (!pane || !pane._tabStrip || !pane._panelContainer || pane.classList.contains('view-collapsed')) {
        return;
    }

    const tabStrip = pane._tabStrip;
    const tabs = tabStrip.querySelectorAll('.ptmt-tab');
    if (tabs.length === 0) return;

    const isVertical = tabStrip.classList.contains('vertical');
    const containerRect = pane._panelContainer.getBoundingClientRect();
    const availableSize = isVertical ? containerRect.height : containerRect.width;

    let requiredSize = 0;
    tabs.forEach(tab => {
        const tabRect = tab.getBoundingClientRect();
        requiredSize += (isVertical ? tabRect.height : tabRect.width) + 4;
    });

    pane.classList.toggle('ptmt-pane-icons-only', requiredSize > availableSize);
}

const throttledCheckPaneForIconMode = throttle(checkPaneForIconMode, 80);

export const resizerControllers = new WeakMap();
const MIN_PIXELS = 40;

const pxToPercent = (px, total) => !Number.isFinite(total) || total <= 0 ? 50 : Math.max(0, Math.min(100, (px / total) * 100));

function createResizer(resizer, orientation, config) {
  const isVertical = orientation === 'vertical' || orientation === 'v';
  const sizeProp = isVertical ? 'width' : 'height';
  const clientProp = isVertical ? 'clientX' : 'clientY';
  resizer.style.cursor = isVertical ? 'col-resize' : 'row-resize';

  let pointerId = null;
  let startClient = 0;
  let dragState = null;

  function onPointerDown(e) {
    if ((e.button && e.button !== 0) || resizer.classList.contains('disabled')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    dragState = config.onDragStart(resizer, { sizeProp, clientProp });
    if (!dragState) return;

    e.preventDefault();
    pointerId = e.pointerId;
    try { resizer.setPointerCapture(pointerId); } catch { }
    startClient = e[clientProp];

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (pointerId === null || e.pointerId !== pointerId || !dragState) return;
    const delta = e[clientProp] - startClient;
    config.onDragMove(delta, dragState);
  }

  function onPointerUp(e) {
    if (pointerId !== null && e.pointerId === pointerId) {
      try { resizer.releasePointerCapture(pointerId); } catch { }
    }
    pointerId = null;
    dragState = null;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    try {
      window.dispatchEvent(new CustomEvent('ptmt:layoutChanged', { detail: { reason: 'manualResize' } }));
    } catch { }
  }

  resizer.addEventListener('pointerdown', onPointerDown);
  return {
    detach() {
      resizer.removeEventListener('pointerdown', onPointerDown);
    }
  };
}

export function attachResizer(resizer, orientation = 'vertical') {
  const paneResizeStrategy = {
    onDragStart: (resizerEl, { sizeProp }) => {
      const aElem = resizerEl.previousElementSibling;
      const bElem = resizerEl.nextElementSibling;
      if (!aElem || !bElem) return null;

      const isACollapsed = aElem.classList.contains('view-collapsed') || aElem.classList.contains('ptmt-container-collapsed');
      const isBCollapsed = bElem.classList.contains('view-collapsed') || bElem.classList.contains('ptmt-container-collapsed');
      if (isACollapsed || isBCollapsed) return null;

      const vsA = readPaneViewSettings(aElem);
      const vsB = readPaneViewSettings(bElem);
      const minSizeA = Number(vsA.minimalPanelSize) || defaultViewSettings.minimalPanelSize;
      const minSizeB = Number(vsB.minimalPanelSize) || defaultViewSettings.minimalPanelSize;

      const flexSiblings = Array.from(resizerEl.parentElement.children).filter(c =>
        c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split')
      );
      const initialSizes = flexSiblings.map(el => el.getBoundingClientRect()[sizeProp]);
      const aElemIndex = flexSiblings.indexOf(aElem);
      const bElemIndex = flexSiblings.indexOf(bElem);
      const parentRectAtStart = resizerEl.parentElement?.getBoundingClientRect();

      return { flexSiblings, initialSizes, aElemIndex, bElemIndex, minSizeA, minSizeB, parentRectAtStart, sizeProp };
    },

    onDragMove: (delta, state) => {
      let clampedDelta = Math.max(delta, state.minSizeA - state.initialSizes[state.aElemIndex]);
      clampedDelta = Math.min(clampedDelta, state.initialSizes[state.bElemIndex] - state.minSizeB);

      const newSizes = [...state.initialSizes];
      newSizes[state.aElemIndex] = state.initialSizes[state.aElemIndex] + clampedDelta;
      newSizes[state.bElemIndex] = state.initialSizes[state.bElemIndex] - clampedDelta;

      const totalResizerSize = Array.from(state.flexSiblings[0].parentElement.children)
        .filter(c => !c.classList.contains('ptmt-pane') && !c.classList.contains('ptmt-split'))
        .reduce((sum, r) => sum + r.getBoundingClientRect()[state.sizeProp], 0);

      const totalAvailable = state.parentRectAtStart[state.sizeProp] - totalResizerSize;

      if (totalAvailable > 0) {
        const newPercentages = newSizes.map(size => pxToPercent(size, totalAvailable));
        state.flexSiblings.forEach((sibling, index) => {
          setFlexBasisPercent(sibling, newPercentages[index]);
        });
      }

      // Trigger real-time icon mode check for all affected panes.
      const aElem = state.flexSiblings[state.aElemIndex];
      const bElem = state.flexSiblings[state.bElemIndex];
      aElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
      bElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
    }
  };

  if (resizerControllers.has(resizer)) {
    resizerControllers.get(resizer).detach();
    resizerControllers.delete(resizer);
  }
  const controller = createResizer(resizer, orientation, paneResizeStrategy);
  resizerControllers.set(resizer, controller);
  return controller;
}

export function attachColumnResizer(resizer) {
  const columnResizeStrategy = {
    onDragStart: (resizerEl, { sizeProp }) => {
      const aElem = resizerEl.previousElementSibling;
      const bElem = resizerEl.nextElementSibling;
      if (!aElem || !bElem || !aElem.classList.contains('ptmt-body-column') || !bElem.classList.contains('ptmt-body-column')) {
        return null;
      }

      const refs = getRefs();
      const parentRectAtStart = refs.mainBody.getBoundingClientRect();
      const minWidthA = calculateElementMinWidth(aElem.querySelector('.ptmt-pane, .ptmt-split'));
      const minWidthB = calculateElementMinWidth(bElem.querySelector('.ptmt-pane, .ptmt-split'));

      const initialSizes = {
        left: refs.leftBody.style.display === 'none' ? 0 : refs.leftBody.getBoundingClientRect()[sizeProp],
        center: refs.centerBody.style.display === 'none' ? 0 : refs.centerBody.getBoundingClientRect()[sizeProp],
        right: refs.rightBody.style.display === 'none' ? 0 : refs.rightBody.getBoundingClientRect()[sizeProp],
      };

      const aKey = aElem.id.replace('ptmt-', '').replace('Body', '');
      const bKey = bElem.id.replace('ptmt-', '').replace('Body', '');

      return { refs, initialSizes, minWidthA, minWidthB, aKey, bKey, parentRectAtStart, sizeProp };
    },

    onDragMove: (delta, state) => {
      let clampedDelta = Math.max(delta, state.minWidthA - state.initialSizes[state.aKey]);
      clampedDelta = Math.min(clampedDelta, state.initialSizes[state.bKey] - state.minWidthB);

      const newSizes = { ...state.initialSizes };
      newSizes[state.aKey] = state.initialSizes[state.aKey] + clampedDelta;
      newSizes[state.bKey] = state.initialSizes[state.bKey] - clampedDelta;

      const totalResizerSize = $$('.ptmt-column-resizer', state.refs.mainBody)
        .reduce((sum, r) => sum + r.getBoundingClientRect()[state.sizeProp], 0);
      const totalAvailable = state.parentRectAtStart[state.sizeProp] - totalResizerSize;

      if (totalAvailable <= 0) return;

      const { leftBody, centerBody, rightBody } = state.refs;
      if (leftBody.style.display !== 'none') leftBody.style.flex = `1 1 ${pxToPercent(newSizes.left, totalAvailable).toFixed(4)}%`;
      if (centerBody.style.display !== 'none') centerBody.style.flex = `1 1 ${pxToPercent(newSizes.center, totalAvailable).toFixed(4)}%`;
      if (rightBody.style.display !== 'none') rightBody.style.flex = `1 1 ${pxToPercent(newSizes.right, totalAvailable).toFixed(4)}%`;

      // Trigger real-time icon mode check for all affected panes.
      const aElem = state.refs[`${state.aKey}Body`];
      const bElem = state.refs[`${state.bKey}Body`];
      aElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
      bElem.querySelectorAll('.ptmt-pane').forEach(throttledCheckPaneForIconMode);
    }
  };

  return createResizer(resizer, 'vertical', columnResizeStrategy);
}

export function setSplitOrientation(splitElement, newOrientation) {
  if (!splitElement) return;
  const isHorizontal = newOrientation === 'horizontal';

  if (splitElement.classList.contains('horizontal') === isHorizontal) return;

  splitElement.classList.toggle('horizontal', isHorizontal);

  const resizer = splitElement.querySelector(':scope > .ptmt-resizer-vertical, :scope > .ptmt-resizer-horizontal');
  if (resizer) {
    if (resizerControllers.has(resizer)) {
      resizerControllers.get(resizer).detach();
      resizerControllers.delete(resizer);
    }
    resizer.className = `ptmt-resizer-${newOrientation}`;
    attachResizer(resizer, newOrientation);
  }
}

export function updateResizerDisabledStates() {
  try {
    document.querySelectorAll('.ptmt-resizer-vertical, .ptmt-resizer-horizontal').forEach(r => {
      let a = r.previousElementSibling;
      let b = r.nextElementSibling;

      if (a?.classList.contains('ptmt-resizer-vertical') || a?.classList.contains('ptmt-resizer-horizontal')) a = a.previousElementSibling;
      if (b?.classList.contains('ptmt-resizer-vertical') || b?.classList.contains('ptmt-resizer-horizontal')) b = b.nextElementSibling;

      const isACollapsed = a?.classList.contains('view-collapsed') || a?.classList.contains('ptmt-container-collapsed');
      const isBCollapsed = b?.classList.contains('view-collapsed') || b?.classList.contains('ptmt-container-collapsed');
      const disabled = !!isACollapsed || !!isBCollapsed;

      r.classList.toggle('disabled', disabled);
    });
  } catch { }
}

export function calculateElementMinWidth(element) {
  if (!element) return 0;

  if (element.classList.contains('ptmt-pane')) {
    const vs = readPaneViewSettings(element);
    return Number(vs.minimalPanelSize) || defaultViewSettings.minimalPanelSize;
  }

  if (element.classList.contains('ptmt-split')) {
    const children = Array.from(element.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
    const resizers = Array.from(element.children).filter(c => c.tagName === 'SPLITTER');

    if (element.classList.contains('horizontal')) {
      let maxMinWidth = 0;
      for (const child of children) {
        maxMinWidth = Math.max(maxMinWidth, calculateElementMinWidth(child));
      }
      return maxMinWidth;
    } else {
      let totalMinWidth = 0;
      for (const child of children) {
        totalMinWidth += calculateElementMinWidth(child);
      }
      for (const resizer of resizers) {
        totalMinWidth += resizer.getBoundingClientRect().width || 8;
      }
      return totalMinWidth;
    }
  }
  return 0;
}

export function recalculateAllSplitsRecursively() {
  try {
    const refs = getRefs();
    const splits = Array.from(refs.mainBody.querySelectorAll('.ptmt-split'));
    splits.sort((a, b) => getElementDepth(b) - getElementDepth(a));
    for (const split of splits) {
      recalculateSplitSizes(split);
    }
  } catch (e) {
    console.warn('recalculateAllSplitsRecursively error:', e);
  }
}

export function recalculateSplitSizes(split, protectedChild = null) {
  if (!split?.classList.contains('ptmt-split')) return;

  const children = Array.from(split.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
  if (children.length === 0) return;

  const activeChildren = children.filter(c => !c.classList.contains('view-collapsed') && !c.classList.contains('ptmt-container-collapsed'));
  const isContainerCollapsed = split.classList.contains('ptmt-container-collapsed');

  if (isContainerCollapsed) {
    // For fully collapsed groups, use simple proportional sizing. The real-time
    // resizer check will handle the icons-only logic automatically.
    const totalFlexBasis = children.reduce((sum, col) => {
        const flexValue = col.style.flex;
        const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        return sum + (basisMatch ? parseFloat(basisMatch[1]) : (100.0 / children.length));
    }, 0);
    if (totalFlexBasis <= 0) return;
    children.forEach(child => {
        const flexValue = child.style.flex;
        const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        const currentBasis = basisMatch ? parseFloat(basisMatch[1]) : (100.0 / children.length);
        const newBasis = (currentBasis / totalFlexBasis) * 100;
        child.style.flex = `1 1 ${newBasis.toFixed(4)}%`;
    });

  } else if (activeChildren.length < children.length) {
    // For partially collapsed groups, shrink the collapsed and fill with the active.
    children.forEach(child => {
      if (child.classList.contains('view-collapsed') || child.classList.contains('ptmt-container-collapsed')) {
        child.style.flex = `0 0 ${calculateCollapsedSize(child)}px`;
      } else {
        const currentFlex = child.style.flex;
        if (currentFlex && currentFlex.includes('%')) {
          child.dataset.lastFlex = currentFlex;
        }
        child.style.flex = '1 1 100%';
      }
    });
  } else {
    // For fully active groups, handle expansion and manual resizing.
    if (protectedChild && activeChildren.length === 2) {
      const otherChild = activeChildren.find(c => c !== protectedChild);
      if (otherChild) {
        const flexValue = protectedChild.style.flex;
        const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        const protectedBasis = basisMatch ? parseFloat(basisMatch[1]) : 50;
        const newOtherBasis = 100.0 - protectedBasis;
        setFlexBasisPercent(protectedChild, protectedBasis);
        setFlexBasisPercent(otherChild, newOtherBasis);
      }
    } else {
      const totalFlexBasis = activeChildren.reduce((sum, col) => {
        const flexValue = col.style.flex;
        const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        return sum + (basisMatch ? parseFloat(basisMatch[1]) : 0);
      }, 0);
      if (totalFlexBasis <= 0) return;
      const error = totalFlexBasis - 100.0;
      if (Math.abs(error) < 0.01) return;
      activeChildren.forEach(child => {
        const flexValue = child.style.flex;
        const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
        const currentBasis = basisMatch ? parseFloat(basisMatch[1]) : (100.0 / activeChildren.length);
        const adjustment = error * (currentBasis / totalFlexBasis);
        const newBasis = currentBasis - adjustment;
        setFlexBasisPercent(child, newBasis);
      });
    }
  }
}

function calculateCollapsedSize(element) {
  if (!element) return 0;

  if (element.classList.contains('ptmt-pane')) {
    const parentSplit = element.parentElement;
    if (parentSplit && parentSplit.classList.contains('ptmt-split')) {
      return parentSplit.classList.contains('horizontal') ? 36 : 48;
    }
    const parent = element.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      return rect.height > rect.width ? 36 : 48;
    }
    return 36;
  }

  if (element.classList.contains('ptmt-split')) {
    if (element.classList.contains('horizontal')) {
      return 36;
    }
    return 40;
  }
  return 0;
}