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
        this.touchDragGhost = null;
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

        const isMobile = settings.get('isMobile');
        const mobileToggleBtn = el('button', {
            class: "menu_button menu_button_icon interactable ptmt-mobile-button",
            title: isMobile ? "Switch to Desktop Layout (Reloads page)" : "Switch to Mobile Layout (Reloads page)",
            tabindex: "0",
            role: "button"
        }, isMobile ? 'Switch to Desktop Layout' : 'Switch to Mobile Layout');

        mobileToggleBtn.addEventListener('click', () => this.appApi.toggleMobileMode());
        globalSettings.append(mobileToggleBtn);

        const resetBtn = el('button', {
            class: "menu_button menu_button_icon interactable ptmt-reset-button",
            title: "Reset all layout settings and reload the UI",
            tabindex: "0",
            role: "button"
        }, 'Reset Layout to Default');

        resetBtn.addEventListener('click', () => this.appApi.resetLayout());

        globalSettings.append(resetBtn);

        panel.append(globalSettings);

        this.renderUnifiedEditor();

        const disclaimerContainer = el('div', {
            style: {
                marginTop: '10px',
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
            const isHidden = col.element?.style.display === 'none';
            const isAlwaysVisible = col.name === 'left' || col.name === 'right';
            if (isAlwaysVisible || !isHidden) {
                editorRoot.appendChild(this.renderColumn(col.name, col.title, col.element, isHidden));
            }
        });

        // Add Hidden Tabs as 4th Column
        editorRoot.appendChild(this.renderHiddenColumn());
    }

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

        // Re-attach listeners to the tabs container for dropping
        tabsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tabsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
        tabsContainer.addEventListener('drop', (e) => this.handleDrop(e));

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

        container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

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
        const pendingTitle = el('div', { className: 'ptmt-editor-title', style: { paddingTop: '8px' } }, el('span', {}, 'Pending Tabs'));
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
        // MOVED listeners to parent container

        const tabs = Array.from(element.querySelectorAll('.ptmt-tab'));
        tabs.forEach(tab => {
            tabsContainer.appendChild(this.renderTab(tab, element));
        });

        container.appendChild(tabsContainer);

        // Attach listeners to the WHOLE pane container so dropping anywhere on the pane works
        container.addEventListener('dragover', this.handleDragOver.bind(this));
        container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        container.addEventListener('drop', (e) => this.handleDrop(e));

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

        container.addEventListener('touchstart', (e) => this.handleTouchStart(e, pid), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

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

        // MOVED listeners to parent container

        const currentLayout = this.settings.getActiveLayout();
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

        // Attach listeners to the WHOLE pane container for easier dropping
        container.addEventListener('dragover', this.handleDragOver.bind(this));
        container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        container.addEventListener('drop', (e) => this.handleDrop(e));

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

        container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

        return container;
    }



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

    handleDragOver(e) {
        e.preventDefault();
        let container = e.currentTarget;

        // If checking a pane wrapper, redirect to its inner tabs container
        if (container.classList.contains('ptmt-editor-pane')) {
            const inner = container.querySelector('.ptmt-editor-tabs-container');
            if (inner) container = inner;
        }

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
            // Allow hovering over panes as well as the tabs container directly
            const isHoveringValidTarget = this.rootElement.querySelector(':hover.ptmt-editor-tabs-container') || this.rootElement.querySelector(':hover.ptmt-editor-pane');
            if (!isHoveringValidTarget) {
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
        if (!targetContainer) {
            indicator.remove();
            return;
        }

        const isTargetPending = targetContainer.dataset.isPendingList === 'true' || !!targetContainer.closest('.ptmt-pending-pane');
        const isTargetHidden = targetContainer.dataset.isHiddenList === 'true' || !!targetContainer.closest('.ptmt-hidden-pane');

        // FIX: Include indicator in the filter to get the correct index
        const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab') || c === indicator);
        let newIndex = children.indexOf(indicator);
        if (newIndex === -1) newIndex = children.length;

        indicator.remove();

        // Routing based on Source AND Target
        const info = this.draggedTabInfo;

        if (isTargetHidden) {
            this.handleHiddenTabDrop(targetContainer, newIndex);
        } else if (isTargetPending) {
            this.handlePendingTabDrop(targetContainer, newIndex);
        } else {
            // Target is a LIVE Pane
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

    handleLiveToLiveDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const sourcePanel = this.appApi.getPanelById(info.pid);
        const targetColumnEl = targetContainer.closest('.ptmt-editor-column');
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;

        if (sourcePanel && targetPane) {
            // PROTECTION: Don't allow dropping settings tab into hidden columns
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

            // Re-sync icon mode and layout
            this.appApi.checkPaneForIconMode(targetPane);
            window.dispatchEvent(new CustomEvent('ptmt:layoutChanged'));

        } else {
            console.warn("[PTMT] Could not execute live tab move: source panel or target pane not found.", { sourcePanel, targetPane });
        }
    }

    handleRestoreHiddenToLive(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;
        const sourceId = info.sourceId;

        if (!targetPane || !sourceId) return;

        console.log(`[PTMT-LayoutEditor] Restoring hidden tab ${sourceId} to live pane ${targetPaneId}.`);

        // 1. Re-create the tab live. createTabFromContent will handle re-ordering via moveTabIntoPaneAtIndex if it already exists, 
        // but here it definitely doesn't exist live because it was hidden.
        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
        const panel = this.appApi.createTabFromContent(sourceId, {
            title: mapping.title,
            icon: mapping.icon,
            makeActive: info.isActive,
            collapsed: info.isCollapsed
        }, targetPane);

        if (panel) {
            // 2. Adjust index because createTabFromContent normally appends.
            this.appApi.moveTabIntoPaneAtIndex(panel, targetPane, newIndex);
        }

        // 3. Cleanup snapshot
        const layout = this.appApi.generateLayoutSnapshot();
        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== sourceId);
        }
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });

        // 4. Refresh
        this.renderUnifiedEditor();
    }

    handleRestorePendingToLive(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetColumnName = targetContainer.dataset.columnName || targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId || targetContainer.dataset.paneId;
        const targetPane = targetPaneId ? document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`) : null;
        const { searchId, searchClass, sourceId } = info;

        if (!targetPane) return;

        // Try to find content in DOM
        let foundElement = null;
        if (searchId) {
            foundElement = document.getElementById(searchId);
        } else if (searchClass) {
            // This is a bit simplified, but similar to pending-tabs.js logic
            foundElement = document.querySelector(`.${CSS.escape(searchClass)}`);
        }

        if (foundElement) {
            console.log(`[PTMT-LayoutEditor] Hydrating pending tab ${sourceId} into live pane ${targetPaneId}.`);
            const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
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

            // Cleanup ghost tabs from snapshot
            const layout = this.appApi.generateLayoutSnapshot();
            for (const col of Object.values(layout.columns)) {
                if (col.ghostTabs) {
                    col.ghostTabs = col.ghostTabs.filter(t => (t.searchId !== searchId || !searchId) && (t.searchClass !== searchClass || !searchClass));
                }
            }
            this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        } else {
            console.log(`[PTMT-LayoutEditor] Moving pending tab ${sourceId} to new live pane ${targetPaneId} (still pending).`);
            // Update the ghost tab's assignment in the snapshot
            const layout = this.appApi.generateLayoutSnapshot();
            const identifier = getTabIdentifier({ searchId, searchClass });

            let pendingInfo = null;
            // 1. Remove from all columns
            for (const colName in layout.columns) {
                const col = layout.columns[colName];
                if (col.ghostTabs) {
                    const idx = col.ghostTabs.findIndex(t => getTabIdentifier(t) === identifier);
                    if (idx !== -1) {
                        pendingInfo = col.ghostTabs.splice(idx, 1)[0];
                    }
                }
            }

            // 2. Add to target column at new index
            if (pendingInfo) {
                pendingInfo.paneId = targetPaneId;
                pendingInfo.active = info.isActive;
                pendingInfo.collapsed = info.isCollapsed;
                if (!layout.columns[targetColumnName].ghostTabs) layout.columns[targetColumnName].ghostTabs = [];
                layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, pendingInfo);
            }

            this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        }

        this.renderUnifiedEditor();
    }

    handlePendingTabDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetColumnName = targetContainer.dataset.columnName || targetContainer.closest('.ptmt-editor-column')?.dataset.columnName;
        const targetPaneId = targetContainer.dataset.paneId || targetContainer.closest('.ptmt-editor-pane')?.dataset.paneId;
        const { sourceId, searchId, searchClass } = info;

        console.log('[PTMT-LayoutEditor] handlePendingTabDrop called', { targetColumnName, targetPaneId, info, newIndex });

        if (!targetColumnName) {
            console.error('[PTMT] Cannot drop: target column name not found', targetContainer);
            return;
        }

        // PROTECTION: Don't allow moving settings tab to pending
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

        // 1. Find ORIGINAL tab info to preserve non-structural metadata (icon, title, sourceId)
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
            ...(originalTabInfo || {}), // Preserve original fields
            searchId: searchId || originalTabInfo?.searchId || '',
            searchClass: searchClass || originalTabInfo?.searchClass || '',
            active: info.isActive,
            collapsed: info.isCollapsed,
            paneId: targetPaneId
        };

        // 2. CLEANUP: Remove ANY matching identifier from ALL columns to prevent clones
        for (const colName in layout.columns) {
            const col = layout.columns[colName];
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => getTabIdentifier(t) !== identifier);
            }
        }

        // 3. Insert into target location
        if (!layout.columns[targetColumnName]) {
            console.error(`[PTMT] Column '${targetColumnName}' not found in layout`, layout.columns);
            return;
        }
        if (!layout.columns[targetColumnName].ghostTabs) layout.columns[targetColumnName].ghostTabs = [];
        layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);

        // Remove from hidden tabs if it was there (regular tabs that were hidden can't become pending, 
        // but if someone manually messes with settings, we should be safe)
        if (layout.hiddenTabs) {
            layout.hiddenTabs = layout.hiddenTabs.filter(id => {
                const sid = typeof id === 'string' ? id : (id.sourceId || id.searchId || id.panelId);
                return sid !== (sourceId || searchId || searchClass);
            });
        }

        this.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);

        console.log('[PTMT-LayoutEditor] Pending tab moved to', targetColumnName, 'at index', newIndex);
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        this.renderUnifiedEditor();
    }

    handleHiddenTabDrop(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const { pid, sourceId, searchId, searchClass, isActive, isCollapsed } = info;
        const effectiveSourceId = sourceId || searchId || searchClass;

        if (!effectiveSourceId) return;

        // PROTECTION: Don't allow hiding the settings tab
        if (effectiveSourceId === 'ptmt-settings-wrapper-content') {
            alert("The Layout Settings tab cannot be hidden. It must remain in one of the columns.");
            return;
        }

        // PROTECTION: Only allow regular tabs (those with sourceId) or already-hidden tabs
        if (!sourceId && !info.isHidden) {
            alert("Only regular tabs can be moved to the Hidden Tabs column.");
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

        // If it was a live tab, we need to park its content in the staging area and destroy the wrappers
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

        // Add to hidden tabs as an object to preserve state
        const hiddenInfo = {
            sourceId: effectiveSourceId,
            active: isActive,
            collapsed: isCollapsed
        };

        // Remove existing entry if it exists
        layout.hiddenTabs = layout.hiddenTabs.filter(h => (typeof h === 'string' ? h : h.sourceId) !== effectiveSourceId);

        layout.hiddenTabs.splice(newIndex, 0, hiddenInfo);

        console.log(`[PTMT-LayoutEditor] Tab ${effectiveSourceId} moved to hidden tabs at index ${newIndex}`);
        this.settings.update({ [this.settings.getActiveLayoutKey()]: layout });
        this.renderUnifiedEditor();
    }

    handleTouchStart(e, pid) {
        // Only allow dragging via the handle on touch devices to prevent scrolling issues
        const handle = e.target.closest('.ptmt-drag-handle');
        if (!handle) return;

        const tab = e.currentTarget;
        if (!tab) return;

        // DO NOT preventDefault here, as it blocks mousedown -> dragstart on hybrid devices.
        // touch-action: none on the handle already prevents scrolling.
        e.stopPropagation();

        if (this.touchDragGhost) return; // Already dragging

        this.handleDragStart(e, pid);
        tab.classList.add('dragging');

        this.touchDragGhost = tab.cloneNode(true);
        const rect = tab.getBoundingClientRect();
        Object.assign(this.touchDragGhost.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '30000',
            opacity: '0.8',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: '0',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
            transform: 'scale(1.05)',
            transition: 'none'
        });
        document.body.appendChild(this.touchDragGhost);
    }

    handleTouchMove(e) {
        if (!this.touchDragGhost) return;

        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];

        // Update ghost position
        this.touchDragGhost.style.left = `${touch.clientX - this.touchDragGhost.offsetWidth / 2}px`;
        this.touchDragGhost.style.top = `${touch.clientY - this.touchDragGhost.offsetHeight / 2}px`;

        // Find element under touch
        const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!elUnder) return;

        const targetPane = elUnder.closest('.ptmt-editor-pane') || elUnder.closest('.ptmt-editor-tabs-container');
        if (targetPane) {
            // Simulate dragover logic
            const fakeEvent = {
                preventDefault: () => { },
                currentTarget: targetPane,
                target: elUnder,
                clientY: touch.clientY,
                dataTransfer: { dropEffect: 'none' }
            };
            this.handleDragOver(fakeEvent);
        } else {
            this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
        }
    }

    handleTouchEnd(e) {
        if (this.touchDragGhost) {
            if (e.cancelable) e.preventDefault();

            const indicator = this.rootElement.querySelector('.drop-indicator');
            if (indicator) {
                const fakeEvent = {
                    preventDefault: () => { },
                    stopPropagation: () => { },
                    target: indicator // Not strictly used for targetContainer but for clarity
                };
                this.handleDrop(fakeEvent);
            }

            this.touchDragGhost.remove();
            this.touchDragGhost = null;
            this.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
        }
    }
}
