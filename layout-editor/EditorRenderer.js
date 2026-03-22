import { el, createIconElement } from '../utils.js';
import { SELECTORS } from '../constants.js';

export function renderUnifiedEditor(manager) {
    let editorRoot = manager.rootElement.querySelector(SELECTORS.UNIFIED_EDITOR);
    if (editorRoot) {
        editorRoot.innerHTML = '';
    } else {
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
        const isHidden = col.element?.style.display === 'none';
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
        'data-column-name': name
    });
    if (isHidden) {
        container.classList.add('ptmt-editor-column-hidden');
    }

    const legend = el('legend', {}, title + (isHidden ? ' (Hidden)' : ''));
    container.appendChild(legend);

    const tree = renderTreeElement(manager, element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));
    if (tree) container.appendChild(tree);

    const pendingContainer = el('div', { className: 'ptmt-editor-pending' });
    const pendingTitle = el('div', { className: 'ptmt-editor-title' }, el('span', { className: 'ptmt-editor-pending-title' }, 'Pending Tabs'));
    pendingContainer.appendChild(pendingTitle);

    const pendingTree = renderPendingTreeElement(manager, element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), name);
    if (pendingTree) pendingContainer.appendChild(pendingTree);

    container.appendChild(pendingContainer);
    return container;
}

function renderTreeElement(manager, element) {
    if (!element || element.classList.contains(SELECTORS.RESIZER_V.substring(1))) return null;
    if (element.classList.contains(SELECTORS.SPLIT.substring(1))) return renderSplit(manager, element);
    if (element.classList.contains(SELECTORS.PANE.substring(1))) return renderPane(manager, element);
    return null;
}

function renderSplit(manager, element) {
    const container = el('div', { className: 'ptmt-editor-split' });
    const titleDiv = el('div', { className: 'ptmt-editor-title' });
    const titleSpan = el('span', {}, `Split Container`);
    const createLabel = (text) => el('span', { className: 'ptmt-editor-label-small' }, text);

    const expandedOrientation = element.dataset.orientationExpanded || element.dataset.naturalOrientation || 'auto';
    const collapsedOrientation = element.dataset.orientationCollapsed || 'auto';

    const expandedSelect = el('select', { title: 'Orientation when expanded' });
    const collapsedSelect = el('select', { title: 'Orientation when collapsed' });

    ['auto', 'vertical', 'horizontal'].forEach(o => {
        expandedSelect.appendChild(el('option', { value: o, selected: o === expandedOrientation }, o.charAt(0).toUpperCase() + o.slice(1)));
        collapsedSelect.appendChild(el('option', { value: o, selected: o === collapsedOrientation }, o.charAt(0).toUpperCase() + o.slice(1)));
    });

    expandedSelect.addEventListener('change', (e) => {
        element.dataset.orientationExpanded = e.target.value;
        if (e.target.value !== 'auto') element.dataset.naturalOrientation = e.target.value;
        manager.appApi.applySplitOrientation(element);
    });

    collapsedSelect.addEventListener('change', (e) => {
        element.dataset.orientationCollapsed = e.target.value;
        manager.appApi.updateSplitCollapsedState(element);
    });

    const controls = el('div', { className: 'ptmt-editor-title-controls' });
    const expandedRow = el('div', { className: 'ptmt-editor-title-row' });
    expandedRow.append(createLabel('Expanded:'), expandedSelect);
    const collapsedRow = el('div', { className: 'ptmt-editor-title-row' });
    collapsedRow.append(createLabel('Collapsed:'), collapsedSelect);

    controls.append(expandedRow, collapsedRow);
    titleDiv.append(titleSpan, controls);
    container.appendChild(titleDiv);

    const childrenWrapper = el('div', { className: 'ptmt-editor-children' });
    Array.from(element.children).forEach(child => {
        const childTree = renderTreeElement(manager, child);
        if (childTree) childrenWrapper.appendChild(childTree);
    });
    container.appendChild(childrenWrapper);
    return container;
}

function renderPane(manager, element) {
    const container = el('div', { className: 'ptmt-editor-pane' });
    container.dataset.paneId = element.dataset.paneId;

    const titleDiv = el('div', { className: 'ptmt-editor-title' });
    const titleSpan = el('span', {}, 'Pane');
    const settingsBtn = el('button', {
        className: SELECTORS.PANE_CONFIG_BTN.substring(1),
        title: 'Configure this pane (size, flow, etc.)',
    }, '⚙');

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        manager.appApi.openViewSettingsDialog(element);
    });

    titleDiv.append(titleSpan, settingsBtn);
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

function renderTab(manager, tabElement, paneElement) {
    const pid = tabElement.dataset.for;
    const panel = manager.appApi.getPanelById(pid);
    const sourceId = panel?.dataset?.sourceId || pid;
    const mapping = manager.settings.getMapping(sourceId);
    const color = mapping.color || null;

    const container = el('div', {
        className: SELECTORS.EDITOR_TAB.substring(1),
        draggable: 'true',
        'data-pid': pid,
        'data-source-id': sourceId,
        'data-is-active': tabElement.classList.contains('active').toString(),
        'data-is-collapsed': tabElement.classList.contains('collapsed').toString()
    });

    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: color } : {} });
    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder' }, '☰');

    const iconBtn = el('button', {
        className: SELECTORS.ICON_PICKER_BTN.substring(1),
        type: 'button',
        title: 'Choose icon'
    });

    const currentIcon = mapping.icon || '';
    if (currentIcon.startsWith('fa-')) {
        iconBtn.innerHTML = `<i class="fa-solid ${currentIcon}"></i>`;
    } else {
        iconBtn.textContent = currentIcon || '';
    }

    iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        manager.pickIcon(iconBtn, sourceId, tabElement);
    });

    const titleSpan = el('span', { className: 'ptmt-tab-label' }, tabElement.querySelector('.ptmt-tab-label').textContent);
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

    hiddenTabs.forEach(entry => {
        tabsContainer.appendChild(renderHiddenTab(manager, entry));
    });

    pane.appendChild(tabsContainer);
    container.appendChild(pane);
    manager.attachDragListeners(tabsContainer);
    return container;
}

function renderHiddenTab(manager, entry) {
    const sourceId = typeof entry === 'string' ? entry : entry.sourceId;
    const isActive = typeof entry === 'object' ? entry.active : false;
    const isCollapsed = typeof entry === 'object' ? entry.collapsed : false;

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
        'data-is-collapsed': isCollapsed.toString()
    });

    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to restore' }, '☰');
    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: color } : {} });
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
    if (!element || element.classList.contains('ptmt-resizer-vertical')) return null;

    if (element.classList.contains('ptmt-split')) {
        const childrenWrappers = Array.from(element.children).map(child => renderPendingTreeElement(manager, child, columnName)).filter(Boolean);
        if (childrenWrappers.length === 0) return null;
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
    const paneId = element.dataset.paneId;
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
    const firstPane = columnEl.querySelector('.ptmt-pane');
    const isFirstPane = element === firstPane;

    let filteredGhostTabs;
    if (isFirstPane) {
        const allPaneIdsInColumn = new Set(Array.from(columnEl.querySelectorAll('.ptmt-pane')).map(p => p.dataset.paneId));
        filteredGhostTabs = ghostTabs.filter(t => (t.paneId === paneId) || (!t.paneId) || (!allPaneIdsInColumn.has(t.paneId)));
    } else {
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
    const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass;
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
        'data-pane-id': tabInfo.paneId || ''
    });
    container.dataset.searchId = tabInfo.searchId || '';
    container.dataset.searchClass = tabInfo.searchClass || '';
    container.dataset.sourceId = sourceId;

    const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder or move' }, '☰');
    const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: color } : {} });
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
