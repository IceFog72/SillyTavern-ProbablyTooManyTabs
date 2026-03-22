import { clearDropIndicators } from '../utils.js';
import { SELECTORS, EVENTS } from '../constants.js';
import { getTabIdentifier } from '../pending-tabs.js';

export function handleDragStart(manager, e, pid) {
    e.stopPropagation();
    const draggedElement = e.target.closest('.ptmt-editor-tab') || (e.currentTarget?.classList.contains('ptmt-editor-tab') ? e.currentTarget : null);
    if (!draggedElement) return;

    manager.draggedTabInfo = {
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
        } catch (err) {}
    }
    setTimeout(() => draggedElement.classList.add('dragging'), 0);
}

export function handleDragOver(manager, e) {
    e.preventDefault();
    let container = e.currentTarget;

    if (container.classList.contains('ptmt-editor-pane')) {
        const inner = container.querySelector('.ptmt-editor-tabs-container');
        if (inner) container = inner;
    }

    const isTargetPendingList = container.dataset.isPendingList === 'true';
    const isTargetHiddenList = container.dataset.isHiddenList === 'true';

    if (manager.draggedTabInfo) {
        const isSettingsTab = manager.draggedTabInfo.sourceId === 'ptmt-settings-wrapper-content';
        if ((isSettingsTab || manager.draggedTabInfo.isPending) && isTargetHiddenList) {
            e.dataTransfer.dropEffect = 'none';
            clearDropIndicators(manager.rootElement);
            return;
        }
        if (isSettingsTab && isTargetPendingList) {
            e.dataTransfer.dropEffect = 'none';
            clearDropIndicators(manager.rootElement);
            return;
        }
        if (isSettingsTab) {
            const targetColumn = container.closest('.ptmt-editor-column');
            if (targetColumn && targetColumn.classList.contains('ptmt-editor-column-hidden')) {
                e.dataTransfer.dropEffect = 'none';
                clearDropIndicators(manager.rootElement);
                return;
            }
        }
    }

    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.ptmt-editor-tab');

    if (target) {
        const rect = target.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;
        if (isAfter) {
            if (target.nextSibling !== manager.indicator) target.after(manager.indicator);
        } else {
            if (target.previousSibling !== manager.indicator) target.before(manager.indicator);
        }
    } else {
        if (container.lastChild !== manager.indicator) container.appendChild(manager.indicator);
    }
}

export function handleDragLeave(manager, e) {
    setTimeout(() => {
        const isHoveringValidTarget = manager.rootElement.querySelector(':hover.ptmt-editor-tabs-container') || manager.rootElement.querySelector(':hover.ptmt-editor-pane');
        if (!isHoveringValidTarget) {
            manager.indicator.remove();
        }
    }, 100);
}

export function handleDrop(manager, e) {
    e.preventDefault();
    e.stopPropagation();
    manager.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    const targetContainer = manager.indicator.parentElement;
    if (!targetContainer) {
        manager.indicator.remove();
        return;
    }

    const isTargetPending = targetContainer.dataset.isPendingList === 'true' || !!targetContainer.closest('.ptmt-pending-pane');
    const isTargetHidden = targetContainer.dataset.isHiddenList === 'true' || !!targetContainer.closest('.ptmt-hidden-pane');
    const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab') || c === manager.indicator);
    let newIndex = children.indexOf(manager.indicator);
    if (newIndex === -1) newIndex = children.length;

    manager.indicator.remove();
    const info = manager.draggedTabInfo;

    if (isTargetHidden) {
        handleHiddenTabDrop(manager, targetContainer, newIndex);
    } else if (isTargetPending) {
        handlePendingTabDrop(manager, targetContainer, newIndex);
    } else {
        if (info.pid) {
            handleLiveToLiveDrop(manager, targetContainer, newIndex);
        } else if (info.isHidden) {
            handleRestoreHiddenToLive(manager, targetContainer, newIndex);
        } else if (info.isPending) {
            handleRestorePendingToLive(manager, targetContainer, newIndex);
        }
    }
    manager.draggedTabInfo = null;
}

function handleLiveToLiveDrop(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    const sourcePanel = manager.appApi.getPanelById(info.pid);
    const targetColumnEl = targetContainer.closest(SELECTORS.EDITOR_TAB) || targetContainer.closest('.ptmt-editor-column');
    const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
    const targetPaneId = targetPaneEl?.dataset?.paneId;
    const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;

    if (sourcePanel && targetPane) {
        if (info.sourceId === 'ptmt-settings-wrapper-content') {
            if (targetColumnEl && targetColumnEl.classList.contains('ptmt-editor-column-hidden')) {
                alert("The Layout Settings tab cannot be moved to a hidden column.");
                return;
            }
        }
        manager.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);
        manager.appApi.setActivePanelInPane(targetPane, info.pid);
        manager.appApi.checkPaneForIconMode(targetPane);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));
    }
}

function handleRestoreHiddenToLive(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
    const targetPaneId = targetPaneEl?.dataset?.paneId;
    const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;
    const sourceId = info.sourceId;

    if (!targetPane || !sourceId) return;

    const mapping = manager.settings.getMapping(sourceId);
    const panel = manager.appApi.createTabFromContent(sourceId, {
        title: mapping.title,
        icon: mapping.icon,
        makeActive: info.isActive,
        collapsed: info.isCollapsed,
        color: mapping.color
    }, targetPane);

    if (panel) {
        manager.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
    }

    const layout = manager.appApi.generateLayoutSnapshot();
    if (layout.hiddenTabs) {
        layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== sourceId);
    }
    manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    manager.renderUnifiedEditor();
}

function handleRestorePendingToLive(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    const targetColumnName = targetContainer.dataset.columnName || targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
    const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
    const targetPaneId = targetPaneEl?.dataset?.paneId || targetContainer.dataset.paneId;
    const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;

    const { searchId, searchClass, sourceId } = info;
    if (!targetPane) return;

    let foundElement = null;
    if (searchId) foundElement = document.getElementById(searchId);
    else if (searchClass) foundElement = document.querySelector(`.${CSS.escape(searchClass)}`);

    if (foundElement) {
        const mapping = manager.settings.getMapping(sourceId);
        const panel = manager.appApi.createTabFromContent(foundElement, {
            title: mapping.title,
            icon: mapping.icon,
            makeActive: info.isActive,
            collapsed: info.isCollapsed,
            sourceId: sourceId,
            color: mapping.color
        }, targetPane);

        if (panel) {
            manager.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
        }

        const layout = manager.appApi.generateLayoutSnapshot();
        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => (t.searchId !== searchId || !searchId) && (t.searchClass !== searchClass || !searchClass));
            }
        }
        manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    } else {
        const layout = manager.appApi.generateLayoutSnapshot();
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
            if (!layout.columns[targetColumnName].ghostTabs) layout.columns[targetColumnName].ghostTabs = [];
            layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, pendingInfo);
        }
        manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    }
    manager.renderUnifiedEditor();
}

function handlePendingTabDrop(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    const targetColumnName = targetContainer.dataset.columnName || targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
    const targetPaneId = targetContainer.dataset.paneId || targetContainer.closest('.ptmt-editor-pane')?.dataset.paneId;
    const { sourceId, searchId, searchClass } = info;

    if (!targetColumnName) return;
    if (sourceId === 'ptmt-settings-wrapper-content') {
        alert("The Layout Settings tab cannot be moved to pending or hidden lists.");
        return;
    }
    const identifier = getTabIdentifier({ searchId, searchClass });
    if (!identifier) return;

    const layout = manager.appApi.generateLayoutSnapshot();
    let originalTabInfo = null;
    for (const col of Object.values(layout.columns)) {
        if (col.ghostTabs) {
            const found = col.ghostTabs.find(t => getTabIdentifier(t) === identifier);
            if (found) { originalTabInfo = found; break; }
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
        if (col.ghostTabs) col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
    }

    if (!layout.columns[targetColumnName].ghostTabs) layout.columns[targetColumnName].ghostTabs = [];
    layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);

    if (layout.hiddenTabs) {
        layout.hiddenTabs = layout.hiddenTabs.filter(id => {
            const sid = typeof id === 'string' ? id : (id.sourceId || id.searchId || id.panelId);
            return sid !== (sourceId || searchId || searchClass);
        });
    }

    manager.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);
    manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    manager.renderUnifiedEditor();
}

function handleHiddenTabDrop(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    const { pid, sourceId, searchId, searchClass, isActive, isCollapsed } = info;
    const effectiveSourceId = sourceId || searchId || searchClass;

    if (!effectiveSourceId) return;
    if (effectiveSourceId === 'ptmt-settings-wrapper-content') {
        alert("The Layout Settings tab cannot be hidden. It must remain in one of the columns.");
        return;
    }
    if (info.isPending) {
        alert("Pending tabs cannot be moved to hidden storage.");
        return;
    }

    const layout = manager.appApi.generateLayoutSnapshot();
    if (!layout.hiddenTabs) layout.hiddenTabs = [];

    for (const col of Object.values(layout.columns)) {
        if (col.ghostTabs) {
            col.ghostTabs = col.ghostTabs.filter(t => !((t.searchId || '') === (searchId || '') && (t.searchClass || '') === (searchClass || '')));
        }
    }

    if (pid) {
        const panel = manager.appApi.getPanelById(pid);
        const content = panel?.querySelector('.ptmt-panel-content > *:not(script)');
        if (content) {
            let stagingArea = document.querySelector(SELECTORS.STAGING_AREA);
            if (!stagingArea) {
                stagingArea = document.createElement('div');
                stagingArea.id = SELECTORS.STAGING_AREA.substring(1);
                stagingArea.style.display = 'none';
                document.body.appendChild(stagingArea);
            }
            stagingArea.appendChild(content);
        }
        manager.appApi.destroyTabById(pid);
    }

    const hiddenInfo = { sourceId: effectiveSourceId, active: isActive, collapsed: isCollapsed };
    layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== effectiveSourceId);
    layout.hiddenTabs.splice(newIndex, 0, hiddenInfo);
    manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    manager.renderUnifiedEditor();
}

export function handleTouchStart(manager, e, pid) {
    const handle = e.target.closest('.ptmt-drag-handle');
    if (!handle) return;
    const tab = e.currentTarget;
    if (!tab) return;
    e.stopPropagation();
    if (manager.touchDragGhost) return;

    handleDragStart(manager, e, pid);
    tab.classList.add('dragging');
    manager.touchDragGhost = tab.cloneNode(true);
    manager.touchDragGhost.classList.add('ptmt-touch-drag-ghost');
    const rect = tab.getBoundingClientRect();
    Object.assign(manager.touchDragGhost.style, {
        left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
    document.body.appendChild(manager.touchDragGhost);
}

export function handleTouchMove(manager, e) {
    if (!manager.touchDragGhost) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    manager.touchDragGhost.style.left = `${touch.clientX - manager.touchDragGhost.offsetWidth / 2}px`;
    manager.touchDragGhost.style.top = `${touch.clientY - manager.touchDragGhost.offsetHeight / 2}px`;

    const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elUnder) return;

    const targetPane = elUnder.closest('.ptmt-editor-pane') || elUnder.closest('.ptmt-editor-tabs-container');
    if (targetPane) {
        const fakeEvent = { preventDefault: () => { }, currentTarget: targetPane, target: elUnder, clientY: touch.clientY, dataTransfer: { dropEffect: 'none' } };
        handleDragOver(manager, fakeEvent);
    } else {
        clearDropIndicators(manager.rootElement);
    }
}

export function handleTouchEnd(manager, e) {
    if (manager.touchDragGhost) {
        if (e.cancelable) e.preventDefault();
        const indicator = manager.rootElement.querySelector(SELECTORS.DROP_INDICATOR_CLASS);
        if (indicator) {
            const fakeEvent = { preventDefault: () => { }, stopPropagation: () => { }, target: indicator };
            handleDrop(manager, fakeEvent);
        }
        manager.touchDragGhost.remove();
        manager.touchDragGhost = null;
        manager.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        clearDropIndicators(manager.rootElement);
    }
}
