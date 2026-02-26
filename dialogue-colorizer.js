/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 */

import { eventSource, event_types, characters, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { settings } from './settings.js';

// Global Vibrant instance
const getVibrant = () => window['Vibrant'];

const DEFAULT_STATIC_COLOR = '#e18a24';
const DEFAULT_RGB = [225, 138, 36];

/** @type {HTMLStyleElement} */
let colorizerStyleSheet;
let colorCache = {};

function initializeStyleSheet() {
    if (document.getElementById('ptmt-colorizer-styles')) {
        colorizerStyleSheet = document.getElementById('ptmt-colorizer-styles');
        return;
    }
    colorizerStyleSheet = document.createElement('style');
    colorizerStyleSheet.id = 'ptmt-colorizer-styles';
    document.body.appendChild(colorizerStyleSheet);
    console.log('[PTMT] Colorizer stylesheet initialized');
}

/**
 * Ported from ExColor to avoid full class dependency
 */
const ColorUtils = {
    rgbToHsl: ([r, g, b]) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, l];
    },
    hslToRgb: ([h, s, l]) => {
        let r, g, b;
        if (s === 0) { r = g = b = l; } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },
    rgbToHex: ([r, g, b]) => "#" + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
};

function adjustColorForContrast(rgb) {
    const [h, s, l] = ColorUtils.rgbToHsl(rgb);
    const nSat = Math.min(1, s + 0.2); // Slightly more saturated
    const nLum = Math.max(0.6, l); // Ensure it's not too dark
    return ColorUtils.hslToRgb([h, nSat, nLum]);
}

async function getVibrantColor(img) {
    const Vibrant = getVibrant();
    if (!Vibrant) {
        console.warn('[PTMT] Vibrant class not found in window object');
        return DEFAULT_RGB;
    }
    try {
        const v = new Vibrant(img, 32, 3);
        const swatches = v.swatches();
        if (!swatches) {
            console.warn('[PTMT] Vibrant swatches are null');
            return DEFAULT_RGB;
        }
        const swatch = swatches.Vibrant || swatches.Muted || swatches.DarkVibrant || null;
        if (!swatch) {
            console.warn('[PTMT] No swatches found for image:', img.src);
            return DEFAULT_RGB;
        }
        return swatch.getRgb();
    } catch (e) {
        console.error('[PTMT] Vibrant execution failed:', e);
        return DEFAULT_RGB;
    }
}

function getAvatarFileInfo(message) {
    const avatarImg = message.querySelector(".avatar img");
    if (!avatarImg) return null;

    const src = avatarImg.getAttribute("src");
    if (!src) return null;

    const isUser = message.getAttribute("is_user") === "true";
    const isSystem = message.getAttribute("is_system") === "true" || src.includes('img/five.png');

    const type = isUser ? 'persona' : (isSystem ? 'system' : 'character');
    let fileName = src.split('/').pop();

    if (type === 'character') {
        const match = src.match(/[?&]file=([^&]*)/i)?.at(1);
        fileName = match ? decodeURIComponent(match) : fileName;
    } else if (type === 'persona') {
        const match = src.match(/[?&]file=([^&]*)/i)?.at(1);
        fileName = match ? decodeURIComponent(match) : fileName;
    }

    return { type, fileName, uid: `${type}|${fileName}` };
}

async function getCharacterColor(info, thumbSrc) {
    if (colorCache[info.uid]) return colorCache[info.uid];

    const source = settings.get('dialogueColorizerSource');
    if (source === 'static_color') return settings.get('dialogueColorizerStaticColor');
    if (info.type === 'system') return settings.get('dialogueColorizerStaticColor');

    // Use thumbSrc directly if available, fallback to full image path if not
    const avatarUrl = thumbSrc || (info.type === 'character' ? `/characters/${encodeURIComponent(info.fileName)}` : `/User Avatars/${encodeURIComponent(info.fileName)}`);
    console.log(`[PTMT] Attempting to load avatar for color extraction: ${avatarUrl}`);

    return new Promise((resolve) => {
        const img = new Image();
        // Removed crossOrigin for local files as it might cause issues if ST doesn't set headers
        img.src = avatarUrl;

        const timeout = setTimeout(() => {
            console.warn(`[PTMT] Avatar load timeout: ${avatarUrl}`);
            resolve(settings.get('dialogueColorizerStaticColor'));
        }, 5000);

        img.onload = async () => {
            clearTimeout(timeout);
            const rgb = await getVibrantColor(img);
            const betterRgb = adjustColorForContrast(rgb);
            const hex = ColorUtils.rgbToHex(betterRgb);
            colorCache[info.uid] = hex;
            console.log(`[PTMT] Extracted color for ${info.uid}: ${hex}`);
            resolve(hex);
        };
        img.onerror = (err) => {
            clearTimeout(timeout);
            console.warn(`[PTMT] Failed to load avatar: ${avatarUrl}`, err);
            resolve(settings.get('dialogueColorizerStaticColor'));
        };
    });
}

/**
 * Tags a message element with its author's unique ID for CSS targeting.
 * @param {HTMLElement} mes 
 */
function tagMessage(mes) {
    const info = getAvatarFileInfo(mes);
    if (info) {
        const safeUid = info.uid.replace(/\W/g, '_');
        if (mes.getAttribute('xdc-author-uid') !== safeUid) {
            mes.setAttribute('xdc-author-uid', safeUid);
        }
    }
}

export async function updateStyles() {
    if (!settings.get('enableDialogueColorizer')) {
        if (colorizerStyleSheet) colorizerStyleSheet.innerHTML = '';
        return;
    }

    initializeStyleSheet();

    const messages = document.querySelectorAll('.mes');
    const uidsToProcess = new Map();

    messages.forEach(mes => {
        const info = getAvatarFileInfo(mes);
        if (info) {
            const safeUid = info.uid.replace(/\W/g, '_');
            if (mes.getAttribute('xdc-author-uid') !== safeUid) {
                mes.setAttribute('xdc-author-uid', safeUid);
            }

            if (!uidsToProcess.has(info.uid)) {
                const thumbImg = mes.querySelector(".avatar img");
                uidsToProcess.set(info.uid, { info, thumbSrc: thumbImg?.getAttribute('src') });
            }
        }
    });

    if (uidsToProcess.size === 0) return;

    let css = '';
    const promises = Array.from(uidsToProcess.values()).map(async ({ info, thumbSrc }) => {
        const color = await getCharacterColor(info, thumbSrc);
        const safeUid = info.uid.replace(/\W/g, '_');
        return `#chat .mes[xdc-author-uid="${safeUid}"] .mes_text q { color: color-mix(in oklch, ${color}, var(--ptmt-adaptive-bw) 30%) !important; }`;
    });

    const results = await Promise.all(promises);
    colorizerStyleSheet.innerHTML = results.join('\n');
}

let chatObserver;

export function initColorizer() {
    const debouncedUpdate = debounce(updateStyles, 100);

    // Initial tagging and styling
    updateStyles();

    // Observe chat for new messages to tag them quickly
    if (chatObserver) chatObserver.disconnect();
    chatObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && node.classList.contains('mes')) {
                    tagMessage(node);
                    shouldUpdate = true;
                }
            }
        }
        if (shouldUpdate) {
            debouncedUpdate();
        }
    });

    const chat = document.getElementById('chat');
    if (chat) {
        chatObserver.observe(chat, { childList: true });
        console.log('[PTMT] Colorizer observer attached to #chat');
    }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        colorCache = {};
        debouncedUpdate();
    });

    window.addEventListener('ptmt:settingsChanged', (e) => {
        const keys = e.detail?.changed || [];
        if (keys.includes('enableDialogueColorizer') ||
            keys.includes('dialogueColorizerSource') ||
            keys.includes('dialogueColorizerStaticColor')) {
            console.log('[PTMT] Colorizer settings changed, refreshing...');
            colorCache = {};
            updateStyles();
        }
    });

    if (settings.get('enableDialogueColorizer')) {
        console.log('[PTMT] Dialogue Colorizer initialized');
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
