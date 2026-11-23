/**
 * Character/Persona personal Dialogue Colorizer UI.
 *
 * Card identity is avatar-based (not display-name-based), matching SillyTavern's
 * stable character identity and allowing duplicate names / renames safely.
 */

import { eventSource, event_types, user_avatar } from '../../../../../../script.js';
import { settings } from '../core/settings.js';
import { el, extractColorsFromImage, sortColorsByLightness } from '../core/utils.js';
import { GradientEditor } from './gradient-editor.js';
import { extractAvatarFilenameFromUrl } from './colorizer-helpers.js';
import {
    buildCharacterCustomColorizerKey,
    buildColorizerCustomEntry,
    resolveCustomColorizerSettings,
    updateCustomColorizerSettings,
} from './colorizer-settings.js';
import type { ResolvedCustomColorizerSettings } from './colorizer-settings.js';
import type {
    BubbleMode,
    ColorizerCustomEntry,
    ColorizerSource,
    ColorizeTarget,
    SettingsChangedEventDetail,
} from '../core/types.js';

interface SelectOption {
    value: string;
    label: string;
}

interface ColorizerUI {
    persona: boolean;
    container: HTMLDivElement;
    wrapper: HTMLDivElement;
    section: HTMLDivElement;
    enable: HTMLInputElement;
    target: HTMLSelectElement;
    dialogSource: HTMLSelectElement;
    dialogStatic: ToolCoolColorPickerElement;
    dialogStaticRow: HTMLDivElement;
    bubbleMode: HTMLSelectElement;
    bubbleSwatch: HTMLSpanElement;
    bubbleStatic: ToolCoolColorPickerElement;
    bubbleStaticRow: HTMLDivElement;
    gradientEditor: GradientEditor;
    gradientRow: HTMLDivElement;
    opacity: HTMLInputElement;
    opacityValue: HTMLSpanElement;
    loading: boolean;
    values: {
        dialogStatic: string;
        bubbleStatic: string;
    };
    syncVisibility: () => void;
}

interface UISnapshot {
    enabled: boolean;
    patch: Partial<ColorizerCustomEntry>;
}

interface PendingSave {
    key: string | null;
    snapshot: UISnapshot;
    timer?: ReturnType<typeof setTimeout>;
}

const CHARACTER_DEFAULT = '#da6745ff';
const PERSONA_DEFAULT = '#537fddff';
const CHARACTER_ANGLE = 225;
const PERSONA_ANGLE = 125;
const SAVE_DELAY = 180;

let charUI: ColorizerUI | null = null;
let personaUI: ColorizerUI | null = null;
let currentCharacterKey: string | null = null;
let currentCharacterAvatar: string | null = null;
let currentPersonaKey: string | null = null;
let characterPendingSave: PendingSave | null = null;
let personaPendingSave: PendingSave | null = null;
let initialized = false;

const sourceOptions: SelectOption[] = [
    { value: 'avatar_vibrant', label: 'Avatar Vibrant' },
    { value: 'static_color', label: 'Static Color' },
];
const bubbleOptions: SelectOption[] = [
    { value: 'avatar_light', label: 'Avatar Light' },
    { value: 'avatar_dark', label: 'Avatar Dark' },
    { value: 'static_color', label: 'Static' },
    { value: 'gradient', label: 'Gradient' },
];
const targetOptions: SelectOption[] = [
    { value: '1', label: 'Quoted Text Only' },
    { value: '2', label: 'Chat Bubbles Only' },
    { value: '3', label: 'Both' },
];

function ensureColorPickerLoaded(): void {
    if (typeof customElements === 'undefined' || customElements.get('toolcool-color-picker')) return;
    if (document.querySelector('script[data-ptmt-toolcool-loader="true"]')) return;
    const script = document.createElement('script');
    script.src = '/lib/toolcool-color-picker.js';
    script.dataset.ptmtToolcoolLoader = 'true';
    document.head.appendChild(script);
}

function getActivePersonaFilename(): string {
    if (user_avatar) return user_avatar;
    const img = document.querySelector('#user_avatar_block .avatar-container.selected img');
    return extractAvatarFilenameFromUrl(img?.getAttribute('src') || '', 'user.png');
}

function getCharacterPreview(): HTMLImageElement | null {
    return document.getElementById('avatar_load_preview') as HTMLImageElement | null;
}

function getPersonaPreview(): HTMLImageElement | null {
    return document.querySelector<HTMLImageElement>('#user_avatar_block .avatar-container.selected img');
}

function extractPalette(img: HTMLImageElement | null, count = 5): string[] {
    if (!img?.complete || !img.naturalWidth) return [];
    try {
        return sortColorsByLightness(extractColorsFromImage(img, count));
    } catch (error) {
        console.warn('[PTMT] Colorizer palette extraction failed:', error);
        return [];
    }
}

function autoPopulateGradient(editor: GradientEditor, img: HTMLImageElement | null, angle: number): boolean {
    const colors = extractPalette(img);
    editor.colors = colors;
    editor.angle = angle;
    if (!colors.length) {
        editor.stops = [];
        return false;
    }
    let selected: [string, string];
    if (colors.length >= 4) selected = [colors[1], colors.at(-2)!];
    else if (colors.length >= 2) selected = [colors[0], colors.at(-1)!];
    else selected = [colors[0], colors[0]];
    editor.stops = [
        { color: selected[0], position: 0 },
        { color: selected[1], position: 1 },
    ];
    return true;
}

function createPicker(id: string, initial: string, label: string): ToolCoolColorPickerElement {
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

function createSelect(id: string, options: SelectOption[], value: string): HTMLSelectElement {
    const select = el('select', { id });
    for (const option of options) {
        select.appendChild(el('option', { value: option.value, selected: option.value === String(value) }, option.label));
    }
    return select;
}

function createColorizerUI({ persona = false } = {}): ColorizerUI {
    ensureColorPickerLoaded();
    const prefix = persona ? 'ptmt-pchar-col' : 'ptmt-char-col';
    const defaultColor = persona ? PERSONA_DEFAULT : CHARACTER_DEFAULT;
    const defaultAngle = persona ? PERSONA_ANGLE : CHARACTER_ANGLE;
    const row = (...children: Array<Node | string>) => el('div', { className: 'ptmt-colorizer-row' }, ...children);
    const group = (title: string): HTMLElement => {
        const node = el('section', { className: 'ptmt-colorizer-group' });
        node.appendChild(el('h4', { className: 'ptmt-colorizer-heading' }, title));
        return node;
    };
    const label = (text: string, id: string): HTMLLabelElement => el('label', { htmlFor: id }, text);

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
    const enableRow = el('div', { className: 'ptmt-colorizer-enable' }, enable,
        label('Use personal colors', enable.id));
    content.appendChild(enableRow);

    const section = el('div', { className: 'ptmt-personal-colorizer-settings', style: 'display:none;' });
    const target = createSelect(`${prefix}-target`, targetOptions, '3');
    section.appendChild(row(label('Apply colors to', target.id), target));
    const dialogueGroup = group('Dialogue');
    const bubbleGroup = group('Bubble');
    section.append(dialogueGroup, bubbleGroup);

    const dialogSource = createSelect(`${prefix}-dialog-src`, sourceOptions, 'avatar_vibrant');
    dialogueGroup.appendChild(row(label('Color source', dialogSource.id), dialogSource));

    const dialogStatic = createPicker(`${prefix}-dialog-static`, defaultColor, 'Dialogue Static Color');
    const dialogStaticRow = row(label('Speech color', dialogStatic.id), dialogStatic);
    dialogueGroup.appendChild(dialogStaticRow);

    const bubbleMode = createSelect(`${prefix}-bubble-mode`, bubbleOptions, 'gradient');
    const bubbleSwatch = el('span', {
        className: 'ptmt-bubble-swatch',
        style: 'display:none;width:20px;height:20px;border-radius:3px;border:1px solid #888;margin-left:6px;vertical-align:middle;background:#888;',
    });
    bubbleGroup.appendChild(row(label('Background', bubbleMode.id), el('div', { className: 'ptmt-colorizer-mode' }, bubbleMode, bubbleSwatch)));

    const bubbleStatic = createPicker(`${prefix}-bubble-static-1`, defaultColor, 'Bubble Static Color');
    const bubbleStaticRow = row(label('Bubble color', bubbleStatic.id), bubbleStatic);
    bubbleGroup.appendChild(bubbleStaticRow);

    const gradientRow = el('div', { className: 'ptmt-colorizer-gradient', style: 'display:none;' });
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
    bubbleGroup.appendChild(gradientRow);

    const opacityValue = el('span', { className: 'ptmt-opacity-value' }, '10%');
    const opacity = el('input', {
        id: `${prefix}-opacity`, type: 'range', min: '0', max: '1', step: '0.01', value: '0.1', className: 'ptmt-opacity-slider',
    });
    opacity.addEventListener('input', () => {
        opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`;
    });
    bubbleGroup.appendChild(row(label('Opacity', opacity.id), el('div', { className: 'ptmt-colorizer-opacity' }, opacity, opacityValue)));
    content.appendChild(section);
    const reset = el('button', {
        id: `${prefix}-reset`, type: 'button', className: 'ptmt-colorizer-reset',
        textContent: 'Reset all colors', title: 'Restore all personal color settings to defaults',
    });
    content.appendChild(el('div', { className: 'ptmt-colorizer-actions' }, reset));
    reset.addEventListener('click', () => resetPersonalColors(persona));

    const ui: ColorizerUI = {
        persona, container, wrapper, section, enable, target, dialogSource, dialogStatic,
        dialogStaticRow, bubbleMode, bubbleSwatch, bubbleStatic, bubbleStaticRow,
        gradientEditor, gradientRow, opacity, opacityValue,
        loading: false,
        values: { dialogStatic: defaultColor, bubbleStatic: defaultColor },
        syncVisibility: () => {},
    };

    const syncVisibility = (): void => {
        section.style.display = enable.checked ? 'flex' : 'none';
        const selectedTarget = Number(target.value);
        dialogueGroup.hidden = !(selectedTarget & 1);
        bubbleGroup.hidden = !(selectedTarget & 2);
        dialogStaticRow.style.display = dialogSource.value === 'static_color' ? 'grid' : 'none';
        bubbleStaticRow.style.display = bubbleMode.value === 'static_color' ? 'grid' : 'none';
        gradientRow.style.display = bubbleMode.value === 'gradient' ? 'flex' : 'none';
        bubbleSwatch.style.display = ['avatar_light', 'avatar_dark'].includes(bubbleMode.value) ? 'inline-block' : 'none';
        if (bubbleSwatch.style.display !== 'none') refreshSwatch(ui);
    };
    ui.syncVisibility = syncVisibility;

    enable.addEventListener('change', () => { syncVisibility(); saveNow(persona); });
    target.addEventListener('change', () => { syncVisibility(); saveNow(persona); });
    dialogSource.addEventListener('change', () => { syncVisibility(); saveNow(persona); });
    bubbleMode.addEventListener('change', () => {
        if (bubbleMode.value === 'gradient' && gradientEditor.stops.length === 0) {
            autoPopulateGradient(gradientEditor, persona ? getPersonaPreview() : getCharacterPreview(), defaultAngle);
        }
        syncVisibility();
        saveNow(persona);
    });
    opacity.addEventListener('input', () => scheduleSave(persona));

    // The picker fires change on every drag update; debounce like the slider.
    dialogStatic.addEventListener('change', (event: Event) => {
        const detail = (event as CustomEvent<{ hex8?: string; hex?: string }>).detail;
        ui.values.dialogStatic = detail?.hex8 || detail?.hex || ui.values.dialogStatic;
        scheduleSave(persona);
    });
    bubbleStatic.addEventListener('change', (event: Event) => {
        const detail = (event as CustomEvent<{ hex8?: string; hex?: string }>).detail;
        ui.values.bubbleStatic = detail?.hex8 || detail?.hex || ui.values.bubbleStatic;
        scheduleSave(persona);
    });

    syncVisibility();
    return ui;
}

function refreshSwatch(ui: ColorizerUI): void {
    const mode = ui.bubbleMode.value;
    if (!['avatar_light', 'avatar_dark'].includes(mode)) return;
    const img = ui.persona ? getPersonaPreview() : getCharacterPreview();
    if (!img) return;
    const apply = (): void => {
        const colors = extractPalette(img);
        const color = mode === 'avatar_light' ? colors.at(-1) : colors[0];
        if (color) ui.bubbleSwatch.style.background = color;
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
}

function snapshotUI(ui: ColorizerUI): UISnapshot {
    return {
        enabled: ui.enable.checked,
        patch: {
            dialogSource: ui.dialogSource.value as ColorizerSource,
            dialogStatic: ui.values.dialogStatic,
            bubbleMode: ui.bubbleMode.value as BubbleMode,
            bubbleStatic1: ui.values.bubbleStatic,
            bubbleStatic2: ui.values.bubbleStatic,
            colorizeTarget: Number.parseInt(ui.target.value, 10) as ColorizeTarget,
            bubbleOpacity: Number.parseFloat(ui.opacity.value),
            bubbleGradientStops: ui.gradientEditor.stops,
            bubbleGradientAngle: ui.gradientEditor.angle,
        },
    };
}

function takeScheduled(persona: boolean): PendingSave | null {
    const pending = persona ? personaPendingSave : characterPendingSave;
    if (pending?.timer !== undefined) clearTimeout(pending.timer);
    if (persona) personaPendingSave = null;
    else characterPendingSave = null;
    return pending;
}

function cancelScheduled(persona: boolean): void {
    takeScheduled(persona);
}

// Save a debounced edit before the UI switches to another card or persona.
function flushScheduled(persona: boolean): void {
    const pending = takeScheduled(persona);
    if (pending) saveSnapshot(persona, pending.key, pending.snapshot);
}

function scheduleSave(persona: boolean): void {
    const ui = persona ? personaUI : charUI;
    if (!ui || ui.loading) return;
    cancelScheduled(persona);
    const pending: PendingSave = { key: persona ? currentPersonaKey : currentCharacterKey, snapshot: snapshotUI(ui) };
    pending.timer = setTimeout(() => {
        takeScheduled(persona);
        saveSnapshot(persona, pending.key, pending.snapshot);
    }, SAVE_DELAY);
    if (persona) personaPendingSave = pending;
    else characterPendingSave = pending;
}

function saveNow(persona: boolean): Promise<boolean> | undefined {
    const ui = persona ? personaUI : charUI;
    if (!ui || ui.loading) return;
    cancelScheduled(persona);
    const key = persona ? currentPersonaKey : currentCharacterKey;
    return saveSnapshot(persona, key, snapshotUI(ui));
}

async function saveSnapshot(persona: boolean, key: string | null, snapshot: UISnapshot | null): Promise<boolean> {
    if (!key || !snapshot) return false;
    const type = persona ? 'persona' : 'character';
    const currentKey = persona ? currentPersonaKey : currentCharacterKey;
    if (key !== currentKey) return false;

    const before = resolveCustomColorizerSettings(settings, type, key);
    if (!snapshot.enabled) {
        if (!before.enabled) return true;
        const changed = await updateCustomColorizerSettings(settings, type, key, { enabled: false });
        // Falling back to global settings can change the extraction mode.
        if (changed) window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: true } }));
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
            detail: { fullRefresh: !before.enabled || extractionChanged || gradientChanged },
        }));
    }
    return saved;
}

async function resetPersonalColors(persona: boolean): Promise<void> {
    const ui = persona ? personaUI : charUI;
    const key = persona ? currentPersonaKey : currentCharacterKey;
    if (!ui || ui.loading || !key) return;
    cancelScheduled(persona);
    const type = persona ? 'persona' : 'character';
    const saved = await updateCustomColorizerSettings(settings, type, key, {
        patch: buildColorizerCustomEntry(type),
    });
    if (!saved) return;
    if (key === (persona ? currentPersonaKey : currentCharacterKey)) {
        if (persona) loadPersonaSettings();
        else loadCharacterSettings();
    }
    window.dispatchEvent(new CustomEvent('ptmt:colorizer:refresh', { detail: { fullRefresh: true } }));
}

function applyResolvedToUI(
    ui: ColorizerUI,
    resolved: ResolvedCustomColorizerSettings,
    img: HTMLImageElement | null,
    defaultColor: string,
    defaultAngle: number,
): void {
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

function loadCharacterSettings(): void {
    if (!charUI) return;
    flushScheduled(false);
    currentCharacterKey = null;
    currentCharacterAvatar = null;

    const preview = getCharacterPreview();
    const avatarSrc = preview?.getAttribute('src') || '';
    const nameInput = document.getElementById('character_name_pole') as HTMLInputElement | null;
    const name = nameInput?.value?.trim()
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

function loadPersonaSettings(): void {
    if (!personaUI) return;
    flushScheduled(true);
    currentPersonaKey = null;
    const key = getActivePersonaFilename();
    if (!key) return;
    currentPersonaKey = key;
    applyResolvedToUI(personaUI, resolveCustomColorizerSettings(settings, 'persona', key), getPersonaPreview(), PERSONA_DEFAULT, PERSONA_ANGLE);
}

function updateEnableState(): void {
    const enabled = !!settings.get('enableDialogueColorizer');
    for (const ui of [charUI, personaUI]) {
        if (!ui?.container) continue;
        ui.container.style.opacity = enabled ? '1' : '0.5';
        ui.container.style.pointerEvents = enabled ? 'auto' : 'none';
        ui.enable.disabled = !enabled;
    }
}

function injectCharacterUI(): boolean {
    if (charUI?.container?.isConnected) return true;
    const target = document.getElementById('spoiler_free_desc');
    if (!target?.parentElement) return false;
    document.getElementById('ptmt-char-col-drawer')?.remove();
    charUI?.gradientEditor.destroy();
    charUI = createColorizerUI({ persona: false });
    target.parentElement.insertBefore(charUI.container, target);
    loadCharacterSettings();
    return true;
}

function injectPersonaUI(): boolean {
    if (personaUI?.container?.isConnected) return true;
    const current = document.querySelector('#persona-management-block .persona_management_current_persona');
    if (!current) return false;
    document.getElementById('ptmt-pchar-col-drawer')?.remove();
    personaUI?.gradientEditor.destroy();
    personaUI = createColorizerUI({ persona: true });
    current.prepend(personaUI.container);
    loadPersonaSettings();
    return true;
}

function ensureUIs(): void {
    injectCharacterUI();
    injectPersonaUI();
    updateEnableState();
}

function handleCharacterEditorOpened(): void {
    if (!injectCharacterUI()) return;
    loadCharacterSettings();
}
function handleCharacterEdited(): void {
    // CHARACTER_EDITED is emitted after SillyTavern has refreshed the card.
    queueMicrotask(loadCharacterSettings);
}
function handlePersonaChanged(): void {
    if (!injectPersonaUI()) return;
    loadPersonaSettings();
}
function handleAppReady(): void {
    ensureUIs();
}
function handleSettingsChanged(event: Event): void {
    if ((event as CustomEvent<SettingsChangedEventDetail>).detail?.changed?.includes('enableDialogueColorizer')) updateEnableState();
}

export function cleanupCharacterColorizerUI(): void {
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
    charUI?.gradientEditor.destroy();
    personaUI?.gradientEditor.destroy();
    charUI?.container?.remove();
    personaUI?.container?.remove();
    charUI = null;
    personaUI = null;
    currentCharacterKey = null;
    currentCharacterAvatar = null;
    currentPersonaKey = null;
}

export function initCharacterColorizerUI(): void {
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
