/**
 * Character/Persona personal Dialogue Colorizer UI.
 *
 * Card identity is avatar-based (not display-name-based), matching SillyTavern's
 * stable character identity and allowing duplicate names / renames safely.
 */

import { eventSource, event_types, user_avatar } from '../../../../script.js';
import { settings } from './settings.js';
import { el, extractColorsFromImage, sortColorsByLightness } from './utils.js';
import { GradientEditor } from './gradient-editor.js';
import { extractAvatarFilenameFromUrl } from './colorizer-helpers.js';
import {
    buildCharacterCustomColorizerKey,
    resolveCustomColorizerSettings,
    updateCustomColorizerSettings,
} from './colorizer-settings.js';

const CHARACTER_DEFAULT = '#da6745ff';
const PERSONA_DEFAULT = '#537fddff';
const CHARACTER_ANGLE = 225;
const PERSONA_ANGLE = 125;
const SAVE_DELAY = 180;

let charUI = null;
let personaUI = null;
let currentCharacterKey = null;
let currentCharacterAvatar = null;
let currentPersonaKey = null;
let characterSaveTimer = null;
let personaSaveTimer = null;
let initialized = false;

const sourceOptions = [
    { value: 'avatar_vibrant', label: 'Avatar Vibrant' },
    { value: 'static_color', label: 'Static Color' },
];
const bubbleOptions = [
    { value: 'avatar_light', label: 'Avatar Light' },
    { value: 'avatar_dark', label: 'Avatar Dark' },
    { value: 'static_color', label: 'Static' },
    { value: 'gradient', label: 'Gradient' },
];
const targetOptions = [
    { value: '1', label: 'Quoted Text Only' },
    { value: '2', label: 'Chat Bubbles Only' },
    { value: '3', label: 'Both' },
];

function ensureColorPickerLoaded() {
    if (typeof customElements === 'undefined' || customElements.get('toolcool-color-picker')) return;
    if (document.querySelector('script[data-ptmt-toolcool-loader="true"]')) return;
    const script = document.createElement('script');
    script.src = '/lib/toolcool-color-picker.js';
    script.dataset.ptmtToolcoolLoader = 'true';
    document.head.appendChild(script);
}

function getActivePersonaFilename() {
    if (user_avatar) return user_avatar;
    const img = document.querySelector('#user_avatar_block .avatar-container.selected img');
    return extractAvatarFilenameFromUrl(img?.getAttribute('src') || '', 'user.png');
}

function getCharacterPreview() {
    return document.getElementById('avatar_load_preview');
}

function getPersonaPreview() {
    return document.querySelector('#user_avatar_block .avatar-container.selected img');
}

function extractPalette(img, count = 5) {
    if (!img?.complete || !img.naturalWidth) return [];
    try {
        return sortColorsByLightness(extractColorsFromImage(img, count));
    } catch (error) {
        console.warn('[PTMT] Colorizer palette extraction failed:', error);
        return [];
    }
}

function autoPopulateGradient(editor, img, angle) {
    const colors = extractPalette(img);
    editor.colors = colors;
    editor.angle = angle;
    if (!colors.length) {
        editor.stops = [];
        return false;
    }
    let selected;
    if (colors.length >= 4) selected = [colors[1], colors.at(-2)];
    else if (colors.length >= 2) selected = [colors[0], colors.at(-1)];
    else selected = [colors[0], colors[0]];
    editor.stops = [
        { color: selected[0], position: 0 },
        { color: selected[1], position: 1 },
    ];
    return true;
}

function createPicker(id, initial, label) {
    const picker = el('toolcool-color-picker', {
        id,
        'popup-position': 'left',
        'button-width': '40px',
        'button-height': '32px',
        title: label,
        'aria-label': label,
    });
    picker.setAttribute('color', initial);
    return picker;
}

function createSelect(id, options, value) {
    const select = el('select', { id });
    for (const option of options) {
        select.appendChild(el('option', { value: option.value, selected: option.value === String(value) }, option.label));
    }
    return select;
}

function createColorizerUI({ persona = false } = {}) {
    ensureColorPickerLoaded();
    const prefix = persona ? 'ptmt-pchar-col' : 'ptmt-char-col';
    const defaultColor = persona ? PERSONA_DEFAULT : CHARACTER_DEFAULT;
    const defaultAngle = persona ? PERSONA_ANGLE : CHARACTER_ANGLE;
    const row = (...children) => el('div', { className: 'ptmt-setting-row' }, ...children);
    const label = (text, id) => el('label', { htmlFor: id }, text);

    const container = el('div', {
        id: `${prefix}-drawer`,
        className: 'inline-drawer flex-container flexFlowColumn flexNoGap',
    });
    const header = el('div', { className: 'inline-drawer-toggle inline-drawer-header padding0 gap5px standoutHeader' });
    const title = el('div', { className: 'title_restorable flexGap5 wide100p' },
        el('span', { className: 'flex1' }, persona ? 'Persona Dialogue Colorizer' : 'Character Dialogue Colorizer'));
    const icon = el('div', { className: 'inline-drawer-icon fa-solid interactable down fa-circle-chevron-down', tabindex: '0', role: 'button' });
    header.append(title, el('div', { className: 'flex-container widthFitContent' }, icon));

    const wrapper = el('div', { className: 'inline-drawer-content', style: 'display:none;' });
    const content = el('div', { className: 'ptmt-char-colorizer-content' });
    wrapper.appendChild(content);
    container.append(header, wrapper);

    const enable = el('input', { id: `${prefix}-enable`, type: 'checkbox' });
    content.appendChild(row(enable, label('Enable Personal Dialogue Colorizer', enable.id)));

    const section = el('div', { style: 'display:none;' });
    const target = createSelect(`${prefix}-target`, targetOptions, '3');
    section.appendChild(row(label('Colorize Target', target.id), target));

    const dialogSource = createSelect(`${prefix}-dialog-src`, sourceOptions, 'avatar_vibrant');
    section.appendChild(row(label('Dialogue Color Source', dialogSource.id), dialogSource));

    const dialogStatic = createPicker(`${prefix}-dialog-static`, defaultColor, 'Dialogue Static Color');
    const dialogStaticRow = row(dialogStatic, label('Dialogue Static Color', dialogStatic.id));
    section.appendChild(dialogStaticRow);

    const bubbleMode = createSelect(`${prefix}-bubble-mode`, bubbleOptions, 'gradient');
    const bubbleSwatch = el('span', {
        className: 'ptmt-bubble-swatch',
        style: 'display:none;width:20px;height:20px;border-radius:3px;border:1px solid #888;margin-left:6px;vertical-align:middle;background:#888;',
    });
    section.appendChild(row(label('Bubble Color Mode', bubbleMode.id), bubbleMode, bubbleSwatch));

    const bubbleStatic = createPicker(`${prefix}-bubble-static-1`, defaultColor, 'Bubble Static Color');
    const bubbleStaticRow = row(bubbleStatic, label('Bubble Static Color', bubbleStatic.id));
    section.appendChild(bubbleStaticRow);

    const gradientRow = el('div', { className: 'ptmt-setting-row', style: 'display:none;flex-direction:column;padding-left:0;' });
    const gradientEditor = new GradientEditor({
        stops: [],
        angle: defaultAngle,
        showAngle: true,
        showReset: true,
        onChange: () => scheduleSave(persona),
        onReset: () => {
            autoPopulateGradient(gradientEditor, persona ? getPersonaPreview() : getCharacterPreview(), defaultAngle);
            scheduleSave(persona);
        },
    });
    gradientEditor.mount(gradientRow);
    section.appendChild(gradientRow);

    const opacityValue = el('span', { className: 'ptmt-opacity-value' }, '10%');
    const opacity = el('input', {
        id: `${prefix}-opacity`, type: 'range', min: '0', max: '1', step: '0.01', value: '0.1', className: 'ptmt-opacity-slider',
    });
    opacity.addEventListener('input', () => {
        opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`;
    });
    section.appendChild(row(label(persona ? 'User Bubble Opacity' : 'Char Bubble Opacity', opacity.id), opacity, opacityValue));
    content.appendChild(section);

    const ui = {
        persona, container, wrapper, section, enable, target, dialogSource, dialogStatic,
        dialogStaticRow, bubbleMode, bubbleSwatch, bubbleStatic, bubbleStaticRow,
        gradientEditor, gradientRow, opacity, opacityValue,
        loading: false,
        values: { dialogStatic: defaultColor, bubbleStatic: defaultColor },
    };

    const syncVisibility = () => {
        section.style.display = enable.checked ? 'block' : 'none';
        dialogStaticRow.style.display = dialogSource.value === 'static_color' ? 'flex' : 'none';
        bubbleStaticRow.style.display = bubbleMode.value === 'static_color' ? 'flex' : 'none';
        gradientRow.style.display = bubbleMode.value === 'gradient' ? 'flex' : 'none';
        bubbleSwatch.style.display = ['avatar_light', 'avatar_dark'].includes(bubbleMode.value) ? 'inline-block' : 'none';
        if (bubbleSwatch.style.display !== 'none') refreshSwatch(ui);
    };
    ui.syncVisibility = syncVisibility;

    enable.addEventListener('change', () => { syncVisibility(); saveNow(persona); });
    target.addEventListener('change', () => saveNow(persona));
    dialogSource.addEventListener('change', () => { syncVisibility(); saveNow(persona); });
    bubbleMode.addEventListener('change', () => {
        if (bubbleMode.value === 'gradient' && gradientEditor.stops.length === 0) {
            autoPopulateGradient(gradientEditor, persona ? getPersonaPreview() : getCharacterPreview(), defaultAngle);
        }
        syncVisibility();
        saveNow(persona);
    });
    opacity.addEventListener('input', () => scheduleSave(persona));

    dialogStatic.addEventListener('change', event => {
        ui.values.dialogStatic = event.detail?.hex8 || event.detail?.hex || ui.values.dialogStatic;
        saveNow(persona);
    });
    bubbleStatic.addEventListener('change', event => {
        ui.values.bubbleStatic = event.detail?.hex8 || event.detail?.hex || ui.values.bubbleStatic;
        saveNow(persona);
    });

    syncVisibility();
    return ui;
}

function refreshSwatch(ui) {
    const mode = ui.bubbleMode.value;
    if (!['avatar_light', 'avatar_dark'].includes(mode)) return;
    const img = ui.persona ? getPersonaPreview() : getCharacterPreview();
    if (!img) return;
    const apply = () => {
        const colors = extractPalette(img);
        const color = mode === 'avatar_light' ? colors.at(-1) : colors[0];
        if (color) ui.bubbleSwatch.style.background = color;
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
}

function snapshotUI(ui) {
    return {
        enabled: ui.enable.checked,
        patch: {
            dialogSource: ui.dialogSource.value,
            dialogStatic: ui.values.dialogStatic,
            bubbleMode: ui.bubbleMode.value,
            bubbleStatic1: ui.values.bubbleStatic,
            bubbleStatic2: ui.values.bubbleStatic,
            colorizeTarget: Number.parseInt(ui.target.value, 10),
            bubbleOpacity: Number.parseFloat(ui.opacity.value),
            bubbleGradientStops: ui.gradientEditor.stops,
            bubbleGradientAngle: ui.gradientEditor.angle,
        },
    };
}

function cancelScheduled(persona) {
    const timer = persona ? personaSaveTimer : characterSaveTimer;
    if (timer) clearTimeout(timer);
    if (persona) personaSaveTimer = null;
    else characterSaveTimer = null;
}

function scheduleSave(persona) {
    const ui = persona ? personaUI : charUI;
    if (!ui || ui.loading) return;
    cancelScheduled(persona);
    const key = persona ? currentPersonaKey : currentCharacterKey;
    const snapshot = snapshotUI(ui);
    const timer = setTimeout(() => {
        if (persona) personaSaveTimer = null;
        else characterSaveTimer = null;
        saveSnapshot(persona, key, snapshot);
    }, SAVE_DELAY);
    if (persona) personaSaveTimer = timer;
    else characterSaveTimer = timer;
}

function saveNow(persona) {
    const ui = persona ? personaUI : charUI;
    if (!ui || ui.loading) return;
    cancelScheduled(persona);
    const key = persona ? currentPersonaKey : currentCharacterKey;
    return saveSnapshot(persona, key, snapshotUI(ui));
}

async function saveSnapshot(persona, key, snapshot) {
    if (!key || !snapshot) return false;
    const type = persona ? 'persona' : 'character';
    const currentKey = persona ? currentPersonaKey : currentCharacterKey;
    if (key !== currentKey) return false;

    const before = resolveCustomColorizerSettings(settings, type, key);
    if (!snapshot.enabled) {
        if (!before.enabled) return true;
        const changed = await updateCustomColorizerSettings(settings, type, key, { enabled: false });
        if (changed) window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: false } }));
        return changed;
    }

    const old = before.value;
    const patch = snapshot.patch;
    const extractionChanged = old.dialogSource !== patch.dialogSource || old.bubbleMode !== patch.bubbleMode;
    const changed = !before.enabled || JSON.stringify(old) !== JSON.stringify({ ...old, ...patch });
    if (!changed) return true;

    const saved = await updateCustomColorizerSettings(settings, type, key, { enabled: true, patch });
    if (saved) {
        const gradientChanged = JSON.stringify(old.bubbleGradientStops ?? []) !== JSON.stringify(patch.bubbleGradientStops ?? []);
        window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', {
            detail: { fullRefresh: extractionChanged || gradientChanged },
        }));
    }
    return saved;
}

function applyResolvedToUI(ui, resolved, img, defaultColor, defaultAngle) {
    const value = resolved.value;
    ui.loading = true;
    try {
        ui.enable.checked = resolved.enabled;
        ui.target.value = String(value.colorizeTarget ?? 3);
        ui.dialogSource.value = value.dialogSource ?? 'avatar_vibrant';
        ui.bubbleMode.value = value.bubbleMode ?? 'gradient';
        ui.opacity.value = String(value.bubbleOpacity ?? 0.1);
        ui.opacityValue.textContent = `${Math.round(Number(ui.opacity.value) * 100)}%`;

        ui.values.dialogStatic = value.dialogStatic ?? defaultColor;
        ui.values.bubbleStatic = value.bubbleStatic1 ?? defaultColor;
        ui.dialogStatic.setAttribute('color', ui.values.dialogStatic);
        ui.bubbleStatic.setAttribute('color', ui.values.bubbleStatic);

        // Always clear previous-card state first. This prevents gradients/palette
        // leaking when switching between cards or personas.
        ui.gradientEditor.colors = [];
        ui.gradientEditor.stops = [];
        ui.gradientEditor.angle = defaultAngle;
        const colors = extractPalette(img);
        if (colors.length) ui.gradientEditor.colors = colors;
        const savedStops = value.bubbleGradientStops ?? [];
        if (savedStops.length) {
            ui.gradientEditor.stops = savedStops;
            ui.gradientEditor.angle = value.bubbleGradientAngle ?? defaultAngle;
        } else if (ui.bubbleMode.value === 'gradient') {
            autoPopulateGradient(ui.gradientEditor, img, value.bubbleGradientAngle ?? defaultAngle);
        }
        ui.syncVisibility();
        updateEnableState();
    } finally {
        ui.loading = false;
    }
}

function loadCharacterSettings() {
    if (!charUI) return;
    cancelScheduled(false);
    currentCharacterKey = null;
    currentCharacterAvatar = null;

    const preview = getCharacterPreview();
    const avatarSrc = preview?.getAttribute('src') || '';
    const name = document.getElementById('character_name_pole')?.value?.trim()
        || document.querySelector('#rm_button_selected_ch h2')?.textContent?.trim()
        || '';
    if (!avatarSrc) {
        charUI.loading = true;
        charUI.enable.checked = false;
        charUI.section.style.display = 'none';
        charUI.loading = false;
        return;
    }

    const avatar = extractAvatarFilenameFromUrl(avatarSrc, 'unknown.png');
    const key = buildCharacterCustomColorizerKey(name, avatar);
    currentCharacterAvatar = avatar;
    currentCharacterKey = key;
    applyResolvedToUI(charUI, resolveCustomColorizerSettings(settings, 'character', key), preview, CHARACTER_DEFAULT, CHARACTER_ANGLE);
}

function loadPersonaSettings() {
    if (!personaUI) return;
    cancelScheduled(true);
    currentPersonaKey = null;
    const key = getActivePersonaFilename();
    if (!key) return;
    currentPersonaKey = key;
    applyResolvedToUI(personaUI, resolveCustomColorizerSettings(settings, 'persona', key), getPersonaPreview(), PERSONA_DEFAULT, PERSONA_ANGLE);
}

function updateEnableState() {
    const enabled = !!settings.get('enableDialogueColorizer');
    for (const ui of [charUI, personaUI]) {
        if (!ui?.container) continue;
        ui.container.style.opacity = enabled ? '1' : '0.5';
        ui.container.style.pointerEvents = enabled ? 'auto' : 'none';
        ui.enable.disabled = !enabled;
    }
}

function injectCharacterUI() {
    if (charUI?.container?.isConnected) return true;
    const target = document.getElementById('spoiler_free_desc');
    if (!target?.parentElement) return false;
    document.getElementById('ptmt-char-col-drawer')?.remove();
    charUI = createColorizerUI({ persona: false });
    target.parentElement.insertBefore(charUI.container, target);
    loadCharacterSettings();
    return true;
}

function injectPersonaUI() {
    if (personaUI?.container?.isConnected) return true;
    const current = document.querySelector('#persona-management-block .persona_management_current_persona');
    if (!current) return false;
    document.getElementById('ptmt-pchar-col-drawer')?.remove();
    personaUI = createColorizerUI({ persona: true });
    current.prepend(personaUI.container);
    loadPersonaSettings();
    return true;
}

function ensureUIs() {
    injectCharacterUI();
    injectPersonaUI();
    updateEnableState();
}

function handleCharacterEditorOpened() {
    if (!injectCharacterUI()) return;
    loadCharacterSettings();
}
function handleCharacterEdited() {
    // CHARACTER_EDITED is emitted after SillyTavern has refreshed the card.
    queueMicrotask(loadCharacterSettings);
}
function handlePersonaChanged() {
    if (!injectPersonaUI()) return;
    loadPersonaSettings();
}
function handleAppReady() {
    ensureUIs();
}
function handleSettingsChanged(event) {
    if (event.detail?.changed?.includes('enableDialogueColorizer')) updateEnableState();
}

export function cleanupCharacterColorizerUI() {
    cancelScheduled(false);
    cancelScheduled(true);
    if (initialized) {
        try { eventSource.off(event_types.CHARACTER_EDITOR_OPENED, handleCharacterEditorOpened); } catch {}
        try { eventSource.off(event_types.CHARACTER_EDITED, handleCharacterEdited); } catch {}
        try { eventSource.off(event_types.PERSONA_CHANGED, handlePersonaChanged); } catch {}
        try { eventSource.off(event_types.APP_READY, handleAppReady); } catch {}
        window.removeEventListener('ptmt:settingsChanged', handleSettingsChanged);
    }
    initialized = false;
    charUI?.container?.remove();
    personaUI?.container?.remove();
    charUI = null;
    personaUI = null;
    currentCharacterKey = null;
    currentCharacterAvatar = null;
    currentPersonaKey = null;
}

export function initCharacterColorizerUI() {
    cleanupCharacterColorizerUI();
    initialized = true;
    eventSource.on(event_types.CHARACTER_EDITOR_OPENED, handleCharacterEditorOpened);
    eventSource.on(event_types.CHARACTER_EDITED, handleCharacterEdited);
    eventSource.on(event_types.PERSONA_CHANGED, handlePersonaChanged);
    eventSource.on(event_types.APP_READY, handleAppReady);
    window.addEventListener('ptmt:settingsChanged', handleSettingsChanged);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureUIs, { once: true });
    } else {
        ensureUIs();
    }
}
