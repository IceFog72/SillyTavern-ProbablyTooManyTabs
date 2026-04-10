// theme-engine.js

import { registerBodyObserver, trackObserver } from './utils.js';

export class ThemeEngine {
    constructor() {
        this.cache = new Map();
        this.unregisterBody = null;
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
    }

    init() {
        console.log('[PTMT] ThemeEngine initializing...');
        this.startObserver();
        this.refresh();
    }

    startObserver() {
        // Use unified body observer for attribute changes (style/class)
        this.unregisterBody = registerBodyObserver(
            'theme-engine',
            { attributes: true, attributeFilter: ['style', 'class'] },
            () => this.refresh()
        );

        // Some backgrounds are injected into specific target divs.
        // These use separate observers because they watch non-body elements.
        this.targetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const obs = trackObserver(new MutationObserver(() => this.refresh()));
                obs.observe(el, { attributes: true, attributeFilter: ['style'] });
            }
        });

        // Observe :root style changes so we recompute when ST changes --SmartThemeChatTintColor
        this._tintObserver = trackObserver(new MutationObserver(() => this.updateEffectiveBgL()));
        this._tintObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
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
            this.applyLuminance(this.cache.get(url));
            return;
        }

        if (!this.ctx) {
            this.applyLuminance(0.5);
            return;
        }

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            await img.decode();

            this.ctx.drawImage(img, 0, 0, 10, 10);
            const data = this.ctx.getImageData(0, 0, 10, 10).data;

            let totalLum = 0;
            for (let i = 0; i < data.length; i += 4) {
                // Perceptual luminance formula
                const r = data[i] / 255;
                const g = data[i + 1] / 255;
                const b = data[i + 2] / 255;
                totalLum += (0.2126 * r + 0.7152 * g + 0.0722 * b);
            }

            const avgLum = totalLum / (data.length / 4);
            this.cache.set(url, avgLum);
            this.applyLuminance(avgLum);
        } catch (e) {
            console.warn('[PTMT] Failed to analyze background image:', e);
            this.applyLuminance(0.5); // Fallback to neutral
        }
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
