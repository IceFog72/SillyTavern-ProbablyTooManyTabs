// SettingsUIRenderer.js - Renders the global settings panel UI

import { el, debounce } from './utils.js';

/** @typedef {import('./types.js').PTMTSettings} PTMTSettings */
/** @typedef {import('./types.js').PTMTAPI} PTMTAPI */
/** @typedef {import('./settings.js').SettingsManager} SettingsManager */

export class SettingsUIRenderer {
    /**
     * @param {SettingsManager} settingsManager
     * @param {PTMTAPI} appApi
     */
    constructor(settingsManager, appApi) {
        this.settings = settingsManager;
        this.appApi = appApi;
        this.rootElement = null;
        this.debouncedSettingsUpdate = debounce((updatedMappings) => {
            settingsManager.update({ panelMappings: updatedMappings });
        }, 400);
        this._layoutChangeHandler = null;
    }

    /**
     * Creates the main settings panel with all UI controls
     * @returns {HTMLElement}
     */
    createSettingsPanel() {
        const panel = el('div', { className: 'ptmt-settings-panel' });
        this.rootElement = panel;

        const globalSettings = el('fieldset', {}, el('legend', {}, 'Global Layout'));

        globalSettings.append(
            this.createSettingCheckbox('Show Left Column', 'showLeftPane'),
            this.createSettingCheckbox('Show Right Column', 'showRightPane'),
            this.createSettingCheckbox('Show Icons Only (Global)', 'showIconsOnly'),
            this.createSettingCheckbox('Hiding some content on resize (for Chrome users)', 'hideContentWhileResizing')
        );

        const isMobile = this.settings.get('isMobile');
        const mobileToggleBtn = this.createMobileToggleButton(isMobile);
        globalSettings.append(mobileToggleBtn);

        const resetBtn = this.createResetButton();
        globalSettings.append(resetBtn);

        panel.append(globalSettings);

        const disclaimerContainer = this.createDisclaimer();
        panel.appendChild(disclaimerContainer);

        const supportLinksContainer = this.createSupportLinks();
        panel.appendChild(supportLinksContainer);

        return panel;
    }

    /**
     * Creates a checkbox setting control
     * @param {string} labelText
     * @param {string} settingKey
     * @returns {HTMLElement}
     */
    createSettingCheckbox(labelText, settingKey) {
        const id = `ptmt-global-${settingKey}`;
        const wrapper = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' } });
        const checkbox = el('input', { type: 'checkbox', id, checked: this.settings.get(settingKey) });
        const label = el('label', { for: id }, labelText);

        checkbox.addEventListener('change', (e) => {
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
    }

    /**
     * Creates the mobile/desktop toggle button
     * @param {boolean} isMobile
     * @returns {HTMLElement}
     */
    createMobileToggleButton(isMobile) {
        const mobileToggleBtn = el('button', {
            class: "menu_button menu_button_icon interactable ptmt-mobile-button",
            title: isMobile ? "Switch to Desktop Layout (Reloads page)" : "Switch to Mobile Layout (Reloads page)",
            tabindex: "0",
            role: "button"
        }, isMobile ? 'Switch to Desktop Layout' : 'Switch to Mobile Layout');

        mobileToggleBtn.addEventListener('click', () => this.appApi.toggleMobileMode());
        return mobileToggleBtn;
    }

    /**
     * Creates the reset layout button
     * @returns {HTMLElement}
     */
    createResetButton() {
        const resetBtn = el('button', {
            class: "menu_button menu_button_icon interactable ptmt-reset-button",
            title: "Reset all layout settings and reload the UI",
            tabindex: "0",
            role: "button"
        }, 'Reset Layout to Default');

        resetBtn.addEventListener('click', () => this.appApi.resetLayout());
        return resetBtn;
    }

    /**
     * Creates the disclaimer/notice container
     * @returns {HTMLElement}
     */
    createDisclaimer() {
        return el('div', {
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
    }

    /**
     * Creates the support links section
     * @returns {HTMLElement}
     */
    createSupportLinks() {
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

        return supportLinksContainer;
    }

    /**
     * Cleanup method for consistency with other renderers
     */
    cleanup() {
        // SettingsUIRenderer doesn't have external listeners to clean up
    }
}
