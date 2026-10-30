import { clampColorChannel, contrastRatio, extractColorsFromImage, hexToRgb, mixRgb, rgba } from '../core/utils.js';

// Surface tones are ordered chat, panel, UI, input.
const BASE_PALETTE_PROFILES = {
    dark: { label: 'Dark', tones: [0.24, 0.28, 0.20, 0.17], surfaceChroma: 0.018, accentChroma: 0.13, inputAlpha: 0.82 },
    bright: { label: 'Bright', tones: [0.94, 0.91, 0.96, 0.98], surfaceChroma: 0.012, accentChroma: 0.14, inputAlpha: 0.9, textTarget: 'dark' },
    balanced: { label: 'Balanced', tones: [0.32, 0.36, 0.28, 0.25], surfaceChroma: 0.028, accentChroma: 0.12, inputAlpha: 0.84 },
    vivid: { label: 'Vivid', tones: [0.23, 0.28, 0.18, 0.15], surfaceChroma: 0.035, accentChroma: 0.20, inputAlpha: 0.8 },
    soft: { label: 'Soft', tones: [0.29, 0.33, 0.25, 0.22], surfaceChroma: 0.012, accentChroma: 0.07, inputAlpha: 0.84 },
};

export const PALETTE_PROFILES = Object.fromEntries(Object.entries(BASE_PALETTE_PROFILES).flatMap(([key, profile]) => {
    const base = { textTarget: 'light', chatAlpha: 0.5, panelAlpha: 0.3, ...profile };
    return [
        [key, { ...base, label: `${profile.label} Alpha`, uiAlpha: 0.7 }],
        [`${key}-normal`, { ...base, label: `${profile.label} Solid`, uiAlpha: 1 }],
    ];
}));

// Oklab matrices: https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
// Work in perceptual lightness/chroma so warm and cool images share the same tonal hierarchy.
function toOklch({ r, g, b }) {
    const linear = value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    [r, g, b] = [r, g, b].map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const blue = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, c: Math.hypot(a, blue), h: Math.atan2(blue, a) };
}

function fromOklch(lightness, chroma, hue) {
    const linear = amount => {
        const a = amount * Math.cos(hue), b = amount * Math.sin(hue);
        const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
        return [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ];
    };
    const inGamut = channels => channels.every(value => value >= -1e-7 && value <= 1.0000001);
    let channels = linear(chroma);
    if (!inGamut(channels)) {
        // Reduce chroma, rather than clipping channels and changing the intended hue.
        let low = 0, high = chroma;
        for (let i = 0; i < 16; i++) {
            const mid = (low + high) / 2;
            if (inGamut(linear(mid))) low = mid;
            else high = mid;
        }
        channels = linear(low);
    }
    const [r, g, b] = channels.map(value => clampColorChannel(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)));
    return { r, g, b };
}

function readableTone(lightness, chroma, hue, backgrounds, target, minimum = 4.5) {
    const endpoint = target === 'dark' ? 0 : 1;
    for (let step = 0; step <= 100; step++) {
        const color = fromOklch(lightness + (endpoint - lightness) * step / 100, chroma, hue);
        if (backgrounds.every(background => contrastRatio(color, background) >= minimum)) return color;
    }
    throw new Error('Generated surfaces cannot support the requested text contrast');
}

export function getPaletteProfile(profileName) {
    return PALETTE_PROFILES[profileName] || PALETTE_PROFILES.dark;
}

export function buildThemeFromColors(hexes, profileName = 'dark') {
    const profile = getPaletteProfile(profileName);
    const colors = [...new Set(hexes.filter(hex => /^#[\da-f]{6}$/i.test(hex)))].map(hex => toOklch(hexToRgb(hex)));
    // Prefer chromatic midtones over near-black/white samples. Gray images stay achromatic.
    const score = color => color.c * (1 - Math.abs(color.l - 0.6));
    const seed = colors.sort((a, b) => score(b) - score(a))[0] || toOklch(hexToRgb('#687b8f'));
    const chroma = seed.c < 0.015 ? 0 : Math.min(seed.c, profile.accentChroma);
    const surfaceChroma = Math.min(chroma * 0.2, profile.surfaceChroma);
    const [chatBase, panelBase, uiBase, inputBase] = profile.tones.map(tone => fromOklch(tone, surfaceChroma, seed.h));
    const backgrounds = [chatBase, panelBase, uiBase, inputBase];
    for (const [base, alpha] of [[chatBase, profile.chatAlpha], [panelBase, profile.panelAlpha], [inputBase, profile.inputAlpha]]) {
        backgrounds.push(mixRgb(uiBase, base, alpha));
    }
    const darkText = profile.textTarget === 'dark';
    const textTone = darkText ? 0.25 : 0.94;
    const accentTone = darkText ? 0.42 : 0.76;
    const analogousHue = seed.h + Math.PI / 6;
    const splitComplementHue = seed.h + 5 * Math.PI / 6;
    const mainText = readableTone(textTone, surfaceChroma * 0.4, seed.h, backgrounds, profile.textTarget, 7);
    const italics = readableTone(accentTone, chroma * 0.6, analogousHue, backgrounds, profile.textTarget);
    const quote = readableTone(accentTone, chroma, seed.h, backgrounds, profile.textTarget);
    const underline = readableTone(accentTone, chroma * 0.85, splitComplementHue, backgrounds, profile.textTarget);
    const border = fromOklch(0.55, surfaceChroma, seed.h);
    const shadow = fromOklch(0.1, surfaceChroma * 0.5, seed.h);
    return {
        main_text_color: rgba(mainText, 1),
        italics_text_color: rgba(italics, 1),
        underline_text_color: rgba(underline, 1),
        quote_text_color: rgba(quote, 1),
        chat_tint_color: rgba(chatBase, profile.chatAlpha),
        ptmt_ui_background_2: rgba(panelBase, profile.panelAlpha),
        border_color: rgba(border, 0.55),
        shadow_color: rgba(shadow, 1),
        blur_tint_color: rgba(uiBase, profile.uiAlpha),
        ptmt_textbox_background: rgba(inputBase, profile.inputAlpha),
        ptmt_tabs_color: rgba(italics, 1),
        ptmt_tabs_background: rgba(uiBase, profile.uiAlpha),
    };
}

export function buildThemeFromImage(img, profileName = 'dark', numColors = 14) {
    return buildThemeFromColors(extractColorsFromImage(img, numColors), profileName);
}
