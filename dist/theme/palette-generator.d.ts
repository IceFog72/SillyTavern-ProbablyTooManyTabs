export interface PaletteProfile {
    label: string;
    tones: [number, number, number, number];
    surfaceChroma: number;
    accentChroma: number;
    inputAlpha: number;
    textTarget: 'light' | 'dark';
    chatAlpha: number;
    panelAlpha: number;
    uiAlpha: number;
}
export interface GeneratedThemePalette {
    main_text_color: string;
    italics_text_color: string;
    underline_text_color: string;
    quote_text_color: string;
    chat_tint_color: string;
    ptmt_ui_background_2: string;
    border_color: string;
    shadow_color: string;
    blur_tint_color: string;
    ptmt_textbox_background: string;
    ptmt_tabs_color: string;
    ptmt_tabs_background: string;
    [key: string]: string;
}
export declare const PALETTE_PROFILES: Record<string, PaletteProfile>;
export declare function getPaletteProfile(profileName: string): PaletteProfile;
export declare function buildThemeFromColors(hexes: string[], profileName?: string): GeneratedThemePalette;
export declare function buildThemeFromImage(img: HTMLImageElement, profileName?: string, numColors?: number): GeneratedThemePalette;
