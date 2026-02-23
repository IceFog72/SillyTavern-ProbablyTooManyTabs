// theme-engine.js

export class ThemeEngine {
    constructor() {
        this.cache = new Map();
        this.observer = null;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 10; // Tiny for performance
        this.canvas.height = 10;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.lastUrl = null;
        this.targetIds = ['bg1', 'bg_custom'];
    }

    init() {
        console.log('[PTMT] ThemeEngine initializing...');
        this.startObserver();
        this.refresh();
    }

    startObserver() {
        this.observer = new MutationObserver(() => this.refresh());

        // Watch body for direct background changes or the background divs
        this.observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: true
        });

        // Some backgrounds are injected into specific divs
        this.targetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                this.observer.observe(el, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            }
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
            this.analyzeColor(bgColor);
        }
    }

    async analyzeImage(url) {
        if (this.cache.has(url)) {
            this.applyLuminance(this.cache.get(url));
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
        // Set as percentage for CSS (0 to 100)
        const lPercent = Math.round(lum * 100);
        document.documentElement.style.setProperty('--ptmt-bg-luminance', lPercent);
        console.log(`[PTMT] Background Luminance: ${lPercent}%`);
    }
}

export const themeEngine = new ThemeEngine();
