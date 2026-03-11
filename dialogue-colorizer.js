/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 * Optimized for PTMT with stable UIDs and robust extraction.
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { settings } from './settings.js';
import { debounce } from './utils.js';

const DEFAULT_RGB = [225, 138, 36]; // Orange

/** Bitmask flags for colorize target */
const COLORIZE_TARGET = {
    QUOTED_TEXT: 1 << 0,
    BUBBLES: 1 << 1,
};

/** @type {HTMLStyleElement} */
let charsStyleSheet;
/** @type {HTMLStyleElement} */
let personasStyleSheet;

// Persistent color cache: keyed by stable UID.
const colorCache = new Map();
// Deduplication Map: keyed by stable UID.
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

// ─── Color utilities ──────────────────────────────────────────────────────────

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
    rgbToHex: ([r, g, b]) => '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join(''),
    hexToRgba: (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
};


function getDominantColor(img) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Use natural dimensions — no resize, no interpolation
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) return DEFAULT_RGB;

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const pixelCount = w * h;

        // Sample every 10th pixel for performance (like Color Thief quality=10)
        const quality = 10;

        // 12 hue buckets × 30° each. All weights are integers.
        const buckets = [];
        for (let i = 0; i < 12; i++) {
            buckets.push({ rSum: 0, gSum: 0, bSum: 0, count: 0 });
        }

        let greyR = 0, greyG = 0, greyB = 0, greyCount = 0;

        for (let i = 0; i < pixelCount; i += quality) {
            const off = i * 4;
            const r = data[off];
            const g = data[off + 1];
            const b = data[off + 2];
            const a = data[off + 3];

            // Skip transparent pixels
            if (a < 128) continue;

            // Skip near-white and near-black
            if (r > 250 && g > 250 && b > 250) continue;
            if (r < 5 && g < 5 && b < 5) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const chroma = max - min;

            // If low saturation, accumulate into grey bucket
            // Saturation check: chroma / max < ~0.1  (using integer: chroma * 10 < max)
            if (max === 0 || chroma * 10 < max) {
                greyR += r; greyG += g; greyB += b; greyCount++;
                continue;
            }

            // Lightness check (skip very dark and very bright)
            const luma = r + g + b; // 0–765
            if (luma < 76 || luma > 688) continue; // ~10% and ~90% of 765

            // Hue calculation — integer math, result in [0, 360)
            let hue;
            if (max === r) {
                hue = 60 * (g - b) / chroma;
                if (hue < 0) hue += 360;
            } else if (max === g) {
                hue = 60 * (b - r) / chroma + 120;
            } else {
                hue = 60 * (r - g) / chroma + 240;
            }

            const bucketIdx = Math.floor(hue / 30) % 12;

            // Weight by saturation (chroma) — integer, no float drift
            const weight = chroma;
            buckets[bucketIdx].rSum += r * weight;
            buckets[bucketIdx].gSum += g * weight;
            buckets[bucketIdx].bSum += b * weight;
            buckets[bucketIdx].count += weight;
        }

        // Find bucket with largest total weight
        let best = null;
        let bestWeight = 0;
        for (const b of buckets) {
            if (b.count > bestWeight) {
                bestWeight = b.count;
                best = b;
            }
        }

        if (best && best.count > 0) {
            return [
                Math.round(best.rSum / best.count),
                Math.round(best.gSum / best.count),
                Math.round(best.bSum / best.count)
            ];
        }

        // Fallback to grey average
        if (greyCount > 0) {
            return [
                Math.round(greyR / greyCount),
                Math.round(greyG / greyCount),
                Math.round(greyB / greyCount)
            ];
        }

        return DEFAULT_RGB;
    } catch (e) {
        console.error('[PTMT] Color extraction failed:', e);
        return DEFAULT_RGB;
    }
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
        const fileMatch = src.match(/[?&]file=([^&]+)/i);
        const avatarFileName = fileMatch ? decodeURIComponent(fileMatch[1]) : src.split('/').pop() || 'user.png';
        const cleanFileName = avatarFileName.split(/[?#]/)[0];
        return { type: 'persona', uid: `user:${cleanFileName}`, avatarFileName: cleanFileName, domAvatarUrl: src, domImgElement: avatarImg };
    }

    if (chName) {
        const safeName = chName.replace(/\W/g, '_').toLowerCase();
        const ctx = getContext();
        const found = ctx.characters?.find(c => c.name === chName);
        const avatarFileName = found?.avatar || (src.includes('file=') ? decodeURIComponent(src.match(/[?&]file=([^&]+)/i)[1]) : src.split('/').pop());
        const cleanFileName = (avatarFileName || 'char.png').split(/[?#]/)[0];
        return { type: 'character', uid: `char:${safeName}`, avatarFileName: cleanFileName, domAvatarUrl: src, domImgElement: avatarImg };
    }

    return null;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

function getSettingsForType(type) {
    if (type === 'persona') {
        return {
            source: settings.get('dialogueColorizerPersonaSource'),
            staticColor: settings.get('dialogueColorizerPersonaStaticColor'),
        };
    }
    return {
        source: settings.get('dialogueColorizerSource'),
        staticColor: settings.get('dialogueColorizerStaticColor'),
    };
}

// ─── Color resolution ─────────────────────────────────────────────────────────

async function getCharacterColor(info) {
    if (colorCache.has(info.uid)) return colorCache.get(info.uid);
    if (extractionPromises.has(info.uid)) return extractionPromises.get(info.uid);

    const promise = (async () => {
        const { source, staticColor } = getSettingsForType(info.type);
        if (info.type === 'system' || source === 'static_color') {
            colorCache.set(info.uid, staticColor);
            return staticColor;
        }

        // Skip extraction if it's the silhouette or missing
        if (!info.domAvatarUrl || info.domAvatarUrl.includes('img/five.png') || info.domAvatarUrl.length < 10) {
            return staticColor;
        }

        // Use the actual DOM <img> element directly — its decoded bitmap is stable.
        // Creating new Image() and re-fetching the URL produces different pixel data
        // on each decode, which causes non-deterministic color extraction.
        const domImg = info.domImgElement;
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            try {
                const rgb = await getDominantColor(domImg);
                const hex = ColorUtils.rgbToHex(rgb);
                colorCache.set(info.uid, hex);
                console.log(`[PTMT] Extracted color for ${info.uid}: ${hex}`);
                return hex;
            } catch (e) {
                console.warn(`[PTMT] DOM extraction failed for ${info.uid}, using static color`, e);
                return staticColor;
            }
        }

        // Fallback: if DOM element is not available/loaded, load fresh
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = info.domAvatarUrl;

            const timeout = setTimeout(() => {
                console.warn(`[PTMT] Extraction timeout for ${info.uid}`);
                resolve(staticColor);
            }, 10000);

            img.onload = async () => {
                clearTimeout(timeout);
                try {
                    const rgb = await getDominantColor(img);
                    const hex = ColorUtils.rgbToHex(rgb);
                    colorCache.set(info.uid, hex);
                    console.log(`[PTMT] Extracted color for ${info.uid} (fallback): ${hex}`);
                    resolve(hex);
                } catch (e) {
                    resolve(staticColor);
                }
            };
            img.onerror = () => {
                clearTimeout(timeout);
                resolve(staticColor);
            };
        });
    })();

    extractionPromises.set(info.uid, promise);
    const result = await promise;
    extractionPromises.delete(info.uid);
    return result;
}

// ─── CSS generation ───────────────────────────────────────────────────────────

function buildCssRules(safeUid, color) {
    const target = settings.get('dialogueColorizerColorizeTarget') ?? 1;
    const opacity = settings.get('dialogueColorizerBubbleOpacity') ?? 0.2;
    let css = '';

    if (target & 1) { // QUOTED_TEXT
        const adaptedColor = `color-mix(in oklch, ${color}, var(--ptmt-contrast-bw) 30%)`;
        css += `#chat .mes[xdc-author-uid="${safeUid}"] .mes_text q { color: ${adaptedColor} !important; }\n`;
        css += `.bubblechat #chat .mes[xdc-author-uid="${safeUid}"] .bubble_content q { color: ${adaptedColor} !important; }\n`;
    }
    if (target & 2) { // BUBBLES
        const rgbaBg = ColorUtils.hexToRgba(color, opacity);
        const rgbaBorder = ColorUtils.hexToRgba(color, Math.min(1.0, opacity * 2.5 + 0.1));
        css += `.bubblechat #chat .mes[xdc-author-uid="${safeUid}"] { background-color: ${rgbaBg} !important; border-color: ${rgbaBorder} !important; }\n`;
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
            const fileMatch = src.match(/[?&]file=([^&]+)/i);
            const avatarFileName = fileMatch ? decodeURIComponent(fileMatch[1]) : src.split('/').pop() || 'user.png';
            const cleanFileName = avatarFileName.split(/[?#]/)[0];
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
        const color = await getCharacterColor(info);
        const rule = buildCssRules(info.uid.replace(/\W/g, '_'), color);
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
    chatObserver = new MutationObserver((mutations) => {
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
    });

    const chat = document.getElementById('chat');
    if (chat) chatObserver.observe(chat, { childList: true, attributes: true, attributeFilter: ['src'], subtree: true });

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStyles();
    });

    const userAvatarBlock = document.getElementById('user_avatar_block');
    if (userAvatarBlock) {
        const personaObserver = new MutationObserver(debouncedUpdate);
        personaObserver.observe(userAvatarBlock, { subtree: true, attributeFilter: ['class'] });
    }

    window.addEventListener('ptmt:settingsChanged', (e) => {
        const keys = e.detail?.changed || [];
        const colorizerKeys = [
            'enableDialogueColorizer',
            'dialogueColorizerSource', 'dialogueColorizerStaticColor',
            'dialogueColorizerPersonaSource', 'dialogueColorizerPersonaStaticColor',
            'dialogueColorizerColorizeTarget', 'dialogueColorizerBubbleOpacity',
        ];
        if (keys.some(k => colorizerKeys.includes(k))) {
            if (!keys.includes('dialogueColorizerBubbleOpacity') && !keys.includes('dialogueColorizerColorizeTarget')) {
                colorCache.clear();
            }
            updateStyles();
        }
    });
}

export function clearColorizerCache() {
    colorCache.clear();
    extractionPromises.clear();
    updateStyles();
}
