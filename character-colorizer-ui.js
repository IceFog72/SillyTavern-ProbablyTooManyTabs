/**
 * Character/Persona Personal Colorizer UI
 * 
 * Injects colorizer controls for individual characters and personas,
 * using the inline-drawer SillyTavern structure and toolcool-color-picker.
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { settings } from './settings.js';
import { el, trackObserver, debounce, extractColorsFromImage, sortColorsByLightness } from './utils.js';
import { GradientEditor } from './gradient-editor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function autoPopulateGradientFromAvatar(gradientEditor, imgElement) {
    if (!gradientEditor || !imgElement || !imgElement.complete || !imgElement.naturalWidth) return false;
    const hexes = sortColorsByLightness(extractColorsFromImage(imgElement));
    if (!hexes || hexes.length === 0) return false;
    gradientEditor.colors = hexes;
    gradientEditor.stops = hexes.map((color, i) => ({
        color,
        position: i / Math.max(hexes.length - 1, 1),
    }));
    gradientEditor.angle = 225;
    return true;
}

// ─── Debounced save helpers ─────────────────────────────────────────────────

const scheduleUpdateCharacter = debounce(() => updateCharacterSettings(), 200);
const scheduleUpdatePersona = debounce(() => updatePersonaSettings(), 200);

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

    // Bubble Color Mode — replaces old Bubble Color Source + Bubble Color Mode
    const sourceOptionsBubble = [
        { value: 'avatar_light', label: 'Avatar Light (Auto)' },
        { value: 'avatar_dark', label: 'Avatar Dark (Auto)' },
        { value: 'static_color', label: 'Static' },
        { value: 'gradient', label: 'Gradient' },
    ];
    const bubbleModeSelect = dropdown(`${prefix}-bubble-mode`, sourceOptionsBubble, 'gradient');
    const bubbleColorSwatch = el('span', {
        className: 'ptmt-bubble-swatch',
        style: 'display: none; width: 20px; height: 20px; border-radius: 3px; border: 1px solid #888; margin-left: 6px; vertical-align: middle; background: #888;',
    });
    const bubbleModeRow = row([
        lbl('Bubble Color Mode', `${prefix}-bubble-mode`),
        bubbleModeSelect,
        bubbleColorSwatch,
    ]);
    settingsSection.appendChild(bubbleModeRow);

    // Bubble static colors (shown when mode is static_color)
    const bubbleStatic1 = colorPicker(`${prefix}-bubble-static-1`, '#da6745ff');
    const bubbleStatic2 = colorPicker(`${prefix}-bubble-static-2`, '#da6745ff');
    const bubbleStaticRow = row([
        el('div', { className: 'ptmt-color-picker-pair' },
            bubbleStatic1,
            bubbleStatic2
        ),
        lbl('Bubble Static Colors', `${prefix}-bubble-static-1`)
    ]);
    bubbleStaticRow.style.display = 'none';
    settingsSection.appendChild(bubbleStaticRow);

    // Gradient editor (shown when mode is gradient)
    const gradientRow = el('div', { className: 'ptmt-setting-row', style: 'display: none; flex-direction: column; padding-left: 0;' });
    const gradientEditor = new GradientEditor({
        stops: [],
        angle: 225,
        showAngle: true,
        showReset: true,
        onChange: () => {
            if (isPersona) {
                scheduleUpdatePersona();
            } else {
                scheduleUpdateCharacter();
            }
        },
        onReset: () => {
            const img = isPersona
                ? document.querySelector('#user_avatar_block .avatar img')
                : document.getElementById('avatar_load_preview');
            if (img && autoPopulateGradientFromAvatar(gradientEditor, img)) {
            } else {
                gradientEditor.stops = [];
                gradientEditor.angle = 225;
            }
            if (isPersona) scheduleUpdatePersona();
            else scheduleUpdateCharacter();
        },
    });
    gradientEditor.mount(gradientRow);
    settingsSection.appendChild(gradientRow);

    const syncBubbleModeVis = () => {
        const mode = bubbleModeSelect.value;
        bubbleStaticRow.style.display = mode === 'static_color' ? 'flex' : 'none';
        gradientRow.style.display = mode === 'gradient' ? 'flex' : 'none';
        bubbleColorSwatch.style.display = (mode === 'avatar_light' || mode === 'avatar_dark') ? 'inline-block' : 'none';
    };
    bubbleModeSelect.addEventListener('change', syncBubbleModeVis);
    syncBubbleModeVis();

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
    dialogSrcSelect.addEventListener('change', syncDialogVisibility);

    return {
        container,
        enableCheckbox,
        dialogSrcSelect,
        dialogStaticColor,
        bubbleColorSwatch,
        bubbleStatic1,
        bubbleStatic2,
        dialogStaticRow,
        bubbleStaticRow,
        settingsSection,
        targetSelect,
        bubbleModeSelect,
        opacitySlider,
        gradientEditor,
        gradientRow,
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
    ui.bubbleModeSelect.addEventListener('change', updateCharacterSettings);
    ui.opacitySlider.addEventListener('input', scheduleUpdateCharacter);

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
    console.log(`[PTMT]   ↳ bubbleOpacity: ${customSettings.bubbleOpacity} (${typeof customSettings.bubbleOpacity})`);

    // Load UI values
    charColorizerUI.enableCheckbox.checked = isEnabled;
    charColorizerUI.settingsSection.style.display = isEnabled ? 'block' : 'none';

    // Update dropdowns
    charColorizerUI.dialogSrcSelect.value = customSettings.dialogSource ?? 'avatar_vibrant';

    // Update range controls & opacity slider BEFORE color pickers
    // (color picker setAttribute triggers change events that call updateCharacterSettings)
    charColorizerUI.targetSelect.value = String(customSettings.colorizeTarget ?? 3);
    const bubbleMode = customSettings.bubbleMode ?? customSettings.bubbleColorMode === 3 ? 'gradient' : 'avatar_light';
    charColorizerUI.bubbleModeSelect.value = bubbleMode;

    const opacityValue = customSettings.bubbleOpacity ?? 0.1;
    charColorizerUI.opacitySlider.value = opacityValue.toString();
    const opacityDisplay = charColorizerUI.opacitySlider.parentElement?.querySelector('.ptmt-opacity-value');
    if (opacityDisplay) {
        opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    }

    // Load gradient editor BEFORE color pickers
    if (charColorizerUI.gradientEditor) {
        const gradientStops = customSettings.bubbleGradientStops ?? [];
        const gradientAngle = customSettings.bubbleGradientAngle ?? 225;

        // Always populate palette from avatar colors (all available)
        const avatarPreview = document.getElementById('avatar_load_preview');
        if (avatarPreview && avatarPreview.complete && avatarPreview.naturalWidth) {
            const hexes = sortColorsByLightness(extractColorsFromImage(avatarPreview));
            if (hexes.length > 0) {
                charColorizerUI.gradientEditor.colors = hexes;
            }
        }
        // Set stops from saved data (determines active colors and positions)
        if (gradientStops.length > 0) {
            charColorizerUI.gradientEditor.stops = gradientStops;
            charColorizerUI.gradientEditor.angle = gradientAngle;
        } else if (bubbleMode !== 'static_color' && customSettings.bubbleSource !== 'static_color') {
            if (avatarPreview) {
                autoPopulateGradientFromAvatar(charColorizerUI.gradientEditor, avatarPreview);
            }
        }

        charColorizerUI.gradientRow.style.display = bubbleMode === 'gradient' ? 'flex' : 'none';
    }

    // Sync bubble mode visibility
    const bubbleModeVis = bubbleMode === 'static_color' ? 'flex' : 'none';
    charColorizerUI.bubbleStaticRow.style.display = bubbleModeVis;
    charColorizerUI.bubbleColorSwatch.style.display = (bubbleMode === 'avatar_light' || bubbleMode === 'avatar_dark') ? 'inline-block' : 'none';
    // Update swatch color for auto modes
    if (bubbleMode === 'avatar_light' || bubbleMode === 'avatar_dark') {
        const avatarPreview = document.getElementById('avatar_load_preview');
        if (avatarPreview) {
            updateBubbleColorSwatch(charColorizerUI, bubbleMode, avatarPreview);
        }
    }

    // Ensure UI reflects global enable state
    updatePersonalColorizerEnableState();
}

/**
 * Save character colorizer settings when UI changes
 * Only saves when the enable checkbox is turned ON
 */
function updateCharacterSettings() {
    if (isUpdatingCharSettings) return;

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
                bubbleStatic1: '#da6745ff',
                bubbleStatic2: '#da6745ff',
                colorizeTarget: 3,
                bubbleOpacity: 0.1,
            };

            // Build new settings, only updating fields that may have changed
            // Colors only update if explicitly changed by color picker events (via latest* vars)
            const gradientStops = charColorizerUI.gradientEditor ? charColorizerUI.gradientEditor.stops : [];
            const gradientAngle = charColorizerUI.gradientEditor ? charColorizerUI.gradientEditor.angle : 225;
            const newSettings = {
                dialogSource: charColorizerUI.dialogSrcSelect.value,
                dialogStatic: latestDialogStaticColor,
                bubbleMode: charColorizerUI.bubbleModeSelect.value,
                bubbleStatic1: latestBubbleStatic1,
                bubbleStatic2: latestBubbleStatic2,
                colorizeTarget: parseInt(charColorizerUI.targetSelect.value, 10),
                bubbleOpacity: parseFloat(charColorizerUI.opacitySlider.value),
                bubbleGradientStops: gradientStops,
                bubbleGradientAngle: gradientAngle,
            };

            const gradientStopsChanged = JSON.stringify(oldSettings.bubbleGradientStops ?? []) !== JSON.stringify(gradientStops) ||
                (oldSettings.bubbleGradientAngle ?? 225) !== gradientAngle;

            // Detect what actually changed
            const colorSourceChanged =
                oldSettings.dialogSource !== newSettings.dialogSource ||
                oldSettings.bubbleMode !== newSettings.bubbleMode ||
                oldSettings.dialogStatic !== newSettings.dialogStatic ||
                oldSettings.bubbleStatic1 !== newSettings.bubbleStatic1 ||
                oldSettings.bubbleStatic2 !== newSettings.bubbleStatic2;

            const targetChanged = oldSettings.colorizeTarget !== newSettings.colorizeTarget;
            const opacityChanged = oldSettings.bubbleOpacity !== newSettings.bubbleOpacity;

            // Only log/save if something actually changed
            if (colorSourceChanged || targetChanged || opacityChanged || gradientStopsChanged) {
                console.log(`[PTMT] ✓ Saving character "${currentCharacterId}" colorizer settings:`, newSettings);
                customSettingsMap[currentCharacterId] = newSettings;

                settings.update({
                    charCustomColorizerEnabled: enabledList,
                    charCustomColorizerSettings: customSettingsMap,
                });

                // Trigger refresh with appropriate cache strategy
                if (colorSourceChanged || gradientStopsChanged) {
                    // Color source or gradient stops changed - clear cache to re-extract
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
    ui.bubbleModeSelect.addEventListener('change', updatePersonaSettings);
    ui.opacitySlider.addEventListener('input', scheduleUpdatePersona);

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
    console.log(`[PTMT]   ↳ bubbleOpacity: ${customSettings.bubbleOpacity} (${typeof customSettings.bubbleOpacity})`);

    // Load UI values
    personaColorizerUI.enableCheckbox.checked = isEnabled;
    personaColorizerUI.settingsSection.style.display = isEnabled ? 'block' : 'none';

    // Update dropdowns
    personaColorizerUI.dialogSrcSelect.value = customSettings.dialogSource ?? 'avatar_vibrant';

    // Update range controls & opacity slider BEFORE color pickers
    personaColorizerUI.targetSelect.value = String(customSettings.colorizeTarget ?? 3);
    const bubbleMode = customSettings.bubbleMode ?? customSettings.bubbleColorMode === 3 ? 'gradient' : 'avatar_light';
    personaColorizerUI.bubbleModeSelect.value = bubbleMode;

    const opacityValue = customSettings.bubbleOpacity ?? 0.1;
    personaColorizerUI.opacitySlider.value = opacityValue.toString();
    const opacityDisplay = personaColorizerUI.opacitySlider.parentElement?.querySelector('.ptmt-opacity-value');
    if (opacityDisplay) {
        opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    }

    // Load gradient editor BEFORE color pickers
    if (personaColorizerUI.gradientEditor) {
        const gradientStops = customSettings.bubbleGradientStops ?? [];
        const gradientAngle = customSettings.bubbleGradientAngle ?? 225;

        // Always populate palette from avatar colors
        const userAvatarImg = document.querySelector('#user_avatar_block .avatar img');
        if (userAvatarImg && userAvatarImg.complete && userAvatarImg.naturalWidth) {
            const hexes = sortColorsByLightness(extractColorsFromImage(userAvatarImg));
            if (hexes.length > 0) {
                personaColorizerUI.gradientEditor.colors = hexes;
            }
        }
        if (gradientStops.length > 0) {
            personaColorizerUI.gradientEditor.stops = gradientStops;
            personaColorizerUI.gradientEditor.angle = gradientAngle;
        } else if (bubbleMode !== 'static_color' && customSettings.bubbleSource !== 'static_color') {
            if (userAvatarImg) {
                autoPopulateGradientFromAvatar(personaColorizerUI.gradientEditor, userAvatarImg);
            }
        }

        personaColorizerUI.gradientRow.style.display = bubbleMode === 'gradient' ? 'flex' : 'none';
    }

    // Sync bubble mode visibility
    personaColorizerUI.bubbleStaticRow.style.display = bubbleMode === 'static_color' ? 'flex' : 'none';
    personaColorizerUI.bubbleColorSwatch.style.display = (bubbleMode === 'avatar_light' || bubbleMode === 'avatar_dark') ? 'inline-block' : 'none';
    if (bubbleMode === 'avatar_light' || bubbleMode === 'avatar_dark') {
        const userAvatarImg = document.querySelector('#user_avatar_block .avatar img');
        if (userAvatarImg) {
            updateBubbleColorSwatch(personaColorizerUI, bubbleMode, userAvatarImg);
        }
    }

    // Update color pickers LAST — setAttribute triggers change events
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

    // Sync visibility

    // Ensure UI reflects global enable state
    updatePersonalColorizerEnableState();
}

/**
 * Update the bubble color swatch for avatar_light/avatar_dark modes
 * by extracting colors from the avatar image and picking darkest/lightest.
 */
function updateBubbleColorSwatch(ui, mode, imgElement) {
    if (!ui?.bubbleColorSwatch || !imgElement) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = imgElement.naturalWidth || 100;
    canvas.height = imgElement.naturalHeight || 100;
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorMap = {};
    for (let i = 0; i < imageData.length; i += 16) {
        const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
        const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
    }
    const sorted = Object.keys(colorMap).sort((a, b) => colorMap[b] - colorMap[a]);
    const top5 = sorted.slice(0, 5).map(k => {
        const [r, g, b] = k.split(',').map(Number);
        return '#' + [r, g, b].map(c => Math.min(255, c + 16).toString(16).padStart(2, '0')).join('');
    });
    const sortedByLightness = top5.map(h => {
        const r = parseInt(h.slice(1, 3), 16);
        const g = parseInt(h.slice(3, 5), 16);
        const b = parseInt(h.slice(5, 7), 16);
        const [, , l] = ColorUtils.rgbToHsl([r, g, b]);
        return { hex: h, l };
    }).sort((a, b) => a.l - b.l);
    const picked = mode === 'avatar_light' ? sortedByLightness[sortedByLightness.length - 1] : sortedByLightness[0];
    if (picked) {
        ui.bubbleColorSwatch.style.background = picked.hex;
    }
}

/**
 * Save persona colorizer settings when UI changes
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
                bubbleStatic1: '#537fddff',
                bubbleStatic2: '#537fddff',
                colorizeTarget: 3,
                bubbleOpacity: 0.1,
            };

            // Build new settings, only updating fields that may have changed
            const gradientStops = personaColorizerUI.gradientEditor ? personaColorizerUI.gradientEditor.stops : [];
            const gradientAngle = personaColorizerUI.gradientEditor ? personaColorizerUI.gradientEditor.angle : 225;
            const newSettings = {
                dialogSource: personaColorizerUI.dialogSrcSelect.value,
                dialogStatic: latestPersonaDialogColor,
                bubbleMode: personaColorizerUI.bubbleModeSelect.value,
                bubbleStatic1: latestPersonaBubble1,
                bubbleStatic2: latestPersonaBubble2,
                colorizeTarget: parseInt(personaColorizerUI.targetSelect.value, 10),
                bubbleOpacity: parseFloat(personaColorizerUI.opacitySlider.value),
                bubbleGradientStops: gradientStops,
                bubbleGradientAngle: gradientAngle,
            };

            const gradientStopsChanged = JSON.stringify(oldSettings.bubbleGradientStops ?? []) !== JSON.stringify(gradientStops) ||
                (oldSettings.bubbleGradientAngle ?? 225) !== gradientAngle;

            // Detect what actually changed
            const colorSourceChanged =
                oldSettings.dialogSource !== newSettings.dialogSource ||
                oldSettings.bubbleMode !== newSettings.bubbleMode ||
                oldSettings.dialogStatic !== newSettings.dialogStatic ||
                oldSettings.bubbleStatic1 !== newSettings.bubbleStatic1 ||
                oldSettings.bubbleStatic2 !== newSettings.bubbleStatic2;

            const targetChanged = oldSettings.colorizeTarget !== newSettings.colorizeTarget;
            const opacityChanged = oldSettings.bubbleOpacity !== newSettings.bubbleOpacity;

            // Only log/save if something actually changed
            if (colorSourceChanged || targetChanged || opacityChanged || gradientStopsChanged) {
                console.log(`[PTMT] ✓ Saving persona "${cleanFileName}" colorizer settings:`, newSettings);
                customSettingsMap[cleanFileName] = newSettings;

                settings.update({
                    personaCustomColorizerEnabled: enabledList,
                    personaCustomColorizerSettings: customSettingsMap,
                });

                // Trigger refresh with appropriate cache strategy
                if (colorSourceChanged || gradientStopsChanged) {
                    // Color source or gradient stops changed - clear cache to re-extract
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
