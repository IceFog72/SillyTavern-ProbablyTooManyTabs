/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 */

import { eventSource, event_types, characters, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { settings } from './settings.js';
import { debounce } from './utils.js';

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
        // Create a canvas to analyze the image and detect transparency
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        // Draw the image to the canvas
        ctx.drawImage(img, 0, 0);
        
        // Get image data to check for transparency
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Count opaque pixels vs transparent pixels
        let opaquePixels = 0;
        let transparentPixels = 0;
        const threshold = 50; // Alpha threshold for considering a pixel "visible"
        
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > threshold) {
                opaquePixels++;
            } else {
                transparentPixels++;
            }
        }
        
        const transparencyRatio = transparentPixels / (opaquePixels + transparentPixels);
        const hasSignificantTransparency = transparencyRatio > 0.3;
        
        if (hasSignificantTransparency) {
            console.log(`[PTMT] Image has significant transparency (${(transparencyRatio * 100).toFixed(1)}%), using fallback color extraction`);
            // For transparent images, extract dominant color from opaque pixels only
            return extractColorFromOpaquePixels(data, canvas.width, canvas.height);
        }
        
        // Use Vibrant for normal images
        const v = new Vibrant(img, 32, 3);
        const swatches = v.swatches();
        if (!swatches) {
            console.warn('[PTMT] Vibrant swatches are null');
            return DEFAULT_RGB;
        }
        
        // Prioritize swatches with better saturation for transparent images
        let bestSwatch = null;
        let bestScore = -1;
        
        const swatchOrder = [
            swatches.Vibrant,
            swatches.DarkVibrant,
            swatches.LightVibrant,
            swatches.Muted,
            swatches.DarkMuted,
            swatches.LightMuted
        ].filter(Boolean);
        
        for (const swatch of swatchOrder) {
            const rgb = swatch.getRgb();
            // Score based on saturation and luminance (prefer mid-saturation, mid-luminance)
            const [h, s, l] = ColorUtils.rgbToHsl(rgb);
            const score = s * 0.7 + (1 - Math.abs(l - 0.5) * 2) * 0.3;
            if (score > bestScore) {
                bestScore = score;
                bestSwatch = swatch;
            }
        }
        
        if (!bestSwatch) {
            console.warn('[PTMT] No suitable swatches found for image:', img.src);
            return DEFAULT_RGB;
        }
        
        return bestSwatch.getRgb();
    } catch (e) {
        console.error('[PTMT] Vibrant execution failed:', e);
        return DEFAULT_RGB;
    }
}

/**
 * Extract dominant color from opaque pixels in an image with transparency
 */
function extractColorFromOpaquePixels(data, width, height) {
    const rgbSum = [0, 0, 0];
    let pixelCount = 0;
    
    // Sample pixels (skip some for performance)
    const step = 4;
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            const alpha = data[i + 3];
            
            // Only consider pixels with sufficient alpha
            if (alpha > 100) {
                rgbSum[0] += data[i];
                rgbSum[1] += data[i + 1];
                rgbSum[2] += data[i + 2];
                pixelCount++;
            }
        }
    }
    
    if (pixelCount === 0) {
        console.warn('[PTMT] No opaque pixels found in transparent image');
        return DEFAULT_RGB;
    }
    
    return [
        Math.round(rgbSum[0] / pixelCount),
        Math.round(rgbSum[1] / pixelCount),
        Math.round(rgbSum[2] / pixelCount)
    ];
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
        // Use ch_name attribute for character UID if available
        // This ensures consistent UID across expression changes
        const chName = message.getAttribute('ch_name');
        if (chName) {
            return { type, fileName, uid: `${type}|${chName}` };
        }
        // Fallback: extract base character name without expression suffix
        // e.g., "A_expression.png" -> "A", "A.png" -> "A"
        const dotIndex = fileName.lastIndexOf('.');
        const baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        // Remove common expression suffixes like "_expression", "_happy", etc.
        const charName = baseName.replace(/_(expression|happy|sad|angry|surprised|neutral|normal|default).*$/i, '');
        return { type, fileName, uid: `${type}|${charName}` };
    } else if (type === 'persona') {
        const match = src.match(/[?&]file=([^&]*)/i)?.at(1);
        fileName = match ? decodeURIComponent(match) : fileName;
        // For personas, use the full filename as UID
        return { type, fileName, uid: `${type}|${fileName}` };
    }

    return { type, fileName, uid: `${type}|${fileName}` };
}

async function getCharacterColor(info, thumbSrc) {
    // Use character UID as cache key (not full URL) for consistent colors
    // Characters with different expressions should have the same color
    const cacheKey = info.uid;
    if (colorCache[cacheKey]) return colorCache[cacheKey];

    const source = settings.get('dialogueColorizerSource');
    if (source === 'static_color') return settings.get('dialogueColorizerStaticColor');
    if (info.type === 'system') return settings.get('dialogueColorizerStaticColor');

    // For characters, always use base avatar URL for color extraction (not expression variants)
    // This ensures consistent colors regardless of current expression
    let avatarUrl;
    if (info.type === 'character') {
        // Extract character name from UID (removes "character|" prefix)
        const charName = info.uid.split('|')[1];
        // Construct base avatar URL: /characters/CharacterName.png
        avatarUrl = `/characters/${encodeURIComponent(charName)}.png`;
    } else {
        // For personas/system, use thumbSrc or fallback
        avatarUrl = thumbSrc || `/User Avatars/${encodeURIComponent(info.fileName)}`;
    }
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
            colorCache[cacheKey] = hex;
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

    // Observe chat for new messages and avatar attribute changes
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
                // Avatar image src changed (e.g., expression sync)
                if (mutation.target.classList?.contains('avatar') || mutation.target.parentElement?.classList?.contains('avatar')) {
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
        chatObserver.observe(chat, { childList: true, attributes: true, attributeFilter: ['src'] });
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
