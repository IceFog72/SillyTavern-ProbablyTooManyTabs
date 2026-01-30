// LayoutManager.js

import { settings } from './settings.js';
import { el, debounce, getPanelBySourceId } from './utils.js';
import { getTabIdentifier } from './pending-tabs.js';

export class LayoutManager {
    constructor(appApi, settings) {
        this.appApi = appApi;
        this.settings = settings;
        this.rootElement = null;
        this.draggedTabInfo = null;
        this.debouncedSettingsUpdate = debounce((updatedMappings) => {
            settings.update({ panelMappings: updatedMappings });
        }, 400);
    }

    createSettingsPanel() {
        const panel = el('div', { className: 'ptmt-settings-panel' });
        this.rootElement = panel;

        const globalSettings = el('fieldset', {}, el('legend', {}, 'Global Layout'));



        const createSettingCheckbox = (labelText, settingKey) => {
            const id = `ptmt-global-${settingKey}`;
            const wrapper = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' } });
            const checkbox = el('input', { type: 'checkbox', id, checked: this.settings.get(settingKey) });
            const label = el('label', { for: id }, labelText);

            checkbox.addEventListener('change', (e) => {
                // PROTECTION: Don't allow hiding a column if it contains the settings tab
                if (e.target.checked === false) {
                    const colName = settingKey === 'showLeftPane' ? 'left' : (settingKey === 'showRightPane' ? 'right' : null);
                    if (colName) {
                        const refs = this.appApi._refs();
                        const colEl = refs[`${colName}Body`];
                        if (colEl && colEl.querySelector('[data-source-id="ptmt-settings-wrapper-content"]')) {
                            alert("Cannot hide this column because it contains the Layout Settings tab. Move the tab to another column first.");
                            e.target.checked = true;
                            return;
                        }
                    }
                }
                this.settings.update({ [settingKey]: e.target.checked });
            });

            wrapper.append(checkbox, label);
            return wrapper;
        };

        globalSettings.append(
            createSettingCheckbox('Show Left Column', 'showLeftPane'),
            createSettingCheckbox('Show Right Column', 'showRightPane'),
            createSettingCheckbox('Show Icons Only (Global)', 'showIconsOnly'),
            createSettingCheckbox('Hiding some content on resize (for Chrome users)', 'hideContentWhileResizing')
        );



        const resetBtn = el('button',
            {
                style: { marginTop: '10px', cursor: 'pointer' },
                title: 'Reset all layout settings and reload the UI',
                class: 'menu_button menu_button_icon interactable'
            },
            'Reset Layout to Default'
        );
        resetBtn.addEventListener('click', () => {
            this.appApi.resetLayout();
        });

        globalSettings.append(resetBtn);

        panel.append(globalSettings);

        this.renderUnifiedEditor();

        const disclaimerContainer = el('div', {
            style: {
                marginTop: '20px',
                padding: '10px',
                borderRadius: '4px',
                background: 'rgba(255, 229, 100, 0.1)',
                color: 'var(--SmartThemeBodyColor)',
                textAlign: 'left',
                fontSize: '0.9em',
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
            }
        },
            el('span', { style: { fontSize: '1.5em' } }, '⚠️'),
            el('div', {},
                el('strong', {}, 'Please Note:'),
                el('p', { style: { margin: '0', opacity: '0.9' } }, 'To ensure compatibility, your custom layout may be automatically reset after major updates to the layout system.'),
                el('p', { style: { margin: '5px 0 0 0', opacity: '0.9' } }, 'If you install a supported extension and its tab does not appear, you may need to reset the layout for it to be added.'),
                el('p', { style: { margin: '5px 0 0 0', opacity: '0.9' } }, 'Pending Tabs lists extensions or panels available for columns that are not currently in active layout.'),
                el('p', { style: { margin: '5px 0 0 0', opacity: '0.9' } }, 'For additional extension tab requests, reach out to me on Discord.'),
                el('p', { style: { margin: '5px 0 0 0', opacity: '0.9' } }, 'Resizing the navigation panel with character cards may lag on Chrome-based browsers. -> Use Hide some content on resize (for Chrome users) toggle.')
            )
        );
        panel.appendChild(disclaimerContainer);


        const supportLinksContainer = el('div', {
            style: {
                marginTop: '20px',
                paddingTop: '15px',
                borderTop: '1px solid var(--SmartThemeBorderColor)',
                textAlign: 'center',
                color: 'var(--SmartThemeBodyColor)'
            }
        }, 'Feedback/support');

        const linksWrapper = el('div', {
            style: {
                display: 'flex',
                justifyContent: 'center',
                gap: '15px',
                marginTop: '10px',
                paddingBottom: '10px'
            }
        });

        const linkStyle = {
            display: 'inline-block',
            padding: '5px 15px',
            borderRadius: '4px',
            background: 'var(--SmartThemeChatTintColor)',
            border: '1px solid var(--SmartThemeBorderColor)',
            color: 'var(--SmartThemeLinkColor)',
            textDecoration: 'none',
            transition: 'background 150ms'
        };

        const discordLink = el('a', { href: 'https://discord.gg/2tJcWeMjFQ', target: '_blank', rel: 'noopener noreferrer', style: linkStyle }, 'Discord (IceFog\'s AI Brew Bar)');
        const patreonLink = el('a', { href: 'https://www.patreon.com/cw/IceFog72', target: '_blank', rel: 'noopener noreferrer', style: linkStyle }, 'Patreon');
        const kofiLink = el('a', { href: 'https://ko-fi.com/icefog72', target: '_blank', rel: 'noopener noreferrer', style: linkStyle }, 'Ko-fi');

        [discordLink, patreonLink, kofiLink].forEach(link => {
            link.addEventListener('mouseover', () => link.style.background = 'var(--SmartThemeShadowColor)');
            link.addEventListener('mouseout', () => link.style.background = 'var(--SmartThemeChatTintColor)');
        });

        linksWrapper.append(discordLink, patreonLink, kofiLink);
        supportLinksContainer.appendChild(linksWrapper);
        panel.appendChild(supportLinksContainer);


        window.addEventListener('ptmt:layoutChanged', () => this.renderUnifiedEditor());
        return panel;
    }

    renderUnifiedEditor() {
        let editorRoot = this.rootElement.querySelector('#ptmt-unified-editor');
        if (editorRoot) {
            editorRoot.innerHTML = '';
        } else {
            editorRoot = el('div', { id: 'ptmt-unified-editor' });
            this.rootElement.appendChild(editorRoot);
        }

        const refs = this.appApi._refs();
        const columns = [
            { name: 'left', title: 'Left Column', element: refs.leftBody },
            { name: 'center', title: 'Center Column', element: refs.centerBody },
            { name: 'right', title: 'Right Column', element: refs.rightBody },
        ];

        columns.forEach(col => {
            const isHidden = col.element.style.display === 'none';
            const isAlwaysVisible = col.name === 'left' || col.name === 'right';
            if (isAlwaysVisible || !isHidden) {
                editorRoot.appendChild(this.renderColumn(col.name, col.title, col.element, isHidden));
            }
        });

        // Add Hidden Tabs Section
        const hiddenSection = this.renderHiddenSection();
        if (hiddenSection) {
            editorRoot.appendChild(hiddenSection);
        }
    }

    renderHiddenSection() {
        const container = el('fieldset', { className: 'ptmt-editor-column ptmt-hidden-section' });
        const legend = el('legend', {}, 'Hidden Tabs (Not in Layout)');
        container.appendChild(legend);

        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container', style: { minHeight: '40px', display: 'flex', flexWrap: 'wrap', gap: '8px' } });
        tabsContainer.dataset.isHiddenList = 'true';

        const currentLayout = this.settings.get('savedLayout') || this.settings.get('defaultLayout');
        const hiddenTabs = currentLayout.hiddenTabs || [];

        if (hiddenTabs.length === 0) {
            const placeholder = el('div', { style: { opacity: '0.5', padding: '10px', fontSize: '0.9em' } }, 'Drag tabs here to hide them from the UI');
            tabsContainer.appendChild(placeholder);
        }

        hiddenTabs.forEach(entry => {
            tabsContainer.appendChild(this.renderHiddenTab(entry));
        });

        tabsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tabsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
        tabsContainer.addEventListener('drop', (e) => this.handleDrop(e));

        container.appendChild(tabsContainer);
        return container;
    }

    renderHiddenTab(entry) {
        const sourceId = typeof entry === 'string' ? entry : entry.sourceId;
        const isActive = typeof entry === 'object' ? entry.active : false;
        const isCollapsed = typeof entry === 'object' ? entry.collapsed : false;

        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
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

        container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        container.addEventListener('drop', (e) => this.handleDrop(e));

        return container;
    }

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
        const pendingTitle = el('div', { className: 'ptmt-editor-title', style: { marginTop: '10px', borderTop: '1px solid var(--SmartThemeShadowColor)', paddingTop: '8px' } }, el('span', {}, 'Pending Tabs'));
        pendingContainer.appendChild(pendingTitle);

        const pendingTree = this.renderPendingTreeElement(element.querySelector('.ptmt-pane, .ptmt-split'), name);
        if (pendingTree) pendingContainer.appendChild(pendingTree);

        container.appendChild(pendingContainer);


        return container;
    }

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
            // Legacy support
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
        tabsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tabsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
        tabsContainer.addEventListener('drop', (e) => this.handleDrop(e));

        const tabs = Array.from(element.querySelectorAll('.ptmt-tab'));
        tabs.forEach(tab => {
            tabsContainer.appendChild(this.renderTab(tab, element));
        });

        container.appendChild(tabsContainer);
        return container;
    }

    renderTab(tabElement, paneElement) {
        const pid = tabElement.dataset.for;
        const panel = this.appApi.getPanelById(pid);
        const sourceId = panel.dataset.sourceId;
        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};

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


                const mappings = settings.get('panelMappings').slice();
                const mapping = mappings.find(m => m.id === sourceId);

                if (mapping) {
                    mapping[prop] = newVal;
                    this.debouncedSettingsUpdate(mappings);
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


        container.addEventListener('dragstart', (e) => this.handleDragStart(e, pid));
        container.addEventListener('drop', (e) => this.handleDrop(e));

        return container;
    }

    renderPendingTreeElement(element, columnName) {
        if (!element || element.classList.contains('ptmt-resizer-vertical')) return null;

        if (element.classList.contains('ptmt-split')) {
            // Recurse into children but don't render the split container itself
            const childrenWrappers = Array.from(element.children).map(child => this.renderPendingTreeElement(child, columnName)).filter(Boolean);
            if (childrenWrappers.length === 0) return null;

            // Return a fragment-like container (div) to hold children
            const container = el('div', { className: 'ptmt-editor-pending-split-group' });
            childrenWrappers.forEach(w => container.appendChild(w));
            return container;
        }
        if (element.classList.contains('ptmt-pane')) {
            return this.renderPendingPane(element, columnName);
        }
        return null;
    }

    renderPendingPane(element, columnName) {
        const paneId = element.dataset.paneId;
        const container = el('div', { className: 'ptmt-editor-pane' });
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

        tabsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tabsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
        tabsContainer.addEventListener('drop', (e) => this.handleDrop(e));

        const currentLayout = this.settings.get('savedLayout') || this.settings.get('defaultLayout');
        const ghostTabs = currentLayout.columns[columnName]?.ghostTabs || [];

        // Identify if this is the first pane in the column to handle orphans
        const columnEl = element.closest('.ptmt-body-column');
        const firstPane = columnEl.querySelector('.ptmt-pane');
        const isFirstPane = element === firstPane;

        let filteredGhostTabs;
        if (isFirstPane) {
            // Include tabs explicitly mapped to this pane, tabs with no paneId, 
            // OR tabs whose paneId doesn't exist anywhere in this column's live structure.
            const allPaneIdsInColumn = new Set(Array.from(columnEl.querySelectorAll('.ptmt-pane')).map(p => p.dataset.paneId));
            filteredGhostTabs = ghostTabs.filter(t => (t.paneId === paneId) || (!t.paneId) || (!allPaneIdsInColumn.has(t.paneId)));
        } else {
            // Just the ones explicitly mapped to this pane
            filteredGhostTabs = ghostTabs.filter(t => t.paneId === paneId);
        }

        filteredGhostTabs.forEach(tabInfo => {
            tabsContainer.appendChild(this.renderPendingTab(tabInfo));
        });

        container.appendChild(tabsContainer);
        return container;
    }

    renderPendingTab(tabInfo) {
        const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass;
        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
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
        container.dataset.sourceId = sourceId; // Important for handleDragStart


        const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder or move' }, '☰');
        const iconSpan = el('span', { className: 'ptmt-tab-icon' }, icon);
        const titleSpan = el('span', { className: 'ptmt-tab-label' }, title);
        const idLabel = el('span', { className: 'ptmt-editor-id', title: identifier }, identifier);

        container.append(handle, iconSpan, titleSpan, idLabel);

        container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        container.addEventListener('drop', (e) => this.handleDrop(e));

        return container;
    }



    handleDragStart(e, pid) {
        e.stopPropagation();
        const draggedElement = e.target.closest('.ptmt-editor-tab');
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
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => draggedElement.classList.add('dragging'), 0);
    }

    handleDragOver(e) {
        e.preventDefault();
        const container = e.currentTarget;
        const isTargetPendingList = container.dataset.isPendingList === 'true';
        const isTargetHiddenList = container.dataset.isHiddenList === 'true';

        if (this.draggedTabInfo) {
            const isSettingsTab = this.draggedTabInfo.sourceId === 'ptmt-settings-wrapper-content';

            // PROTECTION: Don't allow dragging settings tab into hidden/pending sections
            if (isSettingsTab && (isTargetPendingList || isTargetHiddenList)) {
                e.dataTransfer.dropEffect = 'none';
                this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
                return;
            }

            // PROTECTION: Don't allow dragging settings tab into HIDDEN columns
            if (isSettingsTab) {
                const targetColumn = container.closest('.ptmt-editor-column');
                if (targetColumn && targetColumn.classList.contains('ptmt-editor-column-hidden')) {
                    e.dataTransfer.dropEffect = 'none';
                    this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
                    return;
                }
            }
        }

        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.ptmt-editor-tab');

        this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
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

    handleDragLeave(e) {
        setTimeout(() => {
            if (!this.rootElement.querySelector(':hover.ptmt-editor-tabs-container')) {
                this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
            }
        }, 100);
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        const indicator = this.rootElement.querySelector('.drop-indicator');

        if (!this.draggedTabInfo || !indicator) {
            indicator?.remove();
            return;
        }

        const targetContainer = indicator.parentElement;
        const isTargetPending = targetContainer.dataset.isPendingList === 'true';
        const isTargetHidden = targetContainer.dataset.isHiddenList === 'true';

        const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab'));
        let newIndex = children.indexOf(indicator);
        if (newIndex === -1) newIndex = children.length;

        indicator.remove();

        if (isTargetHidden) {
            this.handleHiddenTabDrop(targetContainer, newIndex);
        } else if (isTargetPending) {
            this.handlePendingTabDrop(targetContainer, newIndex);
        } else {
            this.handleLiveTabDrop(targetContainer, newIndex);
        }

        this.draggedTabInfo = null;
    }

    handleLiveTabDrop(targetContainer, newIndex) {
        const sourcePanel = this.appApi.getPanelById(this.draggedTabInfo.pid);
        const targetColumnEl = targetContainer.closest('.ptmt-editor-column');
        const targetPaneId = targetContainer.closest('.ptmt-editor-pane').dataset.paneId;
        const targetPane = document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`);

        if (sourcePanel && targetPane) {
            // PROTECTION: Don't allow dropping settings tab into hidden columns
            if (this.draggedTabInfo.sourceId === 'ptmt-settings-wrapper-content') {
                if (targetColumnEl && targetColumnEl.classList.contains('ptmt-editor-column-hidden')) {
                    alert("The Layout Settings tab cannot be moved to a hidden column.");
                    return;
                }
            }

            const wasActive = this.draggedTabInfo.isActive;
            const wasCollapsed = this.draggedTabInfo.isCollapsed;

            this.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);

            if (wasActive) {
                this.appApi.setActivePanelInPane(targetPane, this.draggedTabInfo.pid);
            } else if (wasCollapsed) {
                this.appApi.setTabCollapsed(this.draggedTabInfo.pid, true);
            }

            // Re-sync icon mode and layout
            this.appApi.checkPaneForIconMode(targetPane);
            window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));

        } else {
            console.warn("[PTMT] Could not execute live tab move: source or target not found.", { sourcePanel, targetPane });
        }
    }

    handlePendingTabDrop(targetContainer, newIndex) {
        const targetColumnName = targetContainer.dataset.columnName;
        const targetPaneId = targetContainer.dataset.paneId;
        const { sourceId, searchId, searchClass } = this.draggedTabInfo;

        // PROTECTION: Don't allow moving settings tab to pending
        if (sourceId === 'ptmt-settings-wrapper-content') {
            alert("The Layout Settings tab cannot be moved to pending or hidden lists.");
            return;
        }

        let liveSourceId = null;
        if (searchId) liveSourceId = `id:${searchId}`;
        else if (searchClass) liveSourceId = `class:${searchClass}`;

        if (liveSourceId) {
            const livePanel = getPanelBySourceId(liveSourceId);
            if (livePanel) {
                console.log(`[PTMT-LayoutEditor] A live tab for ${liveSourceId} was found. Destroying it before moving its pending counterpart.`);
                this.appApi.destroyTabById(livePanel.dataset.panelId);
            }
        }

        const layout = this.appApi.generateLayoutSnapshot();

        // 1. Determine the target identity
        const targetIdentifier = getTabIdentifier({ searchId, searchClass });
        if (!targetIdentifier) {
            console.warn('[PTMT] Cannot drop pending tab: no stable identifier (ID or Class) found.');
            return;
        }

        const matchPredicate = (t) => getTabIdentifier(t) === targetIdentifier;

        // 2. Find ORIGINAL tab info to preserve non-structural metadata (icon, title, sourceId)
        let originalTabInfo = null;
        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                const found = col.ghostTabs.find(matchPredicate);
                if (found) {
                    originalTabInfo = found;
                    break;
                }
            }
        }

        const newTabInfo = {
            ...(originalTabInfo || {}), // Preserve original fields
            searchId: searchId || originalTabInfo?.searchId || '',
            searchClass: searchClass || originalTabInfo?.searchClass || '',
            active: this.draggedTabInfo.isActive,
            collapsed: this.draggedTabInfo.isCollapsed,
            paneId: targetPaneId
        };

        // 3. CLEANUP: Remove ANY matching identifier from ALL columns to prevent clones
        for (const colName in layout.columns) {
            const col = layout.columns[colName];
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => !matchPredicate(t));
            }
        }

        // 4. Insert into target location
        if (!layout.columns[targetColumnName].ghostTabs) layout.columns[targetColumnName].ghostTabs = [];
        layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);

        // Remove from hidden tabs if it was there
        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter(id => {
                const sid = typeof id === 'string' ? id : (id.sourceId || id.searchId || id.panelId);
                return sid !== targetSid;
            });
        }

        this.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);

        this.settings.update({ savedLayout: layout });
        this.renderUnifiedEditor();
    }

    handleHiddenTabDrop(targetContainer, newIndex) {
        const { pid, sourceId, searchId, searchClass, isActive, isCollapsed } = this.draggedTabInfo;
        const effectiveSourceId = sourceId || searchId || searchClass;

        if (!effectiveSourceId) return;

        // PROTECTION: Don't allow hiding the settings tab
        if (effectiveSourceId === 'ptmt-settings-wrapper-content') {
            alert("The Layout Settings tab cannot be hidden. It must remain in one of the columns.");
            return;
        }

        const layout = this.appApi.generateLayoutSnapshot();
        if (!layout.hiddenTabs) layout.hiddenTabs = [];

        // Remove from current columns (pending lists)
        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => !((t.searchId || '') === (searchId || '') && (t.searchClass || '') === (searchClass || '')));
            }
        }

        // If it was a live tab, we need to destroy it in the UI
        if (pid) {
            this.appApi.destroyTabById(pid);
        }

        // Add to hidden tabs as an object to preserve state
        const hiddenInfo = {
            sourceId: effectiveSourceId,
            active: isActive,
            collapsed: isCollapsed
        };

        // Remove existing entry if it exists
        layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== effectiveSourceId);

        layout.hiddenTabs.splice(newIndex, 0, hiddenInfo);

        this.settings.update({ savedLayout: layout });
        this.renderUnifiedEditor();
    }
}
