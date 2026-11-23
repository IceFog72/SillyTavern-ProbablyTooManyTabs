import type { ColorizerCustomEntry } from '../core/types.js';
export type ColorizerEntityType = 'character' | 'persona';
export interface ColorizerSettingsStore {
    get(key: string): any;
    update(patch: Record<string, any>, force?: boolean): Promise<void> | void;
}
export interface ResolvedCustomColorizerSettings {
    enabled: boolean;
    value: ColorizerCustomEntry;
    raw: Partial<ColorizerCustomEntry> | null;
    key: string;
    sourceKey: string;
}
export declare function buildCharacterCustomColorizerKey(_charName: unknown, avatarFilename: string | null | undefined): string;
export declare function buildCustomColorizerKey(type: string, _uid: unknown, domAvatarUrl: unknown): string;
export declare function buildCustomColorizerKeyFromFilename(type: string, _uid: unknown, avatarFileName: string | null | undefined): string;
export declare function buildColorizerCustomEntry(type: string, patch?: Partial<ColorizerCustomEntry>): ColorizerCustomEntry;
export declare function resolveCustomColorizerSettings(settingsStore: ColorizerSettingsStore, type: string, key: string): ResolvedCustomColorizerSettings;
export declare function updateCustomColorizerSettings(settingsStore: ColorizerSettingsStore, type: string, key: string, options?: {
    enabled?: boolean;
    patch?: Partial<ColorizerCustomEntry>;
}): Promise<boolean>;
export declare function migrateColorizerSettings(loadedSettings: Record<string, any>, currentVersion: number): boolean;
