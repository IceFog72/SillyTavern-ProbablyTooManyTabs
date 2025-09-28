
// LayoutManager.js';

import { settings } from './settings.js';
import { el } from './utils.js';

export class LayoutManager {
    constructor(appApi, settings) { 
        this.appApi = appApi;
        this.settings = settings;
        this.rootElement = null;
        this.draggedTabInfo = null;
    }

    createSettingsPanel() {
        const panel = el('div', { className: 'sftnt-settings-panel' });
        this.rootElement = panel;

        const globalSettings = el('fieldset', {}, el('legend', {}, 'Global Layout'));



        const createSettingCheckbox = (labelText, settingKey) => {
            const id = `sftnt-global-${settingKey}`;
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
            createSettingCheckbox('Show Icons Only (Global)', 'showIconsOnly') // <-- ADD THIS LINE
        );



        const resetBtn = el('button',
            {
                style: { marginTop: '10px', cursor: 'pointer' },
                title: 'Reset all layout settings and reload the UI'
            },
            'Reset Layout to Default'
        );
        resetBtn.addEventListener('click', () => {
            this.appApi.resetLayout();
        });

        globalSettings.append(resetBtn);

        panel.append(globalSettings);

        this.renderUnifiedEditor();

        window.addEventListener('sftnt:layoutChanged', () => this.renderUnifiedEditor());
        return panel;
    }

    renderUnifiedEditor() {
        let editorRoot = this.rootElement.querySelector('#sftnt-unified-editor');
        if (editorRoot) {
            editorRoot.innerHTML = '';
        } else {
            editorRoot = el('div', { id: 'sftnt-unified-editor' });
            this.rootElement.appendChild(editorRoot);
        }

        const refs = this.appApi._refs();
        const columns = [
            { name: 'left', title: 'Left Pane', element: refs.leftBody },
            { name: 'center', title: 'Center Pane', element: refs.centerBody },
            { name: 'right', title: 'Right Pane', element: refs.rightBody },
        ];

        columns.forEach(col => {
            if (col.element.style.display !== 'none') {
                editorRoot.appendChild(this.renderColumn(col.name, col.title, col.element));
            }
        });
    }

    renderColumn(name, title, element) {
        const container = el('fieldset', { className: 'sftnt-editor-column' });
        const legend = el('legend', {}, title);

        container.appendChild(legend);

        const tree = this.renderTreeElement(element.querySelector('.sftnt-pane, .sftnt-split'));
        if (tree) container.appendChild(tree);

        return container;
    }

    renderTreeElement(element) {
        if (!element || element.classList.contains('sftnt-resizer-vertical')) return null;

        if (element.classList.contains('sftnt-split')) {
            return this.renderSplit(element);
        }
        if (element.classList.contains('sftnt-pane')) {
            return this.renderPane(element);
        }
        return null;
    }


    renderSplit(element) {
        const orientation = element.classList.contains('horizontal') ? 'Horizontal' : 'Vertical';
        const container = el('div', { className: 'sftnt-editor-split' });
        const titleDiv = el('div', { className: 'sftnt-editor-title' });
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

        const childrenWrapper = el('div', { className: 'sftnt-editor-children' });
        Array.from(element.children).forEach(child => {
            const childTree = this.renderTreeElement(child);
            if (childTree) childrenWrapper.appendChild(childTree);
        });
        container.appendChild(childrenWrapper);
        return container;
    }

    renderPane(element) {
        const container = el('div', { className: 'sftnt-editor-pane' });


        const titleDiv = el('div', { className: 'sftnt-editor-title' });
        const titleSpan = el('span', {}, 'Pane');
        const settingsBtn = el('button', {
            className: 'sftnt-pane-config-btn',
            title: 'Configure this pane (size, flow, etc.)',
        }, '⚙');

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.appApi.openViewSettingsDialog(element);
        });

        titleDiv.append(titleSpan, settingsBtn);
        container.appendChild(titleDiv);


        const tabsContainer = el('div', { className: 'sftnt-editor-tabs-container' });
        tabsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tabsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
        tabsContainer.addEventListener('drop', (e) => this.handleDrop(e, element, null));

        const tabs = Array.from(element.querySelectorAll('.sftnt-tab'));
        tabs.forEach(tab => {
            tabsContainer.appendChild(this.renderTab(tab, element));
        });

        container.appendChild(tabsContainer);
        return container;
    }

    renderTab(tabElement, paneElement) {
        const pid = tabElement.dataset.for;
        const panel = this.appApi.getPanelById(pid);
        const mapping = settings.get('panelMappings').find(m => m.id === panel.dataset.sourceId) || {};

        const container = el('div', {
            className: 'sftnt-editor-tab',
            draggable: 'true',
            'data-pid': pid,
        });

        const handle = el('span', { className: 'sftnt-drag-handle', title: 'Drag to reorder' }, '☰');
        const iconInput = el('input', { type: 'text', value: mapping.icon || '', placeholder: 'Icon', 'data-prop': 'icon' });
        const titleInput = el('input', { type: 'text', value: tabElement.querySelector('.sftnt-tab-label').textContent, placeholder: 'Title', 'data-prop': 'title' });
        const idLabel = el('span', { className: 'sftnt-editor-id', title: panel.dataset.sourceId }, panel.dataset.sourceId?.substring(0, 15) + '...' || 'N/A');


        container.append(handle, iconInput, titleInput, idLabel);


        [iconInput, titleInput].forEach(input => {
            input.addEventListener('input', () => {
                const prop = input.dataset.prop;
                const newVal = input.value.trim();


                const mappings = settings.get('panelMappings').slice();
                const mapping = mappings.find(m => m.id === panel.dataset.sourceId);

                if (mapping) {

                    mapping[prop] = newVal;


                    settings.update({ panelMappings: mappings });
                }

                if (prop === 'title') {
                    tabElement.querySelector('.sftnt-tab-label').textContent = newVal || panel.dataset.sourceId;
                }
                if (prop === 'icon') {
                    tabElement.querySelector('.sftnt-tab-icon').textContent = newVal || '';
                }
            });
        });


        container.addEventListener('dragstart', (e) => this.handleDragStart(e, pid, paneElement));
        container.addEventListener('drop', (e) => this.handleDrop(e, paneElement, pid));

        return container;
    }



    handleDragStart(e, pid, paneElement) {
        e.stopPropagation();
        this.draggedTabInfo = { pid, sourcePane: paneElement };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => e.target.classList.add('dragging'), 0);
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const container = e.currentTarget;
        const target = e.target.closest('.sftnt-editor-tab');

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
            if (!this.rootElement.querySelector(':hover.sftnt-editor-tabs-container')) {
                this.rootElement.querySelectorAll('.drop-indicator').forEach(i => i.remove());
            }
        }, 100);
    }

    handleDrop(e, targetPane, targetPid) {
        e.preventDefault();
        e.stopPropagation();
        this.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        const indicator = this.rootElement.querySelector('.drop-indicator');

        if (!this.draggedTabInfo || !indicator) {
            indicator?.remove();
            return;
        }

        const { pid: sourcePid } = this.draggedTabInfo;
        const sourcePanel = this.appApi.getPanelById(sourcePid);
        if (!sourcePanel) {
            indicator.remove();
            return;
        }

        const siblings = Array.from(indicator.parentElement.children);
        const newIndex = siblings.indexOf(indicator);

        indicator.remove();

        this.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);

        this.draggedTabInfo = null;

    }
}