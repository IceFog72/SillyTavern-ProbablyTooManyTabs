import { el } from '../utils.js';
import { EVENTS } from '../constants.js';
import { SettingsManager } from '../settings.js';
import { moveBg1ToSheld, moveBg1BackToPtmtMain } from '../misc-helpers.js';

export function createSettingsPanel(manager) {
    const { settings, appApi } = manager;
    const panel = el('div', { className: 'ptmt-settings-panel' });
    manager.rootElement = panel;

    const topSection = el('div', { className: 'ptmt-settings-top-section' });
    const globalSettings = el('fieldset', { className: 'ptmt-settings-fieldset' }, el('legend', {}, 'Global Layout'));
    const globalGrid = el('div', { className: 'ptmt-settings-grid' });
    globalSettings.appendChild(globalGrid);

    const createSettingCheckbox = (labelText, settingKey) => {
        const id = `ptmt-global-${settingKey}`;
        const wrapper = el('div', { className: 'ptmt-setting-row' });
        const checkbox = el('input', { type: 'checkbox', id, checked: settings.get(settingKey) });
        const label = el('label', { for: id }, labelText);

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked === false) {
                const colName = settingKey === 'showLeftPane' ? 'left' : (settingKey === 'showRightPane' ? 'right' : null);
                if (colName) {
                    const refs = appApi._refs();
                    const colEl = refs[`${colName}Body`];
                    if (colEl && colEl.querySelector('[data-source-id="ptmt-settings-wrapper-content"]')) {
                        alert("Cannot hide this column because it contains the Layout Settings tab. Move the tab to another column first.");
                        e.target.checked = true;
                        return;
                    }
                }
            }

            // Special handling for moveBg1ToSheld
            if (settingKey === 'moveBg1ToSheld') {
                if (e.target.checked) {
                    moveBg1ToSheld();
                } else {
                    moveBg1BackToPtmtMain();
                }
            }

            settings.update({ [settingKey]: e.target.checked });
        });

        wrapper.append(checkbox, label);
        return wrapper;
    };

    const optimizeVisibilityCheckbox = createSettingCheckbox('Optimize Performance with Long Chat', 'optimizeMessageVisibility');
    optimizeVisibilityCheckbox.classList.add('ptmt-setting-sub-item');
    optimizeVisibilityCheckbox.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
    optimizeVisibilityCheckbox.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';

    const optimizeNotice = el('div', { className: 'ptmt-setting-notice ptmt-setting-notice-item' },
        el('i', { className: 'fa-solid fa-circle-info ptmt-small-icon' }),
        'Minor scroll jumps possible until messages are viewed once.'
    );

    // Wrap checkbox and notice in a container to keep them grouped
    const optimizeContainer = el('div', { className: 'ptmt-full-width-container' },
        optimizeVisibilityCheckbox,
        optimizeNotice
    );

    const autoContrastCheckbox = createSettingCheckbox('Auto Contrast Text Colors', 'enableAutoContrast');
    autoContrastCheckbox.classList.add('ptmt-setting-sub-item');
    autoContrastCheckbox.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
    autoContrastCheckbox.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';

    const overridesCheckbox = createSettingCheckbox('Extension CSS Overrides', 'enableOverride1');
    const overridesInput = overridesCheckbox.querySelector('input');

    const validateCss = (val) => /^-?\d*\.?\d+\s*(?:px|vh|vw|%|em|rem|vmin|vmax)$/i.test(val.trim());
    const createDimensionItem = (label, key) => {
        const inp = el('input', {
            type: 'text',
            value: settings.get(key),
            className: 'text_pole textarea_compact ptmt-dimension-input',
            title: 'Valid CSS units: px, vh, vw, %, em, rem, vmin, vmax'
        });
        const row = el('div', { className: 'ptmt-dimension-row' },
            el('label', { className: 'ptmt-dimension-label' }, label),
            inp
        );

        const updateUI = (val) => {
            if (validateCss(val)) {
                inp.style.borderColor = '';
                settings.update({ [key]: val.trim().toLowerCase() });
            } else {
                inp.style.setProperty('border-color', 'red', 'important');
            }
        };

        inp.addEventListener('input', (e) => updateUI(e.target.value));
        return { row, inp };
    };

    const createFactorItem = (label, key) => {
        const inp = el('input', {
            type: 'number',
            value: settings.get(key),
            step: '0.1',
            min: '0.1',
            max: '5',
            className: 'text_pole textarea_compact ptmt-dimension-input',
            title: 'Multiplier (0.1 – 5)'
        });
        const row = el('div', { className: 'ptmt-dimension-row' },
            el('label', { className: 'ptmt-dimension-label' }, label),
            inp
        );

        inp.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (val >= 0.1 && val <= 5) {
                inp.style.borderColor = '';
                settings.update({ [key]: val.toString() });
            } else {
                inp.style.setProperty('border-color', 'red', 'important');
            }
        });
        return { row, inp };
    };

    // Avatar size dialog
    const openAvatarDialog = () => {
        const existing = document.getElementById('ptmt-avatar-settings-dialog');
        if (existing) { existing.remove(); return; }

        const createDimensionInput = (label, key) => {
            const inp = el('input', {
                type: 'text',
                value: settings.get(key),
                className: 'text_pole textarea_compact ptmt-vs-avatar-input',
                title: 'Valid CSS units: px, vh, vw, %, em, rem, vmin, vmax',
            });
            const validateCss = (val) => /^-?\d*\.?\d+\s*(?:px|vh|vw|%|em|rem|vmin|vmax)$/i.test(val.trim());

            const updateUI = (val) => {
                if (validateCss(val)) {
                    inp.style.borderColor = '';
                    settings.update({ [key]: val.trim().toLowerCase() });
                } else {
                    inp.style.setProperty('border-color', 'red', 'important');
                }
            };

            inp.addEventListener('input', (e) => updateUI(e.target.value));
            return inp;
        };

        const createFactorInput = (label, key) => {
            const inp = el('input', {
                type: 'number',
                value: settings.get(key),
                step: '0.1',
                min: '0.1',
                max: '5',
                className: 'text_pole textarea_compact ptmt-vs-avatar-input',
                title: 'Multiplier (0.1 – 5)',
            });

            inp.addEventListener('change', (e) => {
                const val = parseFloat(e.target.value);
                if (val >= 0.1 && val <= 5) {
                    inp.style.borderColor = '';
                    settings.update({ [key]: val.toString() });
                } else {
                    inp.style.setProperty('border-color', 'red', 'important');
                }
            });
            return inp;
        };

        const createField = (labelText, input) => {
            return el('div', { className: 'ptmt-vs-avatar-field' },
                el('label', { className: 'ptmt-vs-avatar-label' }, labelText),
                input
            );
        };

        // Dialog content sections
        const chatSection = el('div', { className: 'ptmt-vs-section' },
            el('h4', { className: 'ptmt-vs-section-title' },
                el('i', { className: 'fa-solid fa-images ptmt-small-icon' }),
                'Chat Messages (Big Avatars)'
            ),
            createField('Height (base)', createDimensionInput('Height (base)', 'avatarBaseHeight')),
            createField('Width (base)', createDimensionInput('Width (base)', 'avatarBaseWidth')),
            createField('Scale Width', createFactorInput('Scale Width', 'avatarScaleWidth')),
            createField('Scale Height', createFactorInput('Scale Height', 'avatarScaleHeight'))
        );

        const normalSection = el('div', { className: 'ptmt-vs-section' },
            el('h4', { className: 'ptmt-vs-section-title' },
                el('i', { className: 'fa-solid fa-comments ptmt-small-icon' }),
                'Chat Messages (Normal)'
            ),
            createField('Avatar Size', createDimensionInput('Avatar Size', 'normalAvatarSize'))
        );

        const charListSection = el('div', { className: 'ptmt-vs-section' },
            el('h4', { className: 'ptmt-vs-section-title' },
                el('i', { className: 'fa-solid fa-people-group ptmt-small-icon' }),
                'Character List'
            ),
            createField('Avatar Width', createDimensionInput('Avatar Width', 'charListAvatarWidth')),
            createField('Avatar Height', createDimensionInput('Avatar Height', 'charListAvatarHeight')),
            createField('Scale', createFactorInput('Scale', 'charListAvatarScale'))
        );

        const resetBtn = el('button', {
            className: 'ptmt-vs-button secondary',
            type: 'button'
        },
            el('i', { className: 'fa-solid fa-rotate-right ptmt-small-icon' }),
            'Reset All'
        );

        const closeBtn = el('button', {
            className: 'ptmt-vs-button primary',
            type: 'button'
        },
            el('i', { className: 'fa-solid fa-check ptmt-small-icon' }),
            'Close'
        );

        const footer = el('div', { className: 'ptmt-vs-footer' }, resetBtn, closeBtn);

        const dialog = el('div', {
            id: 'ptmt-avatar-settings-dialog',
            className: 'ptmt-view-settings-dialog'
        },
            el('div', { className: 'ptmt-vs-content' },
                el('h3', { className: 'ptmt-vs-title' },
                    el('i', { className: 'fa-solid fa-image ptmt-small-icon' }),
                    'Avatar Size Settings'
                ),
                chatSection,
                normalSection,
                charListSection,
                footer
            )
        );

        closeBtn.addEventListener('click', () => dialog.remove());
        resetBtn.addEventListener('click', () => {
            const defaults = SettingsManager.defaultSettings;
            settings.update({
                avatarBaseHeight: defaults.avatarBaseHeight,
                avatarBaseWidth: defaults.avatarBaseWidth,
                normalAvatarSize: defaults.normalAvatarSize,
                avatarScaleWidth: defaults.avatarScaleWidth,
                avatarScaleHeight: defaults.avatarScaleHeight,
                charListAvatarWidth: defaults.charListAvatarWidth,
                charListAvatarHeight: defaults.charListAvatarHeight,
                charListAvatarScale: defaults.charListAvatarScale
            });
            dialog.remove();
            openAvatarDialog(); // Reopen to show reset values
        });

        document.body.appendChild(dialog);
    };

    const avatarDialogBtn = el('button', {
        className: 'menu_button interactable ptmt-button-compact'
    }, 'Avatar Sizes');
    avatarDialogBtn.addEventListener('click', openAvatarDialog);

    const avatarRow = el('div', {
        className: 'ptmt-setting-row ptmt-setting-sub-item ptmt-avatar-row'
    },
        el('label', { className: 'ptmt-avatar-label' }, 'Avatar Sizes:'),
        avatarDialogBtn
    );

    const syncVisibility = (enabled) => {
        const display = enabled ? '' : 'none';
        avatarRow.style.display = enabled ? 'flex' : 'none';
        autoContrastCheckbox.style.display = display;
        optimizeVisibilityCheckbox.style.display = display;
        optimizeNotice.style.display = display;
    };
    syncVisibility(settings.get('enableOverride1'));
    overridesInput.addEventListener('change', (e) => syncVisibility(e.target.checked));

    // Background color picker
    const bodyBgColorValue = settings.get('bodyBgColor') || 'rgb(89, 0, 255)';

    // Ensure toolcool-color-picker script is loaded
    if (typeof customElements !== 'undefined' && !customElements.get('toolcool-color-picker')) {
        const script = document.createElement('script');
        script.src = '/lib/toolcool-color-picker.js';
        document.head.appendChild(script);
    }

    const bgColorPicker = el('toolcool-color-picker', {
        'popup-position': 'left',
        'button-width': '60px',
        'button-height': '32px'
    });
    bgColorPicker.setAttribute('color', bodyBgColorValue);

    bgColorPicker.addEventListener('change', (evt) => {
        const newColor = evt.detail?.hex8 || evt.detail?.hex || bodyBgColorValue;
        settings.update({ bodyBgColor: newColor });
        // Update CSS variable in real-time
        document.documentElement.style.setProperty('--ptmt-body-bg-color', newColor);
    });

    // Apply color on initialization
    document.documentElement.style.setProperty('--ptmt-body-bg-color', bodyBgColorValue);

    const bgColorContainer = el('div',
        {
            className: 'ptmt-setting-row ptmt-full-width-container',
            style: {
                display: settings.get('moveBg1ToSheld') ? 'flex' : 'none'
            }
        },
        bgColorPicker,
        el('label', { className: 'ptmt-bg-color-label' }, 'Background Color')
    );

    // Create moveBg1ToSheld checkbox separately to control bgColorContainer visibility
    const moveBg1Checkbox = createSettingCheckbox('Move BG under Chat', 'moveBg1ToSheld');
    const moveBg1Input = moveBg1Checkbox.querySelector('input');

    // Add listener to control bgColorContainer visibility
    moveBg1Input.addEventListener('change', (e) => {
        bgColorContainer.style.display = e.target.checked ? 'flex' : 'none';
    });

    globalGrid.append(
        createSettingCheckbox('Show Left Column', 'showLeftPane'),
        createSettingCheckbox('Show Right Column', 'showRightPane'),
        createSettingCheckbox('Auto-Open First Center Tab', 'autoOpenFirstCenterTab'),
        createSettingCheckbox('Show Icons Only (Global)', 'showIconsOnly'),
        createSettingCheckbox('Auto-Hide Tab Strip (Global)', 'tabStripAutoHide'),
        createSettingCheckbox('Show Context Size Status Bar', 'showContextStatusBar'),
        createSettingCheckbox('Sync Avatar with Expression', 'enableAvatarExpressionSync'),
        createSettingCheckbox('Hide on resize (Chrome)', 'hideContentWhileResizing'),
        moveBg1Checkbox,
        bgColorContainer
    );

    // ─── Extension CSS Overrides Fieldset ────────────────────────────────────────
    const overridesFieldset = el('fieldset', { className: 'ptmt-settings-fieldset' }, el('legend', {}, 'Extension CSS Overrides'));
    const overridesGrid = el('div', { className: 'ptmt-settings-grid' });
    overridesFieldset.appendChild(overridesGrid);

    const overridesCheckboxForFieldset = createSettingCheckbox('Enable CSS Overrides', 'enableOverride1');
    overridesCheckboxForFieldset.style.gridColumn = 'span 2';

    const avatarRowForFieldset = el('div', {
        className: 'ptmt-setting-row ptmt-setting-sub-item ptmt-avatar-row'
    },
        el('label', { className: 'ptmt-avatar-label' }, 'Avatar Sizes:'),
        avatarDialogBtn
    );
    avatarRowForFieldset.style.display = settings.get('enableOverride1') ? 'flex' : 'none';

    const autoContrastCheckboxForFieldset = createSettingCheckbox('Auto Contrast Text Colors', 'enableAutoContrast');
    autoContrastCheckboxForFieldset.classList.add('ptmt-setting-sub-item');
    autoContrastCheckboxForFieldset.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
    autoContrastCheckboxForFieldset.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';
    autoContrastCheckboxForFieldset.style.display = settings.get('enableOverride1') ? 'flex' : 'none';

    const optimizeVisibilityCheckboxForFieldset = createSettingCheckbox('Optimize Performance with Long Chat', 'optimizeMessageVisibility');
    optimizeVisibilityCheckboxForFieldset.classList.add('ptmt-setting-sub-item');
    optimizeVisibilityCheckboxForFieldset.style.opacity = settings.get('enableOverride1') ? '1' : '0.5';
    optimizeVisibilityCheckboxForFieldset.style.pointerEvents = settings.get('enableOverride1') ? 'auto' : 'none';
    optimizeVisibilityCheckboxForFieldset.style.display = settings.get('enableOverride1') ? 'flex' : 'none';

    const optimizeNoticeForFieldset = el('div', { className: 'ptmt-setting-notice ptmt-setting-notice-item', style: { display: settings.get('enableOverride1') ? 'flex' : 'none' } },
        el('i', { className: 'fa-solid fa-circle-info ptmt-small-icon' }),
        'Minor scroll jumps possible until messages are viewed once.'
    );

    const optimizeContainerForFieldset = el('div', { className: 'ptmt-full-width-container', style: { display: settings.get('enableOverride1') ? 'flex' : 'none' } },
        optimizeVisibilityCheckboxForFieldset,
        optimizeNoticeForFieldset
    );

    const overridesCheckboxInputForFieldset = overridesCheckboxForFieldset.querySelector('input');
    const syncFieldsetVisibility = (enabled) => {
        avatarRowForFieldset.style.display = enabled ? 'flex' : 'none';
        autoContrastCheckboxForFieldset.style.display = enabled ? 'flex' : 'none';
        optimizeVisibilityCheckboxForFieldset.style.display = enabled ? 'flex' : 'none';
        optimizeNoticeForFieldset.style.display = enabled ? 'flex' : 'none';
        optimizeContainerForFieldset.style.display = enabled ? 'flex' : 'none';
        autoContrastCheckboxForFieldset.style.opacity = enabled ? '1' : '0.5';
        autoContrastCheckboxForFieldset.style.pointerEvents = enabled ? 'auto' : 'none';
        optimizeVisibilityCheckboxForFieldset.style.opacity = enabled ? '1' : '0.5';
        optimizeVisibilityCheckboxForFieldset.style.pointerEvents = enabled ? 'auto' : 'none';
    };
    overridesCheckboxInputForFieldset.addEventListener('change', (e) => syncFieldsetVisibility(e.target.checked));

    overridesGrid.append(
        overridesCheckboxForFieldset,
        avatarRowForFieldset,
        autoContrastCheckboxForFieldset,
        optimizeContainerForFieldset
    );

    // ─── UI Theme Selector ───────────────────────────────────────────────────────
    const themeSelector = el('select', {
        id: 'ptmt-ui-theme-selector',
        className: 'text_edit'
    });

    const themes = SettingsManager.getAvailableThemes?.() || [];
    const defaultTheme = SettingsManager.themes ? Object.keys(SettingsManager.themes)[0] : 'sharp';
    const currentTheme = settings.get('uiTheme') || defaultTheme;

    themes.forEach(theme => {
        const opt = el('option', {
            value: theme.id,
            selected: theme.id === currentTheme
        }, `${theme.name} ${theme.description}`);
        themeSelector.appendChild(opt);
    });

    themeSelector.addEventListener('change', (e) => {
        const themeName = e.target.value;
        settings.update({ uiTheme: themeName });
        SettingsManager.applyTheme(themeName);
    });

    const themeSelectorRow = el('div', { className: 'ptmt-setting-row ptmt-grid-span-1' },
        el('label', { for: 'ptmt-ui-theme-selector' }, 'UI Theme'),
        themeSelector
    );

    globalGrid.append(themeSelectorRow);

    const isMobile = settings.get('isMobile');
    const mobileToggleBtn = el('button', {
        class: "menu_button menu_button_icon interactable ptmt-mobile-button ptmt-grid-span-1",
        title: isMobile ? "Switch to Desktop Layout (Reloads page)" : "Switch to Mobile Layout (Reloads page)",
        tabindex: "0",
        role: "button"
    }, isMobile ? 'Switch to Desktop Layout' : 'Switch to Mobile Layout');

    mobileToggleBtn.addEventListener('click', () => appApi.toggleMobileMode());
    globalGrid.append(mobileToggleBtn);

    const resetBtn = el('button', {
        class: "menu_button menu_button_icon interactable ptmt-reset-button ptmt-grid-span-1",
        title: "Reset all layout settings and reload the UI",
        tabindex: "0",
        role: "button"
    }, 'Reset Layout to Default');

    resetBtn.addEventListener('click', () => appApi.resetLayout());

    globalGrid.append(resetBtn);

    const colorizerSettings = createDialogueColorizerSettings(settings);
    colorizerSettings.className = 'ptmt-settings-fieldset';
    topSection.append(globalSettings, overridesFieldset, colorizerSettings);
    panel.append(topSection);

    manager.renderUnifiedEditor();

    const disclaimerContainer = el('div', { className: 'ptmt-disclaimer-container' },
        el('span', { className: 'ptmt-disclaimer-icon' }, '⚠️'),
        el('div', { className: 'ptmt-disclaimer-content' },
            el('strong', {}, 'Please Note:'),
            el('p', {}, 'To ensure compatibility, your custom layout may be automatically reset after major updates to the layout system.'),
            el('p', {}, 'If you install a supported extension and its tab does not appear, you may need to reset the layout for it to be added.'),
            el('p', {}, 'Pending Tabs lists extensions or panels available for columns that are not currently in active layout.'),
            el('p', {}, 'For additional extension tab requests, reach out to me on Discord.')
        )
    );
    panel.appendChild(disclaimerContainer);

    const supportLinksContainer = el('div', { className: 'ptmt-support-footer' }, 'Feedback/support');
    const linksWrapper = el('div', { className: 'ptmt-support-links' });
    const discordLink = el('a', { href: 'https://discord.gg/2tJcWeMjFQ', target: '_blank', rel: 'noopener noreferrer', className: 'ptmt-support-link' }, 'Discord (IceFog\'s AI Brew Bar)');
    const patreonLink = el('a', { href: 'https://www.patreon.com/cw/IceFog72', target: '_blank', rel: 'noopener noreferrer', className: 'ptmt-support-link' }, 'Patreon');

    linksWrapper.append(discordLink, patreonLink);
    supportLinksContainer.appendChild(linksWrapper);
    panel.appendChild(supportLinksContainer);

    if (manager._layoutChangeHandler) {
        window.removeEventListener(EVENTS.LAYOUT_CHANGED, manager._layoutChangeHandler);
    }
    manager._layoutChangeHandler = () => manager.renderUnifiedEditor();
    window.addEventListener(EVENTS.LAYOUT_CHANGED, manager._layoutChangeHandler);

    return panel;
}

export function createDialogueColorizerSettings(settings) {
    const row = (children, extra = {}) =>
        el('div', { className: 'ptmt-setting-row', ...extra }, ...children);

    const lbl = (text, forId) => el('label', forId ? { for: forId } : {}, text);

    const checkbox = (id, key) => {
        const inp = el('input', { type: 'checkbox', id, checked: settings.get(key) });
        inp.addEventListener('change', e => settings.update({ [key]: e.target.checked }));
        return inp;
    };

    const dropdown = (id, key, options) => {
        const sel = el('select', { id });
        options.forEach(o => sel.appendChild(el('option', { value: o.value, selected: settings.get(key) === o.value }, o.label)));
        sel.addEventListener('change', e => settings.update({ [key]: e.target.value }));
        if (typeof settings.get(key) === 'number') {
            sel.addEventListener('change', e => settings.update({ [key]: parseInt(e.target.value, 10) }));
        }
        return sel;
    };

    const colorPicker = (id, key) => {
        const value = settings.get(key);

        // Ensure toolcool-color-picker is loaded
        if (typeof customElements !== 'undefined' && !customElements.get('toolcool-color-picker')) {
            const script = document.createElement('script');
            script.src = '/lib/toolcool-color-picker.js';
            document.head.appendChild(script);
        }

        // Create toolcool-color-picker with base attributes
        const pickerElement = el('toolcool-color-picker', {
            id,
            'popup-position': 'left',
            'button-width': '40px',
            'button-height': '32px'
        });

        // Explicitly set color attribute for proper initialization
        pickerElement.setAttribute('color', value);

        // Update settings when color changes (use hex8 to preserve alpha)
        pickerElement.addEventListener('change', (e) => {
            const newColor = e.detail.hex8 || e.detail.hex || value;
            settings.update({ [key]: newColor });
        });

        return pickerElement;
    };

    const sourceOptions = [
        { value: 'avatar_vibrant', label: 'Avatar Vibrant (auto)' },
        { value: 'static_color', label: 'Static Color' },
    ];

    const container = el('fieldset', { className: 'ptmt-settings-fieldset' }, el('legend', {}, 'Dialogue Colorizer'));
    const grid = el('div', { className: 'ptmt-settings-grid' });
    container.appendChild(grid);

    grid.appendChild(row([
        checkbox('ptmt-col-enable', 'enableDialogueColorizer'),
        lbl('Enable Dialogue Colorizer', 'ptmt-col-enable'),
    ]));

    const targetSel = dropdown('ptmt-col-target', 'dialogueColorizerColorizeTarget', [
        { value: '1', label: 'Quoted Text Only' },
        { value: '2', label: 'Chat Bubbles Only' },
        { value: '3', label: 'Both' },
    ]);
    targetSel.value = String(settings.get('dialogueColorizerColorizeTarget') ?? 1);
    grid.appendChild(row([lbl('Colorize Target', 'ptmt-col-target'), targetSel]));

    const dialogModeSel = dropdown('ptmt-col-dialog-mode', 'dialogueColorizerDialogColorMode', [
        { value: '1', label: '1st Dominant' },
        { value: '2', label: '2nd Dominant' },
    ]);
    dialogModeSel.value = String(settings.get('dialogueColorizerDialogColorMode') ?? 1);
    grid.appendChild(row([lbl('Dialogue Color Mode', 'ptmt-col-dialog-mode'), dialogModeSel]));

    const bubbleModeSel = dropdown('ptmt-col-bubble-mode', 'dialogueColorizerBubbleColorMode', [
        { value: '1', label: '1st Dominant' },
        { value: '2', label: '2nd Dominant' },
        { value: '3', label: 'Gradient' },
    ]);
    bubbleModeSel.value = String(settings.get('dialogueColorizerBubbleColorMode') ?? 3);
    grid.appendChild(row([lbl('Bubble Color Mode', 'ptmt-col-bubble-mode'), bubbleModeSel]));

    const opacityBotVal = el('span', { className: 'ptmt-opacity-value' }, `${Math.round((settings.get('dialogueColorizerBubbleOpacityBot') ?? 0.1) * 100)}%`);
    const opacityBotSlider = el('input', {
        type: 'range', min: '0', max: '1', step: '0.01',
        value: settings.get('dialogueColorizerBubbleOpacityBot') ?? 0.1,
        className: 'ptmt-opacity-slider'
    });
    opacityBotSlider.addEventListener('input', () => {
        const val = parseFloat(opacityBotSlider.value);
        opacityBotVal.textContent = `${Math.round(val * 100)}%`;
        settings.update({ dialogueColorizerBubbleOpacityBot: val });
    });
    grid.appendChild(row([lbl('Char Bubble Opacity', 'ptmt-bubble-opacity-bot'), opacityBotSlider, opacityBotVal]));

    const opacityUserVal = el('span', { className: 'ptmt-opacity-value' }, `${Math.round((settings.get('dialogueColorizerBubbleOpacityUser') ?? 0.1) * 100)}%`);
    const opacityUserSlider = el('input', {
        type: 'range', min: '0', max: '1', step: '0.01',
        value: settings.get('dialogueColorizerBubbleOpacityUser') ?? 0.1,
        className: 'ptmt-opacity-slider'
    });
    opacityUserSlider.addEventListener('input', () => {
        const val = parseFloat(opacityUserSlider.value);
        opacityUserVal.textContent = `${Math.round(val * 100)}%`;
        settings.update({ dialogueColorizerBubbleOpacityUser: val });
    });
    grid.appendChild(row([lbl('User Bubble Opacity', 'ptmt-bubble-opacity-user'), opacityUserSlider, opacityUserVal]));

    const charSection = el('fieldset', {}, el('legend', {}, 'Characters'));
    const charDialogSrc = row([lbl('Dialogue Color Source', 'ptmt-col-charsrc'), dropdown('ptmt-col-charsrc', 'dialogueColorizerSource', sourceOptions)]);
    const charDialogStatic = row([colorPicker('ptmt-col-charstaticcolor', 'dialogueColorizerStaticColor'), lbl('Dialogue Static Color', 'ptmt-col-charstaticcolor')]);
    const charBubbleSrc = row([lbl('Bubble Color Source', 'ptmt-col-charbubblesrc'), dropdown('ptmt-col-charbubblesrc', 'dialogueColorizerBubbleSource', sourceOptions)]);
    const charBubbleStatic = row([
        el('div', { className: 'ptmt-color-picker-pair' },
            colorPicker('ptmt-col-charbubblestatic1', 'dialogueColorizerBubbleStaticColor1'),
            colorPicker('ptmt-col-charbubblestatic2', 'dialogueColorizerBubbleStaticColor2')
        ),
        lbl('Bubble Static Colors (Gradients)', 'ptmt-col-charbubblestatic'),
    ]);

    const syncCharVis = () => {
        charDialogStatic.style.display = charDialogSrc.querySelector('select').value === 'static_color' ? 'flex' : 'none';
        charBubbleStatic.style.display = charBubbleSrc.querySelector('select').value === 'static_color' ? 'flex' : 'none';
    };
    charDialogSrc.querySelector('select').addEventListener('change', syncCharVis);
    charBubbleSrc.querySelector('select').addEventListener('change', syncCharVis);
    syncCharVis();
    charSection.append(charDialogSrc, charDialogStatic, charBubbleSrc, charBubbleStatic);
    grid.appendChild(charSection);

    const personaSection = el('fieldset', {}, el('legend', {}, 'Personas (User)'));
    const personaDialogSrc = row([lbl('Dialogue Color Source', 'ptmt-col-personasrc'), dropdown('ptmt-col-personasrc', 'dialogueColorizerPersonaSource', sourceOptions)]);
    const personaDialogStatic = row([colorPicker('ptmt-col-personastaticcolor', 'dialogueColorizerPersonaStaticColor'), lbl('Dialogue Static Color', 'ptmt-col-personastaticcolor')]);
    const personaBubbleSrc = row([lbl('Bubble Color Source', 'ptmt-col-personabubblesrc'), dropdown('ptmt-col-personabubblesrc', 'dialogueColorizerPersonaBubbleSource', sourceOptions)]);
    const personaBubbleStatic = row([
        el('div', { className: 'ptmt-color-picker-pair' },
            colorPicker('ptmt-col-personabubblestatic1', 'dialogueColorizerPersonaBubbleStaticColor1'),
            colorPicker('ptmt-col-personabubblestatic2', 'dialogueColorizerPersonaBubbleStaticColor2')
        ),
        lbl('Bubble Static Colors (Gradients)', 'ptmt-col-personabubblestatic'),
    ]);

    const syncPersonaVis = () => {
        personaDialogStatic.style.display = personaDialogSrc.querySelector('select').value === 'static_color' ? 'flex' : 'none';
        personaBubbleStatic.style.display = personaBubbleSrc.querySelector('select').value === 'static_color' ? 'flex' : 'none';
    };
    personaDialogSrc.querySelector('select').addEventListener('change', syncPersonaVis);
    personaBubbleSrc.querySelector('select').addEventListener('change', syncPersonaVis);
    syncPersonaVis();
    personaSection.append(personaDialogSrc, personaDialogStatic, personaBubbleSrc, personaBubbleStatic);
    grid.appendChild(personaSection);

    return container;
}
