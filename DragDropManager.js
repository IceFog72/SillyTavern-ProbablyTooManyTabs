// DragDropManager.js - Handles all drag-drop and touch interactions

import { el } from './utils.js';
import { getTabIdentifier } from './pending-tabs.js';
import { settings as globalSettings } from './settings.js';

/** @typedef {import('./types.js').DragContext} DragContext */
/** @typedef {import('./types.js').LayoutSnapshot} LayoutSnapshot */
/** @typedef {import('./types.js').PTMTAPI} PTMTAPI */
/** @typedef {import('./types.js').SettingsManager} SettingsManager */
/** @typedef {import('./LayoutEditorRenderer.js').LayoutEditorRenderer} LayoutEditorRenderer */

export class DragDropManager {
    /**
     * @param {LayoutEditorRenderer} layoutEditorRenderer
     * @param {PTMTAPI} appApi
     * @param {SettingsManager} settingsManager
     */
    constructor(layoutEditorRenderer, appApi, settingsManager) {
        this.layoutEditorRenderer = layoutEditorRenderer;
        this.appApi = appApi;
        this.settings = settingsManager;
        
        // Drag-drop state (kept only in DragDropManager)
        this.draggedTabInfo = null;
        this.touchDragGhost = null;
        
        // Bind event handlers to preserve 'this' context
        this.boundHandleDragOver = this.handleDragOver.bind(this);
        this.boundHandleDragLeave = this.handleDragLeave.bind(this);
        this.boundHandleDrop = this.handleDrop.bind(this);
    }

    /**
     * Gets current dragged tab info
     * @returns {Object|null}
     */
    getDraggedTabInfo() {
        return this.draggedTabInfo;
    }

    /**
     * Sets dragged tab info
     * @param {Object|null} info
     */
    setDraggedTabInfo(info) {
        this.draggedTabInfo = info;
    }

    /**
     * Attaches drag-drop event listeners to an element
     * @param {HTMLElement} element
     * @param {string} [pid]
     */
    attachListeners(element, pid) {
        element.addEventListener('dragover', this.boundHandleDragOver);
        element.addEventListener('dragleave', this.boundHandleDragLeave);
        element.addEventListener('drop', this.boundHandleDrop);
        
        if (pid) {
            element.addEventListener('dragstart', (e) => this.handleDragStart(e, pid));
            element.addEventListener('touchstart', (e) => this.handleTouchStart(e, pid), { passive: false });
        } else {
            element.addEventListener('dragstart', (e) => this.handleDragStart(e));
            element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        }
        
        element.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        element.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        element.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
    }

    /**
     * Handles drag start event
     * @param {DragEvent} e
     * @param {string} [pid]
     */
    handleDragStart(e, pid) {
        e.stopPropagation();
        const draggedElement = e.target.closest('.ptmt-editor-tab') || (e.currentTarget?.classList.contains('ptmt-editor-tab') ? e.currentTarget : null);
        if (!draggedElement) return;

        this.draggedTabInfo = {
            pid,
            sourceId: draggedElement.dataset.sourceId,
            searchId: draggedElement.dataset.searchId,
            searchClass: draggedElement.dataset.searchClass,
            isPending: draggedElement.dataset.isPending === 'true',
            isHidden: draggedElement.dataset.isHiddenItem === 'true',
            isActive: draggedElement.dataset.isActive === 'true',
            isCollapsed: draggedElement.dataset.isCollapsed === 'true'
        };

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
                e.dataTransfer.setData('text/plain', pid || draggedElement.dataset.sourceId || '');
            } catch (err) {
                // Ignore errors in some environments
            }
        }

        setTimeout(() => draggedElement.classList.add('dragging'), 0);
    }

    /**
     * Handles drag over event
     * @param {DragEvent} e
     */
    handleDragOver(e) {
        e.preventDefault();
        let container = e.currentTarget;

        if (container.classList.contains('ptmt-editor-pane')) {
            const inner = container.querySelector('.ptmt-editor-tabs-container');
            if (inner) container = inner;
        }

        const isTargetPendingList = container.dataset.isPendingList === 'true';
        const isTargetHiddenList = container.dataset.isHiddenList === 'true';

        if (this.draggedTabInfo) {
            const isSettingsTab = this.draggedTabInfo.sourceId === 'ptmt-settings-wrapper-content';

            if (isSettingsTab && (isTargetPendingList || isTargetHiddenList)) {
                e.dataTransfer.dropEffect = 'none';
                this.clearDropIndicators();
                return;
            }

            if (isSettingsTab) {
                const targetColumn = container.closest('.ptmt-editor-column');
                if (targetColumn && targetColumn.classList.contains('ptmt-editor-column-hidden')) {
                    e.dataTransfer.dropEffect = 'none';
                    this.clearDropIndicators();
                    return;
                }
            }
        }

        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.ptmt-editor-tab');

        this.clearDropIndicators();
        const indicator = el('div', { className: 'drop-indicator' });

        if (target) {
            const rect = target.getBoundingClientRect();
            const isAfter = e.clientY > rect.top + rect.height / 2;
            if (isAfter) {
                target.after(indicator);
            } else {
                target.before(indicator);
            }
        } else {
            container.appendChild(indicator);
        }
    }

    /**
     * Handles drag leave event
     * @param {DragEvent} e
     */
    handleDragLeave(e) {
        setTimeout(() => {
            const rootEl = this.layoutEditorRenderer.rootElement;
            if (!rootEl) return;
            
            const isHoveringValidTarget = rootEl.querySelector(':hover.ptmt-editor-tabs-container') || 
                                          rootEl.querySelector(':hover.ptmt-editor-pane');
            if (!isHoveringValidTarget) {
                this.clearDropIndicators();
            }
        }, 100);
    }

    /**
     * Handles drop event
     * @param {DragEvent} e
     */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        this.clearDragState();
        const indicator = this.getDropIndicator();

        if (!this.draggedTabInfo || !indicator) {
            indicator?.remove();
            return;
        }

        const targetContainer = indicator.parentElement;
        if (!targetContainer) {
            indicator.remove();
            return;
        }

        const isTargetPending = targetContainer.dataset.isPendingList === 'true' || 
                                !!targetContainer.closest('.ptmt-pending-pane');
        const isTargetHidden = targetContainer.dataset.isHiddenList === 'true' || 
                               !!targetContainer.closest('.ptmt-hidden-pane');

        const children = Array.from(targetContainer.children).filter(
            c => c.classList.contains('ptmt-editor-tab') || c === indicator
        );
        let newIndex = children.indexOf(indicator);
        if (newIndex === -1) newIndex = children.length;

        indicator.remove();

        const info = this.draggedTabInfo;

        if (isTargetHidden) {
            this.handleHiddenTabDrop(targetContainer, newIndex);
        } else if (isTargetPending) {
            this.handlePendingTabDrop(targetContainer, newIndex);
        } else {
            if (info.pid) {
                this.handleLiveToLiveDrop(targetContainer, newIndex);
            } else if (info.isHidden) {
                this.handleRestoreHiddenToLive(targetContainer, newIndex);
            } else if (info.isPending) {
                this.handleRestorePendingToLive(targetContainer, newIndex);
            } else {
                console.warn("[PTMT] Unknown drop source for live pane.", info);
            }
        }

        this.draggedTabInfo = null;
    }

    /**
     * Handles dropping a live tab onto another live pane
     * @param {HTMLElement} targetContainer
     * @param {number} newIndex
     */
    handleLiveToLiveDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const sourcePanel = this.appApi.getPanelById(info.pid);
        const targetColumnEl = targetContainer.closest('.ptmt-editor-column');
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;

        if (sourcePanel && targetPane) {
            if (info.sourceId === 'ptmt-settings-wrapper-content') {
                if (targetColumnEl && targetColumnEl.classList.contains('ptmt-editor-column-hidden')) {
                    alert("The Layout Settings tab cannot be moved to a hidden column.");
                    return;
                }
            }

            const wasActive = info.isActive;
            const wasCollapsed = info.isCollapsed;

            this.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);

            if (wasActive) {
                this.appApi.setActivePanelInPane(targetPane, info.pid);
            } else if (wasCollapsed) {
                this.appApi.setTabCollapsed(info.pid, true);
            }

            this.appApi.checkPaneForIconMode(targetPane);
            window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));
        } else {
            console.warn("[PTMT] Could not execute live tab move: source panel or target pane not found.", { sourcePanel, targetPane });
        }
    }

    /**
     * Handles restoring a hidden tab to a live pane
     * @param {HTMLElement} targetContainer
     * @param {number} newIndex
     */
    handleRestoreHiddenToLive(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;
        const sourceId = info.sourceId;

        if (!targetPane || !sourceId) return;

        console.log(`[PTMT-LayoutEditor] Restoring hidden tab ${sourceId} to live pane ${targetPaneId}.`);

        const mapping = globalSettings.get('panelMappings').find(m => m.id === sourceId) || {};
        const panel = this.appApi.createTabFromContent(sourceId, {
            title: mapping.title,
            icon: mapping.icon,
            makeActive: info.isActive,
            collapsed: info.isCollapsed
        }, targetPane);

        if (panel) {
            this.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
        }

        const layout = this.appApi.generateLayoutSnapshot();
        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter(
                h => (typeof h === 'string' ? h : h.sourceId) !== sourceId
            );
        }
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });

        this.layoutEditorRenderer.refreshEditor();
    }

    /**
     * Handles restoring a pending tab to a live pane
     * @param {HTMLElement} targetContainer
     * @param {number} newIndex
     */
    handleRestorePendingToLive(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetColumnName = targetContainer.dataset.columnName || 
                                 targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId || targetContainer.dataset.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;
        const { searchId, searchClass, sourceId } = info;

        if (!targetPane) return;

        let foundElement = null;
        if (searchId) {
            foundElement = document.getElementById(searchId);
        } else if (searchClass) {
            foundElement = document.querySelector(`.${CSS.escape(searchClass)}`);
        }

        if (foundElement) {
            console.log(`[PTMT-LayoutEditor] Hydrating pending tab ${sourceId} into live pane ${targetPaneId}.`);
            const mapping = globalSettings.get('panelMappings').find(m => m.id === sourceId) || {};
            const panel = this.appApi.createTabFromContent(foundElement, {
                title: mapping.title,
                icon: mapping.icon,
                makeActive: info.isActive,
                collapsed: info.isCollapsed,
                sourceId: sourceId
            }, targetPane);

            if (panel) {
                this.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
            }

            const layout = this.appApi.generateLayoutSnapshot();
            for (const col of Object.values(layout.columns)) {
                if (col.ghostTabs) {
                    col.ghostTabs = col.ghostTabs.filter(
                        t => (t.searchId !== searchId || !searchId) && 
                             (t.searchClass !== searchClass || !searchClass)
                    );
                }
            }
            this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        } else {
            console.log(`[PTMT-LayoutEditor] Moving pending tab ${sourceId} to new live pane ${targetPaneId} (still pending).`);
            const layout = this.appApi.generateLayoutSnapshot();
            const identifier = getTabIdentifier({ searchId, searchClass });

            let pendingInfo = null;
            for (const colName in layout.columns) {
                const col = layout.columns[colName];
                if (col.ghostTabs) {
                    const idx = col.ghostTabs.findIndex(t => getTabIdentifier(t) === identifier);
                    if (idx !== -1) {
                        pendingInfo = col.ghostTabs.splice(idx, 1)[0];
                    }
                }
            }

            if (pendingInfo) {
                pendingInfo.paneId = targetPaneId;
                pendingInfo.active = info.isActive;
                pendingInfo.collapsed = info.isCollapsed;
                if (!layout.columns[targetColumnName].ghostTabs) {
                    layout.columns[targetColumnName].ghostTabs = [];
                }
                layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, pendingInfo);
            }

            this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        }

        this.layoutEditorRenderer.refreshEditor();
    }

    /**
     * Handles dropping a tab onto pending list
     * @param {HTMLElement} targetContainer
     * @param {number} newIndex
     */
    handlePendingTabDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetColumnName = targetContainer.dataset.columnName || 
                                 targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
        const targetPaneId = targetContainer.dataset.paneId || 
                            targetContainer.closest('.ptmt-editor-pane')?.dataset.paneId;
        const { sourceId, searchId, searchClass } = info;

        if (!targetColumnName) {
            console.error('[PTMT] Cannot drop: target column name not found', targetContainer);
            return;
        }

        if (sourceId === 'ptmt-settings-wrapper-content') {
            alert("The Layout Settings tab cannot be moved to pending or hidden lists.");
            return;
        }

        const identifier = getTabIdentifier({ searchId, searchClass });
        if (!identifier) {
            console.warn('[PTMT] Cannot drop pending tab: no stable identifier (ID or Class) found.');
            return;
        }

        const layout = this.appApi.generateLayoutSnapshot();

        let originalTabInfo = null;
        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                const found = col.ghostTabs.find(t => getTabIdentifier(t) === identifier);
                if (found) {
                    originalTabInfo = found;
                    break;
                }
            }
        }

        const newTabInfo = {
            ...(originalTabInfo || {}),
            searchId: searchId || originalTabInfo?.searchId || '',
            searchClass: searchClass || originalTabInfo?.searchClass || '',
            active: info.isActive,
            collapsed: info.isCollapsed,
            paneId: targetPaneId
        };

        for (const colName in layout.columns) {
            const col = layout.columns[colName];
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
            }
        }

        if (!layout.columns[targetColumnName]) {
            console.error(`[PTMT] Column '${targetColumnName}' not found in layout`, layout.columns);
            return;
        }
        if (!layout.columns[targetColumnName].ghostTabs) {
            layout.columns[targetColumnName].ghostTabs = [];
        }
        layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);

        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter(id => {
                const sid = typeof id === 'string' ? id : (id.sourceId || id.searchId || id.panelId);
                return sid !== (sourceId || searchId || searchClass);
            });
        }

        this.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);

        console.log('[PTMT-LayoutEditor] Pending tab moved to', targetColumnName, 'at index', newIndex);
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        this.layoutEditorRenderer.refreshEditor();
    }

    /**
     * Handles dropping a tab onto hidden list
     * @param {HTMLElement} targetContainer
     * @param {number} newIndex
     */
    handleHiddenTabDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const { pid, sourceId, searchId, searchClass, isActive, isCollapsed } = info;
        const effectiveSourceId = sourceId || searchId || searchClass;

        if (!effectiveSourceId) return;

        if (effectiveSourceId === 'ptmt-settings-wrapper-content') {
            alert("The Layout Settings tab cannot be hidden. It must remain in one of the columns.");
            return;
        }

        if (!sourceId && !info.isHidden) {
            alert("Only regular tabs can be moved to the Hidden Tabs column.");
            return;
        }

        const layout = this.appApi.generateLayoutSnapshot();
        if (!layout.hiddenTabs) layout.hiddenTabs = [];

        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(
                    t => !((t.searchId || '') === (searchId || '') && 
                           (t.searchClass || '') === (searchClass || ''))
                );
            }
        }

        if (pid) {
            const panel = this.appApi.getPanelById(pid);
            const content = panel?.querySelector('.ptmt-panel-content > *:not(script)');
            if (content) {
                let stagingArea = document.getElementById('ptmt-staging-area');
                if (!stagingArea) {
                    stagingArea = document.createElement('div');
                    stagingArea.id = 'ptmt-staging-area';
                    stagingArea.style.display = 'none';
                    document.body.appendChild(stagingArea);
                }
                stagingArea.appendChild(content);
                console.log(`[PTMT] Parked content for ${effectiveSourceId} in staging area.`);
            }
            this.appApi.destroyTabById(pid);
        }

        const hiddenInfo = {
            sourceId: effectiveSourceId,
            active: isActive,
            collapsed: isCollapsed
        };

        layout.hiddenTabs = layout.hiddenTabs.filter(
            h => (typeof h === 'string' ? h : h.sourceId) !== effectiveSourceId
        );

        layout.hiddenTabs.splice(newIndex, 0, hiddenInfo);

        console.log(`[PTMT-LayoutEditor] Tab ${effectiveSourceId} moved to hidden tabs at index ${newIndex}`);
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        this.layoutEditorRenderer.refreshEditor();
    }

    /**
     * Handles touch start for touch-based dragging
     * @param {TouchEvent} e
     * @param {string} [pid]
     */
    handleTouchStart(e, pid) {
        const handle = e.target.closest('.ptmt-drag-handle');
        if (!handle) return;

        const tab = e.currentTarget;
        if (!tab) return;

        e.stopPropagation();

        if (this.touchDragGhost) return;

        this.handleDragStart(e, pid);
        tab.classList.add('dragging');

        this.touchDragGhost = tab.cloneNode(true);
        this.touchDragGhost.classList.add('ptmt-touch-drag-ghost');
        const rect = tab.getBoundingClientRect();
        Object.assign(this.touchDragGhost.style, {
            position: 'fixed',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            pointerEvents: 'none',
            zIndex: '10000'
        });
        document.body.appendChild(this.touchDragGhost);
    }

    /**
     * Handles touch move for touch-based dragging
     * @param {TouchEvent} e
     */
    handleTouchMove(e) {
        if (!this.touchDragGhost) return;

        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];

        this.touchDragGhost.style.left = `${touch.clientX - this.touchDragGhost.offsetWidth / 2}px`;
        this.touchDragGhost.style.top = `${touch.clientY - this.touchDragGhost.offsetHeight / 2}px`;

        const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!elUnder) return;

        const targetPane = elUnder.closest('.ptmt-editor-pane') || 
                          elUnder.closest('.ptmt-editor-tabs-container');
        if (targetPane) {
            const fakeEvent = {
                preventDefault: () => {},
                currentTarget: targetPane,
                target: elUnder,
                clientY: touch.clientY,
                dataTransfer: { dropEffect: 'none' }
            };
            this.handleDragOver(fakeEvent);
        } else {
            this.clearDropIndicators();
        }
    }

    /**
     * Handles touch end for touch-based dragging
     * @param {TouchEvent} e
     */
    handleTouchEnd(e) {
        if (this.touchDragGhost) {
            if (e.cancelable) e.preventDefault();

            const indicator = this.getDropIndicator();
            if (indicator) {
                const fakeEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    target: indicator
                };
                this.handleDrop(fakeEvent);
            }

            this.touchDragGhost.remove();
            this.touchDragGhost = null;
            this.clearDragState();
        }
    }

    /**
     * Clears all drop indicators
     */
    clearDropIndicators() {
        const rootEl = this.layoutEditorRenderer.rootElement;
        if (rootEl) {
            rootEl.querySelectorAll('.drop-indicator').forEach(i => i.remove());
        }
    }

    /**
     * Clears drag state (dragging classes)
     */
    clearDragState() {
        const rootEl = this.layoutEditorRenderer.rootElement;
        if (rootEl) {
            rootEl.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        }
        this.clearDropIndicators();
    }

    /**
     * Gets the current drop indicator element
     * @returns {HTMLElement|null}
     */
    getDropIndicator() {
        const rootEl = this.layoutEditorRenderer.rootElement;
        return rootEl ? rootEl.querySelector('.drop-indicator') : null;
    }

    /**
     * Cleanup all event listeners and resources
     */
    cleanup() {
        if (this.touchDragGhost) {
            this.touchDragGhost.remove();
            this.touchDragGhost = null;
        }
        this.draggedTabInfo = null;
        this.clearDragState();
    }
}
