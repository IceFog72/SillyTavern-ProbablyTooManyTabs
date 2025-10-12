// settings.js

import { saveSettingsDebounced, saveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

export class SettingsManager {
    static defaultSettings = {
        showLeftPane: true,
        showRightPane: true,
        showIconsOnly: false,
        maxLayersLeft: 3,
        maxLayersCenter: 3,
        maxLayersRight: 3,
        runMoveBgDivs: true,
        hideContentWhileResizing: false,

        panelMappings: [
            { id: 'left-nav-panel', title: 'Navigation', icon: '🧭' },
            { id: 'right-nav-panel', title: 'Inspector', icon: '🔍' },
            { id: 'expression-wrapper', title: 'Expression', icon: '💬' },
            { id: 'AdvancedFormatting', title: 'Adv. Formatting', icon: '✨' },
            { id: 'rm_api_block', title: 'API Connections', icon: '🔌' },
            { id: 'Backgrounds', title: 'Backgrounds', icon: '🖼️' },
            { id: 'rm_extensions_block', title: 'Extensions', icon: '🧩' },
            { id: 'stqrd--drawer-v2', title: 'Quick Replies', icon: '⚡' },
            { id: 'WorldInfo', title: 'World Info', icon: '🌍' },
            { id: 'notebookPanel', title: 'Notebook', icon: '📓' },
            { id: 'gallery', title: 'Gallery', icon: '🏞️' },
            { id: 'zoomed_avatar', title: 'Avatar', icon: '🏞️' },
            { id: 'galleryImageDraggable', title: 'Avatar', icon: '🗂️' },
            { id: 'character_popup', title: 'Adv. Definitions', icon: '👤' },
            { id: 'user-settings-block', title: 'User Settings', icon: '⚙️' },
            { id: 'floatingPrompt', title: 'Author\'s Note', icon: '📓' },
            { id: 'PersonaManagement', title: 'Persona Management', icon: '👤' },
            { id: 'objectiveExtensionPopout', title: 'Objective', icon: '🧭' },
            { id: 'cfgConfig', title: 'Chat CFG', icon: '🧭' },
            { id: 'logprobsViewer', title: 'Token Probabilities', icon: '✨' },
            { id: 'dupeFinderPanel', title: 'Similar Characters', icon: '👤' },
            { id: 'summaryExtensionPopout', title: 'Summarize', icon: '📑' },
            { id: 'extensionSideBar', title: 'History', icon: '🗃️' },
            { id: 'table_drawer_content', title: 'Memory', icon: '🗃️' },
            { id: 'moonlit_echoes_popout', title: 'Moonlit Echoes', icon: '🎨' },
            { id: 'groupMemberListPopout', title: 'Group Member List', icon: '📃' },
            { id: 'sheld', title: 'Main', icon: '🏠' }
        ],

        presets: [],
        savedLayout: null,

        defaultLayout: {
            version: 9,
            showLeft: true,
            showRight: true,
            columnSizes: {
                left: "1 1 20%",
                center: "1 1 60%",
                right: "1 1 20%",
                leftCollapsed: false,
                rightCollapsed: false,
                leftLastFlex: null,
                rightLastFlex: null
            },
            columns: {
                left: {
                    content: {
                        type: 'pane',
                        tabs: [
                            { sourceId: "left-nav-panel" },
                            { sourceId: "notebookPanel" },
                            { sourceId: "rm_api_block" },
                            { sourceId: "cfgConfig" },
                            { sourceId: "logprobsViewer" },
                            { sourceId: "extensionSideBar" }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "summaryExtensionPopout", searchClass: "" },
                        { searchId: "groupMemberListPopout", searchClass: "" }
                    ]
                },
                center: {
                    content: {
                        type: 'split',
                        orientation: 'vertical',
                        children: [
                            {
                                type: 'pane',
                                flex: '1 1 60%',
                                isCollapsed: false,
                                tabs: [
                                    { sourceId: "sheld" },
                                    { sourceId: "rm_extensions_block" },
                                    { sourceId: "Backgrounds" },
                                    { sourceId: "AdvancedFormatting" },
                                    { sourceId: "table_drawer_content" },
                                    { sourceId: "user-settings-block" }
                                ]
                            },
                            {
                                type: 'pane',
                                flex: '1 1 40%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "WorldInfo" },
                                    { sourceId: "stqrd--drawer-v2" },
                                    { sourceId: "expression-wrapper" }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "gallery", searchClass: "" },
                        { searchId: "", searchClass: "zoomed_avatar" },
                        { searchId: "", searchClass: "galleryImageDraggable" }
                    ]
                },
                right: {
                    content: {
                        type: 'split',
                        orientation: 'horizontal',
                        children: [
                            {
                                type: 'pane',
                                flex: '1 1 50%',
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "right-nav-panel" },
                                    { sourceId: "PersonaManagement" },
                                ]
                            },
                            {
                                type: 'pane',
                                flex: '1 1 50%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "character_popup" },
                                    { sourceId: "floatingPrompt" },
                                    { sourceId: "dupeFinderPanel" }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "objectiveExtensionPopout", searchClass: "" },
                        { searchId: "moonlit_echoes_popout", searchClass: "" }
                    ]
                }
            }
        }
    };

    constructor() {
        this.initializeSettings();
    }

    initializeSettings() {
        if (!extension_settings.PTMT) {
            extension_settings.PTMT = {};
        }
        const loadedSettings = extension_settings.PTMT;
        extension_settings.PTMT = { ...SettingsManager.defaultSettings, ...loadedSettings };
    }

    get(key) {
        if (extension_settings.PTMT.hasOwnProperty(key)) {
            return extension_settings.PTMT[key];
        }
        return SettingsManager.defaultSettings[key];
    }

    update(newSettings) {
        const changedKeys = [];
        for (const key in newSettings) {
            if (SettingsManager.defaultSettings.hasOwnProperty(key)) {
                extension_settings.PTMT[key] = newSettings[key];
                changedKeys.push(key);
            }
        }
        if (changedKeys.length > 0) {
            this.save();
            const isOnlyLayoutSave = changedKeys.length === 1 && changedKeys[0] === 'savedLayout';
            if (!isOnlyLayoutSave) {
                window.dispatchEvent(new CustomEvent('ptmt:settingsChanged', { detail: { changed: changedKeys, allSettings: extension_settings.PTMT } }));
            }
        }
    }

    save() {
        saveSettingsDebounced();
    }

    reset() {
        const defaultSettingsCopy = JSON.parse(JSON.stringify(SettingsManager.defaultSettings));
        extension_settings.PTMT = defaultSettingsCopy;
        saveSettings();
    }
}

export const settings = new SettingsManager();