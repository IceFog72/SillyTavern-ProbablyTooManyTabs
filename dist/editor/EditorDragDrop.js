import { clearDropIndicators } from '../core/utils.js';
import { SELECTORS } from '../core/constants.js';
import { getTabIdentifier } from '../tabs/pending-tabs.js';
const PANE_DROP_CLASSES = [
    'ptmt-editor-pane-drop-top',
    'ptmt-editor-pane-drop-bottom',
    'ptmt-editor-pane-drop-left',
    'ptmt-editor-pane-drop-right',
    'ptmt-editor-pane-drop-center',
];
function clearPaneDropHighlights(root) {
    if (!root)
        return;
    root.querySelectorAll('.ptmt-editor-pane-drop-top, .ptmt-editor-pane-drop-bottom, .ptmt-editor-pane-drop-left, .ptmt-editor-pane-drop-right, .ptmt-editor-pane-drop-center')
        .forEach(el => el.classList.remove(...PANE_DROP_CLASSES));
}
function paneContainsPtmtInternalTab(paneId) {
    const livePane = document.querySelector(`${SELECTORS.PANE}[data-pane-id="${paneId}"]`);
    if (!livePane)
        return false;
    return Boolean(livePane.querySelector(`${SELECTORS.PANEL}[data-source-id="ptmt-settings-wrapper-content"]`)
        || livePane.querySelector(`${SELECTORS.PANEL}[data-source-id="ptmt-info-wrapper-content"]`));
}
export function handleDragStart(manager, e, pid) {
    e.stopPropagation();
    const target = e.target;
    const currentTarget = e.currentTarget;
    const draggedElement = target?.closest('.ptmt-editor-tab')
        || (currentTarget?.classList.contains('ptmt-editor-tab') ? currentTarget : null);
    // Whole-pane drag from pane header in Layout Settings
    if (!draggedElement) {
        const paneHeader = target?.closest('.ptmt-editor-pane-header')
            || (currentTarget?.classList.contains('ptmt-editor-pane-header') ? currentTarget : null);
        const editorPane = paneHeader?.closest('.ptmt-editor-pane:not(.ptmt-pending-pane):not(.ptmt-hidden-pane)');
        const paneId = editorPane?.dataset.paneId;
        if (!editorPane || !paneId)
            return;
        manager.draggedTabInfo = null;
        manager.draggedPaneId = paneId;
        manager.paneDropZone = null;
        const dataTransfer = 'dataTransfer' in e ? e.dataTransfer : null;
        if (dataTransfer) {
            dataTransfer.effectAllowed = 'move';
            try {
                dataTransfer.setData('text/plain', `pane:${paneId}`);
            }
            catch { }
        }
        editorPane.classList.add('dragging');
        manager.rootElement?.classList.add('ptmt-dragging-pane');
        return;
    }
    manager.draggedPaneId = null;
    manager.paneDropZone = null;
    manager.draggedTabInfo = {
        pid,
        sourceId: draggedElement.dataset.sourceId,
        searchId: draggedElement.dataset.searchId,
        searchClass: draggedElement.dataset.searchClass,
        isPending: draggedElement.dataset.isPending === 'true',
        isHidden: draggedElement.dataset.isHiddenItem === 'true',
        isActive: draggedElement.dataset.isActive === 'true',
        isCollapsed: draggedElement.dataset.isCollapsed === 'true',
    };
    const dataTransfer = 'dataTransfer' in e ? e.dataTransfer : null;
    if (dataTransfer) {
        dataTransfer.effectAllowed = 'move';
        try {
            dataTransfer.setData('text/plain', pid || draggedElement.dataset.sourceId || '');
        }
        catch { }
        try {
            const g = draggedElement.cloneNode(true);
            g.classList.add('ptmt-drag-image-hide');
            document.body.appendChild(g);
            dataTransfer.setDragImage(g, 10, 10);
            setTimeout(() => g.remove(), 60);
        }
        catch (err) {
            console.warn('[PTMT] Failed to set drag image:', err);
        }
    }
    // Add dragging class synchronously for immediate visual feedback
    draggedElement.classList.add('dragging');
    updateDragTargetHighlights(manager);
}
function updateDragTargetHighlights(manager) {
    if (!manager.rootElement || !manager.draggedTabInfo)
        return;
    const isPendingDrag = manager.draggedTabInfo.isPending;
    manager.rootElement.classList.toggle('ptmt-dragging-pending-tab', isPendingDrag);
    manager.rootElement.classList.toggle('ptmt-dragging-normal-tab', !isPendingDrag);
}
function clearDragState(manager) {
    manager.rootElement?.classList.remove('ptmt-dragging-pending-tab', 'ptmt-dragging-normal-tab', 'ptmt-dragging-pane');
    manager.rootElement?.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    clearPaneDropHighlights(manager.rootElement);
    clearDropIndicators(manager.rootElement);
    manager.draggedTabInfo = null;
    manager.draggedPaneId = null;
    manager.paneDropZone = null;
}
export function handleDragOver(manager, e) {
    e.preventDefault();
    // Whole-pane drag inside Layout Settings
    if (manager.draggedPaneId) {
        manager.indicator.remove();
        const current = e.currentTarget;
        const targetPane = current.classList.contains('ptmt-editor-pane')
            ? current
            : e.target?.closest('.ptmt-editor-pane');
        if (targetPane && !targetPane.classList.contains('ptmt-pending-pane') && !targetPane.classList.contains('ptmt-hidden-pane')) {
            const targetPaneId = targetPane.dataset.paneId;
            const targetColumn = targetPane.closest('.ptmt-editor-column');
            if (!targetPaneId || targetPaneId === manager.draggedPaneId || (targetColumn?.classList.contains('ptmt-editor-column-hidden') && paneContainsPtmtInternalTab(manager.draggedPaneId))) {
                if (e.dataTransfer)
                    e.dataTransfer.dropEffect = 'none';
                clearPaneDropHighlights(manager.rootElement);
                manager.paneDropZone = null;
                return;
            }
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'move';
            const rect = targetPane.getBoundingClientRect();
            const relY = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
            const relX = rect.width > 0 && typeof e.clientX === 'number' ? (e.clientX - rect.left) / rect.width : 0.5;
            let zone = 'center';
            if (relY < 0.25)
                zone = 'top';
            else if (relY > 0.75)
                zone = 'bottom';
            else if (relX < 0.2)
                zone = 'left';
            else if (relX > 0.8)
                zone = 'right';
            clearPaneDropHighlights(manager.rootElement);
            targetPane.classList.add(`ptmt-editor-pane-drop-${zone}`);
            manager.paneDropZone = { targetEl: targetPane, zone };
            return;
        }
        const emptyColumn = current.classList.contains('ptmt-editor-column')
            ? current
            : e.target?.closest('.ptmt-editor-column');
        if (emptyColumn && !emptyColumn.querySelector('.ptmt-editor-pane:not(.ptmt-pending-pane)')) {
            if (emptyColumn.classList.contains('ptmt-editor-column-hidden') && paneContainsPtmtInternalTab(manager.draggedPaneId)) {
                if (e.dataTransfer)
                    e.dataTransfer.dropEffect = 'none';
                clearPaneDropHighlights(manager.rootElement);
                manager.paneDropZone = null;
                return;
            }
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'move';
            clearPaneDropHighlights(manager.rootElement);
            emptyColumn.classList.add('ptmt-editor-pane-drop-center');
            manager.paneDropZone = { targetEl: emptyColumn, zone: 'center' };
            return;
        }
        if (e.dataTransfer)
            e.dataTransfer.dropEffect = 'none';
        clearPaneDropHighlights(manager.rootElement);
        manager.paneDropZone = null;
        return;
    }
    // Only editor tabs set draggedTabInfo; pane tabs and files are not editor drops.
    if (!manager.draggedTabInfo) {
        manager.indicator.remove();
        return;
    }
    let container = e.currentTarget;
    if (container.classList.contains('ptmt-editor-pane')) {
        const inner = container.querySelector('.ptmt-editor-tabs-container');
        if (inner)
            container = inner;
    }
    const isTargetPendingList = container.dataset.isPendingList === 'true';
    const isTargetHiddenList = container.dataset.isHiddenList === 'true';
    if (manager.draggedTabInfo) {
        const isPtmtInternal = manager.draggedTabInfo.sourceId === 'ptmt-settings-wrapper-content'
            || manager.draggedTabInfo.sourceId === 'ptmt-info-wrapper-content';
        if ((isPtmtInternal || manager.draggedTabInfo.isPending) && isTargetHiddenList) {
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'none';
            clearDropIndicators(manager.rootElement);
            return;
        }
        if (isPtmtInternal && isTargetPendingList) {
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'none';
            clearDropIndicators(manager.rootElement);
            return;
        }
        const isPendingDrag = manager.draggedTabInfo.isPending;
        if ((isPendingDrag && !isTargetPendingList) || (!isPendingDrag && isTargetPendingList)) {
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = 'none';
            clearDropIndicators(manager.rootElement);
            return;
        }
        if (isPtmtInternal) {
            const targetColumn = container.closest('.ptmt-editor-column');
            if (targetColumn && targetColumn.classList.contains('ptmt-editor-column-hidden')) {
                if (e.dataTransfer)
                    e.dataTransfer.dropEffect = 'none';
                clearDropIndicators(manager.rootElement);
                return;
            }
        }
    }
    if (e.dataTransfer)
        e.dataTransfer.dropEffect = 'move';
    const target = e.target?.closest('.ptmt-editor-tab');
    if (target && target !== manager.indicator) {
        const rect = target.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;
        if (isAfter) {
            target.after(manager.indicator);
        }
        else {
            target.before(manager.indicator);
        }
    }
    else if (!target) {
        // No specific target, append to container
        // Only append if indicator is not already at the end
        if (manager.indicator.parentElement !== container) {
            container.appendChild(manager.indicator);
        }
    }
}
export function handleDragLeave(manager, _e) {
    setTimeout(() => {
        const isHoveringValidTarget = manager.rootElement?.querySelector(':hover.ptmt-editor-tabs-container')
            || manager.rootElement?.querySelector(':hover.ptmt-editor-pane')
            || manager.rootElement?.querySelector(':hover.ptmt-editor-column');
        if (!isHoveringValidTarget) {
            manager.indicator.remove();
            clearPaneDropHighlights(manager.rootElement);
        }
    }, 100);
}
function handlePaneDrop(manager) {
    const sourcePaneId = manager.draggedPaneId;
    const dropTarget = manager.paneDropZone;
    if (!sourcePaneId || !dropTarget)
        return;
    const sourcePane = document.querySelector(`${SELECTORS.PANE}[data-pane-id="${sourcePaneId}"]`);
    if (!sourcePane?._tabStrip)
        return;
    const tabs = Array.from(sourcePane._tabStrip.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)'));
    const panelIds = tabs.map(t => t.dataset.for || '').filter(Boolean);
    if (panelIds.length === 0)
        return;
    const activeTab = sourcePane._tabStrip.querySelector('.ptmt-tab.active');
    const activePanelId = activeTab?.dataset.for || panelIds[0];
    const dockCtrl = globalThis.window?.ptmtTabs?.dock;
    const { targetEl, zone } = dropTarget;
    if (targetEl.classList.contains('ptmt-editor-pane')) {
        const targetPaneId = targetEl.dataset.paneId;
        if (!targetPaneId || targetPaneId === sourcePaneId)
            return;
        const targetPane = document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`);
        if (!targetPane)
            return;
        if (dockCtrl?.dockPanelsToTarget) {
            dockCtrl.dockPanelsToTarget(panelIds, targetPane, zone, { activePanelId });
        }
        else {
            let idx = targetPane._tabStrip?.querySelectorAll('.ptmt-tab:not(.ptmt-view-settings)').length ?? 0;
            for (const pid of panelIds) {
                const panel = manager.appApi.getPanelById(pid);
                if (panel)
                    manager.appApi.moveTabIntoPaneAtIndex(panel, targetPane, idx++);
            }
            manager.appApi.setActivePanelInPane(targetPane, activePanelId);
        }
        return;
    }
    if (targetEl.classList.contains('ptmt-editor-column')) {
        const colName = targetEl.dataset.columnName;
        if (colName && dockCtrl?.dockPanelsToTarget) {
            dockCtrl.dockPanelsToTarget(panelIds, null, 'center', { activePanelId, column: colName });
        }
    }
}
export function handleDrop(manager, e) {
    e.preventDefault();
    if (manager.draggedPaneId) {
        e.stopPropagation();
        handlePaneDrop(manager);
        clearDragState(manager);
        return;
    }
    if (!manager.draggedTabInfo) {
        manager.indicator.remove();
        clearDragState(manager);
        return;
    }
    e.stopPropagation();
    manager.rootElement?.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    manager.rootElement?.classList.remove('ptmt-dragging-pending-tab', 'ptmt-dragging-normal-tab');
    const targetContainer = manager.indicator.parentElement;
    if (!targetContainer) {
        manager.indicator.remove();
        clearDragState(manager);
        return;
    }
    const isTargetPending = targetContainer.dataset.isPendingList === 'true' || !!targetContainer.closest('.ptmt-pending-pane');
    const isTargetHidden = targetContainer.dataset.isHiddenList === 'true' || !!targetContainer.closest('.ptmt-hidden-pane');
    const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab') || c === manager.indicator);
    let newIndex = children.indexOf(manager.indicator);
    if (newIndex === -1)
        newIndex = children.length;
    manager.indicator.remove();
    const info = manager.draggedTabInfo;
    if (info.isPending && !isTargetPending) {
        clearDragState(manager);
        return;
    }
    if (!info.isPending && isTargetPending) {
        clearDragState(manager);
        return;
    }
    if (isTargetHidden) {
        handleHiddenTabDrop(manager, targetContainer, newIndex);
    }
    else if (isTargetPending) {
        handlePendingTabDrop(manager, targetContainer, newIndex);
    }
    else {
        if (info.pid) {
            handleLiveToLiveDrop(manager, targetContainer, newIndex);
        }
        else if (info.isHidden) {
            handleRestoreHiddenToLive(manager, targetContainer, newIndex);
        }
    }
    clearDragState(manager);
}
function handleLiveToLiveDrop(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    if (!info?.pid)
        return;
    const sourcePanel = manager.appApi.getPanelById(info.pid);
    const targetColumnEl = targetContainer.closest(SELECTORS.EDITOR_TAB) || targetContainer.closest('.ptmt-editor-column');
    const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
    const targetPaneId = targetPaneEl?.dataset?.paneId;
    const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;
    if (sourcePanel && targetPane) {
        const isPtmtInternal = info.sourceId === 'ptmt-settings-wrapper-content'
            || info.sourceId === 'ptmt-info-wrapper-content';
        if (isPtmtInternal) {
            if (targetColumnEl && targetColumnEl.classList.contains('ptmt-editor-column-hidden')) {
                alert('This PTMT panel cannot be moved to a hidden column.');
                return;
            }
        }
        manager.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);
        manager.appApi.setActivePanelInPane(targetPane, info.pid);
        manager.appApi.checkPaneForIconMode(targetPane);
    }
}
function handleRestoreHiddenToLive(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    if (!info)
        return;
    const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
    const targetPaneId = targetPaneEl?.dataset?.paneId;
    const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;
    const sourceId = info.sourceId;
    if (!targetPane || !sourceId)
        return;
    const mapping = manager.settings.getMapping(sourceId);
    const panel = manager.appApi.createTabFromContent(sourceId, {
        title: mapping.title,
        icon: mapping.icon,
        makeActive: info.isActive,
        collapsed: info.isCollapsed,
        color: mapping.color,
    }, targetPane);
    if (panel) {
        manager.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
    }
    const layout = manager.appApi.generateLayoutSnapshot();
    if (layout) {
        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter((h) => (typeof h === 'string' ? h : h.sourceId) !== sourceId);
        }
        manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    }
    manager.renderUnifiedEditor();
}
function handlePendingTabDrop(manager, targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    if (!info)
        return;
    const targetColumnName = (targetContainer.dataset.columnName || targetContainer.closest('.ptmt-editor-column')?.dataset.columnName);
    const targetPaneId = targetContainer.dataset.paneId || targetContainer.closest('.ptmt-editor-pane')?.dataset.paneId;
    const { sourceId, searchId, searchClass } = info;
    if (!targetColumnName)
        return;
    if (sourceId === 'ptmt-settings-wrapper-content' || sourceId === 'ptmt-info-wrapper-content') {
        alert('This PTMT panel cannot be moved to pending or hidden lists.');
        return;
    }
    const identifier = getTabIdentifier({ searchId, searchClass });
    if (!identifier)
        return;
    const layout = manager.appApi.generateLayoutSnapshot();
    if (!layout)
        return;
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
        paneId: targetPaneId,
    };
    for (const colName of ['left', 'center', 'right']) {
        const col = layout.columns[colName];
        if (col?.ghostTabs)
            col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
    }
    if (!layout.columns[targetColumnName].ghostTabs)
        layout.columns[targetColumnName].ghostTabs = [];
    layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);
    if (layout.hiddenTabs) {
        layout.hiddenTabs = layout.hiddenTabs.filter((id) => {
            const sid = typeof id === 'string' ? id : (id.sourceId || id.searchId || id.panelId);
            return sid !== (sourceId || searchId || searchClass);
        });
    }
    manager.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);
    manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    manager.renderUnifiedEditor();
}
function handleHiddenTabDrop(manager, _targetContainer, newIndex) {
    const info = manager.draggedTabInfo;
    if (!info)
        return;
    const { pid, sourceId, searchId, searchClass, isActive, isCollapsed } = info;
    const effectiveSourceId = sourceId || searchId || searchClass;
    if (!effectiveSourceId)
        return;
    if (effectiveSourceId === 'ptmt-settings-wrapper-content' || effectiveSourceId === 'ptmt-info-wrapper-content') {
        alert('This PTMT panel cannot be hidden. It must remain in one of the columns.');
        return;
    }
    if (info.isPending) {
        alert('Pending tabs cannot be moved to hidden storage.');
        return;
    }
    const layout = manager.appApi.generateLayoutSnapshot();
    if (!layout)
        return;
    if (!layout.hiddenTabs)
        layout.hiddenTabs = [];
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
    layout.hiddenTabs = layout.hiddenTabs.filter((h) => (typeof h === 'string' ? h : h.sourceId) !== effectiveSourceId);
    layout.hiddenTabs.splice(newIndex, 0, hiddenInfo);
    manager.settings.update({ [manager.settings.getActiveLayoutKey()]: layout });
    manager.renderUnifiedEditor();
}
export function handleTouchStart(manager, e, pid) {
    const handle = e.target?.closest('.ptmt-drag-handle');
    if (!handle)
        return;
    const tab = e.currentTarget;
    if (!tab)
        return;
    e.stopPropagation();
    if (manager.touchDragGhost)
        return;
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
    if (!manager.touchDragGhost)
        return;
    if (e.cancelable)
        e.preventDefault();
    const touch = e.touches[0];
    manager.touchDragGhost.style.left = `${touch.clientX - manager.touchDragGhost.offsetWidth / 2}px`;
    manager.touchDragGhost.style.top = `${touch.clientY - manager.touchDragGhost.offsetHeight / 2}px`;
    // Debounce elementFromPoint by only processing if touch moved significantly
    if (!manager.lastTouchCoords)
        manager.lastTouchCoords = { x: touch.clientX, y: touch.clientY };
    const dx = Math.abs(touch.clientX - manager.lastTouchCoords.x);
    const dy = Math.abs(touch.clientY - manager.lastTouchCoords.y);
    if (dx < 5 && dy < 5)
        return; // Only update if moved more than 5px
    manager.lastTouchCoords = { x: touch.clientX, y: touch.clientY };
    const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elUnder)
        return;
    const targetPane = elUnder.closest('.ptmt-editor-pane')
        || elUnder.closest('.ptmt-editor-tabs-container')
        || (manager.draggedPaneId ? elUnder.closest('.ptmt-editor-column') : null);
    if (targetPane) {
        const fakeEvent = { preventDefault: () => { }, currentTarget: targetPane, target: elUnder, clientX: touch.clientX, clientY: touch.clientY, dataTransfer: { dropEffect: 'none' } };
        handleDragOver(manager, fakeEvent);
    }
    else {
        clearDropIndicators(manager.rootElement);
        clearPaneDropHighlights(manager.rootElement);
    }
}
export function handleTouchEnd(manager, e) {
    if (manager.touchDragGhost) {
        if (e.cancelable)
            e.preventDefault();
        const indicator = manager.rootElement?.querySelector(SELECTORS.DROP_INDICATOR_CLASS);
        if (indicator || (manager.draggedPaneId && manager.paneDropZone)) {
            const fakeTarget = indicator || manager.paneDropZone.targetEl;
            const fakeEvent = { preventDefault: () => { }, stopPropagation: () => { }, target: fakeTarget };
            handleDrop(manager, fakeEvent);
        }
        manager.touchDragGhost.remove();
        manager.touchDragGhost = null;
        manager.lastTouchCoords = null; // Clear debounce state
        clearDragState(manager);
    }
}
//# sourceMappingURL=EditorDragDrop.js.map