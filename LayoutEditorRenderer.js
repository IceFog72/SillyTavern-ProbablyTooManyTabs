// LayoutEditorRenderer.js - Renders the visual layout editor (columns, panes, splits, tabs)

import { el, getPanelBySourceId } from './utils.js';
import { getTabIdentifier } from './pending-tabs.js';
import { settings as globalSettings } from './settings.js';

/** @typedef {import('./types.js').PaneNode} PaneNode */
/** @typedef {import('./types.js').SplitNode} SplitNode */
/** @typedef {import('./types.js').TabData} TabData */
/** @typedef {import('./types.js').GhostTab} GhostTab */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */
/** @typedef {import('./types.js').PTMTAPI} PTMTAPI */
/** @typedef {import('./settings.js').SettingsManager} SettingsManager */

export class LayoutEditorRenderer {
    /**
     * @param {SettingsManager} settingsManager
     * @param {PTMTAPI} appApi
     */
    constructor(settingsManager, appApi) {
        this.settings = settingsManager;
        this.appApi = appApi;
        this.rootElement = null;
        this.debouncedSettingsUpdate = null; // Will be set by LayoutManager
    }

    /**
     * Sets the debounced settings update function (injected by LayoutManager)
     * @param {Function} debouncedFn
     */
    setDebouncedSettingsUpdate(debouncedFn) {
        this.debouncedSettingsUpdate = debouncedFn;
    }

    /**
     * Renders the unified visual editor showing all columns
     */
    renderUnifiedEditor() {
        let editorRoot = this.rootElement?.querySelector('#ptmt-unified-editor');
        if (editorRoot) {
            editorRoot.innerHTML = '';
        } else {
            editorRoot = el('div', { id: 'ptmt-unified-editor' });
            this.rootElement?.appendChild(editorRoot);
        }

        const refs = this.appApi._refs();
        const columns = [
            { name: 'left', title: 'Left Column', element: refs.leftBody },
            { name: 'center', title: 'Center Column', element: refs.centerBody },
            { name: 'right', title: 'Right Column', element: refs.rightBody },
        ];

        columns.forEach(col => {
            const isHidden = col.element?.style.display === 'none';
            const isAlwaysVisible = col.name === 'left' || col.name === 'right';
            if (isAlwaysVisible || !isHidden) {
                editorRoot.appendChild(this.renderColumn(col.name, col.title, col.element, isHidden));
            }
        });

        editorRoot.appendChild(this.renderHiddenColumn());
    }

    /**
     * Renders the hidden tabs column
     * @returns {HTMLElement}
     */
    renderHiddenColumn() {
        const container = el('fieldset', { className: 'ptmt-editor-column ptmt-hidden-section' });
        const legend = el('legend', {}, 'Hidden Tabs');
        container.appendChild(legend);

        const pane = el('div', { className: 'ptmt-editor-pane ptmt-hidden-pane' });
        const titleDiv = el('div', { className: 'ptmt-editor-title' });
        titleDiv.appendChild(el('span', {}, 'Storage Pane'));
        pane.appendChild(titleDiv);

        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container', style: { minHeight: '40px' } });
        tabsContainer.dataset.isHiddenList = 'true';

        const currentLayout = this.settings.getActiveLayout();
        const hiddenTabs = currentLayout.hiddenTabs || [];

        if (hiddenTabs.length === 0) {
            const placeholder = el('div', { style: { opacity: '0.5', padding: '10px', fontSize: '0.9em' } }, 'Drag tabs here to hide');
            tabsContainer.appendChild(placeholder);
        }

        hiddenTabs.forEach(entry => {
            tabsContainer.appendChild(this.renderHiddenTab(entry));
        });

        pane.appendChild(tabsContainer);
        container.appendChild(pane);

        return container;
    }

    /**
     * Renders a hidden tab item
     * @param {string|Object} entry
     * @returns {HTMLElement}
     */
    renderHiddenTab(entry) {
        const sourceId = typeof entry === 'string' ? entry : entry.sourceId;
        const isActive = typeof entry === 'object' ? entry.active : false;
        const isCollapsed = typeof entry === 'object' ? entry.collapsed : false;

        const mapping = globalSettings.get('panelMappings').find(m => m.id === sourceId) || {};
        const title = mapping.title || sourceId;
        const icon = mapping.icon || '🚫';

        const container = el('div', {
            className: 'ptmt-editor-tab',
            draggable: 'true',
            'data-is-hidden-item': 'true',
            'data-source-id': sourceId,
            'data-is-active': isActive.toString(),
            'data-is-collapsed': isCollapsed.toString()
        });

        const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to restore' }, '☰');
        const iconSpan = el('span', { className: 'ptmt-tab-icon' }, icon);
        const titleSpan = el('span', { className: 'ptmt-tab-label' }, title);
        const idLabel = el('span', { className: 'ptmt-editor-id', title: sourceId }, sourceId?.substring(0, 15));

        container.append(handle, iconSpan, titleSpan, idLabel);

        return container;
    }

    /**
     * Renders a column in the editor
     * @param {string} name
     * @param {string} title
     * @param {HTMLElement} element
     * @param {boolean} isHidden
     * @returns {HTMLElement}
     */
    renderColumn(name, title, element, isHidden = false) {
        const container = el('fieldset', {
            className: 'ptmt-editor-column',
            'data-column-name': name
        });
        if (isHidden) {
            container.classList.add('ptmt-editor-column-hidden');
        }

        const legend = el('legend', {}, title + (isHidden ? ' (Hidden)' : ''));
        container.appendChild(legend);

        const tree = this.renderTreeElement(element.querySelector('.ptmt-pane, .ptmt-split'));
        if (tree) container.appendChild(tree);

        const pendingContainer = el('div', { className: 'ptmt-editor-pending' });
        const pendingTitle = el('div', { className: 'ptmt-editor-title', style: { paddingTop: '8px' } }, el('span', {}, 'Pending Tabs'));
        pendingContainer.appendChild(pendingTitle);

        const pendingTree = this.renderPendingTreeElement(element.querySelector('.ptmt-pane, .ptmt-split'), name);
        if (pendingTree) pendingContainer.appendChild(pendingTree);

        container.appendChild(pendingContainer);

        return container;
    }

    /**
     * Recursively renders a tree element (pane or split)
     * @param {HTMLElement} element
     * @returns {HTMLElement|null}
     */
    renderTreeElement(element) {
        if (!element || element.classList.contains('ptmt-resizer-vertical')) return null;

        if (element.classList.contains('ptmt-split')) {
            return this.renderSplit(element);
        }
        if (element.classList.contains('ptmt-pane')) {
            return this.renderPane(element);
        }
        return null;
    }

    /**
     * Renders a split container in the editor
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderSplit(element) {
        const container = el('div', { className: 'ptmt-editor-split' });
        const titleDiv = el('div', { className: 'ptmt-editor-title' });
        const titleSpan = el('span', {}, `Split Container`);

        const createLabel = (text) => el('span', { style: { fontSize: '0.8em', opacity: '0.7', marginRight: '5px' } }, text);

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
            this.appApi.applySplitOrientation(element);
        });

        collapsedSelect.addEventListener('change', (e) => {
            element.dataset.orientationCollapsed = e.target.value;
            this.appApi.updateSplitCollapsedState(element);
        });

        const controls = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });

        const expandedRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } });
        expandedRow.append(createLabel('Expanded:'), expandedSelect);

        const collapsedRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } });
        collapsedRow.append(createLabel('Collapsed:'), collapsedSelect);

        controls.append(expandedRow, collapsedRow);
        titleDiv.append(titleSpan, controls);
        container.appendChild(titleDiv);

        const childrenWrapper = el('div', { className: 'ptmt-editor-children' });
        Array.from(element.children).forEach(child => {
            const childTree = this.renderTreeElement(child);
            if (childTree) childrenWrapper.appendChild(childTree);
        });
        container.appendChild(childrenWrapper);
        return container;
    }

    /**
     * Renders a pane in the editor
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderPane(element) {
        const container = el('div', { className: 'ptmt-editor-pane' });
        container.dataset.paneId = element.dataset.paneId;

        const titleDiv = el('div', { className: 'ptmt-editor-title' });
        const titleSpan = el('span', {}, 'Pane');
        const idSpan = el('span', { className: 'ptmt-editor-id', style: { marginLeft: '8px', opacity: '0.6', fontSize: '0.85em' }, title: element.dataset.paneId }, `[${element.dataset.paneId}]`);
        const settingsBtn = el('button', {
            className: 'ptmt-pane-config-btn',
            title: 'Configure this pane (size, flow, etc.)',
        }, '⚙');

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.appApi.openViewSettingsDialog(element);
        });

        titleDiv.append(titleSpan, idSpan, settingsBtn);
        container.appendChild(titleDiv);

        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });

        const tabs = Array.from(element.querySelectorAll('.ptmt-tab'));
        tabs.forEach(tab => {
            tabsContainer.appendChild(this.renderTab(tab, element));
        });

        container.appendChild(tabsContainer);

        return container;
    }

    /**
     * Renders a tab in the editor
     * @param {HTMLElement} tabElement
     * @param {HTMLElement} paneElement
     * @returns {HTMLElement}
     */
    renderTab(tabElement, paneElement) {
        const pid = tabElement.dataset.for;
        const panel = this.appApi.getPanelById(pid);
        const sourceId = panel.dataset.sourceId;
        const mapping = globalSettings.get('panelMappings').find(m => m.id === sourceId) || {};

        const container = el('div', {
            className: 'ptmt-editor-tab',
            draggable: 'true',
            'data-pid': pid,
            'data-source-id': sourceId,
            'data-is-active': tabElement.classList.contains('active').toString(),
            'data-is-collapsed': tabElement.classList.contains('collapsed').toString()
        });

        const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder' }, '☰');
        const iconInput = el('input', { type: 'text', value: mapping.icon || '', placeholder: 'Icon', 'data-prop': 'icon' });
        const titleInput = el('input', { type: 'text', value: tabElement.querySelector('.ptmt-tab-label').textContent, placeholder: 'Title', 'data-prop': 'title' });
        const idLabel = el('span', { className: 'ptmt-editor-id', title: sourceId }, sourceId?.substring(0, 15) || 'N/A');

        container.append(handle, iconInput, titleInput, idLabel);

        [iconInput, titleInput].forEach(input => {
            input.addEventListener('input', () => {
                const prop = input.dataset.prop;
                const newVal = input.value.trim();

                const mappings = globalSettings.get('panelMappings').slice();
                const mapping = mappings.find(m => m.id === sourceId);

                if (mapping) {
                    mapping[prop] = newVal;
                    if (this.debouncedSettingsUpdate) {
                        this.debouncedSettingsUpdate(mappings);
                    }
                }

                if (prop === 'title') {
                    tabElement.querySelector('.ptmt-tab-label').textContent = newVal || sourceId;
                }
                if (prop === 'icon') {
                    let iconEl = tabElement.querySelector('.ptmt-tab-icon');
                    if (newVal) {
                        if (!iconEl) {
                            iconEl = el('span', { className: 'ptmt-tab-icon' });
                            tabElement.prepend(iconEl);
                        }
                        iconEl.textContent = newVal;
                    } else if (iconEl) {
                        iconEl.remove();
                    }
                }
            });
        });

        return container;
    }

    /**
     * Renders pending tabs for a tree element
     * @param {HTMLElement} element
     * @param {string} columnName
     * @returns {HTMLElement|null}
     */
    renderPendingTreeElement(element, columnName) {
        if (!element || element.classList.contains('ptmt-resizer-vertical')) return null;

        if (element.classList.contains('ptmt-split')) {
            const childrenWrappers = Array.from(element.children).map(child => this.renderPendingTreeElement(child, columnName)).filter(Boolean);
            if (childrenWrappers.length === 0) return null;

            const container = el('div', { className: 'ptmt-editor-pending-split-group' });
            childrenWrappers.forEach(w => container.appendChild(w));
            return container;
        }
        if (element.classList.contains('ptmt-pane')) {
            return this.renderPendingPane(element, columnName);
        }
        return null;
    }

    /**
     * Renders a pending pane
     * @param {HTMLElement} element
     * @param {string} columnName
     * @returns {HTMLElement}
     */
    renderPendingPane(element, columnName) {
        const paneId = element.dataset.paneId;
        const container = el('div', { className: 'ptmt-editor-pane ptmt-pending-pane' });
        container.dataset.paneId = paneId;

        const titleDiv = el('div', { className: 'ptmt-editor-title' });
        const titleSpan = el('span', {}, 'Pane');
        const idSpan = el('span', { className: 'ptmt-editor-id', style: { marginLeft: '8px', opacity: '0.6', fontSize: '0.85em' }, title: paneId }, `[${paneId}]`);
        titleDiv.append(titleSpan, idSpan);
        container.appendChild(titleDiv);

        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
        tabsContainer.dataset.isPendingList = 'true';
        tabsContainer.dataset.columnName = columnName;
        tabsContainer.dataset.paneId = paneId;

        const currentLayout = this.settings.getActiveLayout();
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
            tabsContainer.appendChild(this.renderPendingTab(tabInfo));
        });

        container.appendChild(tabsContainer);

        return container;
    }

    /**
     * Renders a pending tab
     * @param {GhostTab} tabInfo
     * @returns {HTMLElement}
     */
    renderPendingTab(tabInfo) {
        const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass;
        const mapping = globalSettings.get('panelMappings').find(m => m.id === sourceId) || {};
        const title = mapping.title || sourceId || tabInfo.searchClass;
        const icon = mapping.icon || '👻';

        const identifier = tabInfo.searchId ? `ID: ${tabInfo.searchId}` : `Class: ${tabInfo.searchClass}`;

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
        const iconSpan = el('span', { className: 'ptmt-tab-icon' }, icon);
        const titleSpan = el('span', { className: 'ptmt-tab-label' }, title);
        const idLabel = el('span', { className: 'ptmt-editor-id', title: identifier }, identifier);

        container.append(handle, iconSpan, titleSpan, idLabel);

        return container;
    }

    /**
     * Refreshes the entire editor (called after layout changes)
     */
    refreshEditor() {
        this.renderUnifiedEditor();
    }

    /**
     * Cleanup method
     */
    cleanup() {
        this.rootElement = null;
    }
}
