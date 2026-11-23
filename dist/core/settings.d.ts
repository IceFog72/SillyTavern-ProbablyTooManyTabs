import type { LayoutSnapshot, PanelMapping, PTMTSettings, ThemeConfig } from './types.js';
export declare class SettingsManager {
    private _settingsMigrated;
    static defaultSettings: PTMTSettings;
    static themes: Record<string, ThemeConfig>;
    static getThemeConfig(themeName: string): ThemeConfig;
    static applyTheme(themeName: string): void;
    static getAvailableThemes(): Array<{
        id: string;
        name: string;
        description: string;
    }>;
    static isMobile(): boolean;
    static getMobileLayout(sourceLayout: LayoutSnapshot | null | undefined): LayoutSnapshot | null;
    static getDesktopLayout(sourceLayout: LayoutSnapshot | null | undefined): LayoutSnapshot | null;
    constructor();
    initializeSettings(): void;
    migrateDialogueColorizerSettings(loadedSettings: Record<string, any>): boolean;
    getActiveLayoutKey(): 'savedLayoutMobile' | 'savedLayoutDesktop';
    getActiveDefaultLayout(): LayoutSnapshot;
    getActiveLayout(): LayoutSnapshot;
    get<K extends keyof PTMTSettings>(key: K): PTMTSettings[K];
    get(key: string): any;
    getMapping(sourceId: string | null | undefined): Partial<PanelMapping>;
    update(newSettings: Partial<PTMTSettings> & Record<string, any>, force?: boolean): Promise<void>;
    save(force?: boolean): Promise<void>;
    reset(full?: boolean): Promise<void>;
    cleanup(): Promise<void>;
}
export declare const settings: SettingsManager;
