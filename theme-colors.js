import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { sortColorsByLightness } from './utils.js';
import { PALETTE_PROFILES as SHARED_PALETTE_PROFILES, buildThemeFromImage as buildSharedThemeFromImage } from './palette-generator.js';

const PTMT_THEME_COLOR_KEY = 'ptmt_theme_colors';
const PALETTE_PROFILE_KEY = 'ptmt_bg_palette_profile';

// ─── Dead code: local profile copies superseded by palette-generator.js ───────
// These profiles have diverged alpha values (0.86–0.94 vs 0.3–0.6 in the live
// palette-generator.js version). Kept for reference.
//
// const TRANSLUCENT_PROFILE_SUFFIX = ' Alpha';
// const NORMAL_PROFILE_SUFFIX = ' Solid';
//
// function withNormalPaletteProfile(profile) {
//     return { ...profile, uiAlpha: 1 };
// }
//
// function withPaletteProfileVariants(profiles) {
//     return Object.fromEntries(Object.entries(profiles).flatMap(([key, profile]) => [
//         [key, { ...profile, label: `${profile.label}${TRANSLUCENT_PROFILE_SUFFIX}` }],
//         [`${key}-normal`, { ...withNormalPaletteProfile(profile), label: `${profile.label}${NORMAL_PROFILE_SUFFIX}` }],
//     ]));
// }
//
// const BASE_PALETTE_PROFILES = {
//     dark:     { panelAlpha: 0.88, uiAlpha: 0.9,  inputAlpha: 0.82, ... },
//     bright:   { panelAlpha: 0.92, uiAlpha: 0.94, inputAlpha: 0.9,  ... },
//     balanced: { panelAlpha: 0.9,  uiAlpha: 0.9,  inputAlpha: 0.84, ... },
//     vivid:    { panelAlpha: 0.86, uiAlpha: 0.88, inputAlpha: 0.8,  ... },
//     soft:     { panelAlpha: 0.88, uiAlpha: 0.9,  inputAlpha: 0.84, ... },
// };
//
// const PALETTE_PROFILES = withPaletteProfileVariants(BASE_PALETTE_PROFILES);

const PTMT_THEME_COLORS = [
    {
        property: '--ST-UI-Background-2',
        powerUserKey: 'ptmt_ui_background_2',
        label: 'UI Background 2',
        fallback: 'color-mix(in srgb, var(--ptmt-adaptive-quote) 10%, var(--ptmt-adaptive-em) 10%)',
    },
    {
        property: '--ST-TextBox-Background',
        powerUserKey: 'ptmt_textbox_background',
        label: 'Text Box Background',
        fallback: 'var(--black30a)',
    },
    {
        property: '--ST-Tabs-Color',
        powerUserKey: 'ptmt_tabs_color',
        label: 'Tabs Color',
        fallback: 'var(--ptmt-adaptive-em)',
    },
    {
        property: '--ST-Tabs-Background',
        powerUserKey: 'ptmt_tabs_background',
        label: 'Tabs Background',
        fallback: 'color-mix(in srgb, var(--ST-UI-Background), transparent 30%)',
    },
];

const ST_THEME_COLORS = [
    { powerUserKey: 'main_text_color', property: '--SmartThemeBodyColor', picker: '#main-text-color-picker' },
    { powerUserKey: 'italics_text_color', property: '--SmartThemeEmColor', picker: '#italics-color-picker' },
    { powerUserKey: 'underline_text_color', property: '--SmartThemeUnderlineColor', picker: '#underline-color-picker' },
    { powerUserKey: 'quote_text_color', property: '--SmartThemeQuoteColor', picker: '#quote-color-picker' },
    { powerUserKey: 'chat_tint_color', property: '--SmartThemeChatTintColor', picker: '#chat-tint-color-picker' },
    { powerUserKey: 'blur_tint_color', property: '--SmartThemeBlurTintColor', picker: '#blur-tint-color-picker' },
    { powerUserKey: 'border_color', property: '--SmartThemeBorderColor', picker: '#border-color-picker' },
    { powerUserKey: 'shadow_color', property: '--SmartThemeShadowColor', picker: '#shadow-color-picker' },
];

const COLOR_GENERATION_TARGETS = [
    'main_text_color',
    'italics_text_color',
    'underline_text_color',
    'quote_text_color',
    'chat_tint_color',
    'ptmt_ui_background_2',
    'border_color',
    'shadow_color',
    'blur_tint_color',
    'ptmt_textbox_background',
    'ptmt_tabs_color',
    'ptmt_tabs_background',
];

let originalFetchForThemeColors = null;
const programmaticPickerUpdates = new WeakSet();
const initializingPickers = new WeakSet();

function getExplicitThemeColor({ powerUserKey }) {
    const value = power_user[powerUserKey];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
    };
}

function rgba({ r, g, b }, alpha = 1) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clampColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function mixRgb(color, mixWith, amount) {
    return {
        r: clampColorChannel(color.r + ((mixWith.r - color.r) * amount)),
        g: clampColorChannel(color.g + ((mixWith.g - color.g) * amount)),
        b: clampColorChannel(color.b + ((mixWith.b - color.b) * amount)),
    };
}

function rgbDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function relativeLuminance({ r, g, b }) {
    const toLinear = value => {
        value /= 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * toLinear(r)) + (0.7152 * toLinear(g)) + (0.0722 * toLinear(b));
}

function contrastRatio(a, b) {
    const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
    const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
    return (lighter + 0.05) / (darker + 0.05);
}

function ensureTextContrastToward(color, backgrounds, target = 'light', minRatio = 4.5) {
    const mixTarget = target === 'dark' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    for (let amount = 0; amount <= 1; amount += 0.08) {
        const candidate = amount === 0 ? color : mixRgb(color, mixTarget, amount);
        const passes = backgrounds.every(background => contrastRatio(candidate, background) >= minRatio);
        if (passes) return candidate;
    }
    return mixRgb(color, mixTarget, 0.8);
}

function rgbToHsl({ r, g, b }) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
                break;
        }
        h *= 60;
    }

    return { h, s, l };
}

function isMuddyUiColor(color) {
    const { h, s, l } = rgbToHsl(color.rgb);
    const isWarmBrown = h >= 18 && h <= 62 && s >= 0.12;
    const isOlive = h > 62 && h <= 105 && s >= 0.1;
    const isGrayYellow = h >= 35 && h <= 95 && s >= 0.06 && s < 0.18;
    return l < 0.72 && (isWarmBrown || isOlive || isGrayYellow);
}

function pleasantUiRgb(color) {
    if (!isMuddyUiColor(color)) return color.rgb;

    const coolByTone = color.luma < 0.28
        ? { r: 19, g: 29, b: 43 }
        : color.luma < 0.58
            ? { r: 45, g: 58, b: 76 }
            : { r: 102, g: 124, b: 146 };

    const amount = color.saturation > 0.32 ? 0.62 : 0.48;
    return mixRgb(color.rgb, coolByTone, amount);
}

// Dead: was only used by the local buildThemeFromColors below.
// function getPaletteProfile(profileName) {
//     return PALETTE_PROFILES[profileName] || PALETTE_PROFILES.dark;
// }

function getSelectedPaletteProfile() {
    const saved = power_user[PALETTE_PROFILE_KEY];
    return typeof saved === 'string' && SHARED_PALETTE_PROFILES[saved] ? saved : 'dark';
}

function colorStats(hex) {
    const rgb = hexToRgb(hex);
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const lightness = (max + min) / 510;
    const saturation = max === 0 ? 0 : (max - min) / max;
    const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return { hex, rgb, lightness, saturation, luma };
}

function uniqueByDistance(colors, minDistance = 28) {
    const picked = [];
    for (const color of colors) {
        const farEnough = picked.every(existing => rgbDistance(existing.rgb, color.rgb) >= minDistance);
        if (farEnough) picked.push(color);
    }
    return picked;
}

function resolveCssColor(value) {
    const temp = document.createElement('div');
    temp.style.display = 'none';
    temp.style.backgroundColor = value;
    document.body.append(temp);
    let resolved = window.getComputedStyle(temp).backgroundColor;
    temp.remove();

    const reColor = /^color\(srgb (\d(?:\.\d+)) (\d(?:\.\d+)) (\d(?:\.\d+))\)$/;
    if (reColor.test(resolved)) {
        resolved = resolved.replace(reColor, (_, r, g, b) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`);
    }
    return resolved;
}

function channelToHex(value) {
    return clampColorChannel(Number(value)).toString(16).padStart(2, '0');
}

function cssColorToPickerColor(value, { includeAlpha = true } = {}) {
    const resolved = resolveCssColor(value);

    const rgbMatch = resolved.match(/^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:(?:\s*,\s*|\s*\/\s*)([\d.]+))?\s*\)?$/i);
    if (rgbMatch) {
        const hex = `#${channelToHex(rgbMatch[1])}${channelToHex(rgbMatch[2])}${channelToHex(rgbMatch[3])}`;
        if (!includeAlpha) return hex;
        const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
        return alpha < 1 ? `${hex}${channelToHex(Math.round(alpha * 255))}` : hex;
    }

    const srgbMatch = resolved.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
    if (srgbMatch) {
        const hex = `#${channelToHex(Number(srgbMatch[1]) * 255)}${channelToHex(Number(srgbMatch[2]) * 255)}${channelToHex(Number(srgbMatch[3]) * 255)}`;
        if (!includeAlpha) return hex;
        const alpha = srgbMatch[4] !== undefined ? parseFloat(srgbMatch[4]) : 1;
        return alpha < 1 ? `${hex}${channelToHex(Math.round(alpha * 255))}` : hex;
    }

    if (/^#[0-9a-f]{8}$/i.test(resolved)) return includeAlpha ? resolved : resolved.slice(0, 7);
    return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '';
}

function getThemeColorRule(customCss) {
    return [...customCss.sheet.cssRules].find(rule => rule.selectorText === 'html > body:not(#ptmt-theme-properties)');
}

function syncCustomCss(customCss) {
    power_user.custom_css = [...customCss.sheet.cssRules].map(rule => rule.cssText).join('\n');
    customCss.innerHTML = power_user.custom_css;
    const customCssInput = document.querySelector('#customCSS');
    if (customCssInput) customCssInput.value = power_user.custom_css;
}

function setPickerElementColor(picker, value, { includeAlpha = true } = {}) {
    if (!picker) return;

    const color = cssColorToPickerColor(value, { includeAlpha });
    if (!color) return;
    if (picker.getAttribute('color') === color) return;

    programmaticPickerUpdates.add(picker);

    // Suppress change events so SillyTavern's own handlers don't
    // overwrite values we just set programmatically.
    const origDispatch = HTMLElement.prototype.dispatchEvent;
    picker.dispatchEvent = function (event) {
        if (event.type === 'change') return true;
        return origDispatch.call(this, event);
    };
    picker.setAttribute('color', color);
    requestAnimationFrame(() => {
        delete picker.dispatchEvent;
        setTimeout(() => programmaticPickerUpdates.delete(picker), 250);
    });
}

function setPickerColor(selector, value, { includeAlpha = true } = {}) {
    setPickerElementColor(document.querySelector(selector), value, { includeAlpha });
}

function applyColorProperty(property, value) {
    document.documentElement.style.setProperty(property, value);
}

function applyStColor(powerUserKey, value, { syncPicker = true } = {}) {
    const config = ST_THEME_COLORS.find(item => item.powerUserKey === powerUserKey);
    if (!config) return;

    power_user[powerUserKey] = value;
    document.documentElement.style.setProperty(config.property, value);
    if (syncPicker) setPickerColor(config.picker, value);

    if (powerUserKey === 'main_text_color') {
        const [r, g, b, a] = value.split('(')[1].split(')')[0].split(',');
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorR', r);
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorG', g);
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorB', b);
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorA', a);
    }

    if (powerUserKey === 'blur_tint_color') {
        applyColorProperty('--ST-UI-Background', value);
        document.querySelector('meta[name=theme-color]')?.setAttribute('content', value);
    }
}

function applyPtmtColor(powerUserKey, value, { syncPicker = true } = {}) {
    const config = PTMT_THEME_COLORS.find(item => item.powerUserKey === powerUserKey);
    if (!config) return;

    power_user[powerUserKey] = value;
    applyColorProperty(config.property, value);
    if (syncPicker) setPickerColor(`#ptmt-theme-color-${config.property.slice(2)}`, value);
}

function applyPaletteValues(palette, { syncPickers = true } = {}) {
    for (const key of COLOR_GENERATION_TARGETS) {
        const value = palette[key];
        if (!value) continue;
        if (key.startsWith('ptmt_')) applyPtmtColor(key, value, { syncPicker: syncPickers });
        else applyStColor(key, value, { syncPicker: syncPickers });
    }
}

function stabilizeGeneratedPalette(palette) {
    for (const delay of [0, 100, 500, 1200]) {
        setTimeout(() => {
            applyPaletteValues(palette, { syncPickers: false });
            saveSettingsDebounced();
        }, delay);
    }
}

function clearThemeColorProperties(customCss = document.querySelector('#custom-style')) {
    for (const { property, powerUserKey } of PTMT_THEME_COLORS) {
        delete power_user[powerUserKey];
        document.documentElement.style.removeProperty(property);
        document.body.style.removeProperty(property);
    }

    if (customCss?.sheet) {
        const rule = getThemeColorRule(customCss);
        if (rule) {
            for (const { property } of PTMT_THEME_COLORS) {
                rule.style.removeProperty(property);
            }
            syncCustomCss(customCss);
        }
    }
}

function cleanupLegacyCustomCssRule(customCss = document.querySelector('#custom-style')) {
    if (!customCss?.sheet) return;

    const rule = getThemeColorRule(customCss);
    if (!rule) return;

    for (const { property } of PTMT_THEME_COLORS) {
        rule.style.removeProperty(property);
    }

    if (rule.style.length === 0) {
        const index = [...customCss.sheet.cssRules].indexOf(rule);
        if (index >= 0) customCss.sheet.deleteRule(index);
    }

    syncCustomCss(customCss);
    saveSettingsDebounced();
}

function getCurrentThemeColors() {
    return Object.fromEntries(PTMT_THEME_COLORS.map(({ property, powerUserKey }) => [
        property,
        getExplicitThemeColor({ powerUserKey })
            || getComputedStyle(document.body).getPropertyValue(property).trim()
            || getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    ]));
}

function getCurrentThemeColorKeys() {
    return Object.fromEntries(PTMT_THEME_COLORS.map(({ property, powerUserKey }) => [
        powerUserKey,
        getExplicitThemeColor({ powerUserKey })
            || getComputedStyle(document.body).getPropertyValue(property).trim()
            || getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    ]));
}

function applyStoredPowerUserThemeColors() {
    let applied = false;
    for (const color of PTMT_THEME_COLORS) {
        const value = getExplicitThemeColor(color);
        if (value) {
            applyPtmtColor(color.powerUserKey, value);
            applied = true;
        }
    }
    return applied;
}

function reapplyExplicitThemeColors() {
    for (const color of PTMT_THEME_COLORS) {
        const value = getExplicitThemeColor(color);
        if (!value) continue;
        applyColorProperty(color.property, value);
        setPickerColor(`#ptmt-theme-color-${color.property.slice(2)}`, value);
    }
}

function stabilizeThemeColorsAfterLoad() {
    for (const delay of [0, 100, 500, 1500]) {
        setTimeout(reapplyExplicitThemeColors, delay);
    }
}

function applyThemeColorsFromTheme(theme, { clearMissing = true } = {}) {
    const colors = theme?.[PTMT_THEME_COLOR_KEY];
    if (!colors || typeof colors !== 'object') {
        const hasTopLevelColors = PTMT_THEME_COLORS.some(({ powerUserKey }) => typeof theme?.[powerUserKey] === 'string' && theme[powerUserKey].trim());
        if (!hasTopLevelColors) {
            if (clearMissing) clearThemeColorProperties();
            else applyStoredPowerUserThemeColors();
            return false;
        }
    }

    for (const { property, powerUserKey } of PTMT_THEME_COLORS) {
        const value = colors?.[property] || theme?.[powerUserKey];
        if (typeof value === 'string' && value.trim()) {
            applyPtmtColor(powerUserKey, value.trim());
        }
    }
    return true;
}

async function getSavedThemeByName(name) {
    if (!name) return null;
    const response = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.themes?.find(theme => theme.name === name) || null;
}

async function applySavedThemeColors(name = power_user.theme, options = {}) {
    try {
        applyThemeColorsFromTheme(await getSavedThemeByName(name), options);
    } catch (error) {
        console.warn('[PTMT] Failed to apply saved theme colors:', error);
    }
}

function initThemeColorSaveHook() {
    if (originalFetchForThemeColors) return;

    originalFetchForThemeColors = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;
        const isThemeSave = url?.endsWith('/api/themes/save') && init?.body;
        if (!isThemeSave) return originalFetchForThemeColors(input, init);

        try {
            const body = JSON.parse(init.body);
            if (body && typeof body === 'object') {
                body[PTMT_THEME_COLOR_KEY] = getCurrentThemeColors();
                Object.assign(body, getCurrentThemeColorKeys());
                init = { ...init, body: JSON.stringify(body) };
            }
        } catch (error) {
            console.warn('[PTMT] Failed to attach theme colors to theme save:', error);
        }

        return originalFetchForThemeColors(input, init);
    };
}

function getActiveBackgroundUrl() {
    for (const id of ['bg1', 'bg_custom']) {
        const el = document.getElementById(id);
        if (!el) continue;

        const img = getComputedStyle(el).backgroundImage;
        const match = img?.match(/url\(["']?([^"')]+)["']?\)/);
        if (match?.[1]) return match[1];
    }
    return null;
}

async function loadBackgroundImage() {
    const url = getActiveBackgroundUrl();
    if (!url) throw new Error('No active background image found.');

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    await img.decode();
    return img;
}

// Dead: local buildThemeFromColors superseded by palette-generator.js.
// The live path is: applyBackgroundPalette → buildSharedThemeFromImage → palette-generator.buildThemeFromColors
// Note: this copy used inter-color mixing for 'light' panelTone whereas the live version uses white-mix params.
// function buildThemeFromColors(hexes, profileName = getSelectedPaletteProfile()) { ... }

async function applyImagePalette(button, loadImage, successMessage, warningPrefix) {
    if (button.dataset.busy === 'true') return;

    const previousTitle = button.title;
    button.dataset.busy = 'true';
    button.classList.add('disabled');
    button.title = 'Generating colors...';

    try {
        const img = await loadImage();
        const palette = buildSharedThemeFromImage(img, getSelectedPaletteProfile(), 14);
        applyPaletteValues(palette);
        stabilizeGeneratedPalette(palette);
        saveSettingsDebounced();
        window.toastr?.success(successMessage, 'PTMT');
    } catch (error) {
        console.warn(`[PTMT] ${warningPrefix}:`, error);
        window.toastr?.warning(String(error?.message || error), 'PTMT');
    } finally {
        delete button.dataset.busy;
        button.classList.remove('disabled');
        button.title = previousTitle;
    }
}

function applyBackgroundPalette(button) {
    return applyImagePalette(
        button,
        loadBackgroundImage,
        'Theme colors generated from background.',
        'Failed to generate colors from background',
    );
}

async function loadCharacterPreviewImage() {
    const img = document.getElementById('avatar_load_preview');
    if (!img?.getAttribute('src')) throw new Error('No character image found.');

    if (!img.complete || !img.naturalWidth) {
        await new Promise((resolve, reject) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', () => reject(new Error('Character image failed to load.')), { once: true });
        });
    }

    if (typeof img.decode === 'function') {
        await img.decode().catch(() => {});
    }

    return img;
}

function applyCharacterPalette(button) {
    return applyImagePalette(
        button,
        loadCharacterPreviewImage,
        'Theme colors generated from character image.',
        'Failed to generate colors from character image',
    );
}

function syncPaletteProfileSelects(value) {
    for (const select of document.querySelectorAll('[data-ptmt-palette-profile-select="true"]')) {
        select.value = value;
    }
}

function createPaletteProfileSelect(id, title) {
    const profileSelect = document.createElement('select');
    profileSelect.id = id;
    profileSelect.className = 'margin0 text_pole';
    profileSelect.title = title;
    profileSelect.dataset.i18n = `[title]${title}`;
    profileSelect.dataset.ptmtPaletteProfileSelect = 'true';
    for (const [value, profile] of Object.entries(SHARED_PALETTE_PROFILES)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = profile.label;
        profileSelect.append(option);
    }
    profileSelect.value = getSelectedPaletteProfile();
    profileSelect.addEventListener('click', event => event.stopPropagation());
    profileSelect.addEventListener('change', (event) => {
        event.stopPropagation();
        power_user[PALETTE_PROFILE_KEY] = profileSelect.value;
        syncPaletteProfileSelects(profileSelect.value);
        saveSettingsDebounced();
    });
    return profileSelect;
}

function createPaletteButton(id, title, handler) {
    const button = document.createElement('div');
    button.id = id;
    button.className = 'menu_button menu_button_icon margin0';
    button.title = title;
    button.dataset.i18n = `[title]${title}`;
    button.tabIndex = 0;
    button.role = 'button';
    button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handler(button);
    });
    button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        handler(button);
    });
    return button;
}

function injectBackgroundPaletteButton() {
    if (document.querySelector('#ptmt-bg-palette-button')) return;

    const header = document.querySelector('#UI-Theme-Block [name="themeElements"] .inline-drawer-toggle.inline-drawer-header.userSettingsInnerExpandable');
    const title = header?.querySelector('b');
    if (!header || !title) {
        setTimeout(injectBackgroundPaletteButton, 1000);
        return;
    }

    const button = createPaletteButton('ptmt-bg-palette-button', 'Generate colors from background', applyBackgroundPalette);
    const profileSelect = createPaletteProfileSelect('ptmt-bg-palette-profile', 'Background palette profile');

    title.insertAdjacentElement('afterend', button);
    button.insertAdjacentElement('afterend', profileSelect);
}

function injectCharacterPaletteControls() {
    if (document.querySelector('#ptmt-char-palette-header')) return;

    const colorizer = document.querySelector('#ptmt-char-col-drawer');
    if (!colorizer) {
        setTimeout(injectCharacterPaletteControls, 1000);
        return;
    }

    const header = document.createElement('h4');
    header.id = 'ptmt-char-palette-header';

    const title = document.createElement('span');
    title.dataset.i18n = 'Character Palette';
    title.textContent = 'Character Palette';

    const controls = document.createElement('span');
    controls.className = 'flex-container widthFitContent';

    const button = createPaletteButton('ptmt-char-palette-button', 'Generate colors from character image', applyCharacterPalette);
    const profileSelect = createPaletteProfileSelect('ptmt-char-palette-profile', 'Character palette profile');

    controls.append(button, profileSelect);
    header.append(title, controls);
    colorizer.insertAdjacentElement('beforebegin', header);
}

function initThemeColorPickers() {
    if (document.querySelector('#ptmt-theme-color-container')) return;

    const colorPickerBlock = document.querySelector('#color-picker-block');
    const customCss = document.querySelector('#custom-style');
    if (!colorPickerBlock || !customCss?.sheet) {
        setTimeout(initThemeColorPickers, 1000);
        return;
    }
    cleanupLegacyCustomCssRule(customCss);

    const container = document.createElement('div');
    container.id = 'ptmt-theme-color-container';

    for (const { property, powerUserKey, label, fallback } of PTMT_THEME_COLORS) {
        const row = document.createElement('div');
        row.classList.add('flex-container');

        const input = document.createElement('toolcool-color-picker');
        input.id = `ptmt-theme-color-${property.slice(2)}`;
        row.append(input);

        const labelElement = document.createElement('span');
        labelElement.dataset.i18n = label;
        labelElement.textContent = label;
        row.append(labelElement);

        const setInitialValue = () => {
            const rule = getThemeColorRule(customCss);
            const customValue = rule?.styleMap?.get(property)?.toString() || rule?.style?.getPropertyValue(property);
            const value = getExplicitThemeColor({ powerUserKey }) || customValue || fallback;
            initializingPickers.add(input);
            setPickerElementColor(input, value);
            setTimeout(() => initializingPickers.delete(input), 1000);
        };

        container.append(row);
        setInitialValue();

        input.addEventListener('change', (event) => {
            if (programmaticPickerUpdates.has(input) || initializingPickers.has(input)) return;

            const color = event.detail?.rgba || event.detail?.rgb;
            if (!color) return;
            applyPtmtColor(powerUserKey, color);
            saveSettingsDebounced();
        });
    }

    colorPickerBlock.append(container);
    applyStoredPowerUserThemeColors();
    stabilizeThemeColorsAfterLoad();

    const themesSelect = document.querySelector('#themes');
    themesSelect?.addEventListener('change', () => {
        setTimeout(async () => {
            await applySavedThemeColors(String(themesSelect.value));
            for (const color of PTMT_THEME_COLORS) {
                const value = getExplicitThemeColor(color) || color.fallback;
                setPickerColor(`#ptmt-theme-color-${color.property.slice(2)}`, value);
            }
        }, 0);
    });

    // Keep --ST-UI-Background in sync when the user manually changes the blur tint picker.
    // After color generation, PTMT pins --ST-UI-Background as an inline style;
    // ST's own handler only updates --SmartThemeBlurTintColor, leaving the alias stale.
    const blurTintPicker = document.querySelector('#blur-tint-color-picker');
    blurTintPicker?.addEventListener('change', (event) => {
        if (programmaticPickerUpdates.has(blurTintPicker)) return;
        const color = event.detail?.rgba;
        if (!color) return;
        applyColorProperty('--ST-UI-Background', color);
    });

}

export function initThemeColors() {
    initThemeColorSaveHook();
    initThemeColorPickers();
    injectBackgroundPaletteButton();
    injectCharacterPaletteControls();
    cleanupLegacyCustomCssRule();
}
