// layout.js

import { el } from './utils.js';
import { createPane } from './pane.js';
import { attachColumnResizer, calculateElementMinWidth } from './resizer.js';
import { settings } from './settings.js';

let _refs = null;

export function getRefs() {
  if (_refs) {
    const ok = _refs.main && document.getElementById('ptmt-main') === _refs.main && _refs.centerBody && document.getElementById('ptmt-centerBody') === _refs.centerBody;
    if (ok) return _refs;
    _refs = null;
  }
  _refs = {
    main: document.getElementById('ptmt-main'),
    mainBody: document.getElementById('ptmt-mainBody'),
    leftBody: document.getElementById('ptmt-leftBody'),
    centerBody: document.getElementById('ptmt-centerBody'),
    rightBody: document.getElementById('ptmt-rightBody'),
    dropIndicator: document.getElementById('ptmt-drop-indicator'),
    splitOverlay: document.getElementById('ptmt-split-overlay')
  };
  return _refs;
}

export function createLayoutIfMissing() {
  if (document.getElementById('ptmt-main')) return getRefs();

  const main = el('div', { id: 'ptmt-main' });
  const topBar = el('div', { id: 'ptmt-topBar' });

  const mainBody = el('div', { id: 'ptmt-mainBody', style: { display: 'flex', flex: '1 1 0', minHeight: '0', minWidth: '0', overflow: 'hidden', position: 'relative' } });
  const leftBody = el('div', { id: 'ptmt-leftBody', className: 'ptmt-body-column' });
  const centerBody = el('div', { id: 'ptmt-centerBody', className: 'ptmt-body-column' });
  const rightBody = el('div', { id: 'ptmt-rightBody', className: 'ptmt-body-column' });

  const resizerLeftCenter = el('splitter', { className: 'ptmt-resizer-vertical ptmt-column-resizer' });
  const resizerCenterRight = el('splitter', { className: 'ptmt-resizer-vertical ptmt-column-resizer' });

  mainBody.append(leftBody, resizerLeftCenter, centerBody, resizerCenterRight, rightBody);
  main.append(topBar, mainBody);

  leftBody.appendChild(createPane());
  centerBody.appendChild(createPane());
  rightBody.appendChild(createPane());

  attachColumnResizer(resizerLeftCenter);
  attachColumnResizer(resizerCenterRight);

  document.body.insertBefore(main, document.body.firstChild);

  mainBody.append(
    el('div', { className: 'ptmt-drop-indicator', id: 'ptmt-drop-indicator', style: { display: 'none' } }),
    el('div', { className: 'ptmt-split-overlay', id: 'ptmt-split-overlay', style: { display: 'none' } })
  );
  return getRefs();
}

export function applyColumnVisibility() {
  const refs = getRefs();
  const showLeft = settings.get('showLeftPane');
  const showRight = settings.get('showRightPane');

  const resizerLeft = refs.mainBody.querySelector('.ptmt-resizer-vertical');
  const resizerRight = refs.mainBody.querySelectorAll('.ptmt-resizer-vertical')[1];

  if (refs.leftBody.style.display !== (showLeft ? 'flex' : 'none')) {
    refs.leftBody.style.display = showLeft ? 'flex' : 'none';
    if (resizerLeft) resizerLeft.style.display = showLeft ? 'flex' : 'none';
    if (showLeft && !refs.leftBody.querySelector('.ptmt-pane')) {
      refs.leftBody.appendChild(createPane());
    }
  }

  if (refs.rightBody.style.display !== (showRight ? 'flex' : 'none')) {
    refs.rightBody.style.display = showRight ? 'flex' : 'none';
    if (resizerRight) resizerRight.style.display = showRight ? 'flex' : 'none';
    if (showRight && !refs.rightBody.querySelector('.ptmt-pane')) {
      refs.rightBody.appendChild(createPane());
    }
  }

  recalculateColumnSizes();
}


export function recalculateColumnSizes() {
  const refs = getRefs();
  if (!refs || !refs.mainBody) return;

  const MIN_COLLAPSED_PIXELS = 40;

  const columns = [refs.leftBody, refs.centerBody, refs.rightBody];
  const visibleColumns = columns.filter(col => col && col.style.display !== 'none');
  if (visibleColumns.length === 0) return;

  const isContentCollapsed = visibleColumns.map(col => {
    const firstChild = col.querySelector('.ptmt-pane, .ptmt-split');
    return firstChild && (firstChild.classList.contains('view-collapsed') || firstChild.classList.contains('ptmt-container-collapsed'));
  });

  visibleColumns.forEach((col, index) => {
    if (isContentCollapsed[index]) {

      if (!col.dataset.isColumnCollapsed) {
        const currentFlex = col.style.flex;

        if (currentFlex && currentFlex.includes('%')) {
          col.dataset.lastFlex = currentFlex;
        }
        col.dataset.isColumnCollapsed = 'true';
      }
      col.style.flex = `0 0 ${MIN_COLLAPSED_PIXELS}px`;
    } else {

      if (col.dataset.isColumnCollapsed) {
        col.removeAttribute('data-is-column-collapsed');
        col.style.flex = col.dataset.lastFlex || '1 1 33.3333%';
      }

    }
  });


  const activeColumns = visibleColumns.filter(col => !col.dataset.isColumnCollapsed);
  if (activeColumns.length > 0) {
    const totalFlexBasis = activeColumns.reduce((sum, col) => {
      const flexValue = col.style.flex;
      const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);
      return sum + (basisMatch ? parseFloat(basisMatch[1]) : 0);
    }, 0);

    if (totalFlexBasis <= 0) return;

    const error = totalFlexBasis - 100.0;


    if (Math.abs(error) < 0.01) {
      return;
    }


    activeColumns.forEach(col => {
      const flexValue = col.style.flex;
      const basisMatch = flexValue.match(/(\d+(?:\.\d+)?)\s*%/);


      const currentBasis = basisMatch ? parseFloat(basisMatch[1]) : (100.0 / activeColumns.length);


      const adjustment = error * (currentBasis / totalFlexBasis);
      const newBasis = currentBasis - adjustment;

      col.style.flex = `1 1 ${newBasis.toFixed(4)}%`;
    });
  }
}