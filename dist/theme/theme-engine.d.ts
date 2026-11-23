interface ImageAnalysis {
    luminance: number;
    color: string | null;
}
interface ColorLumAlpha {
    lum: number;
    alpha: number;
}
export declare class ThemeEngine {
    cache: Map<string, ImageAnalysis>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    lastUrl: string | null;
    targetIds: string[];
    _currentBgL: number;
    _tintObserver: MutationObserver | null;
    _browserColor: string | null;
    _browserTintEnabled: boolean;
    _metaThemeColor: HTMLMetaElement | null;
    _originalMetaColor: string | null;
    _appliedMetaColor: string | null;
    constructor();
    init(browserTintEnabled?: boolean): void;
    startObserver(): void;
    refresh(): void;
    analyzeImage(url: string): Promise<void>;
    setBrowserColor(color: string | null): void;
    setBrowserTintEnabled(enabled: boolean): void;
    syncBrowserColor(): void;
    cleanup(): void;
    analyzeColor(colorStr: string): void;
    applyLuminance(lum: number): void;
    /**
     * Parse any CSS color string into { lum, alpha }.
     * Supports rgb/rgba and #hex. Returns null for unknown formats.
     */
    parseColorLumAlpha(colorStr: string | null | undefined): ColorLumAlpha | null;
    /**
     * Computes effective background luminance seen by chat messages:
     *   --SmartThemeChatTintColor (at its own alpha) blended over the wallpaper.
     * - Tint alpha=1 → bg has zero influence (solid tint blocks wallpaper)
     * - Tint alpha=0 → wallpaper luminance used directly
     * Exposes the result as --ptmt-effective-bg-l for use in bubble composite formulas.
     */
    updateEffectiveBgL(): void;
    /**
     * Parses bodyBgColor and sets --ptmt-body-bg-l for CSS.
     * Returns the alpha channel (0-1) so the caller can decide whether
     * ptmt-bg-under-chat should be active (transparent = no tab contrast).
     */
    setBodyBgColor(colorStr: string | null | undefined): number;
}
export declare const themeEngine: ThemeEngine;
export {};
