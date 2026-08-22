// settings.js

import { saveSettingsDebounced, saveSettings } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { migrateColorizerSettings } from './colorizer-settings.js';

/** @typedef {import('./types.js').PTMTSettings} PTMTSettings */
/** @typedef {import('./types.js').PanelMapping} PanelMapping */
/** @typedef {import('./types.js').LayoutSnapshot} LayoutSnapshot */
/** @typedef {import('./types.js').ColumnLayout} ColumnLayout */

export class SettingsManager {
    static defaultSettings = {
        showLeftPane: true,
        showRightPane: true,
        showIconsOnly: false,
        tabStripAutoHide: false,
        tabStripMode: 'normal',
        maxLayersLeft: 3,
        maxLayersCenter: 3,
        maxLayersRight: 3,
        runMoveBgDivs: true,
        moveBg1ToSheld: false,
        isMobile: false,
        hideContentWhileResizing: false,
        showContextStatusBar: true,
        showWorldInfoStatusBar: true,
        enableAnimations: true,
        enableShadows: true,
        enableBlurEffect: true,
        enableOverride1: false,
        optimizeMessageVisibility: false,
        enableAutoContrast: true,
        enableDialogueColorizer: true,
        autoOpenFirstCenterTab: true,
        enableAvatarExpressionSync: false,
        dialogueColorizerSource: 'avatar_vibrant',
        dialogueColorizerStaticColor: '#da6745ff',
        dialogueColorizerBubbleSource: 'avatar_vibrant',
        dialogueColorizerBubbleStaticColor1: '#da6745ff',
        dialogueColorizerBubbleStaticColor2: '#da6745ff',
        dialogueColorizerPersonaSource: 'avatar_vibrant',
        dialogueColorizerPersonaStaticColor: '#537fddff',
        dialogueColorizerPersonaBubbleSource: 'avatar_vibrant',
        dialogueColorizerPersonaBubbleStaticColor1: '#537fddff',
        dialogueColorizerPersonaBubbleStaticColor2: '#537fddff',
        messageRailEnabled: false,
        messageRailFilter: 'all',
        messageRailExcludeSystem: true,
        messageRailMaxDots: 64,
        messageRailSide: 'right',
        messageRailScrollBehavior: 'smooth',
        dialogueColorizerColorizeTarget: 3,
        dialogueColorizerPersonaColorizeTarget: 3,
        dialogueColorizerBubbleOpacityBot: 0.1,
        dialogueColorizerBubbleOpacityUser: 0.1,
        dialogueColorizerBubbleMode: 'gradient',
        dialogueColorizerPersonaBubbleMode: 'gradient',
        dialogueColorizerBubbleGradientStops: [],
        dialogueColorizerBubbleGradientAngle: 225,
        dialogueColorizerPersonaBubbleGradientStops: [],
        dialogueColorizerPersonaBubbleGradientAngle: 125,
        dialogueColorizerSettingsVersion: 2,

        charCustomColorizerEnabled: [],
        charCustomColorizerSettings: {},
        personaCustomColorizerEnabled: [],
        personaCustomColorizerSettings: {},

        avatarBaseHeight: '14vh',
        avatarBaseWidth: '8vw',
        avatarBaseBorderRadius: '0.5rem',
        normalAvatarSize: '48px',
        avatarScaleWidth: '1',
        avatarScaleHeight: '1.6',
        charListAvatarWidth: '4vw',
        charListAvatarHeight: 'auto',
        charListAvatarScale: '1',
        bodyBgColor: 'rgb(29, 29, 29)',
        lastSeenVersion: null,

        panelMappings: [
            { id: 'left-nav-panel', title: 'API Sliders', icon: 'fa-compass' },
            { id: 'right-nav-panel', title: 'Characters', icon: 'fa-magnifying-glass' },
            { id: 'expression-wrapper', title: 'Expression', icon: 'fa-face-smile' },
            { id: 'expression-plus-wrapper', title: 'Expression Plus', icon: 'fa-face-meh' },
            { id: 'expressions_plus_carousel_body', title: 'Expression Plus Carousel', icon: 'fa-rectangle-list' },
            { id: 'AdvancedFormatting', title: 'Adv. Formatting', icon: 'fa-wand-magic-sparkles' },
            { id: 'rm_api_block', title: 'API Connections', icon: 'fa-plug' },
            { id: 'Backgrounds', title: 'Backgrounds', icon: 'fa-image' },
            { id: 'rm_extensions_block', title: 'Extensions', icon: 'fa-puzzle-piece' },
            { id: 'stqrd--drawer-v2', title: 'Quick Replies', icon: 'fa-bolt' },
            { id: 'WorldInfo', title: 'World Info', icon: 'fa-globe' },
            { id: 'notebookPanel', title: 'Notebook', icon: 'fa-book' },
            { id: 'gallery', title: 'Gallery', icon: 'fa-images' },
            { id: 'zoomed_avatar', title: 'Avatar', icon: 'fa-user' },
            { id: 'galleryImageDraggable', title: 'Gallery Img', icon: 'fa-folder' },
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
            { id: 'ptmt-info-wrapper-content', title: 'Info & Guide', icon: 'fa-circle-info' },
            { id: 'sheld', title: 'Main', icon: 'fa-house' },
            { id: 'charlib-embedded-container', title: 'CharLib', icon: 'fa-book-open' },
            { id: 'trackerInterface', title: 'Tracker', icon: 'fa-chart-simple' },
            { id: 'vv--root', title: 'Variables', icon: 'fa-code' },
            { id: 'etle--panel', title: 'Text Line Editor', icon: 'fa-pen-to-square' },
            { id: 'cardGalleryViewer', title: 'Card Gallery', icon: 'fa-images' },
            { id: 'rpg-companion-panel', title: 'RPG Companion', icon: 'fa-dice-d20' }
        ],

        presets: [],
        savedLayoutDesktop: null,
        savedLayoutMobile: null,

        defaultLayout: {
            version: 28,
            showIconsOnly: false,
            showLeft: true,
            showRight: true,
            hiddenTabs: [],
            columnSizes: {
                left: '1 1 20%',
                center: '1 1 60%',
                right: '1 1 20%',
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
                            { sourceId: 'left-nav-panel' },
                            { sourceId: 'notebookPanel' },
                            { sourceId: 'rm_api_block' },
                            { sourceId: 'cfgConfig' },
                            { sourceId: 'logprobsViewer' },
                            { sourceId: 'extensionSideBar' },
                            { sourceId: 'injectManagerSideBar' },
                            { sourceId: 'cardGalleryViewer' }
                        ]
                    },
                    ghostTabs: [
                        { searchId: 'summaryExtensionPopout', searchClass: '', paneId: 'ptmt-default-left-pane' },
                        { searchId: 'groupMemberListPopout', searchClass: '', paneId: 'ptmt-default-left-pane' },
                        { searchId: 'qr--popout', searchClass: '', paneId: 'ptmt-default-left-pane' },
                        { searchId: 'ctsi-drawerPopout', searchClass: '', paneId: 'ptmt-default-left-pane' },
                        { searchId: 'trackerInterface', searchClass: '', paneId: 'ptmt-default-left-pane' },
                        { searchId: 'vv--root', searchClass: '', paneId: 'ptmt-default-left-pane' }
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
                                    { sourceId: 'sheld' },
                                    { sourceId: 'rm_extensions_block' },
                                    { sourceId: 'Backgrounds' },
                                    { sourceId: 'etle--panel' },
                                    { sourceId: 'AdvancedFormatting' },
                                    { sourceId: 'table_drawer_content' },
                                    { sourceId: 'user-settings-block' }
                                ]
                            },
                            {
                                type: 'pane',
                                paneId: 'ptmt-default-center-bottom-pane',
                                flex: '1 1 40%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: 'reversed' },
                                tabs: [
                                    { sourceId: 'WorldInfo' },
                                    { sourceId: 'stqrd--drawer-v2' },
                                    { sourceId: 'expression-wrapper' },
                                    { sourceId: 'expression-plus-wrapper' },
                                    { sourceId: 'expressions_plus_carousel_body' },
                                    { sourceId: 'charlib-embedded-container' }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: 'gallery', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: '', searchClass: 'galleryImageDraggable', paneId: 'ptmt-default-center-pane' }
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
                                viewSettings: { contentFlow: 'reversed' },
                                tabs: [
                                    { sourceId: 'right-nav-panel' },
                                    { sourceId: 'PersonaManagement' },
                                ]
                            },
                            {
                                type: 'pane',
                                paneId: 'ptmt-default-right-bottom-pane',
                                flex: '1 1 50%',
                                isCollapsed: true,
                                viewSettings: { contentFlow: 'reversed' },
                                tabs: [
                                    { sourceId: 'character_popup' },
                                    { sourceId: 'floatingPrompt' },
                                    { sourceId: 'dupeFinderPanel' }
                                ]
                            }
                        ]
                    },
                    ghostTabs: [
                        { searchId: 'objectiveExtensionPopout', searchClass: '', paneId: 'ptmt-default-right-top-pane' },
                        { searchId: 'rpg-companion-panel', searchClass: '', paneId: 'ptmt-default-right-top-pane' },
                        { searchId: 'moonlit_echoes_popout', searchClass: '', paneId: 'ptmt-default-right-top-pane' },
                        { searchId: '', searchClass: 'zoomed_avatar', paneId: 'ptmt-default-right-top-pane' }
                    ]
                }
            }
        },

        uiTheme: 'sharp',

        mobileLayout: {
            version: 28,
            showIconsOnly: true,
            showLeft: false,
            showRight: false,
            hiddenTabs: [],
            columnSizes: {
                left: '1 1 20%',
                center: '1 1 100%',
                right: '1 1 20%',
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
                            { sourceId: 'sheld' },
                            { sourceId: 'left-nav-panel' },
                            { sourceId: 'notebookPanel' },
                            { sourceId: 'rm_api_block' },
                            { sourceId: 'cfgConfig' },
                            { sourceId: 'logprobsViewer' },
                            { sourceId: 'extensionSideBar' },
                            { sourceId: 'rm_extensions_block' },
                            { sourceId: 'Backgrounds' },
                            { sourceId: 'AdvancedFormatting' },
                            { sourceId: 'table_drawer_content' },
                            { sourceId: 'user-settings-block' },
                            { sourceId: 'WorldInfo' },
                            { sourceId: 'stqrd--drawer-v2' },
                            { sourceId: 'expression-wrapper' },
                            { sourceId: 'expression-plus-wrapper' },
                            { sourceId: 'right-nav-panel' },
                            { sourceId: 'PersonaManagement' },
                            { sourceId: 'character_popup' },
                            { sourceId: 'floatingPrompt' },
                            { sourceId: 'dupeFinderPanel' },
                            { sourceId: 'injectManagerSideBar' },
                            { sourceId: 'charlib-embedded-container' },
                            { sourceId: 'etle--panel' },
                            { sourceId: 'cardGalleryViewer' }
                        ]
                    },
                    ghostTabs: [
                        { searchId: 'summaryExtensionPopout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'groupMemberListPopout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'qr--popout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'ctsi-drawerPopout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'gallery', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: '', searchClass: 'galleryImageDraggable', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'objectiveExtensionPopout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'moonlit_echoes_popout', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: '', searchClass: 'zoomed_avatar', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'trackerInterface', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'vv--root', searchClass: '', paneId: 'ptmt-default-center-pane' },
                        { searchId: 'rpg-companion-panel', searchClass: '', paneId: 'ptmt-default-center-pane' }
                    ]
                }
            }
        }
    };

    static themes = {
        sharp: {
            name: 'Sharp',
            description: '',
            variables: {
                '--ptmt-radius': '0px',
                '--ptmt-tab-radius': '0px',
                '--ptmt-pane-radius': '0px',
                '--ptmt-dialog-radius': '0.75rem',
                '--ptmt-button-radius': '0px',
                '--ptmt-tab-size': '38px',
                '--ptmt-collapsed-width': '38px',
                '--ptmt-icons-only-tab-size': '38px',
                '--ptmt-spacing-xs': '2px',
                '--ptmt-spacing-sm': '4px',
                '--ptmt-spacing-md': '6px',
                '--ptmt-spacing-lg': '8px',
                '--ptmt-spacing-xl': '12px',
                '--ptmt-border-width': '1px',
                '--ptmt-tab-margin': '0px',
                '--ptmt-tab-margin-offset': '0px',
                '--ptmt-grid-gap': '0px',
                '--ptmt-panel-padding': '0px',
            }
        },
        rounded_smooth: {
            name: 'Smooth',
            description: '',
            variables: {
                '--ptmt-radius': '12px',
                '--ptmt-tab-radius': '0px 0px 12px 12px',
                '--ptmt-pane-radius': '12px',
                '--ptmt-dialog-radius': '16px',
                '--ptmt-button-radius': '10px',
                '--ptmt-tab-size': '44px',
                '--ptmt-collapsed-width': '44px',
                '--ptmt-icons-only-tab-size': '50px',
                '--ptmt-spacing-xs': '4px',
                '--ptmt-spacing-sm': '6px',
                '--ptmt-spacing-md': '10px',
                '--ptmt-spacing-lg': '12px',
                '--ptmt-spacing-xl': '16px',
                '--ptmt-border-width': '1px',
                '--ptmt-tab-margin': '2px',
                '--ptmt-tab-margin-offset': '6px',
                '--ptmt-grid-gap': '4px',
                '--ptmt-panel-padding': '0px',
            }
        }
    };

    static getThemeConfig(themeName) {
        return this.themes[themeName] || this.themes.sharp;
    }

    static applyTheme(themeName) {
        const theme = this.getThemeConfig(themeName);
        const body = document.body;
        body.classList.remove('ptmt-Theme-Sharp', 'ptmt-Theme-RoundedSoft', 'ptmt-Theme-RoundedSmooth');
        const className = `ptmt-Theme-${themeName.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
        body.classList.add(className);
    }

    static getAvailableThemes() {
        return Object.entries(this.themes).map(([key, config]) => ({
            id: key,
            name: config.name,
            description: config.description
        }));
    }

    static isMobile() {
        const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const narrowTouch = window.matchMedia?.('(max-width: 799px) and (pointer: coarse)')?.matches;
        return uaMobile || !!narrowTouch;
    }

    static getMobileLayout(sourceLayout) {
        if (!sourceLayout) return null;
        const layout = structuredClone(sourceLayout);
        layout.showLeft = false;
        layout.showRight = false;
        layout.columnSizes = {
            left: '1 1 20%',
            center: '1 1 100%',
            right: '1 1 20%',
            leftCollapsed: false,
            rightCollapsed: false,
            leftLastFlex: null,
            rightLastFlex: null
        };

        const allTabs = [];
        const processContent = (node) => {
            if (!node) return;
            if (node.type === 'pane' && node.tabs) allTabs.push(...node.tabs);
            else if (node.type === 'split' && node.children) node.children.forEach(processContent);
        };
        processContent(layout.columns.left?.content);
        processContent(layout.columns.center?.content);
        processContent(layout.columns.right?.content);

        const uniqueTabs = [];
        const seen = new Set();
        allTabs.forEach(t => {
            if (t.sourceId && !seen.has(t.sourceId)) {
                uniqueTabs.push(t);
                seen.add(t.sourceId);
            } else if (t.customContent) uniqueTabs.push(t);
        });

        layout.columns.center.content = { type: 'pane', paneId: 'ptmt-default-center-pane', tabs: uniqueTabs };
        layout.columns.left.content = { type: 'pane', paneId: 'ptmt-default-left-pane', tabs: [] };
        layout.columns.right.content = { type: 'pane', paneId: 'ptmt-default-right-pane', tabs: [] };
        layout.columns.left.ghostTabs = [];
        layout.columns.right.ghostTabs = [];
        return layout;
    }

    static getDesktopLayout(sourceLayout) {
        if (!sourceLayout) return null;
        const layout = structuredClone(sourceLayout);
        layout.showLeft = true;
        layout.showRight = true;
        layout.columnSizes = {
            left: '1 1 22%',
            center: '1 1 56%',
            right: '1 1 22%',
            leftCollapsed: false,
            rightCollapsed: false,
            leftLastFlex: null,
            rightLastFlex: null
        };
        return layout;
    }

    constructor() {
        this._settingsMigrated = false;
        this.initializeSettings();

        if (extension_settings.PTMT?.savedLayout && !this.get('savedLayoutDesktop')) {
            extension_settings.PTMT.savedLayoutDesktop = extension_settings.PTMT.savedLayout;
            delete extension_settings.PTMT.savedLayout;
            this.save();
        }
        if (extension_settings.PTMT?.tabStripAutoHide && this.get('tabStripMode') === 'normal') {
            extension_settings.PTMT.tabStripMode = 'auto-hide';
            this._settingsMigrated = true;
        }
        if (this._settingsMigrated) this.save();

        if (SettingsManager.isMobile() && !this.get('isMobile') && !this.get('savedLayoutMobile')) {
            this.update({ isMobile: true });
        }
    }

    initializeSettings() {
        if (!extension_settings.PTMT) extension_settings.PTMT = {};
        const loadedSettings = extension_settings.PTMT;
        this._settingsMigrated = this.migrateDialogueColorizerSettings(loadedSettings) || this._settingsMigrated;

        const defaultMappings = SettingsManager.defaultSettings.panelMappings || [];
        const loadedMappings = loadedSettings.panelMappings || [];
        const mergedMappings = [...loadedMappings];
        defaultMappings.forEach(defM => {
            if (!mergedMappings.some(m => m.id === defM.id)) mergedMappings.push(defM);
        });

        mergedMappings.forEach(mapping => {
            if (mapping.id === 'left-nav-panel') {
                if (mapping.title === 'Navigation') mapping.title = 'API Sliders';
                if (!mapping.icon || mapping.icon === 'fa-sliders') mapping.icon = 'fa-compass';
            }
            if (mapping.id === 'right-nav-panel') {
                if (mapping.title === 'Inspector') mapping.title = 'Characters';
                if (!mapping.icon || mapping.icon === 'fa-search') mapping.icon = 'fa-magnifying-glass';
            }
            if (mapping.id === 'galleryImageDraggable' && mapping.title === 'Avatar') mapping.title = 'Gallery Img';
        });

        extension_settings.PTMT = {
            ...SettingsManager.defaultSettings,
            ...loadedSettings,
            panelMappings: mergedMappings
        };
    }

    migrateDialogueColorizerSettings(loadedSettings) {
        return migrateColorizerSettings(loadedSettings, SettingsManager.defaultSettings.dialogueColorizerSettingsVersion);
    }

    getActiveLayoutKey() {
        return this.get('isMobile') ? 'savedLayoutMobile' : 'savedLayoutDesktop';
    }

    getActiveDefaultLayout() {
        if (this.get('isMobile')) return SettingsManager.defaultSettings.mobileLayout || this.get('mobileLayout');
        return this.get('defaultLayout');
    }

    getActiveLayout() {
        return this.get(this.getActiveLayoutKey()) || this.getActiveDefaultLayout();
    }

    get(key) {
        const store = extension_settings.PTMT;
        if (store && Object.prototype.hasOwnProperty.call(store, key)) return store[key];
        return SettingsManager.defaultSettings[key];
    }

    getMapping(sourceId) {
        if (!sourceId) return {};
        const lookupId = sourceId.startsWith('id:') ? sourceId.substring(3) : sourceId.startsWith('class:') ? sourceId.substring(6) : sourceId;
        return (this.get('panelMappings') || []).find(m => m.id === lookupId || m.id === sourceId) || {};
    }

    async update(newSettings, force = false) {
        if (!extension_settings.PTMT) this.initializeSettings();
        const changedKeys = [];
        for (const key in newSettings) {
            if (Object.prototype.hasOwnProperty.call(SettingsManager.defaultSettings, key)) {
                extension_settings.PTMT[key] = newSettings[key];
                changedKeys.push(key);
            } else {
                console.warn(`[PTMT] update() ignored unknown setting key: "${key}"`);
            }
        }
        if (changedKeys.length > 0) {
            await this.save(force);
            const isLayoutSave = changedKeys.some(k => k === 'savedLayoutDesktop' || k === 'savedLayoutMobile');
            if (!isLayoutSave) {
                window.dispatchEvent(new CustomEvent('ptmt:settingsChanged', { detail: { changed: changedKeys, allSettings: extension_settings.PTMT } }));
            }
        }
    }

    async save(force = false) {
        if (force) await saveSettings();
        else saveSettingsDebounced();
    }

    async reset(full = false) {
        if (!extension_settings.PTMT) this.initializeSettings();
        if (full) {
            extension_settings.PTMT = structuredClone(SettingsManager.defaultSettings);
        } else {
            extension_settings.PTMT.savedLayoutDesktop = null;
            extension_settings.PTMT.savedLayoutMobile = null;
            if (extension_settings.PTMT.defaultLayout) delete extension_settings.PTMT.defaultLayout;
            if (extension_settings.PTMT.mobileLayout) delete extension_settings.PTMT.mobileLayout;
            if (extension_settings.PTMT.panelMappings) delete extension_settings.PTMT.panelMappings;
        }
        await this.save(true);
    }

    async cleanup() {
        delete extension_settings.PTMT;
        await this.save(true);
    }
}

export const settings = new SettingsManager();
