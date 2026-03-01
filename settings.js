// settings.js

import { saveSettingsDebounced, saveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

/** @typedef {import('./types.js').PTMTSettings} PTMTSettings */
/** @typedef {import('./types.js').PanelMapping} PanelMapping */
/** @typedef {import('./types.js').LayoutSnapshot} LayoutSnapshot */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */

export class SettingsManager {
    static defaultSettings = {
        showLeftPane: true,
        showRightPane: true,
        showIconsOnly: false,
        maxLayersLeft: 3,
        maxLayersCenter: 3,
        maxLayersRight: 3,
        runMoveBgDivs: true,
        isMobile: false,
        hideContentWhileResizing: false,
        showContextStatusBar: true,
        enableOverride1: false,
        enableDialogueColorizer: true,
        dialogueColorizerSource: 'avatar_vibrant',
        dialogueColorizerStaticColor: '#e18a24',

        panelMappings: [
            { id: 'left-nav-panel', title: 'Navigation', icon: 'fa-compass' },
            { id: 'right-nav-panel', title: 'Inspector', icon: 'fa-magnifying-glass' },
            { id: 'expression-wrapper', title: 'Expression', icon: 'fa-face-smile' },
            { id: 'expression-plus-wrapper', title: 'Expression Plus', icon: 'fa-face-meh' },
            { id: 'AdvancedFormatting', title: 'Adv. Formatting', icon: 'fa-wand-magic-sparkles' },
            { id: 'rm_api_block', title: 'API Connections', icon: 'fa-plug' },
            { id: 'Backgrounds', title: 'Backgrounds', icon: 'fa-image' },
            { id: 'rm_extensions_block', title: 'Extensions', icon: 'fa-puzzle-piece' },
            { id: 'stqrd--drawer-v2', title: 'Quick Replies', icon: 'fa-bolt' },
            { id: 'WorldInfo', title: 'World Info', icon: 'fa-globe' },
            { id: 'notebookPanel', title: 'Notebook', icon: 'fa-book' },
            { id: 'gallery', title: 'Gallery', icon: 'fa-images' },
            { id: 'zoomed_avatar', title: 'Avatar', icon: 'fa-user' },
            { id: 'galleryImageDraggable', title: 'Avatar', icon: 'fa-folder' },
            { id: 'character_popup', title: 'Adv. Definitions', icon: 'fa-user-gear' },
            { id: 'user-settings-block', title: 'User Settings', icon: 'fa-gear' },
            { id: 'floatingPrompt', title: 'Author\'s Note', icon: 'fa-note-sticky' },
            { id: 'PersonaManagement', title: 'Persona Management', icon: 'fa-id-card' },
            { id: 'objectiveExtensionPopout', title: 'Objective', icon: 'fa-bullseye' },
            { id: 'cfgConfig', title: 'Chat CFG', icon: 'fa-scale-balanced' },
            { id: 'logprobsViewer', title: 'Token Probabilities', icon: 'fa-chart-column' },
            { id: 'dupeFinderPanel', title: 'Similar Characters', icon: 'fa-users-viewfinder' },
            { id: 'summaryExtensionPopout', title: 'Summarize', icon: 'fa-list-check' },
            { id: 'extensionSideBar', title: 'History', icon: 'fa-clock-rotate-left' },
            { id: 'table_drawer_content', title: 'Memory', icon: 'fa-brain' },
            { id: 'moonlit_echoes_popout', title: 'Moonlit Echoes', icon: 'fa-palette' },
            { id: 'groupMemberListPopout', title: 'Group Member List', icon: 'fa-list' },
            { id: 'ctsi-drawerPopout', title: 'CustomInputs', icon: 'fa-keyboard' },
            { id: 'qr--popout', title: 'QR Popout', icon: 'fa-qrcode' },
            { id: 'injectManagerSideBar', title: 'Inject Manager', icon: 'fa-file-shield' },
            { id: 'ptmt-settings-wrapper-content', title: 'Layout Settings', icon: 'fa-screwdriver-wrench' },
            { id: 'sheld', title: 'Main', icon: 'fa-house' }
        ],

        presets: [],
        savedLayoutDesktop: null,
        savedLayoutMobile: null,

        defaultLayout: {
            version: 15,
            showLeft: true,
            showRight: true,
            hiddenTabs: [],
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
                        paneId: 'ptmt-default-left-pane',
                        tabs: [
                            { sourceId: "left-nav-panel" },
                            { sourceId: "notebookPanel" },
                            { sourceId: "rm_api_block" },
                            { sourceId: "cfgConfig" },
                            { sourceId: "logprobsViewer" },
                            { sourceId: "extensionSideBar" },
                            { sourceId: "injectManagerSideBar" }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "summaryExtensionPopout", searchClass: "", paneId: "ptmt-default-left-pane" },
                        { searchId: "groupMemberListPopout", searchClass: "", paneId: "ptmt-default-left-pane" },
                        { searchId: "qr--popout", searchClass: "", paneId: "ptmt-default-left-pane" },
                        { searchId: "ctsi-drawerPopout", searchClass: "", paneId: "ptmt-default-left-pane" }
                    ]
                },
                center: {
                    content: {
                        type: 'split',
                        orientation: 'vertical',
                        children: [
                            {
                                type: 'pane',
                                paneId: 'ptmt-default-center-pane',
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
                                paneId: 'ptmt-default-center-bottom-pane',
                                flex: '1 1 40%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "WorldInfo" },
                                    { sourceId: "stqrd--drawer-v2" },
                                    { sourceId: "expression-wrapper" },
                                    { sourceId: "expression-plus-wrapper" }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "gallery", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "", searchClass: "galleryImageDraggable", paneId: "ptmt-default-center-pane" }
                    ]
                },
                right: {
                    content: {
                        type: 'split',
                        orientation: 'horizontal',
                        children: [
                            {
                                type: 'pane',
                                paneId: 'ptmt-default-right-top-pane',
                                flex: '1 1 50%',
                                viewSettings: { contentFlow: "reversed" },
                                tabs: [
                                    { sourceId: "right-nav-panel" },
                                    { sourceId: "PersonaManagement" },
                                ]
                            },
                            {
                                type: 'pane',
                                paneId: 'ptmt-default-right-bottom-pane',
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
                        { searchId: "objectiveExtensionPopout", searchClass: "", paneId: "ptmt-default-right-top-pane" },
                        { searchId: "moonlit_echoes_popout", searchClass: "", paneId: "ptmt-default-right-top-pane" },
                        { searchId: "", searchClass: "zoomed_avatar", paneId: "ptmt-default-right-top-pane" }
                    ]
                }
            }
        },

        mobileLayout: {
            version: 15,
            showLeft: false,
            showRight: false,
            hiddenTabs: [],
            columnSizes: {
                left: "1 1 20%",
                center: "1 1 100%",
                right: "1 1 20%",
                leftCollapsed: false,
                rightCollapsed: false,
                leftLastFlex: null,
                rightLastFlex: null
            },
            columns: {
                left: { content: { type: 'pane', paneId: 'ptmt-default-left-pane', tabs: [] }, ghostTabs: [] },
                right: { content: { type: 'pane', paneId: 'ptmt-default-right-pane', tabs: [] }, ghostTabs: [] },
                center: {
                    content: {
                        type: 'pane',
                        paneId: 'ptmt-default-center-pane',
                        tabs: [
                            { sourceId: "sheld" },
                            { sourceId: "left-nav-panel" },
                            { sourceId: "notebookPanel" },
                            { sourceId: "rm_api_block" },
                            { sourceId: "cfgConfig" },
                            { sourceId: "logprobsViewer" },
                            { sourceId: "extensionSideBar" },
                            { sourceId: "rm_extensions_block" },
                            { sourceId: "Backgrounds" },
                            { sourceId: "AdvancedFormatting" },
                            { sourceId: "table_drawer_content" },
                            { sourceId: "user-settings-block" },
                            { sourceId: "WorldInfo" },
                            { sourceId: "stqrd--drawer-v2" },
                            { sourceId: "expression-wrapper" },
                            { sourceId: "expression-plus-wrapper" },
                            { sourceId: "right-nav-panel" },
                            { sourceId: "PersonaManagement" },
                            { sourceId: "character_popup" },
                            { sourceId: "floatingPrompt" },
                            { sourceId: "dupeFinderPanel" },
                            { sourceId: "injectManagerSideBar" }
                        ]
                    },
                    ghostTabs: [
                        { searchId: "summaryExtensionPopout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "groupMemberListPopout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "qr--popout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "ctsi-drawerPopout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "gallery", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "galleryImageDraggable", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "objectiveExtensionPopout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "moonlit_echoes_popout", searchClass: "", paneId: "ptmt-default-center-pane" },
                        { searchId: "zoomed_avatar", searchClass: "", paneId: "ptmt-default-center-pane" }
                    ]
                }
            }
        }
    };

    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;
    }

    static getMobileLayout(sourceLayout) {
        if (!sourceLayout) return null;
        const layout = JSON.parse(JSON.stringify(sourceLayout));
        layout.showLeft = false;
        layout.showRight = false;
        layout.columnSizes = {
            left: "1 1 20%",
            center: "1 1 100%",
            right: "1 1 20%",
            leftCollapsed: false,
            rightCollapsed: false,
            leftLastFlex: null,
            rightLastFlex: null
        };

        // Move all tabs to center-top pane
        const allTabs = [];
        const processContent = (node) => {
            if (!node) return;
            if (node.type === 'pane' && node.tabs) {
                allTabs.push(...node.tabs);
            } else if (node.type === 'split' && node.children) {
                node.children.forEach(processContent);
            }
        };

        processContent(layout.columns.left?.content);
        processContent(layout.columns.center?.content);
        processContent(layout.columns.right?.content);

        // Deduplicate tabs by sourceId
        const uniqueTabs = [];
        const seen = new Set();
        allTabs.forEach(t => {
            if (t.sourceId && !seen.has(t.sourceId)) {
                uniqueTabs.push(t);
                seen.add(t.sourceId);
            } else if (t.customContent) {
                uniqueTabs.push(t);
            }
        });

        layout.columns.center.content = {
            type: 'pane',
            paneId: 'ptmt-default-center-pane',
            tabs: uniqueTabs
        };
        layout.columns.left.content = { type: 'pane', paneId: 'ptmt-default-left-pane', tabs: [] };
        layout.columns.right.content = { type: 'pane', paneId: 'ptmt-default-right-pane', tabs: [] };

        // Clear ghost tabs from side columns for mobile
        layout.columns.left.ghostTabs = [];
        layout.columns.right.ghostTabs = [];

        return layout;
    }

    static getDesktopLayout(sourceLayout) {
        if (!sourceLayout) return null;
        const layout = JSON.parse(JSON.stringify(sourceLayout));
        layout.showLeft = true;
        layout.showRight = true;
        layout.columnSizes = {
            left: "1 1 22%",
            center: "1 1 56%",
            right: "1 1 22%",
            leftCollapsed: false,
            rightCollapsed: false,
            leftLastFlex: null,
            rightLastFlex: null
        };
        return layout;
    }

    constructor() {
        this.initializeSettings();

        // Migration: Move old savedLayout to savedLayoutDesktop
        if (extension_settings.PTMT?.savedLayout && !this.get('savedLayoutDesktop')) {
            console.log("[PTMT] Migrating legacy layout to savedLayoutDesktop");
            extension_settings.PTMT.savedLayoutDesktop = extension_settings.PTMT.savedLayout;
            delete extension_settings.PTMT.savedLayout;
            this.save();
        }

        if (SettingsManager.isMobile() && !this.get('isMobile')) {
            // Only auto-enable if no layout is saved yet, or if it's explicitly mobile
            if (!this.get('savedLayoutMobile')) {
                this.update({ isMobile: true });
            }
        }
    }

    initializeSettings() {
        if (!extension_settings.PTMT) {
            extension_settings.PTMT = {};
        }
        const loadedSettings = extension_settings.PTMT;

        // Merge panel mappings by ID instead of overwriting
        const defaultMappings = SettingsManager.defaultSettings.panelMappings || [];
        const loadedMappings = loadedSettings.panelMappings || [];
        const mergedMappings = [...loadedMappings];

        defaultMappings.forEach(defM => {
            if (!mergedMappings.some(m => m.id === defM.id)) {
                mergedMappings.push(defM);
            }
        });

        extension_settings.PTMT = {
            ...SettingsManager.defaultSettings,
            ...loadedSettings,
            panelMappings: mergedMappings
        };
    }

    getActiveLayoutKey() {
        return this.get('isMobile') ? 'savedLayoutMobile' : 'savedLayoutDesktop';
    }

    getActiveDefaultLayout() {
        if (this.get('isMobile')) {
            return SettingsManager.defaultSettings.mobileLayout || this.get('mobileLayout');
        }
        return this.get('defaultLayout');
    }

    getActiveLayout() {
        return this.get(this.getActiveLayoutKey()) || this.getActiveDefaultLayout();
    }

    get(key) {
        if (extension_settings.PTMT.hasOwnProperty(key)) {
            return extension_settings.PTMT[key];
        }
        return SettingsManager.defaultSettings[key];
    }

    update(newSettings, force = false) {
        const changedKeys = [];
        for (const key in newSettings) {
            if (SettingsManager.defaultSettings.hasOwnProperty(key)) {
                extension_settings.PTMT[key] = newSettings[key];
                changedKeys.push(key);
            }
        }
        if (changedKeys.length > 0) {
            this.save(force);
            const isLayoutSave = changedKeys.some(k => k === 'savedLayoutDesktop' || k === 'savedLayoutMobile');
            if (!isLayoutSave) {
                window.dispatchEvent(new CustomEvent('ptmt:settingsChanged', { detail: { changed: changedKeys, allSettings: extension_settings.PTMT } }));
            }
        }
    }

    save(force = false) {
        if (force) {
            saveSettings();
        } else {
            saveSettingsDebounced();
        }
    }

    reset(full = false) {
        if (full) {
            console.log('[PTMT Settings] 🧨 Performing full factory reset.');
            const defaultSettingsCopy = JSON.parse(JSON.stringify(SettingsManager.defaultSettings));
            extension_settings.PTMT = defaultSettingsCopy;
        } else {
            // Layout-only reset: Clear saved snapshots to force fallback to current factory defaults
            extension_settings.PTMT.savedLayoutDesktop = null;
            extension_settings.PTMT.savedLayoutMobile = null;
            // Also clear overridden defaults if they exist
            if (extension_settings.PTMT.defaultLayout) delete extension_settings.PTMT.defaultLayout;
            if (extension_settings.PTMT.mobileLayout) delete extension_settings.PTMT.mobileLayout;
            // Clear mappings too to ensure icons/titles refresh
            if (extension_settings.PTMT.panelMappings) delete extension_settings.PTMT.panelMappings;
        }
        this.save(true);
    }
}

export const settings = new SettingsManager();