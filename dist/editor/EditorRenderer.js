import { el, createIconElement, hexToRgba, readPaneViewSettings } from '../core/utils.js';
import { SELECTORS, EVENTS } from '../core/constants.js';
export function renderUnifiedEditor(manager) {
    if (!manager.rootElement)
        return;
    let editorRoot = manager.rootElement.querySelector(SELECTORS.UNIFIED_EDITOR);
    if (editorRoot) {
        editorRoot.innerHTML = '';
    }
    else {
        editorRoot = el('div', { id: SELECTORS.UNIFIED_EDITOR.substring(1) });
        manager.rootElement.appendChild(editorRoot);
    }
    const refs = manager.appApi._refs();
    const columns = [
        { name: 'left', title: 'Left Column', element: refs.leftBody },
        { name: 'center', title: 'Center Column', element: refs.centerBody },
        { name: 'right', title: 'Right Column', element: refs.rightBody },
    ];
    columns.forEach(col => {
        if (!col.element)
            return;
        const settingVal = col.name === 'left'
            ? manager.settings.get('showLeftPane')
            : col.name === 'right'
                ? manager.settings.get('showRightPane')
                : undefined;
        const isHidden = typeof settingVal === 'boolean' ? !settingVal : col.element.style.display === 'none';
        const isAlwaysVisible = col.name === 'left' || col.name === 'right';
        if (isAlwaysVisible || !isHidden) {
            editorRoot.appendChild(renderColumn(manager, col.name, col.title, col.element, isHidden));
        }
    });
    editorRoot.appendChild(renderHiddenColumn(manager));
}
function renderColumn(manager, name, title, element, isHidden = false) {
    const container = el('fieldset', {
        className: 'ptmt-editor-column',
        'data-column-name': name,
    });
    if (isHidden) {
        container.classList.add('ptmt-editor-column-hidden');
    }
    const legend = el('legend', { className: 'ptmt-editor-column-legend' });
    const titleSpan = el('span', {}, title + (isHidden ? ' (Hidden)' : ''));
    if (name === 'left' || name === 'right') {
        const settingKey = name === 'left' ? 'showLeftPane' : 'showRightPane';
        const toggleId = `ptmt-global-${settingKey}`;
        const checkbox = el('input', {
            type: 'checkbox',
            id: toggleId,
            className: 'ptmt-editor-column-toggle',
            checked: !isHidden,
            title: `Show ${title}`,
        });
        checkbox.addEventListener('change', (e) => {
            const target = e.target;
            if (!target.checked && element.querySelector('[data-source-id="ptmt-settings-wrapper-content"]')) {
                alert('Cannot hide this column because it contains the Layout Settings tab. Move the tab to another column first.');
                target.checked = true;
                return;
            }
            container.classList.toggle('ptmt-editor-column-hidden', !target.checked);
            titleSpan.textContent = title + (target.checked ? '' : ' (Hidden)');
            manager.settings.update({ [settingKey]: target.checked });
            window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'columnVisibilityChanged' } }));
        });
        const label = el('label', { for: toggleId, className: 'ptmt-editor-column-legend-label' }, titleSpan);
        legend.append(checkbox, label);
    }
    else {
        legend.append(titleSpan);
    }
    container.appendChild(legend);
    const tree = renderTreeElement(manager, element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
    if (tree)
        container.appendChild(tree);
    else
        manager.attachDragListeners(container);
    const pendingContainer = el('div', { className: 'ptmt-editor-pending' });
    const pendingTitle = el('div', { className: 'ptmt-editor-title' }, el('span', { className: 'ptmt-editor-pending-title' }, 'Pending Tabs'));
    pendingContainer.appendChild(pendingTitle);
    const pendingTree = renderPendingTreeElement(manager, element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), name);
    if (pendingTree)
        pendingContainer.appendChild(pendingTree);
    container.appendChild(pendingContainer);
    return container;
}
function renderTreeElement(manager, element) {
    if (!element || element.classList.contains(SELECTORS.RESIZER_V.substring(1)))
        return null;
    if (element.classList.contains(SELECTORS.SPLIT.substring(1)))
        return renderSplit(manager, element);
    if (element.classList.contains(SELECTORS.PANE.substring(1)))
        return renderPane(manager, element);
    return null;
}
function renderSplit(manager, element) {
    const container = el('div', { className: 'ptmt-editor-split' });
    const titleDiv = el('div', { className: 'ptmt-editor-title' });
    const titleSpan = el('span', {}, 'Split Container');
    const ORIENTATIONS = ['auto', 'vertical', 'horizontal'];
    const SIZINGS = ['split-reference', 'equal-distribution', 'proportional'];
    const EXPANDED_META = {
        auto: { icon: 'fa-expand', label: 'Expanded: Auto' },
        vertical: { icon: 'fa-arrows-up-down', label: 'Expanded: Vertical' },
        horizontal: { icon: 'fa-arrows-left-right', label: 'Expanded: Horizontal' },
    };
    const COLLAPSED_META = {
        auto: { icon: 'fa-compress', label: 'Collapsed: Auto' },
        vertical: { icon: 'fa-up-down', label: 'Collapsed: Vertical' },
        horizontal: { icon: 'fa-left-right', label: 'Collapsed: Horizontal' },
    };
    const SIZING_META = {
        'split-reference': { icon: 'fa-table-columns', label: 'Sizing: Reference (50/50)' },
        'equal-distribution': { icon: 'fa-grip', label: 'Sizing: Equal' },
        proportional: { icon: 'fa-sliders', label: 'Sizing: Proportional' },
    };
    const iconsContainer = el('div', { className: 'ptmt-editor-pane-icons ptmt-editor-split-actions' });
    let expandedOrientation = element.dataset.orientationExpanded || element.dataset.naturalOrientation || 'auto';
    let collapsedOrientation = element.dataset.orientationCollapsed || 'auto';
    let sizingStrategy = element.dataset.sizingStrategy || manager.settings.get('dockingSizeStrategy') || 'split-reference';
    const createCycleBtn = (className, metaMap, initialKey, onCycle) => {
        const iconEl = el('span', { className: `fa-solid ${(metaMap[initialKey] || metaMap.auto || Object.values(metaMap)[0]).icon}` });
        const btn = el('button', {
            type: 'button',
            className: `ptmt-editor-split-btn ${className}`,
            title: `${(metaMap[initialKey] || Object.values(metaMap)[0]).label} (click to cycle)`,
        }, iconEl);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextKey = onCycle();
            const meta = metaMap[nextKey] || Object.values(metaMap)[0];
            iconEl.className = `fa-solid ${meta.icon}`;
            btn.title = `${meta.label} (click to cycle)`;
        });
        return btn;
    };
    const expandedBtn = createCycleBtn('ptmt-split-expanded-btn', EXPANDED_META, expandedOrientation, () => {
        const idx = ORIENTATIONS.indexOf(expandedOrientation);
        expandedOrientation = ORIENTATIONS[(idx + 1) % ORIENTATIONS.length];
        element.dataset.orientationExpanded = expandedOrientation;
        if (expandedOrientation !== 'auto')
            element.dataset.naturalOrientation = expandedOrientation;
        manager.appApi.applySplitOrientation(element);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'splitOrientationChanged' } }));
        return expandedOrientation;
    });
    const collapsedBtn = createCycleBtn('ptmt-split-collapsed-btn', COLLAPSED_META, collapsedOrientation, () => {
        const idx = ORIENTATIONS.indexOf(collapsedOrientation);
        collapsedOrientation = ORIENTATIONS[(idx + 1) % ORIENTATIONS.length];
        element.dataset.orientationCollapsed = collapsedOrientation;
        manager.appApi.updateSplitCollapsedState(element);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'splitOrientationChanged' } }));
        return collapsedOrientation;
    });
    const sizingBtn = createCycleBtn('ptmt-split-sizing-btn', SIZING_META, sizingStrategy, () => {
        const idx = SIZINGS.indexOf(sizingStrategy);
        sizingStrategy = SIZINGS[(idx + 1) % SIZINGS.length];
        element.dataset.sizingStrategy = sizingStrategy;
        manager.appApi.setDockingSizeStrategy?.(sizingStrategy);
        window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED, { detail: { reason: 'splitSizingChanged' } }));
        return sizingStrategy;
    });
    iconsContainer.append(expandedBtn, collapsedBtn, sizingBtn);
    titleDiv.append(titleSpan, iconsContainer);
    container.appendChild(titleDiv);
    const childrenWrapper = el('div', { className: 'ptmt-editor-children' });
    Array.from(element.children).forEach(child => {
        const childTree = renderTreeElement(manager, child);
        if (childTree)
            childrenWrapper.appendChild(childTree);
    });
    container.appendChild(childrenWrapper);
    return container;
}
function renderPane(manager, element) {
    const container = el('div', { className: 'ptmt-editor-pane' });
    if (element.dataset.paneId)
        container.dataset.paneId = element.dataset.paneId;
    const vs = readPaneViewSettings(element);
    const titleDiv = el('div', {
        className: 'ptmt-editor-title ptmt-editor-pane-header',
        draggable: 'true',
        title: 'Drag pane header to move or split this pane',
    });
    const dragHandle = el('span', { className: 'ptmt-drag-handle ptmt-editor-pane-drag-handle', title: 'Drag pane to move or split' }, '☰');
    const titleSpan = el('span', {}, 'Pane');
    // Add view settings indicator icons
    const iconsContainer = el('div', { className: 'ptmt-editor-pane-icons' });
    const addIcon = (iconClass, title) => {
        iconsContainer.appendChild(el('span', { className: `fa-solid ${iconClass}`, title }));
    };
    // 1. Expanded Orientation
    if (vs.defaultOrientation === 'vertical')
        addIcon('fa-arrows-up-down', 'Expanded: Vertical');
    else if (vs.defaultOrientation === 'horizontal')
        addIcon('fa-arrows-left-right', 'Expanded: Horizontal');
    else
        addIcon('fa-expand', 'Expanded: Auto');
    // 2. Collapsed Orientation
    if (vs.collapsedOrientation === 'vertical')
        addIcon('fa-up-down', 'Collapsed: Vertical');
    else if (vs.collapsedOrientation === 'horizontal')
        addIcon('fa-left-right', 'Collapsed: Horizontal');
    else
        addIcon('fa-compress', 'Collapsed: Auto');
    // 3. Flow
    if (vs.contentFlow === 'reversed')
        addIcon('fa-arrow-up-wide-short', 'Flow: Reversed');
    else
        addIcon('fa-arrow-down-wide-short', 'Flow: Default');
    // 4. Icons Only
    if (vs.iconOnly)
        addIcon('fa-icons', 'Icons Only');
    // 5. Tab Strip Mode
    const tabMode = vs.tabStripMode || 'normal';
    if (tabMode === 'auto-hide')
        addIcon('fa-eye-slash', 'Tab Strip: Auto-Hide');
    else if (tabMode === 'shy')
        addIcon('fa-ghost', 'Tab Strip: Shy');
    else
        addIcon('fa-eye', 'Tab Strip: Normal');
    const settingsBtn = el('button', {
        className: SELECTORS.PANE_CONFIG_BTN.substring(1),
        title: 'Configure this pane (size, flow, etc.)',
    }, '⚙');
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        manager.appApi.openViewSettingsDialog(element);
    });
    titleDiv.append(dragHandle, titleSpan, iconsContainer, settingsBtn);
    titleDiv.addEventListener('dragstart', (e) => manager.handleDragStart(e, null));
    titleDiv.addEventListener('dragend', (e) => manager.handleDragLeave(e));
    manager.attachTouchDragListeners(titleDiv);
    container.appendChild(titleDiv);
    const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
    const tabs = Array.from(element.querySelectorAll(SELECTORS.TAB));
    tabs.forEach(tab => {
        tabsContainer.appendChild(renderTab(manager, tab, element));
    });
    container.appendChild(tabsContainer);
    manager.attachDragListeners(container);
    return container;
}
function renderTab(manager, tabElement, _paneElement) {
    const pid = tabElement.dataset.for || '';
    const panel = pid ? manager.appApi.getPanelById(pid) : null;
    const sourceId = panel?.dataset?.sourceId || pid;
    const mapping = manager.settings.getMapping(sourceId);
    const color = mapping.color || null;
    const container = el('div', {
        className: SELECTORS.EDITOR_TAB.substring(1),
        draggable: 'true',
        'data-pid': pid,
        'data-source-id': sourceId,
        'data-is-active': tabElement.classList.contains('active').toString(),
        'data-is-collapsed': tabElement.classList.contains('collapsed').toString(),
    });
    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: hexToRgba(color) } : {} });
    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder' }, '☰');
    const iconBtn = el('button', {
        className: SELECTORS.ICON_PICKER_BTN.substring(1),
        type: 'button',
        title: 'Choose icon',
    });
    const currentIcon = mapping.icon || '';
    manager.updateIconBtn(iconBtn, currentIcon);
    iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        manager.pickIcon(iconBtn, sourceId, tabElement);
    });
    const titleSpan = el('span', { className: 'ptmt-tab-label' }, tabElement.querySelector('.ptmt-tab-label')?.textContent || '');
    const settingsBtn = el('button', {
        className: SELECTORS.TAB_CONFIG_BTN.substring(1),
        title: 'Tab Settings (rename, color, etc.)',
    }, '⚙');
    manager.attachSettingsButtonListener(settingsBtn, sourceId, tabElement, container, false);
    container.append(bg, handle, iconBtn, titleSpan, settingsBtn);
    container.addEventListener('dragstart', (e) => manager.handleDragStart(e, pid));
    container.addEventListener('drop', (e) => manager.handleDrop(e));
    manager.attachTouchDragListeners(container, pid);
    return container;
}
function renderHiddenColumn(manager) {
    const container = el('fieldset', { className: 'ptmt-editor-column ptmt-hidden-section' });
    const legend = el('legend', {}, 'Hidden Tabs');
    container.appendChild(legend);
    const pane = el('div', { className: 'ptmt-editor-pane ptmt-hidden-pane' });
    const titleDiv = el('div', { className: 'ptmt-editor-title' });
    titleDiv.appendChild(el('span', {}, 'Storage Pane'));
    pane.appendChild(titleDiv);
    const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
    tabsContainer.dataset.isHiddenList = 'true';
    const currentLayout = manager.settings.getActiveLayout();
    const hiddenTabs = currentLayout.hiddenTabs || [];
    if (hiddenTabs.length === 0) {
        const placeholder = el('div', { className: 'ptmt-editor-tabs-container-placeholder' }, 'Drag tabs here to hide');
        tabsContainer.appendChild(placeholder);
    }
    hiddenTabs.forEach((entry) => {
        tabsContainer.appendChild(renderHiddenTab(manager, entry));
    });
    pane.appendChild(tabsContainer);
    container.appendChild(pane);
    manager.attachDragListeners(tabsContainer);
    return container;
}
function renderHiddenTab(manager, entry) {
    const sourceId = typeof entry === 'string' ? entry : entry.sourceId;
    const isActive = typeof entry === 'object' ? Boolean(entry.active) : false;
    const isCollapsed = typeof entry === 'object' ? Boolean(entry.collapsed) : false;
    const mapping = manager.settings.getMapping(sourceId);
    const title = mapping.title || sourceId;
    const icon = mapping.icon || 'fa-ban';
    const color = mapping.color || null;
    const container = el('div', {
        className: SELECTORS.EDITOR_TAB.substring(1),
        draggable: 'true',
        'data-is-hidden-item': 'true',
        'data-source-id': sourceId,
        'data-is-active': isActive.toString(),
        'data-is-collapsed': isCollapsed.toString(),
    });
    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to restore' }, '☰');
    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: hexToRgba(color) } : {} });
    const iconSpan = createIconElement(icon);
    const titleSpan = el('span', { className: SELECTORS.TAB_LABEL.substring(1) }, title);
    const settingsBtn = el('button', {
        className: SELECTORS.TAB_CONFIG_BTN.substring(1),
        title: 'Tab Settings (rename, color, etc.)',
    }, '⚙');
    manager.attachSettingsButtonListener(settingsBtn, sourceId, null, container, true);
    container.append(bg, handle, ...(iconSpan ? [iconSpan] : []), titleSpan, settingsBtn);
    container.addEventListener('dragstart', (e) => manager.handleDragStart(e));
    manager.attachTouchDragListeners(container);
    return container;
}
function renderPendingTreeElement(manager, element, columnName) {
    if (!element || element.classList.contains('ptmt-resizer-vertical'))
        return null;
    if (element.classList.contains('ptmt-split')) {
        const childrenWrappers = Array.from(element.children)
            .map(child => renderPendingTreeElement(manager, child, columnName))
            .filter((w) => Boolean(w));
        if (childrenWrappers.length === 0)
            return null;
        const container = el('div', { className: 'ptmt-editor-pending-split-group' });
        childrenWrappers.forEach(w => container.appendChild(w));
        return container;
    }
    if (element.classList.contains('ptmt-pane')) {
        return renderPendingPane(manager, element, columnName);
    }
    return null;
}
function renderPendingPane(manager, element, columnName) {
    const paneId = element.dataset.paneId || '';
    const container = el('div', { className: 'ptmt-editor-pane ptmt-pending-pane' });
    container.dataset.paneId = paneId;
    const titleDiv = el('div', { className: 'ptmt-editor-title' });
    const titleSpan = el('span', {}, 'Pane');
    titleDiv.append(titleSpan);
    container.appendChild(titleDiv);
    const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
    tabsContainer.dataset.isPendingList = 'true';
    tabsContainer.dataset.columnName = columnName;
    tabsContainer.dataset.paneId = paneId;
    const currentLayout = manager.settings.getActiveLayout();
    const ghostTabs = currentLayout.columns[columnName]?.ghostTabs || [];
    const columnEl = element.closest('.ptmt-body-column');
    const firstPane = columnEl?.querySelector('.ptmt-pane');
    const isFirstPane = element === firstPane;
    let filteredGhostTabs;
    if (isFirstPane && columnEl) {
        const allPaneIdsInColumn = new Set(Array.from(columnEl.querySelectorAll('.ptmt-pane')).map(p => p.dataset.paneId));
        filteredGhostTabs = ghostTabs.filter(t => (t.paneId === paneId) || (!t.paneId) || (!allPaneIdsInColumn.has(t.paneId)));
    }
    else {
        filteredGhostTabs = ghostTabs.filter(t => t.paneId === paneId);
    }
    filteredGhostTabs.forEach(tabInfo => {
        tabsContainer.appendChild(renderPendingTab(manager, tabInfo));
    });
    container.appendChild(tabsContainer);
    manager.attachDragListeners(container);
    return container;
}
function renderPendingTab(manager, tabInfo) {
    const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass || '';
    const mapping = manager.settings.getMapping(sourceId);
    const title = mapping.title || sourceId || tabInfo.searchClass;
    const icon = mapping.icon || 'fa-ghost';
    const color = mapping.color || null;
    const container = el('div', {
        className: 'ptmt-editor-tab',
        draggable: 'true',
        'data-is-pending': 'true',
        'data-is-active': (tabInfo.active === true).toString(),
        'data-is-collapsed': (tabInfo.collapsed === true).toString(),
        'data-pane-id': tabInfo.paneId || '',
        'data-source-id': sourceId,
    });
    container.dataset.searchId = tabInfo.searchId || '';
    container.dataset.searchClass = tabInfo.searchClass || '';
    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder or move' }, '☰');
    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: hexToRgba(color) } : {} });
    const iconSpan = createIconElement(icon);
    const titleSpan = el('span', { className: 'ptmt-tab-label' }, title);
    const settingsBtn = el('button', {
        className: SELECTORS.TAB_CONFIG_BTN.substring(1),
        title: 'Tab Settings (rename, color, etc.)',
    }, '⚙');
    manager.attachSettingsButtonListener(settingsBtn, sourceId, null, container, true);
    container.append(bg, handle, ...(iconSpan ? [iconSpan] : []), titleSpan, settingsBtn);
    container.addEventListener('dragstart', (e) => manager.handleDragStart(e));
    container.addEventListener('drop', (e) => manager.handleDrop(e));
    manager.attachTouchDragListeners(container);
    return container;
}
//# sourceMappingURL=EditorRenderer.js.map