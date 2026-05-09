/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 * Optimized for PTMT with stable UIDs and robust extraction.
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { settings } from './settings.js';
import { debounce, trackObserver, extractColorsFromImage, sortColorsByLightness } from './utils.js';
import {
    DEFAULT_COLORIZER_RGB,
    buildCharacterColorizerKey,
    buildColorizerCacheKey,
    buildPersonaColorizerKey,
    extractAvatarFilenameFromUrl,
    hexToRgbaWithAlpha,
    normalizeBubbleMode,
    normalizeHexColor,
    rgbToHex,
    rgbToHsl,
} from './colorizer-helpers.js';

const DEFAULT_HEX = rgbToHex(DEFAULT_COLORIZER_RGB);

/** Bitmask flags for colorize target */
const COLORIZE_TARGET = {
    QUOTED_TEXT: 1 << 0,
    BUBBLES: 1 << 1,
};

/** @type {HTMLStyleElement} */
let charsStyleSheet;
/** @type {HTMLStyleElement} */
let personasStyleSheet;

// Persistent color cache: keyed by type plus avatar-specific identity.
const colorCache = new Map();
// Deduplication Map: keyed the same way as colorCache.
const extractionPromises = new Map();

// ─── Stylesheet management ────────────────────────────────────────────────────

function initializeStyleSheets() {
    charsStyleSheet = getOrCreateStyleSheet('ptmt-colorizer-chars');
    personasStyleSheet = getOrCreateStyleSheet('ptmt-colorizer-personas');
}

function getOrCreateStyleSheet(id) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const style = document.createElement('style');
    style.id = id;
    document.body.appendChild(style);
    return style;
}

// ─── Avatar identification ────────────────────────────────────────────────────

/**
 * Stable UID generation.
 * Characters: char:NAME (normalized)
 * Personas: user:FILENAME
 */
function getAvatarFileInfo(message) {
    const avatarImg = message.querySelector('.avatar img');
    const src = avatarImg?.getAttribute('src') || '';

    const isUser = message.getAttribute('is_user') === 'true';
    const isSystem = message.getAttribute('is_system') === 'true' || src.includes('img/five.png');
    const chName = message.getAttribute('ch_name');

    if (isSystem) return { type: 'system', uid: 'system', avatarFileName: 'img/five.png', domAvatarUrl: src, domImgElement: avatarImg };

    if (isUser) {
        const cleanFileName = extractAvatarFilenameFromUrl(src, 'user.png');
        return { type: 'persona', uid: `user:${cleanFileName}`, avatarFileName: cleanFileName, domAvatarUrl: src, domImgElement: avatarImg };
    }

    if (chName) {
        const safeName = (chName || '').trim().replace(/\W/g, '_').toLowerCase();
        const ctx = getContext();
        const found = ctx.characters?.find(c => c.name === chName);
        const cleanFileName = found?.avatar || extractAvatarFilenameFromUrl(src, 'char.png');
        return { type: 'character', uid: `char:${safeName}`, avatarFileName: cleanFileName, domAvatarUrl: src, domImgElement: avatarImg };
    }

    return null;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

/**
 * Get control settings (target, modes, opacity) for a character/persona
 * Checks for custom per-character settings first, falls back to global
 */
function getColorizerControlSettings(type, info) {
    const isPersona = type === 'persona';
    if (!info || info.type === 'system') {
        return {
            target: settings.get('dialogueColorizerColorizeTarget') ?? 3,
            bubbleMode: settings.get('dialogueColorizerBubbleMode') ?? 'gradient',
            opacity: settings.get('dialogueColorizerBubbleOpacityBot') ?? 0.1,
        };
    }

    // Build unique key based on type
    const characterKey = isPersona 
        ? buildPersonaColorizerKey(info.uid, info.domAvatarUrl)
        : buildCharacterColorizerKey(info.uid, info.domAvatarUrl);
    
    // Check if this character/persona has custom settings enabled
    const enabledList = isPersona ? settings.get('personaCustomColorizerEnabled') ?? [] : settings.get('charCustomColorizerEnabled') ?? [];
    const customSettingsMap = isPersona ? settings.get('personaCustomColorizerSettings') ?? {} : settings.get('charCustomColorizerSettings') ?? {};
    
    if (enabledList.includes(characterKey) && customSettingsMap[characterKey]) {
        // Use custom settings
        const custom = customSettingsMap[characterKey];
        console.log(`[PTMT] ✓ Using CUSTOM colorizer for ${type} "${characterKey}" — opacity=${custom.bubbleOpacity} | full:`, custom);
        return {
            target: custom.colorizeTarget ?? 3,
            bubbleMode: normalizeBubbleMode(custom, 'gradient'),
            opacity: custom.bubbleOpacity ?? 0.1,
        };
    }
    
    // Fall back to global settings
    console.log(`[PTMT] ⚠ Fallback to GLOBAL for ${type} "${characterKey}" — NOT in customSettingsMap`);
    return {
        target: isPersona ? (settings.get('dialogueColorizerPersonaColorizeTarget') ?? 3) : (settings.get('dialogueColorizerColorizeTarget') ?? 3),
        bubbleMode: isPersona ? (settings.get('dialogueColorizerPersonaBubbleMode') ?? 'gradient') : (settings.get('dialogueColorizerBubbleMode') ?? 'gradient'),
        opacity: isPersona ? (settings.get('dialogueColorizerBubbleOpacityUser') ?? 0.1) : (settings.get('dialogueColorizerBubbleOpacityBot') ?? 0.1),
    };
}

/**
 * Get colorizer settings for a specific character/persona/system.
 * Checks for custom per-char/persona settings first, falls back to global.
 */
function getSettingsForType(type, info) {
    if (!info || info.type === 'system') {
        // System messages always use global settings
        const isPersona = false;
        const prefix = isPersona ? 'dialogueColorizerPersona' : 'dialogueColorizer';
        return {
            dialogSource: settings.get(`${prefix}Source`),
            dialogStatic: settings.get(`${prefix}StaticColor`),
            bubbleSource: settings.get(`${prefix}BubbleSource`),
            bubbleStatic1: settings.get(`${prefix}BubbleStaticColor1`),
            bubbleStatic2: settings.get(`${prefix}BubbleStaticColor2`),
        };
    }

    const isPersona = type === 'persona';
    
    // Build unique key based on type
    const characterKey = isPersona 
        ? buildPersonaColorizerKey(info.uid, info.domAvatarUrl)
        : buildCharacterColorizerKey(info.uid, info.domAvatarUrl);
    
    // Check if this character/persona has custom settings enabled
    const enabledList = isPersona ? settings.get('personaCustomColorizerEnabled') ?? [] : settings.get('charCustomColorizerEnabled') ?? [];
    const customSettingsMap = isPersona ? settings.get('personaCustomColorizerSettings') ?? {} : settings.get('charCustomColorizerSettings') ?? {};
    
    if (enabledList.includes(characterKey) && customSettingsMap[characterKey]) {
        // Use custom settings
        const custom = customSettingsMap[characterKey];
        const defaultStatic = isPersona ? '#537fddff' : '#da6745ff';
        const result = {
            dialogSource: custom.dialogSource ?? 'avatar_vibrant',
            dialogStatic: custom.dialogStatic ?? defaultStatic,
            bubbleSource: custom.bubbleSource ?? 'avatar_vibrant',
            bubbleStatic1: custom.bubbleStatic1 ?? defaultStatic,
            bubbleStatic2: custom.bubbleStatic2 ?? defaultStatic,
        };
        console.log(`[PTMT] getSettingsForType() using CUSTOM for ${characterKey}:`, result, `| full:`, custom);
        return result;
    }
    
    // Fall back to global settings
    const prefix = isPersona ? 'dialogueColorizerPersona' : 'dialogueColorizer';
    return {
        dialogSource: settings.get(`${prefix}Source`),
        dialogStatic: settings.get(`${prefix}StaticColor`),
        bubbleSource: settings.get(`${prefix}BubbleSource`),
        bubbleStatic1: settings.get(`${prefix}BubbleStaticColor1`),
        bubbleStatic2: settings.get(`${prefix}BubbleStaticColor2`),
    };
}

// ─── Color resolution ─────────────────────────────────────────────────────────

async function getCharacterColor(info) {
    const cacheKey = buildColorizerCacheKey(info);
    if (colorCache.has(cacheKey)) return colorCache.get(cacheKey);
    if (extractionPromises.has(cacheKey)) return extractionPromises.get(cacheKey);

    const promise = (async () => {
        const s = getSettingsForType(info.type, info);
        const controls = getColorizerControlSettings(info.type, info);
        const custom = getCustomColorizerSettings(info);
        const storedStops = custom?.bubbleGradientStops ?? [];
        const needsBubbleExtraction = controls.bubbleMode === 'avatar_light' ||
            controls.bubbleMode === 'avatar_dark' ||
            (controls.bubbleMode === 'gradient' && storedStops.length === 0);
        const needsExtraction = info.type !== 'system' && (s.dialogSource === 'avatar_vibrant' || needsBubbleExtraction);

        if (!needsExtraction) {
            const colors = [DEFAULT_HEX];
            colorCache.set(cacheKey, colors);
            return colors;
        }

        // Skip extraction if it's the silhouette or missing
        if (!info.domAvatarUrl || info.domAvatarUrl.includes('img/five.png') || info.domAvatarUrl.length < 10) {
            return [DEFAULT_HEX];
        }

        // Use the actual DOM <img> element directly — its decoded bitmap is stable.
        const domImg = info.domImgElement;
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            try {
                const hexes = extractColorsFromImage(domImg);
                colorCache.set(cacheKey, hexes);
                console.log(`[PTMT] Extracted colors for ${info.uid}: ${hexes.join(', ')}`);
                return hexes;
            } catch (e) {
                console.warn(`[PTMT] DOM extraction failed for ${info.uid}, using static color`, e);
                return [DEFAULT_HEX];
            }
        }

        // Fallback: if DOM element is not available/loaded, load fresh
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = info.domAvatarUrl;

            const timeout = setTimeout(() => {
                console.warn(`[PTMT] Extraction timeout for ${info.uid}`);
                resolve([DEFAULT_HEX]);
            }, 10000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const hexes = extractColorsFromImage(img);
                    colorCache.set(cacheKey, hexes);
                    console.log(`[PTMT] Extracted colors for ${info.uid} (fallback): ${hexes.join(', ')}`);
                    resolve(hexes);
                } catch (e) {
                    resolve([DEFAULT_HEX]);
                }
            };
            img.onerror = () => {
                clearTimeout(timeout);
                resolve([DEFAULT_HEX]);
            };
        });
    })();

    extractionPromises.set(cacheKey, promise);
    const result = await promise;
    extractionPromises.delete(cacheKey);
    return result;
}

// ─── CSS generation ───────────────────────────────────────────────────────────

function getCustomColorizerSettings(info) {
    if (!info || info.type === 'system') return null;
    const isPersona = info.type === 'persona';
    const characterKey = isPersona
        ? buildPersonaColorizerKey(info.uid, info.domAvatarUrl)
        : buildCharacterColorizerKey(info.uid, info.domAvatarUrl);
    const enabledList = isPersona ? settings.get('personaCustomColorizerEnabled') ?? [] : settings.get('charCustomColorizerEnabled') ?? [];
    const customSettingsMap = isPersona ? settings.get('personaCustomColorizerSettings') ?? {} : settings.get('charCustomColorizerSettings') ?? {};
    if (enabledList.includes(characterKey) && customSettingsMap[characterKey]) {
        return customSettingsMap[characterKey];
    }
    return null;
}

function resolveBubbleGradientStops(s, extractedColors, info) {
    let colors;
    let angle = 225;

    const custom = getCustomColorizerSettings(info);
    const isPersona = info?.type === 'persona';
    const globalAngleKey = isPersona ? 'dialogueColorizerPersonaBubbleGradientAngle' : 'dialogueColorizerBubbleGradientAngle';
    const storedStops = custom?.bubbleGradientStops ?? [];
    angle = custom?.bubbleGradientAngle ?? settings.get(globalAngleKey) ?? 225;
    if (storedStops.length > 0) {
        return { stops: storedStops, angle };
    }

    // No custom stops — auto-generate from extracted colors
    colors = sortColorsByLightness(extractedColors.slice(0, 5));
    if (colors.length >= 4) {
        colors = [colors[1], colors[colors.length - 2]];
    } else if (colors.length >= 2) {
        colors = [colors[0], colors[colors.length - 1]];
    } else {
        colors = [colors[0], colors[0]];
    }

    const stops = [
        { color: colors[0], position: 0 },
        { color: colors[1], position: 1 },
    ];

    return { stops, angle };
}

/**
 * Pick the most saturated light color from extracted palette for dialogue text.
 * Filters for colors with reasonable lightness (not too dark, not near-white/pastel)
 * and picks the one with highest saturation.
 */
function pickBestDialogColor(extractedColors) {
    let best = null;
    let bestScore = -1;
    for (const hex of extractedColors) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const [h, s, l] = rgbToHsl([r, g, b]);
        // Prefer colors that are light enough (l > 0.35) but not washed out (l < 0.85)
        // Score by saturation, with a bonus for the ideal lightness range
        if (l > 0.35 && l < 0.85) {
            const lightnessBonus = 1 - Math.abs(l - 0.55) * 2; // peak at l=0.55
            const score = s * lightnessBonus;
            if (score > bestScore) {
                bestScore = score;
                best = hex;
            }
        }
    }
    return best || extractedColors[0] || DEFAULT_HEX;
}

function buildCssRules(safeUid, extractedColors, info) {
    const s = getSettingsForType(info.type, info);
    const controls = getColorizerControlSettings(info.type, info);
    const target = controls.target;
    const opacity = controls.opacity;
    let css = '';

    const bubbleMode = controls.bubbleMode;

    // 1. Resolve Dialogue Color — pick most saturated light color from palette
    let dialogColor;
    if (s.dialogSource === 'static_color') {
        dialogColor = normalizeHexColor(s.dialogStatic);
    } else {
        dialogColor = pickBestDialogColor(extractedColors);
    }

    // 2. Resolve Bubble Colors
    const sortedColors = sortColorsByLightness(extractedColors.slice(0, 5));
    let bPrim;
    if (bubbleMode === 'static_color') {
        bPrim = normalizeHexColor(s.bubbleStatic1);
    } else if (bubbleMode === 'avatar_light') {
        bPrim = sortedColors[sortedColors.length - 1] || DEFAULT_HEX;
    } else if (bubbleMode === 'avatar_dark') {
        bPrim = sortedColors[0] || DEFAULT_HEX;
    } else {
        // gradient — use first stop or default
        const { stops } = resolveBubbleGradientStops(s, extractedColors, info);
        bPrim = normalizeHexColor(stops[0]?.color, DEFAULT_HEX);
    }

    if (target & 1) { // QUOTED_TEXT
        const standardRule = `color: ${dialogColor} !important;`;
        const adaptiveRule = `color: color-mix(in oklch, ${dialogColor}, var(--ptmt-contrast-bw) 25%) !important;`;

        css += `#chat .mes[xdc-author-uid="${safeUid}"] .mes_text q { ${standardRule} }\n`;
        css += `#chat .mes[xdc-author-uid="${safeUid}"] .mes_reasoning q { ${standardRule} }\n`;
        css += `.ptmt-auto-contrast #chat .mes[xdc-author-uid="${safeUid}"] .mes_text q { ${adaptiveRule} }\n`;
        css += `.ptmt-auto-contrast #chat .mes[xdc-author-uid="${safeUid}"] .mes_reasoning q { ${adaptiveRule} }\n`;

        css += `.bubblechat #chat .mes[xdc-author-uid="${safeUid}"] .bubble_content q { ${standardRule} }\n`;
        css += `.ptmt-auto-contrast .bubblechat #chat .mes[xdc-author-uid="${safeUid}"] .bubble_content q { ${adaptiveRule} }\n`;
    }
    if (target & 2) { // BUBBLES
        const rgbaBorder = hexToRgbaWithAlpha(bPrim, Math.min(1.0, opacity * 2.5 + 0.1));

        css += `#chat .mes[xdc-author-uid="${safeUid}"] { --ptmt-mes-colorizer-color: ${hexToRgbaWithAlpha(bPrim, opacity)}; }\n`;

        let background;
        if (bubbleMode === 'gradient') {
            const { stops, angle } = resolveBubbleGradientStops(s, extractedColors, info);
            const sorted = [...stops]
                .map(st => ({
                    color: normalizeHexColor(st.color, DEFAULT_HEX),
                    position: Math.max(0, Math.min(1, Number(st.position) || 0)),
                }))
                .sort((a, b) => a.position - b.position);
            if (sorted.length <= 1) {
                background = hexToRgbaWithAlpha(sorted[0]?.color || bPrim, opacity);
            } else {
                const parts = sorted.map(st => `${hexToRgbaWithAlpha(st.color, opacity)} ${Math.round(st.position * 100)}%`);
                background = `linear-gradient(${angle}deg, ${parts.join(', ')})`;
            }
        } else if (bubbleMode === 'static_color') {
            background = hexToRgbaWithAlpha(bPrim, opacity);
        } else {
            // avatar_light or avatar_dark — single color
            background = hexToRgbaWithAlpha(bPrim, opacity);
        }

        css += `.bubblechat #chat .mes[xdc-author-uid="${safeUid}"] { background: ${background}; border-color: ${rgbaBorder}; --SmartThemeBotMesBlurTintColor: transparent; --SmartThemeUserMesBlurTintColor: transparent; }\n`;
    }
    return css;
}

// ─── Message tagging ──────────────────────────────────────────────────────────

function tagMessage(mes) {
    const info = getAvatarFileInfo(mes);
    if (!info) return null;
    const safeUid = info.uid.replace(/\W/g, '_');
    if (mes.getAttribute('xdc-author-uid') !== safeUid) {
        mes.setAttribute('xdc-author-uid', safeUid);
    }
    return info;
}

// ─── Stylesheet update functions ──────────────────────────────────────────────

async function updateStyles() {
    if (!settings.get('enableDialogueColorizer')) {
        initializeStyleSheets();
        charsStyleSheet.innerHTML = '';
        personasStyleSheet.innerHTML = '';
        return;
    }

    initializeStyleSheets();

    // 1. Tag all messages currently in the DOM and collect unique UIDs
    const messages = document.querySelectorAll('.mes');
    const uidsInDom = new Map(); // uid -> info

    messages.forEach(mes => {
        const info = tagMessage(mes);
        if (info && !uidsInDom.has(info.uid)) {
            uidsInDom.set(info.uid, info);
        }
    });

    // 2. Also ensure we have the current persona from the UI if not in chat
    const userAvatarImg = document.querySelector('#user_avatar_block .avatar img');
    if (userAvatarImg) {
        const src = userAvatarImg.getAttribute('src');
        if (src) {
            const cleanFileName = extractAvatarFilenameFromUrl(src, 'user.png');
            const uid = `user:${cleanFileName}`;
            if (!uidsInDom.has(uid)) {
                uidsInDom.set(uid, { type: 'persona', uid, avatarFileName: cleanFileName, domAvatarUrl: src, domImgElement: userAvatarImg });
            }
        }
    }

    // 3. Resolve colors and build rules
    const charRules = [];
    const personaRules = [];

    const results = await Promise.all(Array.from(uidsInDom.values()).map(async info => {
        const colors = await getCharacterColor(info);
        const rule = buildCssRules(info.uid.replace(/\W/g, '_'), colors, info);
        return { info, rule };
    }));

    for (const res of results) {
        if (res.info.type === 'persona') personaRules.push(res.rule);
        else charRules.push(res.rule);
    }

    charsStyleSheet.innerHTML = charRules.join('\n');
    personasStyleSheet.innerHTML = personaRules.join('\n');
}

// ─── Initialization ───────────────────────────────────────────────────────────

let chatObserver;

export function initColorizer() {
    initializeStyleSheets();
    const debouncedUpdate = debounce(updateStyles, 150);

    updateStyles();

    if (chatObserver) chatObserver.disconnect();
    chatObserver = trackObserver(new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.classList.contains('mes')) {
                        tagMessage(node);
                        shouldUpdate = true;
                    }
                }
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                if (mutation.target.tagName === 'IMG' && mutation.target.closest('.avatar')) {
                    shouldUpdate = true;
                }
            }
        }
        if (shouldUpdate) debouncedUpdate();
    }));

    const chat = document.getElementById('chat');
    if (chat) chatObserver.observe(chat, { childList: true, attributes: true, attributeFilter: ['src'], subtree: true });

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStyles();
    });

    const userAvatarBlock = document.getElementById('user_avatar_block');
    if (userAvatarBlock) {
        const personaObserver = trackObserver(new MutationObserver(debouncedUpdate));
        personaObserver.observe(userAvatarBlock, { subtree: true, attributeFilter: ['class'] });
    }

    window.addEventListener('ptmt:settingsChanged', (e) => {
        const keys = e.detail?.changed || [];
        const colorizerKeys = [
            'enableDialogueColorizer',
            'dialogueColorizerSource', 'dialogueColorizerStaticColor',
            'dialogueColorizerBubbleSource', 'dialogueColorizerBubbleStaticColor1', 'dialogueColorizerBubbleStaticColor2',
            'dialogueColorizerPersonaSource', 'dialogueColorizerPersonaStaticColor',
            'dialogueColorizerPersonaBubbleSource', 'dialogueColorizerPersonaBubbleStaticColor1', 'dialogueColorizerPersonaBubbleStaticColor2',
            'dialogueColorizerColorizeTarget', 'dialogueColorizerPersonaColorizeTarget',
            'dialogueColorizerBubbleOpacityBot', 'dialogueColorizerBubbleOpacityUser',
            'dialogueColorizerBubbleMode', 'dialogueColorizerPersonaBubbleMode',
            'dialogueColorizerBubbleGradientStops', 'dialogueColorizerBubbleGradientAngle',
            'dialogueColorizerPersonaBubbleGradientStops', 'dialogueColorizerPersonaBubbleGradientAngle',
            'charCustomColorizerEnabled', 'charCustomColorizerSettings',
            'personaCustomColorizerEnabled', 'personaCustomColorizerSettings',
        ];
        if (keys.some(k => colorizerKeys.includes(k))) {
            const noExtractionKeys = [
                'dialogueColorizerBubbleOpacityBot',
                'dialogueColorizerBubbleOpacityUser',
                'dialogueColorizerColorizeTarget',
                'dialogueColorizerPersonaColorizeTarget',
                'dialogueColorizerBubbleGradientAngle',
                'dialogueColorizerPersonaBubbleGradientAngle',
            ];
            if (!keys.some(k => !noExtractionKeys.includes(k))) {
                // All changed keys are visual-only, don't clear cache
            } else {
                colorCache.clear();
            }
            updateStyles();
        }
    });

    // Listen for custom colorizer refresh event from character UI
    window.addEventListener('ptmt:colorizer:refresh', (e) => {
        const fullRefresh = e.detail?.fullRefresh !== false;  // Default to full refresh
        if (fullRefresh) {
            // Full refresh: clear caches, re-extract colors
            colorCache.clear();
            extractionPromises.clear();
            console.log(`[PTMT] Full colorizer refresh (clearing caches)`);
        } else {
            // Partial refresh: keep caches, just regenerate CSS with new settings
            console.log(`[PTMT] Partial colorizer refresh (keeping color cache)`);
        }
        updateStyles();
    });
}

export function clearColorizerCache() {
    colorCache.clear();
    extractionPromises.clear();
    updateStyles();
}
