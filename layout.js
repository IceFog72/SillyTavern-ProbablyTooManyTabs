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


function isColumnContentCollapsed(column) {
    if (!column || column.style.display === 'none') return true;
    const directChildren = Array.from(column.children).filter(c => c.classList.contains('ptmt-pane') || c.classList.contains('ptmt-split'));
    if (directChildren.length === 0) return true; 
    return directChildren.every(child => 
        child.classList.contains('view-collapsed') || child.classList.contains('ptmt-container-collapsed')
    );
}

export function recalculateColumnSizes({ protected: protectedColumn = null, collapsed: collapsedColumn = null } = {}) {
    const refs = getRefs();
    if (!refs || !refs.mainBody) return;

    const MIN_COLLAPSED_PIXELS = 36;
    const columns = [refs.leftBody, refs.centerBody, refs.rightBody];
    const visibleColumns = columns.filter(col => col && col.style.display !== 'none');
    if (visibleColumns.length === 0) return;

    // Step 1: Update collapsed state for each column based on its content.
    visibleColumns.forEach(col => {
        const isContentFullyCollapsed = isColumnContentCollapsed(col);
        const wasColumnCollapsed = col.dataset.isColumnCollapsed === 'true';

        if (isContentFullyCollapsed && !wasColumnCollapsed) {
            const minWidth = calculateElementMinWidth(col.querySelector('.ptmt-pane, .ptmt-split'));
            const currentWidth = col.getBoundingClientRect().width;
            const currentFlex = col.style.flex;
            const basisMatch = currentFlex ? currentFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
            const basis = basisMatch ? parseFloat(basisMatch[1]) : 0;

            if (currentWidth < minWidth || basis >= 99.9) {
                const parentWidth = col.parentElement.getBoundingClientRect().width;
                const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                    .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
                const availableWidth = parentWidth - totalResizerWidth;
                if (availableWidth > 0) {
                    const minBasisPercent = (minWidth / availableWidth) * 100;
                    col.dataset.lastFlex = `1 1 ${minBasisPercent.toFixed(4)}%`;
                }
            } else {
                 if (currentFlex && currentFlex.includes('%')) {
                    col.dataset.lastFlex = currentFlex;
                } else {
                    const parentWidth = col.parentElement.getBoundingClientRect().width;
                    const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                        .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
                    const availableWidth = parentWidth - totalResizerWidth;
                    if (availableWidth > 0 && currentWidth > 0) {
                        const basisPercent = (currentWidth / availableWidth) * 100;
                        col.dataset.lastFlex = `1 1 ${basisPercent.toFixed(4)}%`;
                    }
                }
            }
            
            col.dataset.isColumnCollapsed = 'true';
            col.style.flex = `0 0 ${MIN_COLLAPSED_PIXELS}px`;
        } else if (!isContentFullyCollapsed && wasColumnCollapsed) {
            let lastFlex = col.dataset.lastFlex;
            const minWidth = calculateElementMinWidth(col.querySelector('.ptmt-pane, .ptmt-split'));
            const parentWidth = col.parentElement.getBoundingClientRect().width;
            const totalResizerWidth = Array.from(col.parentElement.querySelectorAll('.ptmt-column-resizer'))
                .reduce((sum, r) => sum + r.getBoundingClientRect().width, 0);
            const availableWidth = parentWidth - totalResizerWidth;

            if (availableWidth > 0) {
                const minBasisPercent = (minWidth / availableWidth) * 100;
                const lastBasisMatch = lastFlex ? lastFlex.match(/(\d+(?:\.\d+)?)\s*%/) : null;
                const lastBasisPercent = lastBasisMatch ? parseFloat(lastBasisMatch[1]) : 0;

                if (Math.abs(lastBasisPercent - minBasisPercent) < 0.1) {
                    const siblings = visibleColumns.filter(c => c !== col);
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
            
            col.removeAttribute('data-is-column-collapsed');
            col.style.flex = lastFlex || `1 1 ${100 / visibleColumns.length}%`;
        }
    });

    const activeColumns = visibleColumns.filter(col => col.dataset.isColumnCollapsed !== 'true');
    if (activeColumns.length === 0) return;

    const getBasis = (col, useLastFlex = false) => {
        if (!col || col.style.display === 'none') return 0;
        let flexString = col.style.flex;
        if (useLastFlex && col.dataset.isColumnCollapsed === 'true') {
            flexString = col.dataset.lastFlex || flexString;
        }
        if (!useLastFlex && col.dataset.isColumnCollapsed === 'true') return 0;
        const basisMatch = flexString.match(/(\d+(?:\.\d+)?)\s*%/);
        return basisMatch ? parseFloat(basisMatch[1]) : 0;
    };

    const { leftBody, centerBody, rightBody } = refs;

    // Specific event-driven logic (collapse or reopen)
    if (protectedColumn || collapsedColumn) {
        // Guard: Only act on the instruction if the column's state actually matches.
        if (collapsedColumn && collapsedColumn.dataset.isColumnCollapsed !== 'true') {
            collapsedColumn = null; // Ignore instruction, column isn't fully collapsed.
        }
        if (protectedColumn && protectedColumn.dataset.isColumnCollapsed === 'true') {
            protectedColumn = null; // Ignore instruction, column is still collapsed.
        }

        if (protectedColumn) { // A column was reopened
            const spaceToTake = getBasis(protectedColumn);
            let donors = [];

            // Determine priority for donating space
            if (protectedColumn === leftBody || protectedColumn === rightBody) {
                if (activeColumns.includes(centerBody)) {
                    donors.push(centerBody);
                } else {
                    const otherSide = (protectedColumn === leftBody) ? rightBody : leftBody;
                    if (activeColumns.includes(otherSide)) donors.push(otherSide);
                }
            } else if (protectedColumn === centerBody) {
                if (activeColumns.includes(leftBody)) donors.push(leftBody);
                if (activeColumns.includes(rightBody)) donors.push(rightBody);
            }

            // Fallback to any other active column (excluding self)
            if (donors.length === 0) {
                donors = activeColumns.filter(c => c !== protectedColumn);
            }

            if (donors.length > 0) {
                const totalDonorBasis = donors.reduce((sum, col) => sum + getBasis(col), 0);
                if (totalDonorBasis > 0) {
                    // Take space proportionally
                    donors.forEach(col => {
                        const currentBasis = getBasis(col);
                        const reduction = spaceToTake * (currentBasis / totalDonorBasis);
                        col.style.flex = `1 1 ${(currentBasis - reduction).toFixed(4)}%`;
                    });
                }
            }
        } else if (collapsedColumn) { // A column was collapsed
            const spaceFreed = getBasis(collapsedColumn, true);
            
            let receivers = [];
            // Determine priority for receiving space
            if (collapsedColumn === leftBody || collapsedColumn === rightBody) {
                if (activeColumns.includes(centerBody)) {
                    receivers.push(centerBody);
                } else {
                    const otherSide = (collapsedColumn === leftBody) ? rightBody : leftBody;
                    if (activeColumns.includes(otherSide)) receivers.push(otherSide);
                }
            } else if (collapsedColumn === centerBody) {
                if (activeColumns.includes(leftBody)) receivers.push(leftBody);
                if (activeColumns.includes(rightBody)) receivers.push(rightBody);
            }

            // Fallback to any other active column if priority targets are not available
            if (receivers.length === 0) {
                receivers = activeColumns;
            }

            if (receivers.length > 0) {
                const totalReceiverBasis = receivers.reduce((sum, col) => sum + getBasis(col), 0);
                if (totalReceiverBasis > 0) {
                    // Distribute proportionally
                    receivers.forEach(col => {
                        const currentBasis = getBasis(col);
                        const share = spaceFreed * (currentBasis / totalReceiverBasis);
                        col.style.flex = `1 1 ${(currentBasis + share).toFixed(4)}%`;
                    });
                } else {
                    // Distribute equally
                    const equalShare = spaceFreed / receivers.length;
                    receivers.forEach(col => {
                        const currentBasis = getBasis(col); // is 0
                        col.style.flex = `1 1 ${(currentBasis + equalShare).toFixed(4)}%`;
                    });
                }
            }
        }
    }

    // General normalization pass to correct any floating point errors
    const finalTotalBasis = activeColumns.reduce((sum, col) => sum + getBasis(col), 0);
    const finalError = finalTotalBasis - 100.0;

    if (Math.abs(finalError) > 0.01) {
        const colToAdjust = activeColumns.includes(centerBody) ? centerBody : activeColumns[activeColumns.length-1];
        if(colToAdjust) {
            const basis = getBasis(colToAdjust);
            colToAdjust.style.flex = `1 1 ${(basis - finalError).toFixed(4)}%`;
        }
    }
}