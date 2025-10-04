// settings.js

import { saveSettingsDebounced, saveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

class SettingsManager {
    constructor() {

       this.defaultSettings = {

        showLeftPane: true,
        showRightPane: true,
        showIconsOnly: false,
        maxLayersLeft: 3,
        maxLayersCenter: 3,
        maxLayersRight:3 ,
        runMoveBgDivs: true,


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
            { id: 'character_popup', title: 'Adv. Definitions', icon: '👤' },
            { id: 'user-settings-block', title: 'User Settings', icon: '⚙️' },
            { id: 'floatingPrompt', title: 'Author\'s Note', icon: '📓' },
            { id: 'PersonaManagement', title: 'Persona Management', icon: '👤' },
            { id: 'objectiveExtensionPopout', title: 'Objective', icon: '🧭' },
            { id: 'cfgConfig', title: 'Chat CFG', icon: '🧭' },
            { id: 'logprobsViewer', title: 'Token Probabilities', icon: '✨' },
            { id: 'dupeFinderPanel', title: 'Similar Characters', icon: '👤' },
            { id: 'sheld', title: 'Main', icon: '📌' }
        ],

        presets: [],

        savedLayout: null,

        defaultLayout: {
            version: 4,
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
                            { sourceId: "rm_api_block" }
                        ]
                    },
                    ghostTabs: []
                },
                center: {
                    content: {
                        type: 'split',
                        orientation: 'vertical',
                        children: [
                            {
                                type: 'pane',
                                flex: '1 1 70%',
                                tabs: [
                                    { sourceId: "rm_extensions_block" },
                                    { sourceId: "Backgrounds" },
                                    { sourceId: "AdvancedFormatting" },
                                    { sourceId: "user-settings-block" },
                                    { sourceId: "sheld" }
                                ]
                            },
                            {
                                type: 'pane',
                                flex: '1 1 30%',
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
                        { searchId: "", searchClass: "zoomed_avatar" }
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
                                    { sourceId: "floatingPrompt" },
                                    { sourceId: "dupeFinderPanel" },
                                    { sourceId: "cfgConfig" },
                                    { sourceId: "logprobsViewer" }
      
                                ]
                            },
                            {
                                type: 'pane',
                                flex: '1 1 50%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "character_popup" }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "objectiveExtensionPopout", searchClass: "" }
                    ]
                }
            }
        }
    };

    this.settings = this.initializeSettings();
}

initializeSettings() {
    if (!extension_settings.PTMT) {
        extension_settings.PTMT = {};
    }
    const loadedSettings = extension_settings.PTMT;
    extension_settings.PTMT = { ...this.defaultSettings, ...loadedSettings };
    return extension_settings.PTMT;
}

get(key) {
    if (this.settings.hasOwnProperty(key)) { return this.settings[key]; }
    return this.defaultSettings[key];
}

update(newSettings) {
    const changedKeys = [];
    for (const key in newSettings) {
        if (this.defaultSettings.hasOwnProperty(key)) {
            this.settings[key] = newSettings[key];
            changedKeys.push(key);
        }
    }
    if (changedKeys.length > 0) {
        this.save();
        const isOnlyLayoutSave = changedKeys.length === 1 && changedKeys[0] === 'savedLayout';
        if (!isOnlyLayoutSave) {
            window.dispatchEvent(new CustomEvent('ptmt:settingsChanged', { detail: { changed: changedKeys, allSettings: this.settings } }));
        }
    }
}

save() {
    saveSettingsDebounced();
}

reset() {
    const defaultSettingsCopy = JSON.parse(JSON.stringify(this.defaultSettings));

    extension_settings.PTMT = defaultSettingsCopy;
    this.settings = extension_settings.PTMT;

    saveSettings();
}
}

export const settings = new SettingsManager();