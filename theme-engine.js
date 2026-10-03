// theme-engine.js

import { trackObserver } from './utils.js';

export class ThemeEngine {
    constructor() {
        this.cache = new Map();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 10; // Tiny for performance
        this.canvas.height = 10;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!this.ctx) {
            console.warn('[PTMT] ThemeEngine: Failed to get 2D canvas context. Image analysis will be disabled.');
        }

        this.lastUrl = null;
        this.targetIds = ['bg1', 'bg_custom'];
        this._currentBgL = 0.5; // Last known wallpaper luminance
        this._tintObserver = null;
        this._browserColor = null;
        this._browserTintEnabled = true;
        this._metaThemeColor = null;
        this._originalMetaColor = null;
        this._appliedMetaColor = null;
    }

    init(browserTintEnabled = true) {
        console.log('[PTMT] ThemeEngine initializing...');
        this._browserTintEnabled = browserTintEnabled;
        this.lastUrl = null;
        this._browserColor = null;
        this._metaThemeColor = document.querySelector('meta[name="theme-color"]');
        this._originalMetaColor = this._metaThemeColor?.getAttribute('content') ?? null;
        this._appliedMetaColor = this._originalMetaColor;
        if (this._metaThemeColor) {
            const metaObserver = trackObserver(new MutationObserver(() => {
                const value = this._metaThemeColor?.getAttribute('content');
                if (value !== this._appliedMetaColor) {
                    // ST may apply its saved theme after PTMT starts. Keep the
                    // selected tint, retaining ST's latest tint for cleanup.
                    this._originalMetaColor = value;
                    this.syncBrowserColor();
                }
            }));
            metaObserver.observe(this._metaThemeColor, { attributes: true, attributeFilter: ['content'] });
        }
        this.startObserver();
        this.syncBrowserColor();
        this.refresh();
    }

    startObserver() {
        // Only observe BODY's own class/style changes.
        //
        // IMPORTANT:
        // Do not use PTMT's unified document.body subtree MutationObserver here.
        // Extensions such as SillyTavern-Timelines use Cytoscape/Popper/Tippy and
        // continuously update inline styles while panning, zooming, animating,
        // and positioning tooltips. Watching style/class mutations for the whole
        // body subtree causes all of those rendering updates to wake ThemeEngine.
        //
        // ThemeEngine only needs BODY's own theme-related class/style changes.
        const bodyObserver = trackObserver(new MutationObserver(() => this.refresh()));
        bodyObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: false,
        });

        // Some backgrounds are injected into specific target divs.
        // Observe only those elements directly.
        this.targetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const obs = trackObserver(new MutationObserver(() => this.refresh()));
                obs.observe(el, { attributes: true, attributeFilter: ['style'] });
            }
        });

        // Observe :root style changes so we recompute when ST changes
        // --SmartThemeChatTintColor.
        this._tintObserver = trackObserver(new MutationObserver(() => {
            this.updateEffectiveBgL();
            this.syncBrowserColor();
        }));
        this._tintObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style'],
        });
    }

    refresh() {
        // Find the active background image
        let bgUrl = null;
        let bgColor = 'rgba(0,0,0,0)';

        // Priority order for SillyTavern backgrounds
        for (const id of this.targetIds) {
            const el = document.getElementById(id);
            if (!el) continue;

            const style = window.getComputedStyle(el);
            const img = style.backgroundImage;
            if (img && img !== 'none' && img.includes('url(')) {
                bgUrl = img.match(/url\(["']?([^"']+)["']?\)/)?.[1];
                if (bgUrl) break;
            }
            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                bgColor = style.backgroundColor;
            }
        }

        if (bgUrl) {
            if (bgUrl === this.lastUrl) return;
            this.lastUrl = bgUrl;
            this.analyzeImage(bgUrl);
        } else {
            this.lastUrl = null;
            this.setBrowserColor(null);
            // Check if background is transparent
            if (bgColor === 'rgba(0,0,0,0)' || bgColor === 'rgba(0, 0, 0, 0)') {
                console.log('[PTMT] Background is transparent, using neutral luminance');
                this.applyLuminance(0.5); // Neutral fallback for transparent
            } else {
                this.analyzeColor(bgColor);
            }
        }
    }

    async analyzeImage(url) {
        if (this.cache.has(url)) {
            const analysis = this.cache.get(url);
            this.setBrowserColor(analysis.color);
            this.applyLuminance(analysis.luminance);
            return;
        }

        if (!this.ctx) {
            this.setBrowserColor(null);
            this.applyLuminance(0.5);
            return;
        }

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            await img.decode();
            if (url !== this.lastUrl) return;

            this.ctx.drawImage(img, 0, 0, 10, 10);
            const data = this.ctx.getImageData(0, 0, 10, 10).data;

            let totalLum = 0;
            const rgb = [0, 0, 0];
            let alphaWeight = 0;
            for (let i = 0; i < data.length; i += 4) {
                // Perceptual luminance formula
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;
                totalLum += (0.2126 * r + 0.7152 * g + 0.0722 * b);
                const alpha = data[i + 3] / 255;
                rgb[0] += data[i] * alpha;
                rgb[1] += data[i + 1] * alpha;
                rgb[2] += data[i + 2] * alpha;
                alphaWeight += alpha;
            }

            const avgLum = totalLum / (data.length / 4);
            // Browser chrome needs an opaque color. Transparent pixels do not
            // contribute black to the wallpaper's average RGB.
            const color = alphaWeight > 0
                ? '#' + rgb.map(channel => Math.round(channel / alphaWeight).toString(16).padStart(2, '0')).join('')
                : null;
            this.cache.set(url, { luminance: avgLum, color });
            this.setBrowserColor(color);
            this.applyLuminance(avgLum);
        } catch (e) {
            if (url !== this.lastUrl) return;
            this.setBrowserColor(null);
            console.warn('[PTMT] Failed to analyze background image:', e);
            this.applyLuminance(0.5); // Fallback to neutral
        }
    }

    setBrowserColor(color) {
        this._browserColor = color;
        this.syncBrowserColor();
    }

    setBrowserTintEnabled(enabled) {
        this._browserTintEnabled = enabled;
        this.syncBrowserColor();
    }

    syncBrowserColor() {
        const bodyColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--ptmt-body-bg-color').trim();
        const value = (this._browserTintEnabled ? this._browserColor : bodyColor)
            || bodyColor || this._originalMetaColor;
        if (this._metaThemeColor && value !== null && this._metaThemeColor.getAttribute('content') !== value) {
            this._appliedMetaColor = value;
            this._metaThemeColor.setAttribute('content', value);
        }
    }

    cleanup() {
        this.lastUrl = null; // Ignore image decodes still pending on disable.
        this._browserColor = null;
        if (this._metaThemeColor && this._originalMetaColor !== null) {
            this._metaThemeColor.setAttribute('content', this._originalMetaColor);
        }
        this._metaThemeColor = null;
    }

    analyzeColor(colorStr) {
        // Basic RGB parser
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1]) / 255;
            const g = parseInt(match[2]) / 255;
            const b = parseInt(match[3]) / 255;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            this.applyLuminance(lum);
        }
    }

    applyLuminance(lum) {
        this._currentBgL = lum;
        const lPercent = Math.round(lum * 100);
        document.documentElement.style.setProperty('--ST-UI-Background-luminance', lPercent);
        this.updateEffectiveBgL();
        console.log(`[PTMT] Background Luminance: ${lPercent}%`);
    }

    /**
     * Parse any CSS color string into { lum, alpha }.
     * Supports rgb/rgba and #hex. Returns null for unknown formats.
     */
    parseColorLumAlpha(colorStr) {
        if (!colorStr) return null;
        const str = colorStr.trim();
        if (str === 'transparent' || str === '') return { lum: 0, alpha: 0 };

        const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]) / 255;
            const g = parseInt(rgbMatch[2]) / 255;
            const b = parseInt(rgbMatch[3]) / 255;
            const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
            return { lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha };
        }
        if (str.startsWith('#') && str.length >= 7) {
            const r = parseInt(str.slice(1, 3), 16) / 255;
            const g = parseInt(str.slice(3, 5), 16) / 255;
            const b = parseInt(str.slice(5, 7), 16) / 255;
            const alpha = str.length >= 9 ? parseInt(str.slice(7, 9), 16) / 255 : 1;
            return { lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha };
        }
        return null;
    }

    /**
     * Computes effective background luminance seen by chat messages:
     *   --SmartThemeChatTintColor (at its own alpha) blended over the wallpaper.
     * - Tint alpha=1 → bg has zero influence (solid tint blocks wallpaper)
     * - Tint alpha=0 → wallpaper luminance used directly
     * Exposes the result as --ptmt-effective-bg-l for use in bubble composite formulas.
     */
    updateEffectiveBgL() {
        const tintStr = getComputedStyle(document.documentElement)
            .getPropertyValue('--SmartThemeChatTintColor').trim();
        const tint = this.parseColorLumAlpha(tintStr);
        const bgL = this._currentBgL;

        let effectiveBgL;
        if (!tint) {
            effectiveBgL = bgL; // Unknown tint — use raw wallpaper
        } else {
            // Two-layer blend: tint over wallpaper
            effectiveBgL = tint.lum * tint.alpha + bgL * (1 - tint.alpha);
        }
        document.documentElement.style.setProperty('--ptmt-effective-bg-l', effectiveBgL.toFixed(3));
    }

    /**
     * Parses bodyBgColor and sets --ptmt-body-bg-l for CSS.
     * Returns the alpha channel (0-1) so the caller can decide whether
     * ptmt-bg-under-chat should be active (transparent = no tab contrast).
     * @param {string} colorStr  e.g. 'rgb(29,29,29)', 'rgba(0,0,0,0.5)', '#1d1d1d'
     * @returns {number} alpha (0 = fully transparent, 1 = fully opaque)
     */
    setBodyBgColor(colorStr) {
        if (!colorStr) {
            document.documentElement.style.setProperty('--ptmt-body-bg-l', '0.15');
            return 0;
        }

        // rgba?(r, g, b[, a]) format
        const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]) / 255;
            const g = parseInt(rgbMatch[2]) / 255;
            const b = parseInt(rgbMatch[3]) / 255;
            const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            document.documentElement.style.setProperty('--ptmt-body-bg-l', lum.toFixed(3));
            return alpha;
        }

        // #RRGGBB or #RRGGBBAA hex format
        if (colorStr.startsWith('#') && colorStr.length >= 7) {
            const r = parseInt(colorStr.slice(1, 3), 16) / 255;
            const g = parseInt(colorStr.slice(3, 5), 16) / 255;
            const b = parseInt(colorStr.slice(5, 7), 16) / 255;
            const alpha = colorStr.length >= 9 ? parseInt(colorStr.slice(7, 9), 16) / 255 : 1;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            document.documentElement.style.setProperty('--ptmt-body-bg-l', lum.toFixed(3));
            return alpha;
        }

        // Unknown format — use neutral fallback
        document.documentElement.style.setProperty('--ptmt-body-bg-l', '0.15');
        return 0;
    }
}

export const themeEngine = new ThemeEngine();
