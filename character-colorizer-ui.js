/**
 * Character/Persona Personal Colorizer UI
 * 
 * Injects colorizer controls for individual characters and personas,
 * using the inline-drawer SillyTavern structure and toolcool-color-picker.
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { settings } from './settings.js';
import { el, trackObserver } from './utils.js';

// ─── Ensure color picker library is loaded ────────────────────────────────────

function ensureColorPickerLoaded() {
    if (typeof customElements !== 'undefined' && !customElements.get('toolcool-color-picker')) {
        const script = document.createElement('script');
        script.src = '/lib/toolcool-color-picker.js';
        document.head.appendChild(script);
    }
}

// ─── UI Builders ──────────────────────────────────────────────────────────────

/**
 * Build colorizer UI using inline-drawer structure
 * Mimics the structure of #spoiler_free_desc from SillyTavern
 */
function createPersonalColorizerUI(isPersona = false) {
    ensureColorPickerLoaded();

    const sourceOptions = [
        { value: 'avatar_vibrant', label: 'Avatar Vibrant (auto)' },
        { value: 'static_color', label: 'Static Color' },
    ];

    const prefix = isPersona ? 'ptmt-pchar-col' : 'ptmt-char-col';
    const title = isPersona ? 'Persona Dialogue Colorizer' : 'Character Dialogue Colorizer';

    // Color picker: uses toolcool-color-picker like layout settings
    const colorPicker = (id, initialColor) => {
        const pickerElement = el('toolcool-color-picker', {
            id,
            'popup-position': 'left',
            'button-width': '40px',
            'button-height': '32px'
        });
        pickerElement.setAttribute('color', initialColor);
        return pickerElement;
    };

    // Dropdown
    const dropdown = (id, options, selectedValue) => {
        const select = el('select', { id });
        options.forEach(opt => {
            const option = el('option', { value: opt.value, selected: selectedValue === opt.value }, opt.label);
            select.appendChild(option);
        });
        return select;
    };

    // Checkbox
    const checkbox = (id) => el('input', { type: 'checkbox', id });

    // Label
    const lbl = (text, forId) => el('label', { htmlFor: forId }, text);

    // Setting row - matches SettingsPanel.js format (array of children)
    const row = (children, extra = {}) => el('div', { className: 'ptmt-setting-row', ...extra }, ...children);

    // Main inline-drawer structure (matching #spoiler_free_desc pattern)
    const container = el('div', { id: `${prefix}-drawer`, className: 'inline-drawer flex-container flexFlowColumn flexNoGap' });

    // Header with title and toggle button
    const headerDiv = el('div', { className: 'inline-drawer-toggle inline-drawer-header padding0 gap5px standoutHeader' });
    const titleDiv = el('div', { className: 'title_restorable flexGap5 wide100p' });
    const titleSpan = el('span', { className: 'flex1' }, title);
    const toggleIcon = el('div', { className: 'inline-drawer-icon fa-solid interactable down fa-circle-chevron-down', tabindex: '0', role: 'button' });

    titleDiv.appendChild(titleSpan);
    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(el('div', { className: 'flex-container widthFitContent' }, toggleIcon));

    // Content area
    const contentWrapper = el('div', { className: 'inline-drawer-content', style: 'display: none;' });
    const contentArea = el('div', { className: 'ptmt-char-colorizer-content' });
    contentWrapper.appendChild(contentArea);

    // Add to container
    container.appendChild(headerDiv);
    container.appendChild(contentWrapper);

    // Enable checkbox row
    const enableCheckbox = checkbox(`${prefix}-enable`);
    contentArea.appendChild(row([
        enableCheckbox,
        lbl('Enable Personal Dialogue Colorizer', `${prefix}-enable`)
    ]));

    // Settings section (shown/hidden by enable checkbox)
    const settingsSection = el('div', { style: 'display: none;' });

    // Colorize Target dropdown
    const targetSelect = dropdown(`${prefix}-target`, [
        { value: '1', label: 'Quoted Text Only' },
        { value: '2', label: 'Chat Bubbles Only' },
        { value: '3', label: 'Both' },
    ], '3');
    settingsSection.appendChild(row([
        lbl('Colorize Target', `${prefix}-target`),
        targetSelect
    ]));

    // Dialog color source
    const dialogSrcSelect = dropdown(`${prefix}-dialog-src`, sourceOptions, 'avatar_vibrant');
    settingsSection.appendChild(row([
        lbl('Dialogue Color Source', `${prefix}-dialog-src`),
        dialogSrcSelect
    ]));

    // Dialogue static color (hidden by default)
    const dialogStaticColor = colorPicker(`${prefix}-dialog-static`, '#da6745ff');
    const dialogStaticRow = row([
        dialogStaticColor,
        lbl('Dialogue Static Color', `${prefix}-dialog-static`)
    ]);
    dialogStaticRow.style.display = 'none';
    settingsSection.appendChild(dialogStaticRow);

    // Dialogue Color Mode dropdown
    const dialogModeSelect = dropdown(`${prefix}-dialog-mode`, [
        { value: '1', label: '1st Dominant' },
        { value: '2', label: '2nd Dominant' },
    ], '1');
    settingsSection.appendChild(row([
        lbl('Dialogue Color Mode', `${prefix}-dialog-mode`),
        dialogModeSelect
    ]));

    // Bubble color source
    const bubbleSrcSelect = dropdown(`${prefix}-bubble-src`, sourceOptions, 'avatar_vibrant');
    settingsSection.appendChild(row([
        lbl('Bubble Color Source', `${prefix}-bubble-src`),
        bubbleSrcSelect
    ]));

    // Bubble static colors (hidden by default)
    const bubbleStatic1 = colorPicker(`${prefix}-bubble-static-1`, '#da6745ff');
    const bubbleStatic2 = colorPicker(`${prefix}-bubble-static-2`, '#da6745ff');
    const bubbleStaticRow = row([
        el('div', { className: 'ptmt-color-picker-pair' },
            bubbleStatic1,
            bubbleStatic2
        ),
        lbl('Bubble Static Colors (Gradient)', `${prefix}-bubble-static-1`)
    ]);
    bubbleStaticRow.style.display = 'none';
    settingsSection.appendChild(bubbleStaticRow);

    // Bubble Color Mode dropdown
    const bubbleModeSelect = dropdown(`${prefix}-bubble-mode`, [
        { value: '1', label: '1st Dominant' },
        { value: '2', label: '2nd Dominant' },
        { value: '3', label: 'Gradient' },
    ], '3');
    settingsSection.appendChild(row([
        lbl('Bubble Color Mode', `${prefix}-bubble-mode`),
        bubbleModeSelect
    ]));

    // Opacity slider for character or user
    const opacityLabel = isPersona ? 'User Bubble Opacity' : 'Char Bubble Opacity';
    const defaultOpacity = isPersona ? 0.1 : 0.1;
    const opacityVal = el('span', { className: 'ptmt-opacity-value' }, `${Math.round(defaultOpacity * 100)}%`);
    const opacitySlider = el('input', {
        type: 'range', min: '0', max: '1', step: '0.01',
        value: defaultOpacity.toString(),
        className: 'ptmt-opacity-slider'
    });
    opacitySlider.addEventListener('input', () => {
        const val = parseFloat(opacitySlider.value);
        opacityVal.textContent = `${Math.round(val * 100)}%`;
    });
    settingsSection.appendChild(row([
        lbl(opacityLabel, `${prefix}-opacity`),
        opacitySlider,
        opacityVal
    ]));

    contentArea.appendChild(settingsSection);

    // Toggle settings visibility based on enable checkbox
    enableCheckbox.addEventListener('change', () => {
        settingsSection.style.display = enableCheckbox.checked ? 'block' : 'none';
    });

    // Toggle static color visibility based on source selection
    const syncDialogVisibility = () => {
        dialogStaticRow.style.display = dialogSrcSelect.value === 'static_color' ? 'flex' : 'none';
    };
    const syncBubbleVisibility = () => {
        bubbleStaticRow.style.display = bubbleSrcSelect.value === 'static_color' ? 'flex' : 'none';
    };
    dialogSrcSelect.addEventListener('change', syncDialogVisibility);
    bubbleSrcSelect.addEventListener('change', syncBubbleVisibility);

    return {
        container,
        enableCheckbox,
        dialogSrcSelect,
        dialogStaticColor,
        bubbleSrcSelect,
        bubbleStatic1,
        bubbleStatic2,
        dialogStaticRow,
        bubbleStaticRow,
        settingsSection,
        targetSelect,
        dialogModeSelect,
        bubbleModeSelect,
        opacitySlider,
    };
}

// ─── Character Editor Integration ────────────────────────────────────────────

let charColorizerUI = null;
let currentCharacterId = null;
let currentAvatarFilename = null;

// Guard flags to prevent recursive updates
let isUpdatingCharSettings = false;
let isUpdatingPersonaSettings = false;

// ─── Update personal colorizer UI based on global enable setting ────────────────

function updatePersonalColorizerEnableState() {
    const globalEnabled = settings.get('enableDialogueColorizer');

    if (charColorizerUI?.container) {
        charColorizerUI.container.style.opacity = globalEnabled ? '1' : '0.5';
        charColorizerUI.container.style.pointerEvents = globalEnabled ? 'auto' : 'none';
        charColorizerUI.enableCheckbox.disabled = !globalEnabled;
    }

    if (personaColorizerUI?.container) {
        personaColorizerUI.container.style.opacity = globalEnabled ? '1' : '0.5';
        personaColorizerUI.container.style.pointerEvents = globalEnabled ? 'auto' : 'none';
        personaColorizerUI.enableCheckbox.disabled = !globalEnabled;
    }
}

/**
 * Generate unique character key from name + avatar to avoid collisions
 * e.g. "alice__alice_v1.png" for character "Alice" with avatar "alice_v1.png"
 */
function buildCharacterKey(charName, avatarFilename) {
    const normalizedName = charName.replace(/\W/g, '_').toLowerCase();
    return `${normalizedName}__${avatarFilename}`;
}

// Store latest color picker values (since getAttribute doesn't update in real-time)
let latestDialogStaticColor = '#da6745ff';
let latestBubbleStatic1 = '#da6745ff';
let latestBubbleStatic2 = '#da6745ff';
let latestPersonaDialogColor = '#537fddff';
let latestPersonaBubble1 = '#537fddff';
let latestPersonaBubble2 = '#537fddff';

/**
 * Initialize character editor UI
 * Finds/creates colorizer section above #spoiler_free_desc
 */
function initCharacterColorizer() {
    // Find the target element
    const spoilerFreeDiv = document.getElementById('spoiler_free_desc');
    if (!spoilerFreeDiv) {
        console.warn('[PTMT] Character editor #spoiler_free_desc not found, skipping char colorizer UI');
        return;
    }

    // Create and insert the colorizer UI above spoiler_free_desc
    const ui = createPersonalColorizerUI(false);
    charColorizerUI = ui;

    // Insert before spoiler_free_desc
    spoilerFreeDiv.parentElement.insertBefore(ui.container, spoilerFreeDiv);

    // Listen for settings changes
    ui.enableCheckbox.addEventListener('change', updateCharacterSettings);
    ui.dialogSrcSelect.addEventListener('change', updateCharacterSettings);
    ui.bubbleSrcSelect.addEventListener('change', updateCharacterSettings);

    // Color picker changes - capture the color value from event details
    ui.dialogStaticColor.addEventListener('change', (e) => {
        latestDialogStaticColor = e.detail.hex8 || e.detail.hex || latestDialogStaticColor;
        console.log(`[PTMT] Dialogue color picker changed: ${latestDialogStaticColor}`);
        updateCharacterSettings();
    });
    ui.bubbleStatic1.addEventListener('change', (e) => {
        latestBubbleStatic1 = e.detail.hex8 || e.detail.hex || latestBubbleStatic1;
        console.log(`[PTMT] Bubble static 1 color picker changed: ${latestBubbleStatic1}`);
        updateCharacterSettings();
    });
    ui.bubbleStatic2.addEventListener('change', (e) => {
        latestBubbleStatic2 = e.detail.hex8 || e.detail.hex || latestBubbleStatic2;
        console.log(`[PTMT] Bubble static 2 color picker changed: ${latestBubbleStatic2}`);
        updateCharacterSettings();
    });

    // New control listeners
    ui.targetSelect.addEventListener('change', updateCharacterSettings);
    ui.dialogModeSelect.addEventListener('change', updateCharacterSettings);
    ui.bubbleModeSelect.addEventListener('change', updateCharacterSettings);
    ui.opacitySlider.addEventListener('input', updateCharacterSettings);

    // Update UI when character is selected
    eventSource.on(event_types.CHARACTER_EDITOR_OPENED, () => {
        loadCharacterSettings();
    });

    // Update UI when global dialogue colorizer enable state changes
    window.addEventListener('ptmt:settingsChanged', (e) => {
        const changed = e.detail?.changed || [];
        if (changed.includes('enableDialogueColorizer')) {
            updatePersonalColorizerEnableState();
        }
    });

    // Set initial state
    updatePersonalColorizerEnableState();
}

/**
 * Load current character's colorizer settings into the UI
 */
function loadCharacterSettings() {
    if (!charColorizerUI) return;

    const charNameElem = document.querySelector('#rm_button_selected_ch h2');
    const nameInput = document.getElementById('character_name_pole');
    const avatarPreview = document.getElementById('avatar_load_preview');
    const charName = nameInput?.value?.trim() || charNameElem?.textContent?.trim();
    const avatarSrc = avatarPreview?.getAttribute('src');

    if (!charName || !avatarSrc) {
        charColorizerUI.enableCheckbox.checked = false;
        charColorizerUI.settingsSection.style.display = 'none';
        return;
    }

    // Extract avatar filename from src
    const fileMatch = avatarSrc.match(/[?&]file=([^&]+)/i);
    const avatarFileName = fileMatch ? decodeURIComponent(fileMatch[1]) : avatarSrc.split('/').pop() || 'unknown.png';
    const cleanFileName = avatarFileName.split(/[?#]/)[0];

    // Build unique key: name + avatar to avoid collisions when multiple cards have same name
    currentCharacterId = buildCharacterKey(charName, cleanFileName);
    currentAvatarFilename = cleanFileName;
    const enabledList = settings.get('charCustomColorizerEnabled') ?? [];
    const customSettingsMap = settings.get('charCustomColorizerSettings') ?? {};

    const isEnabled = enabledList.includes(currentCharacterId);
    const customSettings = customSettingsMap[currentCharacterId] || {};

    console.log(`[PTMT] Character Editor: "${charName}" (${cleanFileName}) → Key: "${currentCharacterId}" | Enabled: ${isEnabled}`);

    // Load UI values
    charColorizerUI.enableCheckbox.checked = isEnabled;
    charColorizerUI.settingsSection.style.display = isEnabled ? 'block' : 'none';

    // Update dropdowns
    charColorizerUI.dialogSrcSelect.value = customSettings.dialogSource ?? 'avatar_vibrant';
    charColorizerUI.bubbleSrcSelect.value = customSettings.bubbleSource ?? 'avatar_vibrant';

    // Update color pickers (toolcool-color-picker)
    const dialogStaticColor = customSettings.dialogStatic ?? '#da6745ff';
    const bubbleStatic1 = customSettings.bubbleStatic1 ?? '#da6745ff';
    const bubbleStatic2 = customSettings.bubbleStatic2 ?? '#da6745ff';

    charColorizerUI.dialogStaticColor.setAttribute('color', dialogStaticColor);
    charColorizerUI.bubbleStatic1.setAttribute('color', bubbleStatic1);
    charColorizerUI.bubbleStatic2.setAttribute('color', bubbleStatic2);

    // Store in module-level variables so change events can use them
    latestDialogStaticColor = dialogStaticColor;
    latestBubbleStatic1 = bubbleStatic1;
    latestBubbleStatic2 = bubbleStatic2;

    // Update range controls
    charColorizerUI.targetSelect.value = String(customSettings.colorizeTarget ?? 3);
    charColorizerUI.dialogModeSelect.value = String(customSettings.dialogColorMode ?? 1);
    charColorizerUI.bubbleModeSelect.value = String(customSettings.bubbleColorMode ?? 3);

    const opacityValue = customSettings.bubbleOpacity ?? 0.1;
    charColorizerUI.opacitySlider.value = opacityValue.toString();
    const opacityDisplay = charColorizerUI.opacitySlider.parentElement?.querySelector('.ptmt-opacity-value');
    if (opacityDisplay) {
        opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    }

    // Sync visibility
    charColorizerUI.dialogStaticRow.style.display = charColorizerUI.dialogSrcSelect.value === 'static_color' ? 'flex' : 'none';
    charColorizerUI.bubbleStaticRow.style.display = charColorizerUI.bubbleSrcSelect.value === 'static_color' ? 'flex' : 'none';

    // Ensure UI reflects global enable state
    updatePersonalColorizerEnableState();
}

/**
 * Save character colorizer settings when UI changes
 * Only saves when the enable checkbox is turned ON
 */
function updateCharacterSettings() {
    if (isUpdatingCharSettings) return; // Guard against recursion

    if (!charColorizerUI || !currentCharacterId || !currentAvatarFilename) return;

    isUpdatingCharSettings = true;
    try {
        const isEnabled = charColorizerUI.enableCheckbox.checked;
        const enabledList = settings.get('charCustomColorizerEnabled') ?? [];
        const customSettingsMap = settings.get('charCustomColorizerSettings') ?? {};

        if (isEnabled) {
            // Add to enabled list if not already there
            if (!enabledList.includes(currentCharacterId)) {
                enabledList.push(currentCharacterId);
            }

            // Get existing settings for this character (if any)
            const oldSettings = customSettingsMap[currentCharacterId] || {
                dialogSource: 'avatar_vibrant',
                dialogStatic: '#da6745ff',
                bubbleSource: 'avatar_vibrant',
                bubbleStatic1: '#da6745ff',
                bubbleStatic2: '#da6745ff',
                colorizeTarget: 3,
                dialogColorMode: 1,
                bubbleColorMode: 3,
                bubbleOpacity: 0.1,
            };

            // Build new settings, only updating fields that may have changed
            // Colors only update if explicitly changed by color picker events (via latest* vars)
            const newSettings = {
                dialogSource: charColorizerUI.dialogSrcSelect.value,
                dialogStatic: latestDialogStaticColor,
                bubbleSource: charColorizerUI.bubbleSrcSelect.value,
                bubbleStatic1: latestBubbleStatic1,
                bubbleStatic2: latestBubbleStatic2,
                colorizeTarget: parseInt(charColorizerUI.targetSelect.value, 10),
                dialogColorMode: parseInt(charColorizerUI.dialogModeSelect.value, 10),
                bubbleColorMode: parseInt(charColorizerUI.bubbleModeSelect.value, 10),
                bubbleOpacity: parseFloat(charColorizerUI.opacitySlider.value),
            };

            // Detect what actually changed
            const colorSourceChanged =
                oldSettings.dialogSource !== newSettings.dialogSource ||
                oldSettings.bubbleSource !== newSettings.bubbleSource ||
                oldSettings.dialogStatic !== newSettings.dialogStatic ||
                oldSettings.bubbleStatic1 !== newSettings.bubbleStatic1 ||
                oldSettings.bubbleStatic2 !== newSettings.bubbleStatic2;

            const colorModeChanged =
                oldSettings.dialogColorMode !== newSettings.dialogColorMode ||
                oldSettings.bubbleColorMode !== newSettings.bubbleColorMode;

            const targetChanged = oldSettings.colorizeTarget !== newSettings.colorizeTarget;
            const opacityChanged = oldSettings.bubbleOpacity !== newSettings.bubbleOpacity;

            // Only log/save if something actually changed
            if (colorSourceChanged || colorModeChanged || targetChanged || opacityChanged) {
                console.log(`[PTMT] ✓ Saving character "${currentCharacterId}" colorizer settings:`, newSettings);
                customSettingsMap[currentCharacterId] = newSettings;

                settings.update({
                    charCustomColorizerEnabled: enabledList,
                    charCustomColorizerSettings: customSettingsMap,
                });

                // Trigger refresh with appropriate cache strategy
                if (colorSourceChanged) {
                    // Color source changed - clear cache to re-extract
                    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: true } }));
                } else {
                    // Only visual changes (target, modes, opacity) - keep cache
                    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: false } }));
                }
            } else {
                console.log(`[PTMT] No changes detected, skipping save`);
            }
        } else {
            // If disabling, only update if this character was previously enabled
            if (enabledList.includes(currentCharacterId)) {
                const idx = enabledList.indexOf(currentCharacterId);
                enabledList.splice(idx, 1);
                delete customSettingsMap[currentCharacterId];

                settings.update({
                    charCustomColorizerEnabled: enabledList,
                    charCustomColorizerSettings: customSettingsMap,
                });

                // Trigger colorizer update
                window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh'));
            }
        }
    } finally {
        isUpdatingCharSettings = false;
    }
}

// ─── Persona Management Integration ───────────────────────────────────────────

let personaColorizerUI = null;

/**
 * Initialize persona UI
 * Finds/inserts near persona management
 */
function initPersonaColorizer() {
    // Look for persona management block
    const personaMgmtBlock = document.getElementById('persona-management-block');
    if (!personaMgmtBlock) {
        console.warn('[PTMT] Persona management block not found, skipping persona colorizer UI');
        return;
    }

    // Look for the current persona container within the block
    const currentPersonaDiv = personaMgmtBlock.querySelector('.persona_management_current_persona');
    if (!currentPersonaDiv) {
        console.warn('[PTMT] .persona_management_current_persona not found, skipping persona colorizer UI');
        return;
    }

    // Create UI
    const ui = createPersonalColorizerUI(true);
    personaColorizerUI = ui;

    // Insert at top of current persona div
    const firstChild = currentPersonaDiv.firstElementChild;
    if (firstChild) {
        currentPersonaDiv.insertBefore(ui.container, firstChild);
    } else {
        currentPersonaDiv.appendChild(ui.container);
    }

    // Listen for settings changes
    ui.enableCheckbox.addEventListener('change', updatePersonaSettings);
    ui.dialogSrcSelect.addEventListener('change', updatePersonaSettings);
    ui.bubbleSrcSelect.addEventListener('change', updatePersonaSettings);

    // Color picker changes - capture the color value from event details
    ui.dialogStaticColor.addEventListener('change', (e) => {
        latestPersonaDialogColor = e.detail.hex8 || e.detail.hex || latestPersonaDialogColor;
        console.log(`[PTMT] Persona dialogue color picker changed: ${latestPersonaDialogColor}`);
        updatePersonaSettings();
    });
    ui.bubbleStatic1.addEventListener('change', (e) => {
        latestPersonaBubble1 = e.detail.hex8 || e.detail.hex || latestPersonaBubble1;
        console.log(`[PTMT] Persona bubble static 1 color picker changed: ${latestPersonaBubble1}`);
        updatePersonaSettings();
    });
    ui.bubbleStatic2.addEventListener('change', (e) => {
        latestPersonaBubble2 = e.detail.hex8 || e.detail.hex || latestPersonaBubble2;
        console.log(`[PTMT] Persona bubble static 2 color picker changed: ${latestPersonaBubble2}`);
        updatePersonaSettings();
    });

    // New control listeners
    ui.targetSelect.addEventListener('change', updatePersonaSettings);
    ui.dialogModeSelect.addEventListener('change', updatePersonaSettings);
    ui.bubbleModeSelect.addEventListener('change', updatePersonaSettings);
    ui.opacitySlider.addEventListener('input', updatePersonaSettings);

    // Update UI when persona changes
    eventSource.on(event_types.PERSONA_CHANGED, () => {
        loadPersonaSettings();
    });

    // Update UI when global dialogue colorizer enable state changes
    window.addEventListener('ptmt:settingsChanged', (e) => {
        const changed = e.detail?.changed || [];
        if (changed.includes('enableDialogueColorizer')) {
            updatePersonalColorizerEnableState();
        }
    });

    // Set initial state
    updatePersonalColorizerEnableState();
}

/**
 * Load current persona's colorizer settings into the UI
 */
function loadPersonaSettings() {
    if (!personaColorizerUI) return;

    // Get current persona from DOM/API
    const userAvatarImg = document.querySelector('#user_avatar_block .avatar img');
    if (!userAvatarImg) return;

    const src = userAvatarImg.getAttribute('src');
    if (!src) return;

    const fileMatch = src.match(/[?&]file=([^&]+)/i);
    const avatarFileName = fileMatch ? decodeURIComponent(fileMatch[1]) : src.split('/').pop() || 'user.png';
    const cleanFileName = avatarFileName.split(/[?#]/)[0];

    const enabledList = settings.get('personaCustomColorizerEnabled') ?? [];
    const customSettingsMap = settings.get('personaCustomColorizerSettings') ?? {};

    const isEnabled = enabledList.includes(cleanFileName);
    const customSettings = customSettingsMap[cleanFileName] || {};

    console.log(`[PTMT] Persona Editor: "${cleanFileName}" | Enabled: ${isEnabled} | Saved Files: [${Object.keys(customSettingsMap).join(', ')}]`);

    // Load UI values
    personaColorizerUI.enableCheckbox.checked = isEnabled;
    personaColorizerUI.settingsSection.style.display = isEnabled ? 'block' : 'none';

    // Update dropdowns
    personaColorizerUI.dialogSrcSelect.value = customSettings.dialogSource ?? 'avatar_vibrant';
    personaColorizerUI.bubbleSrcSelect.value = customSettings.bubbleSource ?? 'avatar_vibrant';

    // Update color pickers (toolcool-color-picker)
    const dialogStaticColor = customSettings.dialogStatic ?? '#537fddff';
    const bubbleStatic1 = customSettings.bubbleStatic1 ?? '#537fddff';
    const bubbleStatic2 = customSettings.bubbleStatic2 ?? '#537fddff';

    personaColorizerUI.dialogStaticColor.setAttribute('color', dialogStaticColor);
    personaColorizerUI.bubbleStatic1.setAttribute('color', bubbleStatic1);
    personaColorizerUI.bubbleStatic2.setAttribute('color', bubbleStatic2);

    // Store in module-level variables so change events can use them
    latestPersonaDialogColor = dialogStaticColor;
    latestPersonaBubble1 = bubbleStatic1;
    latestPersonaBubble2 = bubbleStatic2;

    // Update range controls
    personaColorizerUI.targetSelect.value = String(customSettings.colorizeTarget ?? 3);
    personaColorizerUI.dialogModeSelect.value = String(customSettings.dialogColorMode ?? 1);
    personaColorizerUI.bubbleModeSelect.value = String(customSettings.bubbleColorMode ?? 3);

    const opacityValue = customSettings.bubbleOpacity ?? 0.1;
    personaColorizerUI.opacitySlider.value = opacityValue.toString();
    const opacityDisplay = personaColorizerUI.opacitySlider.parentElement?.querySelector('.ptmt-opacity-value');
    if (opacityDisplay) {
        opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    }

    // Sync visibility
    personaColorizerUI.dialogStaticRow.style.display = personaColorizerUI.dialogSrcSelect.value === 'static_color' ? 'flex' : 'none';
    personaColorizerUI.bubbleStaticRow.style.display = personaColorizerUI.bubbleSrcSelect.value === 'static_color' ? 'flex' : 'none';

    // Ensure UI reflects global enable state
    updatePersonalColorizerEnableState();
}

/**
 * Save persona colorizer settings when UI changes
 * Only saves when the enable checkbox is turned ON
 */
function updatePersonaSettings() {
    if (isUpdatingPersonaSettings) return; // Guard against recursion

    if (!personaColorizerUI) return;

    isUpdatingPersonaSettings = true;
    try {
        // Get current persona filename
        const userAvatarImg = document.querySelector('#user_avatar_block .avatar img');
        if (!userAvatarImg) return;

        const src = userAvatarImg.getAttribute('src');
        if (!src) return;

        const fileMatch = src.match(/[?&]file=([^&]+)/i);
        const avatarFileName = fileMatch ? decodeURIComponent(fileMatch[1]) : src.split('/').pop() || 'user.png';
        const cleanFileName = avatarFileName.split(/[?#]/)[0];

        const isEnabled = personaColorizerUI.enableCheckbox.checked;
        const enabledList = settings.get('personaCustomColorizerEnabled') ?? [];
        const customSettingsMap = settings.get('personaCustomColorizerSettings') ?? {};

        if (isEnabled) {
            // Add to enabled list if not already there
            if (!enabledList.includes(cleanFileName)) {
                enabledList.push(cleanFileName);
            }

            // Get existing settings for this persona (if any)
            const oldSettings = customSettingsMap[cleanFileName] || {
                dialogSource: 'avatar_vibrant',
                dialogStatic: '#537fddff',
                bubbleSource: 'avatar_vibrant',
                bubbleStatic1: '#537fddff',
                bubbleStatic2: '#537fddff',
                colorizeTarget: 3,
                dialogColorMode: 1,
                bubbleColorMode: 3,
                bubbleOpacity: 0.1,
            };

            // Build new settings, only updating fields that may have changed
            const newSettings = {
                dialogSource: personaColorizerUI.dialogSrcSelect.value,
                dialogStatic: latestPersonaDialogColor,
                bubbleSource: personaColorizerUI.bubbleSrcSelect.value,
                bubbleStatic1: latestPersonaBubble1,
                bubbleStatic2: latestPersonaBubble2,
                colorizeTarget: parseInt(personaColorizerUI.targetSelect.value, 10),
                dialogColorMode: parseInt(personaColorizerUI.dialogModeSelect.value, 10),
                bubbleColorMode: parseInt(personaColorizerUI.bubbleModeSelect.value, 10),
                bubbleOpacity: parseFloat(personaColorizerUI.opacitySlider.value),
            };

            // Detect what actually changed
            const colorSourceChanged =
                oldSettings.dialogSource !== newSettings.dialogSource ||
                oldSettings.bubbleSource !== newSettings.bubbleSource ||
                oldSettings.dialogStatic !== newSettings.dialogStatic ||
                oldSettings.bubbleStatic1 !== newSettings.bubbleStatic1 ||
                oldSettings.bubbleStatic2 !== newSettings.bubbleStatic2;

            const colorModeChanged =
                oldSettings.dialogColorMode !== newSettings.dialogColorMode ||
                oldSettings.bubbleColorMode !== newSettings.bubbleColorMode;

            const targetChanged = oldSettings.colorizeTarget !== newSettings.colorizeTarget;
            const opacityChanged = oldSettings.bubbleOpacity !== newSettings.bubbleOpacity;

            // Only log/save if something actually changed
            if (colorSourceChanged || colorModeChanged || targetChanged || opacityChanged) {
                console.log(`[PTMT] ✓ Saving persona "${cleanFileName}" colorizer settings:`, newSettings);
                customSettingsMap[cleanFileName] = newSettings;

                settings.update({
                    personaCustomColorizerEnabled: enabledList,
                    personaCustomColorizerSettings: customSettingsMap,
                });

                // Trigger refresh with appropriate cache strategy
                if (colorSourceChanged) {
                    // Color source changed - clear cache to re-extract
                    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: true } }));
                } else {
                    // Only visual changes (target, modes, opacity) - keep cache
                    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: false } }));
                }
            } else {
                console.log(`[PTMT] No changes detected, skipping save`);
            }
        } else {
            // If disabling, only update if this persona was previously enabled
            if (enabledList.includes(cleanFileName)) {
                const idx = enabledList.indexOf(cleanFileName);
                enabledList.splice(idx, 1);
                delete customSettingsMap[cleanFileName];

                settings.update({
                    personaCustomColorizerEnabled: enabledList,
                    personaCustomColorizerSettings: customSettingsMap,
                });

                // Trigger colorizer update
                window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh'));
            }
        }
    } finally {
        isUpdatingPersonaSettings = false;
    }
}

// ─── Initialization ───────────────────────────────────────────────────────────

export function initCharacterColorizerUI() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initCharacterColorizer();
            initPersonaColorizer();
        });
    } else {
        initCharacterColorizer();
        initPersonaColorizer();
    }

    // Also listen for APP_READY event from ST
    eventSource.once(event_types.APP_READY, () => {
        if (!charColorizerUI) initCharacterColorizer();
        if (!personaColorizerUI) initPersonaColorizer();
        // Load initial values after app is ready
        loadCharacterSettings();
        loadPersonaSettings();
    });
}

export function refreshColorizerStyles() {
    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh'));
}
