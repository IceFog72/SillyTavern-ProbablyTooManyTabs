// settings.js

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

class SettingsManager {
    constructor() {

        this.defaultSettings = {

            showLeftPane: true,
            showRightPane: true,
            showIconsOnly: false,
            maxLayersLeft: 3,
            maxLayersCenter: 3,
            maxLayersRight: 3,
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
                { id: 'character_popup', title: 'Adv. Definitions', icon: '👤' },
                { id: 'user-settings-block', title: 'User Settings', icon: '⚙️' }
            ],


            presets: [],


            savedLayout: null,


            defaultLayout: {
                version: 3,
                showLeft: true,
                showRight: true,
                columns: {
                    left: {
                        flex: "1 1 22%",
                        content: {
                            type: 'pane',
                            flex: '1 1 100%',
                            isCollapsed: false,
                            viewSettings: { defaultOrientation: 'horizontal' },
                            tabs: [
                                { sourceId: 'left-nav-panel' },
                                { sourceId: 'WorldInfo' },
                                { sourceId: 'notebookPanel' },
                                { sourceId: 'Backgrounds' },
                                { sourceId: 'gallery' },
                                { sourceId: 'rm_extensions_block' }
                            ]
                        }
                    },
                    center: {
                        flex: "1 1 56%",
                        content: {
                            type: 'pane',
                            flex: '1 1 100%',
                            isCollapsed: false,
                            viewSettings: {},
                            tabs: [ /* The 'Main' panel will be added here automatically */]
                        }
                    },
                    right: {
                        flex: "1 1 22%",
                        content: {
                            type: 'split',
                            orientation: 'horizontal',
                            flex: '1 1 100%',
                            isCollapsed: false,
                            children: [
                                {
                                    type: 'pane',
                                    flex: '0 1 50%',
                                    isCollapsed: false,
                                    viewSettings: {},
                                    tabs: [
                                        { sourceId: 'right-nav-panel' },
                                        { sourceId: 'expression-wrapper' },
                                        { sourceId: 'stqrd--drawer-v2' }
                                    ]
                                },
                                {
                                    type: 'pane',
                                    flex: '0 1 50%',
                                    isCollapsed: false,
                                    viewSettings: {},
                                    tabs: [
                                        { sourceId: 'character_popup' },
                                        { sourceId: 'AdvancedFormatting' },
                                        { sourceId: 'rm_api_block' },
                                        { sourceId: 'user-settings-block' }
                                    ]
                                }
                            ]
                        }
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

        this.save();
    }
}

export const settings = new SettingsManager();