// LayoutManager.js

import { settings } from './settings.js';
import { el, debounce, getPanelBySourceId } from './utils.js';

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
                el('p', { style: { margin: '0', opacity: '0.9' } }, 'To ensure compatibility, your custom layout may be automatically reset after major updates to the layout system.')
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
                marginTop: '10px'
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
            if (col.element.style.display !== 'none') {
                editorRoot.appendChild(this.renderColumn(col.name, col.title, col.element));
            }
        });
    }

    renderColumn(name, title, element) {
        const container = el('fieldset', { className: 'ptmt-editor-column', 'data-column-name': name });
        const legend = el('legend', {}, title);

        container.appendChild(legend);

        const tree = this.renderTreeElement(element.querySelector('.ptmt-pane, .ptmt-split'));
        if (tree) container.appendChild(tree);

        const pendingContainer = el('div', { className: 'ptmt-editor-pending' });
        const pendingTitle = el('div', { className: 'ptmt-editor-title', style: { marginTop: '10px', borderTop: '1px solid var(--SmartThemeShadowColor)', paddingTop: '8px' } }, el('span', {}, 'Pending Tabs'));
        const pendingTabsList = el('div', { className: 'ptmt-editor-tabs-container' });
        pendingTabsList.dataset.isPendingList = 'true';
        pendingTabsList.dataset.columnName = name;

        const currentLayout = this.settings.get('savedLayout') || this.settings.get('defaultLayout');
        const ghostTabs = currentLayout.columns[name]?.ghostTabs || [];

        ghostTabs.forEach(tabInfo => {
            pendingTabsList.appendChild(this.renderPendingTab(tabInfo));
        });

        pendingTabsList.addEventListener('dragover', this.handleDragOver.bind(this));
        pendingTabsList.addEventListener('dragleave', this.handleDragLeave.bind(this));
        pendingTabsList.addEventListener('drop', (e) => this.handleDrop(e));

        pendingContainer.append(pendingTitle, pendingTabsList);
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
        const orientation = element.classList.contains('horizontal') ? 'Horizontal' : 'Vertical';
        const container = el('div', { className: 'ptmt-editor-split' });
        const titleDiv = el('div', { className: 'ptmt-editor-title' });
        const titleSpan = el('span', {}, `Split (${orientation})`);

        const orientationSelect = el('select', { title: 'Set split orientation' });
        ['vertical', 'horizontal'].forEach(o => {
            const opt = el('option', { value: o, selected: o.toLowerCase() === orientation.toLowerCase() }, o.charAt(0).toUpperCase() + o.slice(1));
            orientationSelect.appendChild(opt);
        });


        orientationSelect.addEventListener('change', (e) => {
            const newOrientation = e.target.value;
            this.appApi.setSplitOrientation(element, newOrientation);
        });


        titleDiv.append(titleSpan, orientationSelect);
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
        const settingsBtn = el('button', {
            className: 'ptmt-pane-config-btn',
            title: 'Configure this pane (size, flow, etc.)',
        }, '⚙');

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.appApi.openViewSettingsDialog(element);
        });

        titleDiv.append(titleSpan, settingsBtn);
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
        });

        const handle = el('span', { className: 'ptmt-drag-handle', title: 'Drag to reorder' }, '☰');
        const iconInput = el('input', { type: 'text', value: mapping.icon || '', placeholder: 'Icon', 'data-prop': 'icon' });
        const titleInput = el('input', { type: 'text', value: tabElement.querySelector('.ptmt-tab-label').textContent, placeholder: 'Title', 'data-prop': 'title' });
        const idLabel = el('span', { className: 'ptmt-editor-id', title: sourceId }, sourceId?.substring(0, 15) + '...' || 'N/A');


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

    renderPendingTab(tabInfo) {
        const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass;
        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
        const title = mapping.title || sourceId || tabInfo.searchClass;
        const icon = mapping.icon || '👻';

        const identifier = tabInfo.searchId ? `ID: ${tabInfo.searchId}` : `Class: ${tabInfo.searchClass}`;

        const container = el('div', {
            className: 'ptmt-editor-tab',
            draggable: 'true',
            'data-is-pending': 'true'
        });
        container.dataset.searchId = tabInfo.searchId || '';
        container.dataset.searchClass = tabInfo.searchClass || '';


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
            isPending: draggedElement.dataset.isPending === 'true'
        };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => draggedElement.classList.add('dragging'), 0);
    }

    handleDragOver(e) {
        e.preventDefault();
        const container = e.currentTarget;
        const isTargetPendingList = container.dataset.isPendingList === 'true';

        if (this.draggedTabInfo) {
            const isSourcePending = this.draggedTabInfo.isPending;
            if (isSourcePending !== isTargetPendingList) {
                e.dataTransfer.dropEffect = 'none';
                this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
                return;
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

        const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab'));
        let newIndex = children.indexOf(indicator);
        if (newIndex === -1) newIndex = children.length;

        indicator.remove();

        if (isTargetPending) {
            this.handlePendingTabDrop(targetContainer, newIndex);
        } else {
            this.handleLiveTabDrop(targetContainer, newIndex);
        }

        this.draggedTabInfo = null;
    }

    handleLiveTabDrop(targetContainer, newIndex) {
        const sourcePanel = this.appApi.getPanelById(this.draggedTabInfo.pid);
        const targetPaneId = targetContainer.closest('.ptmt-editor-pane').dataset.paneId;
        const targetPane = document.querySelector(`.ptmt-pane[data-pane-id="${targetPaneId}"]`);

        if (sourcePanel && targetPane) {
            this.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);
        } else {
            console.warn("[PTMT] Could not execute live tab move: source or target not found.", { sourcePanel, targetPane });
        }
    }

    handlePendingTabDrop(targetContainer, newIndex) {
        const targetColumnName = targetContainer.closest('.ptmt-editor-column').dataset.columnName;
        const { sourceId, searchId, searchClass } = this.draggedTabInfo;

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

        const newTabInfo = { searchId: searchId || sourceId || '', searchClass: searchClass || '' };

        for (const col of Object.values(layout.columns)) {
            if (col.ghostTabs) {
                col.ghostTabs = col.ghostTabs.filter(t => !((t.searchId === newTabInfo.searchId && t.searchClass === newTabInfo.searchClass)));
            }
        }

        layout.columns[targetColumnName].ghostTabs.splice(newIndex, 0, newTabInfo);

        this.appApi.updatePendingTabColumn(newTabInfo, targetColumnName);

        this.settings.update({ savedLayout: layout });
        this.renderUnifiedEditor();
    }
}