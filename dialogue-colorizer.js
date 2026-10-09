/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 *
 * Character identity is avatar/card based rather than display-name based. Legacy
 * v2 per-character settings are resolved and lazily migrated by colorizer-settings.js.
 */

import { eventSource, event_types, user_avatar } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { settings } from './settings.js';
import { debounce, trackObserver, extractColorsFromImage, sortColorsByLightness } from './utils.js';
import {
    DEFAULT_COLORIZER_RGB,
    extractAvatarFilenameFromUrl,
    hexToRgbaWithAlpha,
    normalizeHexColor,
    rgbToHex,
    rgbToHsl,
} from './colorizer-helpers.js';
import {
    buildCustomColorizerKeyFromFilename,
    resolveCustomColorizerSettings,
} from './colorizer-settings.js';

const DEFAULT_HEX = rgbToHex(DEFAULT_COLORIZER_RGB);

/** Bitmask flags for colorize target. */
const COLORIZE_TARGET = {
    QUOTED_TEXT: 1 << 0,
    BUBBLES: 1 << 1,
};

/** @type {HTMLStyleElement} */
let charsStyleSheet;
/** @type {HTMLStyleElement} */
let personasStyleSheet;

// Persistent color cache: keyed by the same avatar-specific runtime identity used
// to distinguish messages in the DOM.
const colorCache = new Map();
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

// ─── Avatar / author identification ──────────────────────────────────────────

/**
 * Convert an arbitrary UID into a collision-free CSS/DOM-safe ASCII value.
 * Hex encoding UTF-8 bytes avoids the collisions produced by replacing every
 * non-word character with an underscore.
 */
function toDomUid(uid) {
    const bytes = new TextEncoder().encode(String(uid || 'unknown'));
    let encoded = 'xdc_';
    for (const byte of bytes) encoded += byte.toString(16).padStart(2, '0');
    return encoded;
}

/**
 * Runtime author identity. SillyTavern display names are not unique, so
 * character identity is anchored to the card avatar filename. Group messages
 * use `original_avatar`; solo chats use the active character id. The rendered
 * DOM image is only a fallback because expression-sync extensions may replace
 * it with a sprite.
 */
function getAvatarFileInfo(message) {
    const avatarImg = message.querySelector('.avatar img');
    const src = avatarImg?.getAttribute('src') || '';

    const isUser = message.getAttribute('is_user') === 'true';
    const isSystem = message.getAttribute('is_system') === 'true' || src.includes('img/five.png');
    const chName = message.getAttribute('ch_name') || '';

    if (isSystem) {
        return {
            type: 'system',
            uid: 'system',
            avatarFileName: 'img/five.png',
            domAvatarUrl: src,
            domImgElement: avatarImg,
        };
    }

    if (isUser) {
        const cleanFileName = extractAvatarFilenameFromUrl(src, user_avatar || 'user.png');
        return {
            type: 'persona',
            uid: `user:${cleanFileName}`,
            avatarFileName: cleanFileName,
            domAvatarUrl: src,
            domImgElement: avatarImg,
        };
    }

    if (!chName) return null;

    const ctx = getContext();
    const messageId = Number(message.getAttribute('mesid'));
    const chatEntry = Number.isInteger(messageId) && messageId >= 0 ? ctx.chat?.[messageId] : null;
    const renderedFileName = extractAvatarFilenameFromUrl(src, '');

    let cleanFileName = '';

    // Group messages record the source card explicitly. This survives duplicate
    // display names and later DOM avatar changes from expression sync.
    if (typeof chatEntry?.original_avatar === 'string' && chatEntry.original_avatar && chatEntry.original_avatar !== 'none') {
        cleanFileName = chatEntry.original_avatar;
    }

    // Solo chat: SillyTavern exposes the selected character by index/id.
    if (!cleanFileName && !ctx.groupId && ctx.characterId !== undefined && ctx.characterId !== null) {
        const currentCharacter = ctx.characters?.[ctx.characterId];
        if (currentCharacter?.avatar && currentCharacter.avatar !== 'none') cleanFileName = currentCharacter.avatar;
    }

    // Older group logs may lack original_avatar. Match the forced/rendered avatar
    // against card avatar filenames, never against the non-unique display name.
    if (!cleanFileName) {
        const forcedFileName = extractAvatarFilenameFromUrl(chatEntry?.force_avatar || '', '');
        const candidate = forcedFileName || renderedFileName;
        const matched = candidate ? ctx.characters?.find(character => character.avatar === candidate) : null;
        cleanFileName = matched?.avatar || candidate || 'char.png';
    }

    const uid = `char:${cleanFileName}`;
    let colorUrl = src;
    let colorImgElement = avatarImg;

    // If the DOM currently shows a sprite/expression rather than the card avatar,
    // extract colors from the canonical card thumbnail instead.
    if (renderedFileName !== cleanFileName && typeof ctx.getThumbnailUrl === 'function') {
        try {
            colorUrl = ctx.getThumbnailUrl('avatar', cleanFileName) || src;
            colorImgElement = null;
        } catch {
            colorUrl = src;
            colorImgElement = avatarImg;
        }
    }

    return {
        type: 'character',
        uid,
        characterName: chName,
        avatarFileName: cleanFileName,
        domAvatarUrl: colorUrl,
        domImgElement: colorImgElement,
    };
}

/** Build the existing persistent custom-settings key without coupling it to runtime UID. */
function getCustomSettingsKey(type, info) {
    return buildCustomColorizerKeyFromFilename(
        type,
        info?.uid,
        info?.avatarFileName,
    );
}

function getRuntimeCacheKey(info) {
    if (!info) return 'unknown';
    return `${info.type}:${info.uid}`;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

/**
 * Get control settings (target, modes, opacity) for a character/persona.
 * Checks for custom per-character settings first, falls back to global.
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

    const characterKey = getCustomSettingsKey(type, info);
    const resolved = resolveCustomColorizerSettings(settings, type, characterKey);

    if (resolved.enabled && resolved.raw) {
        const custom = resolved.value;
        console.log(`[PTMT] ✓ Using CUSTOM colorizer for ${type} "${characterKey}" — opacity=${custom.bubbleOpacity} | full:`, custom);
        return {
            target: custom.colorizeTarget,
            bubbleMode: custom.bubbleMode,
            opacity: custom.bubbleOpacity,
        };
    }

    console.log(`[PTMT] ⚠ Fallback to GLOBAL for ${type} "${characterKey}" — NOT in customSettingsMap`);
    return {
        target: isPersona
            ? (settings.get('dialogueColorizerPersonaColorizeTarget') ?? 3)
            : (settings.get('dialogueColorizerColorizeTarget') ?? 3),
        bubbleMode: isPersona
            ? (settings.get('dialogueColorizerPersonaBubbleMode') ?? 'gradient')
            : (settings.get('dialogueColorizerBubbleMode') ?? 'gradient'),
        opacity: isPersona
            ? (settings.get('dialogueColorizerBubbleOpacityUser') ?? 0.1)
            : (settings.get('dialogueColorizerBubbleOpacityBot') ?? 0.1),
    };
}

/**
 * Get colorizer source/static settings for a character/persona/system.
 */
function getSettingsForType(type, info) {
    if (!info || info.type === 'system') {
        const prefix = 'dialogueColorizer';
        return {
            dialogSource: settings.get(`${prefix}Source`),
            dialogStatic: settings.get(`${prefix}StaticColor`),
            bubbleSource: settings.get(`${prefix}BubbleSource`),
            bubbleStatic1: settings.get(`${prefix}BubbleStaticColor1`),
            bubbleStatic2: settings.get(`${prefix}BubbleStaticColor2`),
        };
    }

    const isPersona = type === 'persona';
    const characterKey = getCustomSettingsKey(type, info);
    const resolved = resolveCustomColorizerSettings(settings, type, characterKey);

    if (resolved.enabled && resolved.raw) {
        const custom = resolved.value;
        const result = {
            dialogSource: custom.dialogSource,
            dialogStatic: custom.dialogStatic,
            bubbleSource: 'avatar_vibrant',
            bubbleStatic1: custom.bubbleStatic1,
            bubbleStatic2: custom.bubbleStatic2,
        };
        console.log(`[PTMT] getSettingsForType() using CUSTOM for ${characterKey}:`, result, '| full:', custom);
        return result;
    }

    const prefix = isPersona ? 'dialogueColorizerPersona' : 'dialogueColorizer';
    return {
        dialogSource: settings.get(`${prefix}Source`),
        dialogStatic: settings.get(`${prefix}StaticColor`),
        bubbleSource: settings.get(`${prefix}BubbleSource`),
        bubbleStatic1: settings.get(`${prefix}BubbleStaticColor1`),
        bubbleStatic2: settings.get(`${prefix}BubbleStaticColor2`),
    };
}

function getCustomColorizerSettings(info) {
    if (!info || info.type === 'system') return null;

    const characterKey = getCustomSettingsKey(info.type, info);
    const resolved = resolveCustomColorizerSettings(settings, info.type, characterKey);
    return resolved.enabled && resolved.raw ? resolved.value : null;
}

// ─── Color resolution ─────────────────────────────────────────────────────────

async function getCharacterColor(info) {
    const cacheKey = getRuntimeCacheKey(info);

    if (colorCache.has(cacheKey)) return colorCache.get(cacheKey);
    if (extractionPromises.has(cacheKey)) return extractionPromises.get(cacheKey);

    const revision = cacheRevision;
    const cacheColors = (colors) => {
        if (revision === cacheRevision) colorCache.set(cacheKey, colors);
        return colors;
    };

    const promise = (async () => {
        const s = getSettingsForType(info.type, info);
        const controls = getColorizerControlSettings(info.type, info);
        const custom = getCustomColorizerSettings(info);
        const isPersona = info.type === 'persona';
        const globalStopsKey = isPersona
            ? 'dialogueColorizerPersonaBubbleGradientStops'
            : 'dialogueColorizerBubbleGradientStops';
        const storedStops = custom
            ? (custom.bubbleGradientStops ?? [])
            : (settings.get(globalStopsKey) ?? []);

        const needsBubbleExtraction =
            controls.bubbleMode === 'avatar_light' ||
            controls.bubbleMode === 'avatar_dark' ||
            (controls.bubbleMode === 'gradient' && storedStops.length === 0);

        const needsExtraction =
            info.type !== 'system' &&
            (s.dialogSource === 'avatar_vibrant' || needsBubbleExtraction);

        if (!needsExtraction) {
            const colors = [DEFAULT_HEX];
            return cacheColors(colors);
        }

        if (!info.domAvatarUrl || info.domAvatarUrl.includes('img/five.png') || info.domAvatarUrl.length < 10) {
            return [DEFAULT_HEX];
        }

        // Prefer the exact DOM bitmap used for this message. This is especially
        // important when two characters share a display name.
        const domImg = info.domImgElement;
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            try {
                const hexes = extractColorsFromImage(domImg);
                cacheColors(hexes);
                console.log(`[PTMT] Extracted colors for ${info.uid}: ${hexes.join(', ')}`);
                return hexes;
            } catch (e) {
                console.warn(`[PTMT] DOM extraction failed for ${info.uid}, using static color`, e);
                return [DEFAULT_HEX];
            }
        }

        // Fallback if the DOM image has not decoded yet.
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
                    cacheColors(hexes);
                    console.log(`[PTMT] Extracted colors for ${info.uid} (fallback): ${hexes.join(', ')}`);
                    resolve(hexes);
                } catch (e) {
                    console.warn(`[PTMT] Fallback extraction failed for ${info.uid}`, e);
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

    try {
        return await promise;
    } finally {
        extractionPromises.delete(cacheKey);
    }
}

// ─── CSS generation ───────────────────────────────────────────────────────────

function resolveBubbleGradientStops(s, extractedColors, info) {
    let colors;
    const custom = getCustomColorizerSettings(info);
    const isPersona = info?.type === 'persona';
    const globalAngleKey = isPersona
        ? 'dialogueColorizerPersonaBubbleGradientAngle'
        : 'dialogueColorizerBubbleGradientAngle';
    const globalStopsKey = isPersona
        ? 'dialogueColorizerPersonaBubbleGradientStops'
        : 'dialogueColorizerBubbleGradientStops';

    const storedStops = custom
        ? (custom.bubbleGradientStops ?? [])
        : (settings.get(globalStopsKey) ?? []);
    const angle = custom?.bubbleGradientAngle ?? settings.get(globalAngleKey) ?? (isPersona ? 125 : 225);

    if (storedStops.length > 0) {
        return { stops: storedStops, angle };
    }

    colors = sortColorsByLightness(extractedColors.slice(0, 5));
    if (colors.length >= 4) {
        colors = [colors[1], colors[colors.length - 2]];
    } else if (colors.length >= 2) {
        colors = [colors[0], colors[colors.length - 1]];
    } else {
        colors = [colors[0] || DEFAULT_HEX, colors[0] || DEFAULT_HEX];
    }

    return {
        stops: [
            { color: colors[0], position: 0 },
            { color: colors[1], position: 1 },
        ],
        angle,
    };
}

/** Pick a saturated, readable color from an extracted avatar palette. */
function pickBestDialogColor(extractedColors) {
    let best = null;
    let bestScore = -1;

    for (const hex of extractedColors) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const [, s, l] = rgbToHsl([r, g, b]);

        if (l > 0.35 && l < 0.85) {
            const lightnessBonus = 1 - Math.abs(l - 0.55) * 2;
            const score = s * lightnessBonus;
            if (score > bestScore) {
                bestScore = score;
                best = hex;
            }
        }
    }

    return best || extractedColors[0] || DEFAULT_HEX;
}

function hexToRgb(hex) {
    const safeHex = normalizeHexColor(hex);
    return [
        parseInt(safeHex.slice(1, 3), 16),
        parseInt(safeHex.slice(3, 5), 16),
        parseInt(safeHex.slice(5, 7), 16),
    ];
}

function mixHexColors(colors) {
    if (!colors.length) return DEFAULT_HEX;

    const total = colors.reduce((sum, item) => sum + item.weight, 0) || 1;
    const mixed = colors.reduce((acc, item) => {
        const [r, g, b] = hexToRgb(item.color);
        const alpha = item.color.length === 9 ? parseInt(item.color.slice(7, 9), 16) / 255 : 1;
        const weight = item.weight / total;
        acc[0] += r * alpha * weight;
        acc[1] += g * alpha * weight;
        acc[2] += b * alpha * weight;
        acc[3] += alpha * weight;
        return acc;
    }, [0, 0, 0, 0]);

    const alpha = mixed[3];
    const rgb = alpha > 0 ? mixed.slice(0, 3).map(channel => channel / alpha) : [0, 0, 0];
    const hex = rgbToHex(rgb);
    return alpha < 1 ? hex + Math.round(alpha * 255).toString(16).padStart(2, '0') : hex;
}

function getGradientContrastColor(sortedStops) {
    if (sortedStops.length === 0) return DEFAULT_HEX;
    if (sortedStops.length === 1) return normalizeHexColor(sortedStops[0].color, DEFAULT_HEX);

    return mixHexColors(sortedStops.map((stop, index) => {
        const previous = sortedStops[index - 1]?.position ?? stop.position;
        const next = sortedStops[index + 1]?.position ?? stop.position;
        const weight = Math.max(0.01, (next - previous) / 2);
        return { color: normalizeHexColor(stop.color, DEFAULT_HEX), weight };
    }));
}

function buildCssRules(domUid, extractedColors, info) {
    const s = getSettingsForType(info.type, info);
    const controls = getColorizerControlSettings(info.type, info);
    const target = controls.target;
    const opacity = controls.opacity;
    const bubbleMode = controls.bubbleMode;
    let css = '';

    let dialogColor;
    if (s.dialogSource === 'static_color') {
        dialogColor = normalizeHexColor(s.dialogStatic);
    } else {
        dialogColor = pickBestDialogColor(extractedColors);
    }

    const sortedColors = sortColorsByLightness(extractedColors.slice(0, 5));
    let bPrim;

    if (bubbleMode === 'static_color') {
        bPrim = normalizeHexColor(s.bubbleStatic1);
    } else if (bubbleMode === 'avatar_light') {
        bPrim = sortedColors[sortedColors.length - 1] || DEFAULT_HEX;
    } else if (bubbleMode === 'avatar_dark') {
        bPrim = sortedColors[0] || DEFAULT_HEX;
    } else {
        const { stops } = resolveBubbleGradientStops(s, extractedColors, info);
        bPrim = normalizeHexColor(stops[0]?.color, DEFAULT_HEX);
    }

    if (target & COLORIZE_TARGET.QUOTED_TEXT) {
        const standardRule = `color: ${dialogColor} !important;`;
        const dialogAlpha = dialogColor.length === 9 ? parseInt(dialogColor.slice(7, 9), 16) / 255 : 1;
        const adaptiveRule = `color: rgb(from color-mix(in oklch, ${dialogColor}, var(--ptmt-contrast-bw) var(--ptmt-dialogue-contrast-mix, 45%)) r g b / ${dialogAlpha}) !important;`;

        css += `#chat .mes[xdc-author-uid="${domUid}"] .mes_text q { ${standardRule} }\n`;
        css += `#chat .mes[xdc-author-uid="${domUid}"] .mes_reasoning q { ${standardRule} }\n`;
        css += `.ptmt-auto-contrast #chat .mes[xdc-author-uid="${domUid}"] .mes_text q { ${adaptiveRule} }\n`;
        css += `.ptmt-auto-contrast #chat .mes[xdc-author-uid="${domUid}"] .mes_reasoning q { ${adaptiveRule} }\n`;
        css += `.bubblechat #chat .mes[xdc-author-uid="${domUid}"] .bubble_content q { ${standardRule} }\n`;
        css += `.ptmt-auto-contrast .bubblechat #chat .mes[xdc-author-uid="${domUid}"] .bubble_content q { ${adaptiveRule} }\n`;
    }

    if (target & COLORIZE_TARGET.BUBBLES) {
        const rgbaBorder = hexToRgbaWithAlpha(bPrim, Math.min(1.0, opacity * 2.5 + 0.1));
        let contrastColor = bPrim;
        let background;

        if (bubbleMode === 'gradient') {
            const { stops, angle } = resolveBubbleGradientStops(s, extractedColors, info);
            const sorted = [...stops]
                .map((stop) => ({
                    color: normalizeHexColor(stop.color, DEFAULT_HEX),
                    position: Math.max(0, Math.min(1, Number(stop.position) || 0)),
                }))
                .sort((a, b) => a.position - b.position);

            if (sorted.length <= 1) {
                background = hexToRgbaWithAlpha(sorted[0]?.color || bPrim, opacity);
            } else {
                const parts = sorted.map((stop) =>
                    `${hexToRgbaWithAlpha(stop.color, opacity)} ${Math.round(stop.position * 100)}%`);
                background = `linear-gradient(${angle}deg, ${parts.join(', ')})`;
            }

            contrastColor = getGradientContrastColor(sorted);
        } else {
            background = hexToRgbaWithAlpha(bPrim, opacity);
        }

        css += `#chat .mes[xdc-author-uid="${domUid}"] { --ptmt-mes-colorizer-color: ${hexToRgbaWithAlpha(contrastColor, opacity)}; }\n`;
        css += `.bubblechat #chat .mes[xdc-author-uid="${domUid}"] { background: ${background}; border-color: ${rgbaBorder}; --SmartThemeBotMesBlurTintColor: transparent; --SmartThemeUserMesBlurTintColor: transparent; }\n`;
    }

    return css;
}

// ─── Message tagging ──────────────────────────────────────────────────────────

function tagMessage(message) {
    const info = getAvatarFileInfo(message);
    if (!info) return null;

    const domUid = toDomUid(info.uid);
    if (message.getAttribute('xdc-author-uid') !== domUid) {
        message.setAttribute('xdc-author-uid', domUid);
    }

    return info;
}

// ─── Stylesheet update functions ──────────────────────────────────────────────

let styleGeneration = 0;
let colorizerActive = false;
let cacheRevision = 0;

async function updateStyles() {
    if (!colorizerActive) return;
    const generation = ++styleGeneration;
    if (!settings.get('enableDialogueColorizer')) {
        initializeStyleSheets();
        charsStyleSheet.innerHTML = '';
        personasStyleSheet.innerHTML = '';
        return;
    }

    initializeStyleSheets();

    // Runtime UID contains avatar filename, so same-name cards remain separate.
    const messages = document.querySelectorAll('.mes');
    const uidsInDom = new Map();

    messages.forEach((message) => {
        const info = tagMessage(message);
        if (info && !uidsInDom.has(info.uid)) {
            uidsInDom.set(info.uid, info);
        }
    });

    // Also ensure the current persona is represented even if no user message is
    // currently mounted in the chat DOM.
    const cleanFileName = user_avatar || extractAvatarFilenameFromUrl(
        document.querySelector('#user_avatar_block .avatar-container.selected img')?.getAttribute('src') || '',
        '',
    );

    if (cleanFileName) {
        const userAvatarImg = document.querySelector('#user_avatar_block .avatar-container.selected img');
        const uid = `user:${cleanFileName}`;

        if (!uidsInDom.has(uid)) {
            uidsInDom.set(uid, {
                type: 'persona',
                uid,
                avatarFileName: cleanFileName,
                domAvatarUrl: userAvatarImg?.getAttribute('src') || '',
                domImgElement: userAvatarImg,
            });
        }
    }

    const charRules = [];
    const personaRules = [];

    const results = await Promise.all(
        Array.from(uidsInDom.values()).map(async (info) => {
            const colors = await getCharacterColor(info);
            const rule = buildCssRules(toDomUid(info.uid), colors, info);
            return { info, rule };
        }),
    );

    if (!colorizerActive || generation !== styleGeneration) return;

    for (const result of results) {
        if (result.info.type === 'persona') personaRules.push(result.rule);
        else charRules.push(result.rule);
    }

    charsStyleSheet.innerHTML = charRules.join('\n');
    personasStyleSheet.innerHTML = personaRules.join('\n');
}

// ─── Initialization ───────────────────────────────────────────────────────────

let chatObserver = null;
let personaObserver = null;
let chatChangedHandler = null;
let settingsChangedHandler = null;
let refreshHandler = null;

function invalidateAllColorCache() {
    cacheRevision++;
    colorCache.clear();
    extractionPromises.clear();
}

export function cleanupColorizer({ clearStyles = false } = {}) {
    colorizerActive = false;
    styleGeneration++;
    cacheRevision++;

    chatObserver?.disconnect();
    personaObserver?.disconnect();
    chatObserver = null;
    personaObserver = null;

    if (chatChangedHandler) {
        try { eventSource.off(event_types.CHAT_CHANGED, chatChangedHandler); } catch {}
        chatChangedHandler = null;
    }
    if (settingsChangedHandler) {
        window.removeEventListener('ptmt:settingsChanged', settingsChangedHandler);
        settingsChangedHandler = null;
    }
    if (refreshHandler) {
        window.removeEventListener('ptmt:colorizer:refresh', refreshHandler);
        refreshHandler = null;
    }

    extractionPromises.clear();
    if (clearStyles) {
        initializeStyleSheets();
        charsStyleSheet.innerHTML = '';
        personasStyleSheet.innerHTML = '';
    }
}

export function initColorizer() {
    cleanupColorizer();
    colorizerActive = true;
    initializeStyleSheets();
    const debouncedUpdate = debounce(updateStyles, 150);

    updateStyles();

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
                    const message = mutation.target.closest('.mes');
                    const info = message ? getAvatarFileInfo(message) : null;
                    // Only invalidate when the changed DOM image is actually our
                    // extraction source. Expression sprites use the canonical card
                    // thumbnail instead and should not churn the cache.
                    if (info?.domImgElement === mutation.target) {
                        cacheRevision++;
                        colorCache.delete(getRuntimeCacheKey(info));
                        extractionPromises.delete(getRuntimeCacheKey(info));
                    }
                    shouldUpdate = true;
                }
            }
        }

        if (shouldUpdate) debouncedUpdate();
    }));

    const chat = document.getElementById('chat');
    if (chat) {
        chatObserver.observe(chat, {
            childList: true,
            attributes: true,
            attributeFilter: ['src'],
            subtree: true,
        });
    }

    chatChangedHandler = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (colorizerActive) updateStyles();
    };
    eventSource.on(event_types.CHAT_CHANGED, chatChangedHandler);

    const userAvatarBlock = document.getElementById('user_avatar_block');
    if (userAvatarBlock) {
        personaObserver = trackObserver(new MutationObserver(() => {
            invalidateAllColorCache();
            debouncedUpdate();
        }));
        personaObserver.observe(userAvatarBlock, { subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
    }

    settingsChangedHandler = (event) => {
        const keys = event.detail?.changed || [];
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
        if (!keys.some(key => colorizerKeys.includes(key))) return;

        const noExtractionKeys = [
            'dialogueColorizerBubbleOpacityBot', 'dialogueColorizerBubbleOpacityUser',
            'dialogueColorizerColorizeTarget', 'dialogueColorizerPersonaColorizeTarget',
            'dialogueColorizerBubbleGradientAngle', 'dialogueColorizerPersonaBubbleGradientAngle',
        ];
        if (keys.some(key => !noExtractionKeys.includes(key))) invalidateAllColorCache();
        updateStyles();
    };
    window.addEventListener('ptmt:settingsChanged', settingsChangedHandler);

    refreshHandler = (event) => {
        const fullRefresh = event.detail?.fullRefresh !== false;
        if (fullRefresh) invalidateAllColorCache();
        updateStyles();
    };
    window.addEventListener('ptmt:colorizer:refresh', refreshHandler);
}
