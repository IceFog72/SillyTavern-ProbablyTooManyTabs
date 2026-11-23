export interface ThemeAppearance {
    theme: string;
    colors: Record<string, string | null>;
}
export declare function initThemeColors(): void;
/** Undo initThemeColors. Applied theme colors stay: they belong to the user's theme. */
export declare function cleanupThemeColors(): void;
export declare function captureThemeAppearance(): ThemeAppearance;
export declare function restoreThemeAppearance(appearance: ThemeAppearance): void;
