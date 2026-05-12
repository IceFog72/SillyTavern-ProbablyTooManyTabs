import { extractColorsFromImage, sortColorsByLightness } from './utils.js';

const TRANSLUCENT_PROFILE_SUFFIX = ' Alpha';
const NORMAL_PROFILE_SUFFIX = ' Solid';

function withNormalVariant(profile) {
    return {
        ...profile,
        uiAlpha: 1,
    };
}

function withProfileVariants(profiles) {
    return Object.fromEntries(Object.entries(profiles).flatMap(([key, profile]) => [
        [key, { ...profile, label: `${profile.label}${TRANSLUCENT_PROFILE_SUFFIX}` }],
        [`${key}-normal`, { ...withNormalVariant(profile), label: `${profile.label}${NORMAL_PROFILE_SUFFIX}` }],
    ]));
}

const BASE_PALETTE_PROFILES = {
    dark: {
        label: 'Dark',
        textTarget: 'light',
        panelTone: 'dark',
        textWhiteMix: 0.54,
        italicsWhiteMix: 0.2,
        accentMix: 0.5,
        chatAlpha: 0.5,
        panelAlpha: 0.3,
        uiAlpha: 0.6,
        inputAlpha: 0.82,
    },
    bright: {
        label: 'Bright',
        textTarget: 'dark',
        panelTone: 'light',
        textBlackMix: 0.42,
        italicsBlackMix: 0.26,
        bgWhiteMix: 0.54,
        panelWhiteMix: 0.46,
        uiWhiteMix: 0.62,
        inputWhiteMix: 0.72,
        accentMix: 0.22,
        chatAlpha: 0.5,
        panelAlpha: 0.3,
        uiAlpha: 0.6,
        inputAlpha: 0.9,
    },
    balanced: {
        label: 'Balanced',
        textTarget: 'light',
        panelTone: 'mid',
        textWhiteMix: 0.46,
        italicsWhiteMix: 0.14,
        accentMix: 0.36,
        chatAlpha: 0.5,
        panelAlpha: 0.3,
        uiAlpha: 0.6,
        inputAlpha: 0.84,
    },
    vivid: {
        label: 'Vivid',
        textTarget: 'light',
        panelTone: 'dark',
        textWhiteMix: 0.48,
        italicsWhiteMix: 0.12,
        accentMix: 0.18,
        chatAlpha: 0.5,
        panelAlpha: 0.3,
        uiAlpha: 0.6,
        inputAlpha: 0.8,
    },
    soft: {
        label: 'Soft',
        textTarget: 'light',
        panelTone: 'muted',
        textWhiteMix: 0.58,
        italicsWhiteMix: 0.28,
        accentMix: 0.62,
        chatAlpha: 0.5,
        panelAlpha: 0.3,
        uiAlpha: 0.6,
        inputAlpha: 0.84,
    },
};

export const PALETTE_PROFILES = withProfileVariants(BASE_PALETTE_PROFILES);

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

export function getPaletteProfile(profileName) {
    return PALETTE_PROFILES[profileName] || PALETTE_PROFILES.dark;
}

export function buildThemeFromColors(hexes, profileName = 'dark') {
    const profile = getPaletteProfile(profileName);
    const colors = uniqueByDistance(sortColorsByLightness(hexes).map(colorStats), 18);
    const byLight = [...colors].sort((a, b) => a.luma - b.luma);
    const byVibrant = [...colors].sort((a, b) => (b.saturation * 0.75 + b.luma * 0.25) - (a.saturation * 0.75 + a.luma * 0.25));
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const darkest = byLight[0];
    const mostLight = byLight.at(-1);
    const lightAlt = byLight.at(-2) || mostLight;
    const mid = byLight[Math.floor(byLight.length / 2)] || lightAlt;
    const midLight = byLight[Math.ceil(byLight.length * 0.65)] || lightAlt;
    const midDark = byLight[Math.floor(byLight.length * 0.35)] || mid;
    const dark2 = byLight[1] || darkest;
    const dark3 = byLight[2] || dark2;
    const dark4 = byLight[3] || dark3;
    const vibrant = byVibrant[0] || mostLight;
    const vibrant2 = byVibrant.find(color => color.hex !== vibrant.hex && rgbDistance(color.rgb, vibrant.rgb) > 34) || byVibrant.find(color => color.hex !== vibrant.hex) || mid;

    let chatBase;
    let panelBase;
    let uiBase;
    let inputBase;
    let borderBase;

    switch (profile.panelTone) {
        case 'light':
            chatBase = mixRgb(mostLight.rgb, white, profile.bgWhiteMix ?? 0.54);
            panelBase = mixRgb(lightAlt.rgb, white, profile.panelWhiteMix ?? 0.46);
            uiBase = mixRgb(mostLight.rgb, white, profile.uiWhiteMix ?? 0.62);
            inputBase = mixRgb(mostLight.rgb, white, profile.inputWhiteMix ?? 0.72);
            borderBase = mixRgb(midLight.rgb, white, 0.18);
            break;
        case 'mid':
            chatBase = pleasantUiRgb(midDark);
            panelBase = pleasantUiRgb(mid);
            uiBase = pleasantUiRgb(dark4);
            inputBase = pleasantUiRgb(dark2);
            borderBase = pleasantUiRgb(midLight);
            break;
        case 'muted':
            chatBase = mixRgb(pleasantUiRgb(dark3), pleasantUiRgb(mid), 0.28);
            panelBase = mixRgb(pleasantUiRgb(dark4), pleasantUiRgb(mid), 0.36);
            uiBase = mixRgb(pleasantUiRgb(dark2), pleasantUiRgb(mid), 0.18);
            inputBase = mixRgb(pleasantUiRgb(darkest), pleasantUiRgb(mid), 0.16);
            borderBase = mixRgb(pleasantUiRgb(mid), pleasantUiRgb(lightAlt), 0.18);
            break;
        default:
            chatBase = pleasantUiRgb(dark3);
            panelBase = pleasantUiRgb(dark4);
            uiBase = pleasantUiRgb(dark2);
            inputBase = pleasantUiRgb(darkest);
            borderBase = pleasantUiRgb(mid);
            break;
    }

    const textContrastBackgrounds = [chatBase, panelBase, uiBase, inputBase];
    const textSource = profile.textTarget === 'dark'
        ? mixRgb(darkest.rgb, black, profile.textBlackMix ?? 0.35)
        : mixRgb(mostLight.rgb, white, profile.textWhiteMix ?? 0.54);
    const italicsSource = profile.textTarget === 'dark'
        ? mixRgb(midDark.rgb, black, profile.italicsBlackMix ?? 0.24)
        : mixRgb(mostLight.rgb, white, profile.italicsWhiteMix ?? 0.2);
    const mainText = ensureTextContrastToward(textSource, textContrastBackgrounds, profile.textTarget, 4.8);
    const italicsText = ensureTextContrastToward(italicsSource, textContrastBackgrounds, profile.textTarget, 4.5);
    const underline = mixRgb(vibrant2.rgb, profile.textTarget === 'dark' ? darkest.rgb : lightAlt.rgb, profile.accentMix);
    const shadowBase = profile.textTarget === 'dark'
        ? mixRgb(mostLight.rgb, white, 0.35)
        : mixRgb(darkest.rgb, black, 0.35);

    return {
        main_text_color: rgba(mainText, 1),
        italics_text_color: rgba(italicsText, 1),
        underline_text_color: rgba(underline, 1),
        quote_text_color: rgba(vibrant.rgb, 1),
        chat_tint_color: rgba(chatBase, profile.chatAlpha),
        ptmt_ui_background_2: rgba(panelBase, profile.panelAlpha),
        border_color: rgba(borderBase, 0.55),
        shadow_color: rgba(shadowBase, 1),
        blur_tint_color: rgba(uiBase, profile.uiAlpha),
        ptmt_textbox_background: rgba(inputBase, profile.inputAlpha),
        ptmt_tabs_color: rgba(italicsText, 1),
        ptmt_tabs_background: rgba(uiBase, profile.uiAlpha),
    };
}

export function buildThemeFromImage(img, profileName = 'dark', numColors = 14) {
    return buildThemeFromColors(extractColorsFromImage(img, numColors), profileName);
}
