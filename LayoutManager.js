import { settings } from './settings.js';
import { el, debounce, getPanelBySourceId, createIconElement, clearDropIndicators } from './utils.js';
import { showFontAwesomePicker } from '../../../utils.js';
import { getTabIdentifier } from './pending-tabs.js';
import { SELECTORS, EVENTS, LAYOUT } from './constants.js';


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
        this._layoutChangeHandler = null;
        this.indicator = el('div', { className: SELECTORS.DROP_INDICATOR_CLASS.substring(1) });


        this._openSettingsHandler = (e) => {
            const { sourceId, tabElement, tabRow } = e.detail;
            this.openTabSettingsDialog(sourceId, tabElement, tabRow, false);
        };
        window.addEventListener(EVENTS.OPEN_TAB_SETTINGS, this._openSettingsHandler);

    }

    async pickIcon(btn, sourceId, tabElement) {
        const mapping = settings.get('panelMappings').find(m => m.id === sourceId) || {};
        const currentIcon = mapping.icon || '';

        const selectedIcon = await showFontAwesomePicker();
        if (selectedIcon) {
            this.updateIconBtn(btn, selectedIcon);
            this.saveIconToMapping(sourceId, tabElement, selectedIcon);
        }
    }

    updateIconBtn(btn, iconName) {
        if (!btn) return;
        if (iconName.startsWith('fa-')) {
            btn.innerHTML = `<i class="fa-solid ${iconName}"></i>`;
        } else {
            btn.textContent = iconName || '';
        }
    }

    saveIconToMapping(sourceId, tabElement, iconName) {
        const mappings = settings.get('panelMappings').slice();
        const mapping = mappings.find(m => m.id === sourceId);
        if (mapping) {
            mapping.icon = iconName;
            this.debouncedSettingsUpdate(mappings);
        }
        if (tabElement) {
            let iconEl = tabElement.querySelector(SELECTORS.TAB_ICON);

            if (iconName) {
                if (!iconEl) {
                    iconEl = createIconElement(iconName);
                    if (iconEl) tabElement.prepend(iconEl);
                } else {
                    iconEl.className = SELECTORS.TAB_ICON.substring(1);

                    if (iconName.startsWith('fa-')) {
                        iconEl.classList.add('fa-solid', iconName);
                        iconEl.textContent = '';
                    } else {
                        iconEl.textContent = iconName;
                    }
                }
            } else if (iconEl) {
                iconEl.remove();
            }
        }

        // Also update any icon picker buttons in the editor UI for this sourceId
        if (this.rootElement) {
            const editorBtns = this.rootElement.querySelectorAll(`${SELECTORS.EDITOR_TAB}[data-source-id="${sourceId}"] ${SELECTORS.ICON_PICKER_BTN}`);
            editorBtns.forEach(btn => this.updateIconBtn(btn, iconName));
        }

    }

    // --- Helper Methods for Event Listener Consolidation ---

    attachTouchDragListeners(container, pid = null) {
        // Attach touch event listeners for drag-and-drop functionality
        container.addEventListener('touchstart', (e) => this.handleTouchStart(e, pid), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
    }

    attachDragListeners(container) {
        // Attach drag event listeners for drag-and-drop functionality
        container.addEventListener('dragover', this.handleDragOver.bind(this));
        container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        container.addEventListener('drop', (e) => this.handleDrop(e));
    }

    attachSettingsButtonListener(button, sourceId, tabElement, container, isHidden = false) {
        // Attach click listener to settings button
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTabSettingsDialog(sourceId, tabElement, container, isHidden);
        });
    }

    createSettingsPanel() {
        const panel = el('div', { className: 'ptmt-settings-panel' });
        this.rootElement = panel;

        const topSection = el('div', { className: 'ptmt-settings-top-section' });
        const globalSettings = el('fieldset', { className: 'ptmt-settings-fieldset' }, el('legend', {}, 'Global Layout'));



        const createSettingCheckbox = (labelText, settingKey) => {
            const id = `ptmt-global-${settingKey}`;
            const wrapper = el('div', { className: 'ptmt-setting-row' });
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

        const optimizeVisibilityCheckbox = createSettingCheckbox('Optimize Performance with Long Chat (Disables text-wrapping around avatars in Chrome)', 'optimizeMessageVisibility');
        optimizeVisibilityCheckbox.classList.add('ptmt-setting-sub-item');
        optimizeVisibilityCheckbox.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
        optimizeVisibilityCheckbox.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';

        const autoContrastCheckbox = createSettingCheckbox('Auto Contrast (Adaptive Text Colors)', 'enableAutoContrast');
        autoContrastCheckbox.classList.add('ptmt-setting-sub-item');
        autoContrastCheckbox.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
        autoContrastCheckbox.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';

        const overridesCheckbox = createSettingCheckbox('Extension CSS Overrides', 'enableOverride1');
        const overridesInput = overridesCheckbox.querySelector('input');
        overridesInput.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            optimizeVisibilityCheckbox.style.opacity = enabled ? '1' : '0.5';
            optimizeVisibilityCheckbox.style.pointerEvents = enabled ? 'auto' : 'none';
            autoContrastCheckbox.style.opacity = enabled ? '1' : '0.5';
            autoContrastCheckbox.style.pointerEvents = enabled ? 'auto' : 'none';
        });

        globalSettings.append(
            createSettingCheckbox('Show Left Column', 'showLeftPane'),
            createSettingCheckbox('Show Right Column', 'showRightPane'),
            createSettingCheckbox('Auto-Open First Center Tab', 'autoOpenFirstCenterTab'),
            createSettingCheckbox('Show Icons Only (Global)', 'showIconsOnly'),
            createSettingCheckbox('Show Context Size Status Bar', 'showContextStatusBar'),
            createSettingCheckbox('Sync Avatar with Expression', 'enableAvatarExpressionSync'),
            overridesCheckbox,
            autoContrastCheckbox,
            optimizeVisibilityCheckbox,
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

        const colorizerSettings = this.createDialogueColorizerSettings();
        colorizerSettings.className = 'ptmt-settings-fieldset';
        topSection.append(globalSettings, colorizerSettings);
        panel.append(topSection);

        this.renderUnifiedEditor();

        const disclaimerContainer = el('div', { className: 'ptmt-disclaimer-container' },
            el('span', { className: 'ptmt-disclaimer-icon' }, '⚠️'),
            el('div', { className: 'ptmt-disclaimer-content' },
                el('strong', {}, 'Please Note:'),
                el('p', {}, 'To ensure compatibility, your custom layout may be automatically reset after major updates to the layout system.'),
                el('p', {}, 'If you install a supported extension and its tab does not appear, you may need to reset the layout for it to be added.'),
                el('p', {}, 'Pending Tabs lists extensions or panels available for columns that are not currently in active layout.'),
                el('p', {}, 'For additional extension tab requests, reach out to me on Discord.'),
                el('p', {}, 'Resizing the navigation panel with character cards may lag on Chrome-based browsers. -> Use Hide some content on resize (for Chrome users) toggle.')
            )
        );
        panel.appendChild(disclaimerContainer);



        const supportLinksContainer = el('div', { className: 'ptmt-support-footer' }, 'Feedback/support');

        const linksWrapper = el('div', { className: 'ptmt-support-links' });

        const discordLink = el('a', { href: 'https://discord.gg/2tJcWeMjFQ', target: '_blank', rel: 'noopener noreferrer', className: 'ptmt-support-link' }, 'Discord (IceFog\'s AI Brew Bar)');
        const patreonLink = el('a', { href: 'https://www.patreon.com/cw/IceFog72', target: '_blank', rel: 'noopener noreferrer', className: 'ptmt-support-link' }, 'Patreon');
        const kofiLink = el('a', { href: 'https://ko-fi.com/icefog72', target: '_blank', rel: 'noopener noreferrer', className: 'ptmt-support-link' }, 'Ko-fi');

        linksWrapper.append(discordLink, patreonLink, kofiLink);
        supportLinksContainer.appendChild(linksWrapper);
        panel.appendChild(supportLinksContainer);




        // Avoid duplicate event listeners - remove old one if exists
        if (this._layoutChangeHandler) {
            window.removeEventListener(EVENTS.LAYOUT_CHANGED, this._layoutChangeHandler);
        }
        this._layoutChangeHandler = () => this.renderUnifiedEditor();
        window.addEventListener(EVENTS.LAYOUT_CHANGED, this._layoutChangeHandler);

        return panel;
    }

    renderUnifiedEditor() {
        let editorRoot = this.rootElement.querySelector(SELECTORS.UNIFIED_EDITOR);
        if (editorRoot) {
            editorRoot.innerHTML = '';
        } else {
            editorRoot = el('div', { id: SELECTORS.UNIFIED_EDITOR.substring(1) });
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

        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
        tabsContainer.dataset.isHiddenList = 'true';

        const currentLayout = this.settings.getActiveLayout();
        const hiddenTabs = currentLayout.hiddenTabs || [];

        if (hiddenTabs.length === 0) {
            const placeholder = el('div', { className: 'ptmt-editor-tabs-container-placeholder' }, 'Drag tabs here to hide');
            tabsContainer.appendChild(placeholder);
        }

        hiddenTabs.forEach(entry => {
            tabsContainer.appendChild(this.renderHiddenTab(entry));
        });

        pane.appendChild(tabsContainer);
        container.appendChild(pane);

        // Re-attach listeners to the tabs container for dropping
        this.attachDragListeners(tabsContainer);

        return container;
    }

    renderHiddenTab(entry) {
        const sourceId = typeof entry === 'string' ? entry : entry.sourceId;
        const isActive = typeof entry === 'object' ? entry.active : false;
        const isCollapsed = typeof entry === 'object' ? entry.collapsed : false;

        const mapping = (settings.get('panelMappings') || []).find(m => m.id === sourceId) || {};
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


        this.attachSettingsButtonListener(settingsBtn, sourceId, null, container, true);

        container.append(bg, handle, ...(iconSpan ? [iconSpan] : []), titleSpan, settingsBtn);

        container.addEventListener('dragstart', (e) => this.handleDragStart(e));

        this.attachTouchDragListeners(container);

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

        const tree = this.renderTreeElement(element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`));

        if (tree) container.appendChild(tree);

        const pendingContainer = el('div', { className: 'ptmt-editor-pending' });
        const pendingTitle = el('div', { className: 'ptmt-editor-title' }, el('span', { className: 'ptmt-editor-pending-title' }, 'Pending Tabs'));
        pendingContainer.appendChild(pendingTitle);

        const pendingTree = this.renderPendingTreeElement(element.querySelector(`${SELECTORS.PANE}, ${SELECTORS.SPLIT}`), name);

        if (pendingTree) pendingContainer.appendChild(pendingTree);

        container.appendChild(pendingContainer);


        return container;
    }

    renderTreeElement(element) {
        if (!element || element.classList.contains(SELECTORS.RESIZER_V.substring(1))) return null;

        if (element.classList.contains(SELECTORS.SPLIT.substring(1))) {
            return this.renderSplit(element);
        }
        if (element.classList.contains(SELECTORS.PANE.substring(1))) {
            return this.renderPane(element);
        }
        return null;
    }



    renderSplit(element) {
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
            // Legacy support
            if (e.target.value !== 'auto') element.dataset.naturalOrientation = e.target.value;
            this.appApi.applySplitOrientation(element);
        });

        collapsedSelect.addEventListener('change', (e) => {
            element.dataset.orientationCollapsed = e.target.value;
            this.appApi.updateSplitCollapsedState(element);
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
            className: SELECTORS.PANE_CONFIG_BTN.substring(1),
            title: 'Configure this pane (size, flow, etc.)',
        }, '⚙');


        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.appApi.openViewSettingsDialog(element);
        });

        titleDiv.append(titleSpan, settingsBtn);
        container.appendChild(titleDiv);


        const tabsContainer = el('div', { className: 'ptmt-editor-tabs-container' });
        // MOVED listeners to parent container

        const tabs = Array.from(element.querySelectorAll(SELECTORS.TAB));

        tabs.forEach(tab => {
            tabsContainer.appendChild(this.renderTab(tab, element));
        });

        container.appendChild(tabsContainer);

        // Attach listeners to the WHOLE pane container so dropping anywhere on the pane works
        this.attachDragListeners(container);

        return container;
    }

    renderTab(tabElement, paneElement) {
        const pid = tabElement.dataset.for;
        const panel = this.appApi.getPanelById(pid);
        const sourceId = panel?.dataset?.sourceId || pid;
        const mapping = (settings.get('panelMappings') || []).find(m => m.id === sourceId) || {};
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
            this.pickIcon(iconBtn, sourceId, tabElement);
        });

        const titleSpan = el('span', { className: 'ptmt-tab-label' }, tabElement.querySelector('.ptmt-tab-label').textContent);
        const settingsBtn = el('button', {
            className: SELECTORS.TAB_CONFIG_BTN.substring(1),
            title: 'Tab Settings (rename, color, etc.)',
        }, '⚙');

        this.attachSettingsButtonListener(settingsBtn, sourceId, tabElement, container, false);

        container.append(bg, handle, iconBtn, titleSpan, settingsBtn);

        container.addEventListener('dragstart', (e) => this.handleDragStart(e, pid));
        container.addEventListener('drop', (e) => this.handleDrop(e));

        this.attachTouchDragListeners(container, pid);

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
        titleDiv.append(titleSpan);
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
        this.attachDragListeners(container);

        return container;
    }

    renderPendingTab(tabInfo) {
        const sourceId = tabInfo.searchId || tabInfo.sourceId || tabInfo.searchClass;
        const mapping = (settings.get('panelMappings') || []).find(m => m.id === sourceId) || {};
        const title = mapping.title || sourceId || tabInfo.searchClass;
        const icon = mapping.icon || 'fa-ghost';
        const color = mapping.color || null;

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
        const bg = el('div', { className: 'ptmt-tab-bg', style: color ? { backgroundColor: color } : {} });
        const iconSpan = createIconElement(icon);
        const titleSpan = el('span', { className: 'ptmt-tab-label' }, title);
        const settingsBtn = el('button', {
            className: SELECTORS.TAB_CONFIG_BTN.substring(1),
            title: 'Tab Settings (rename, color, etc.)',
        }, '⚙');

        this.attachSettingsButtonListener(settingsBtn, sourceId, null, container, true);

        container.append(bg, handle, ...(iconSpan ? [iconSpan] : []), titleSpan, settingsBtn);

        container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        container.addEventListener('drop', (e) => this.handleDrop(e));

        this.attachTouchDragListeners(container);

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

            // PROTECTION: Don't allow dragging settings tab OR pending tabs into hidden/pending sections
            if ((isSettingsTab || this.draggedTabInfo.isPending) && isTargetHiddenList) {
                e.dataTransfer.dropEffect = 'none';
                clearDropIndicators(this.rootElement);
                return;
            }

            if (isSettingsTab && isTargetPendingList) {
                e.dataTransfer.dropEffect = 'none';
                clearDropIndicators(this.rootElement);
                return;
            }

            // PROTECTION: Don't allow dragging settings tab into HIDDEN columns
            if (isSettingsTab) {
                const targetColumn = container.closest('.ptmt-editor-column');
                if (targetColumn && targetColumn.classList.contains('ptmt-editor-column-hidden')) {
                    e.dataTransfer.dropEffect = 'none';
                    clearDropIndicators(this.rootElement);
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
                if (target.nextSibling !== this.indicator) target.after(this.indicator);
            } else {
                if (target.previousSibling !== this.indicator) target.before(this.indicator);
            }
        } else {
            if (container.lastChild !== this.indicator) container.appendChild(this.indicator);
        }
    }

    handleDragLeave(e) {
        setTimeout(() => {
            // Allow hovering over panes as well as the tabs container directly
            const isHoveringValidTarget = this.rootElement.querySelector(':hover.ptmt-editor-tabs-container') || this.rootElement.querySelector(':hover.ptmt-editor-pane');
            if (!isHoveringValidTarget) {
                this.indicator.remove();
            }
        }, 100);
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        const targetContainer = this.indicator.parentElement;
        if (!targetContainer) {
            this.indicator.remove();
            return;
        }

        const isTargetPending = targetContainer.dataset.isPendingList === 'true' || !!targetContainer.closest('.ptmt-pending-pane');
        const isTargetHidden = targetContainer.dataset.isHiddenList === 'true' || !!targetContainer.closest('.ptmt-hidden-pane');

        const children = Array.from(targetContainer.children).filter(c => c.classList.contains('ptmt-editor-tab') || c === this.indicator);
        let newIndex = children.indexOf(this.indicator);
        if (newIndex === -1) newIndex = children.length;

        this.indicator.remove();

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
        const targetColumnEl = targetContainer.closest(SELECTORS.EDITOR_TAB) || targetContainer.closest('.ptmt-editor-column'); // Fallback if needed
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;


        if (sourcePanel && targetPane) {
            // PROTECTION: Don't allow dropping settings tab into hidden columns
            if (info.sourceId === 'ptmt-settings-wrapper-content') {
                if (targetColumnEl && targetColumnEl.classList.contains('ptmt-editor-column-hidden')) {
                    alert("The Layout Settings tab cannot be moved to a hidden column.");
                    return;
                }
            }

            // Move the tab to the new pane
            // The tab will be automatically uncollapsed (collapsed class removed) by moveTabIntoPaneAtIndex
            this.appApi.moveTabIntoPaneAtIndex(sourcePanel, targetPane, newIndex);

            // Always make the dragged tab active in the new pane
            // The user is explicitly moving/interacting with this tab, so it should become active
            this.appApi.setActivePanelInPane(targetPane, info.pid);

            // Re-sync icon mode and layout
            this.appApi.checkPaneForIconMode(targetPane);
            window.dispatchEvent(new CustomEvent(EVENTS.LAYOUT_CHANGED));


        } else {
            console.warn("[PTMT] Could not execute live tab move: source panel or target pane not found.", { sourcePanel, targetPane });
        }
    }

    handleRestoreHiddenToLive(targetContainer, newIndex) {
        const info = this.draggedTabInfo;
        const targetPaneEl = targetContainer.closest('.ptmt-editor-pane');
        const targetPaneId = targetPaneEl?.dataset?.paneId;
        const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;

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
            collapsed: info.isCollapsed,
            color: mapping.color
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
        const targetPane = targetPaneId ? document.querySelector(`${SELECTORS.PANE}[data-pane-id="${targetPaneId}"]`) : null;

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
                sourceId: sourceId,
                color: mapping.color
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
        if (info.isPending) {
            alert("Pending tabs cannot be moved to hidden storage.");
            return;
        }

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
                let stagingArea = document.querySelector(SELECTORS.STAGING_AREA);
                if (!stagingArea) {
                    stagingArea = document.createElement('div');
                    stagingArea.id = SELECTORS.STAGING_AREA.substring(1);

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
        this.touchDragGhost.classList.add('ptmt-touch-drag-ghost'); // Add the new class
        const rect = tab.getBoundingClientRect();
        Object.assign(this.touchDragGhost.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
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
            clearDropIndicators(this.rootElement);
        }
    }

    handleTouchEnd(e) {
        if (this.touchDragGhost) {
            if (e.cancelable) e.preventDefault();

            const indicator = this.rootElement.querySelector(SELECTORS.DROP_INDICATOR_CLASS);

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
            clearDropIndicators(this.rootElement);

        }
    }

    handleTouchCancel(e) {
        // Clean up touch drag ghost if touch is cancelled (e.g., by system or error)
        if (this.touchDragGhost) {
            this.touchDragGhost.remove();
            this.touchDragGhost = null;
        }
        if (this.rootElement) {
            this.rootElement.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            clearDropIndicators(this.rootElement);

        }
    }

    createDialogueColorizerSettings() {
        const s = this.settings;

        // ── helpers ──────────────────────────────────────────────────────────
        const row = (children, extra = {}) =>
            el('div', { className: 'ptmt-setting-row', ...extra }, ...children);

        const lbl = (text, forId) => el('label', forId ? { for: forId } : {}, text);

        const checkbox = (id, key) => {
            const inp = el('input', { type: 'checkbox', id, checked: s.get(key) });
            inp.addEventListener('change', e => s.update({ [key]: e.target.checked }));
            return inp;
        };

        const dropdown = (id, key, options) => {
            const sel = el('select', { id });
            options.forEach(o => sel.appendChild(el('option', { value: o.value, selected: s.get(key) === o.value }, o.label)));
            sel.addEventListener('change', e => s.update({ [key]: e.target.value }));
            // Numeric keys (like colorizeTarget) need parseInt
            if (typeof s.get(key) === 'number') {
                sel.addEventListener('change', e => s.update({ [key]: parseInt(e.target.value, 10) }));
            }
            return sel;
        };

        const colorPicker = (id, key) => {
            const inp = el('input', { type: 'color', id, value: s.get(key) });
            inp.addEventListener('input', e => s.update({ [key]: e.target.value }));
            return inp;
        };

        const sourceOptions = [
            { value: 'avatar_vibrant', label: 'Avatar Vibrant (auto)' },
            { value: 'static_color', label: 'Static Color' },
        ];

        // ── Assemble ─────────────────────────────────────────────────────────
        const container = el('fieldset', {}, el('legend', {}, 'Dialogue Colorizer'));

        // Enable toggle
        container.appendChild(row([
            checkbox('ptmt-col-enable', 'enableDialogueColorizer'),
            lbl('Enable Dialogue Colorizer', 'ptmt-col-enable'),
        ]));

        // Colorize target
        const targetSel = dropdown('ptmt-col-target', 'dialogueColorizerColorizeTarget', [
            { value: '1', label: 'Quoted Text Only' },
            { value: '2', label: 'Chat Bubbles Only' },
            { value: '3', label: 'Both' },
        ]);
        // Sync initial numeric value
        targetSel.value = String(s.get('dialogueColorizerColorizeTarget') ?? 1);
        container.appendChild(row([lbl('Colorize Target', 'ptmt-col-target'), targetSel]));

        // Bubble Opacity
        const opacityVal = el('span', { className: 'ptmt-opacity-value' }, `${Math.round((s.get('dialogueColorizerBubbleOpacity') ?? 0.2) * 100)}%`);
        const opacitySlider = el('input', {
            type: 'range', min: '0', max: '1', step: '0.01',
            value: s.get('dialogueColorizerBubbleOpacity') ?? 0.2,
            className: 'ptmt-opacity-slider'
        });
        opacitySlider.addEventListener('input', () => {
            const val = parseFloat(opacitySlider.value);
            opacityVal.textContent = `${Math.round(val * 100)}%`;
            s.update({ dialogueColorizerBubbleOpacity: val });
        });
        container.appendChild(row([lbl('Bubble Opacity', 'ptmt-bubble-opacity'), opacitySlider, opacityVal]));

        // ── Characters ───────────────────────────────────────────────────────
        const charSection = el('fieldset', {}, el('legend', {}, 'Characters'));
        charSection.appendChild(row([
            lbl('Color Source', 'ptmt-col-charsrc'),
            dropdown('ptmt-col-charsrc', 'dialogueColorizerSource', sourceOptions),
        ]));
        charSection.appendChild(row([
            lbl('Static Color', 'ptmt-col-charstaticcolor'),
            colorPicker('ptmt-col-charstaticcolor', 'dialogueColorizerStaticColor'),
        ]));
        container.appendChild(charSection);

        // ── Personas ─────────────────────────────────────────────────────────
        const personaSection = el('fieldset', {}, el('legend', {}, 'Personas (User)'));
        personaSection.appendChild(row([
            lbl('Color Source', 'ptmt-col-personasrc'),
            dropdown('ptmt-col-personasrc', 'dialogueColorizerPersonaSource', sourceOptions),
        ]));
        personaSection.appendChild(row([
            lbl('Static Color', 'ptmt-col-personastaticcolor'),
            colorPicker('ptmt-col-personastaticcolor', 'dialogueColorizerPersonaStaticColor'),
        ]));
        container.appendChild(personaSection);


        return container;
    }

    openTabSettingsDialog(sourceId, tabElement, tabRow, isPendingOrHidden = false) {
        if (!sourceId) return;

        // Remove ANY existing PTMT dialog to prevent overlap
        const existing = document.getElementById('ptmt-view-settings-dialog') || document.getElementById('ptmt-tab-settings-dialog');
        if (existing) existing.remove();

        const mappings = settings.get('panelMappings');
        const mapping = mappings.find(m => m.id === sourceId) || { id: sourceId, title: sourceId };
        const currentTitle = mapping.title || sourceId;
        const currentColor = mapping.color || '#00000000'; // Transparent default handling depends on ST CSS usually

        const dialog = el('div', { id: 'ptmt-view-settings-dialog', className: 'ptmt-view-settings-dialog' },
            el('div', null,
                el('h3', null, 'Tab Settings'),
                el('div', { className: 'ptmt-vs-row ptmt-vs-id-row' },
                    el('label', null, 'Internal ID: '),
                    el('span', { className: 'ptmt-vs-id-value' }, sourceId)
                ),
                el('div', { className: 'ptmt-vs-row' },
                    el('label', { for: 'ptmt-ts-title' }, 'Tab Title: '),
                    el('input', { type: 'text', value: currentTitle, id: 'ptmt-ts-title', className: 'text_edit', placeholder: 'Enter tab name...' })
                ),
                el('div', { className: 'ptmt-vs-row' },
                    el('label', { for: 'ptmt-ts-icon' }, 'Tab Icon: '),
                    el('button', { className: 'ptmt-icon-picker-btn', id: 'ptmt-ts-icon-btn', type: 'button', title: 'Choose icon' })
                ),
                el('div', { className: 'ptmt-vs-row' },
                    el('label', { for: 'ptmt-ts-color' }, 'Tab Color (Tint): '),
                    el('input', { type: 'color', value: (currentColor && currentColor.length === 7) ? currentColor : '#000000', id: 'ptmt-ts-color', className: 'text_edit' }),
                    el('button', { className: 'ptmt-vs-button ptmt-vs-button-reset', id: 'ptmt-ts-color-reset' }, 'Reset')
                ),
                el('div', { className: 'ptmt-vs-footer' },
                    el('button', { id: 'ptmt-ts-save', className: 'ptmt-vs-button primary' }, 'Save'),
                    el('button', { id: 'ptmt-ts-cancel', className: 'ptmt-vs-button' }, 'Cancel')
                )
            )
        );

        document.body.appendChild(dialog);
        const input = dialog.querySelector('#ptmt-ts-title');
        if (input) {
            input.focus();
            input.select();
        }

        const iconBtn = dialog.querySelector('#ptmt-ts-icon-btn');
        const currentIcon = mapping.icon || '';
        this.updateIconBtn(iconBtn, currentIcon);

        iconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.pickIcon(iconBtn, sourceId, tabElement);
        });

        const colorInput = dialog.querySelector('#ptmt-ts-color');
        let colorReset = !mapping.color;
        dialog.querySelector('#ptmt-ts-color-reset').addEventListener('click', () => {
            colorInput.value = '#000000';
            colorReset = true;
        });
        colorInput.addEventListener('input', () => { colorReset = false; });

        const saveBtn = dialog.querySelector('#ptmt-ts-save');
        const cancelBtn = dialog.querySelector('#ptmt-ts-cancel');

        if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.remove());
        if (saveBtn) saveBtn.addEventListener('click', () => {
            const newTitle = input.value.trim();
            const newColor = colorReset ? null : colorInput.value;

            if (newTitle !== currentTitle || newColor !== mapping.color) {
                const updatedMappings = settings.get('panelMappings').slice();
                let m = updatedMappings.find(item => item.id === sourceId);
                if (!m) {
                    m = { id: sourceId, title: newTitle, color: newColor };
                    updatedMappings.push(m);
                } else {
                    m.title = newTitle;
                    m.color = newColor;
                }
                this.debouncedSettingsUpdate(updatedMappings);

                // Update UI immediately for ALL matching elements
                const liveTabs = document.querySelectorAll(SELECTORS.TAB);

                liveTabs.forEach(liveTab => {
                    const pid = liveTab.dataset.for;
                    const panel = this.appApi.getPanelById(pid);
                    if (panel?.dataset.sourceId === sourceId) {
                        const lbl = liveTab.querySelector(SELECTORS.TAB_LABEL);
                        if (lbl) lbl.textContent = newTitle || sourceId;
                        const bg = liveTab.querySelector('.ptmt-tab-bg');
                        if (bg) bg.style.backgroundColor = newColor;

                        const iconEl = liveTab.querySelector(SELECTORS.TAB_ICON);

                        // Refresh icon as well if needed? For now we only have name/color in this dialog 
                        // but icon button updates mapping live.
                    }
                });

                // Update any editor rows as well
                const editorRows = document.querySelectorAll(SELECTORS.EDITOR_TAB);
                editorRows.forEach(row => {
                    if (row.dataset.sourceId !== sourceId) return;
                    const lbl = row.querySelector(SELECTORS.TAB_LABEL);
                    if (lbl) lbl.textContent = newTitle || sourceId;
                    const bg = row.querySelector('.ptmt-tab-bg');
                    if (bg) bg.style.backgroundColor = newColor;
                });

            }
            dialog.remove();
        });

        // Close on Escape or Save on Enter
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') dialog.remove();
                if (e.key === 'Enter') saveBtn?.click();
            });
        }
    }

    cleanup() {
        // Remove event listener to prevent memory leaks
        if (this._layoutChangeHandler) {
            window.removeEventListener(EVENTS.LAYOUT_CHANGED, this._layoutChangeHandler);
            this._layoutChangeHandler = null;
        }
        if (this._openSettingsHandler) {
            window.removeEventListener(EVENTS.OPEN_TAB_SETTINGS, this._openSettingsHandler);
            this._openSettingsHandler = null;
        }

        // Clean up touch drag ghost if it exists
        if (this.touchDragGhost) {
            this.touchDragGhost.remove();
            this.touchDragGhost = null;
        }
    }
}
