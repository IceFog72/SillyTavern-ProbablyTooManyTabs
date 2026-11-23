import {
    extractAvatarFilenameFromUrl,
    normalizeHexColor,
} from './colorizer-helpers.js';
import type {
    BubbleMode,
    ColorizerCustomEntry,
    ColorizerSource,
    ColorizeTarget,
    GradientStop,
} from '../core/types.js';

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

interface StoredEntryResolution {
    canonicalKey: string;
    sourceKey: string;
    enabledList: string[];
    settingsMap: Record<string, Partial<ColorizerCustomEntry>>;
    enabled: boolean;
    raw: Partial<ColorizerCustomEntry> | null;
}

const DEFAULTS: Record<ColorizerEntityType, ColorizerCustomEntry> = {
    character: {
        dialogSource: 'avatar_vibrant',
        dialogStatic: '#da6745ff',
        bubbleMode: 'gradient',
        bubbleStatic1: '#da6745ff',
        bubbleStatic2: '#da6745ff',
        colorizeTarget: 3,
        bubbleOpacity: 0.1,
        bubbleGradientStops: [],
        bubbleGradientAngle: 225,
    },
    persona: {
        dialogSource: 'avatar_vibrant',
        dialogStatic: '#537fddff',
        bubbleMode: 'gradient',
        bubbleStatic1: '#537fddff',
        bubbleStatic2: '#537fddff',
        colorizeTarget: 3,
        bubbleOpacity: 0.1,
        bubbleGradientStops: [],
        bubbleGradientAngle: 125,
    },
};

const STORE_KEYS: Record<ColorizerEntityType, { enabled: string; settings: string }> = {
    character: {
        enabled: 'charCustomColorizerEnabled',
        settings: 'charCustomColorizerSettings',
    },
    persona: {
        enabled: 'personaCustomColorizerEnabled',
        settings: 'personaCustomColorizerSettings',
    },
};

const SOURCE_VALUES = new Set<string>(['avatar_vibrant', 'static_color']);
const BUBBLE_MODE_VALUES = new Set<string>(['avatar_light', 'avatar_dark', 'static_color', 'gradient']);
const TARGET_VALUES = new Set<number>([1, 2, 3]);
const CHARACTER_KEY_PREFIX = 'avatar:';

function getType(type: string): ColorizerEntityType {
    return type === 'persona' ? 'persona' : 'character';
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function normalizeGradientStops(stops: unknown, fallbackColor: string): GradientStop[] {
    if (!Array.isArray(stops)) return [];
    return stops.map((stop: any) => ({
        color: normalizeHexColor(stop?.color, fallbackColor),
        position: clampNumber(stop?.position, 0, 0, 1),
    }));
}

function normalizeBubbleMode(entry: Partial<ColorizerCustomEntry> | null | undefined, fallback: BubbleMode): BubbleMode {
    if (entry?.bubbleMode && BUBBLE_MODE_VALUES.has(entry.bubbleMode)) return entry.bubbleMode;
    if (entry?.bubbleColorMode === 3) return 'gradient';
    return fallback;
}

function canonicalCharacterKey(avatarFilename: string | null | undefined): string {
    return `${CHARACTER_KEY_PREFIX}${avatarFilename || 'unknown.png'}`;
}

function avatarFromCharacterKey(key: string): string {
    const value = String(key || '');
    if (value.startsWith(CHARACTER_KEY_PREFIX)) return value.slice(CHARACTER_KEY_PREFIX.length) || 'unknown.png';
    return '';
}

function legacyCharacterCandidates(
    enabledList: string[],
    settingsMap: Record<string, Partial<ColorizerCustomEntry>>,
    avatarFilename: string,
): string[] {
    if (!avatarFilename) return [];
    const suffix = `__${avatarFilename}`;
    const all = new Set([...enabledList, ...Object.keys(settingsMap)]);
    return [...all].filter(key => !String(key).startsWith(CHARACTER_KEY_PREFIX) && String(key).endsWith(suffix));
}

function resolveStoredEntry(settingsStore: ColorizerSettingsStore, type: string, key: string): StoredEntryResolution {
    const storeType = getType(type);
    const keys = STORE_KEYS[storeType];
    const enabledList: string[] = settingsStore.get(keys.enabled) ?? [];
    const settingsMap: Record<string, Partial<ColorizerCustomEntry>> = settingsStore.get(keys.settings) ?? {};

    if (storeType === 'persona') {
        return {
            canonicalKey: key,
            sourceKey: key,
            enabledList,
            settingsMap,
            enabled: enabledList.includes(key),
            raw: settingsMap[key] || null,
        };
    }

    const avatarFilename = avatarFromCharacterKey(key);
    const canonicalKey = avatarFilename ? canonicalCharacterKey(avatarFilename) : key;
    if (enabledList.includes(canonicalKey) || settingsMap[canonicalKey]) {
        return {
            canonicalKey,
            sourceKey: canonicalKey,
            enabledList,
            settingsMap,
            enabled: enabledList.includes(canonicalKey),
            raw: settingsMap[canonicalKey] || null,
        };
    }

    // v2 used normalizedName__avatarFilename. Avatar filenames are the stable
    // SillyTavern card identity, so lazily resolve the old entry by its suffix.
    const candidates = legacyCharacterCandidates(enabledList, settingsMap, avatarFilename);
    const sourceKey = candidates.find(candidate => enabledList.includes(candidate)) || candidates[0] || canonicalKey;
    return {
        canonicalKey,
        sourceKey,
        enabledList,
        settingsMap,
        enabled: enabledList.includes(sourceKey),
        raw: settingsMap[sourceKey] || null,
    };
}

function currentCharacterAvatarFilename(): string {
    if (typeof document === 'undefined') return '';
    const preview = document.getElementById('avatar_load_preview');
    const src = preview?.getAttribute('src') || '';
    return src ? extractAvatarFilenameFromUrl(src, '') : '';
}

function characterUpdateMatchesOpenEditor(key: string): boolean {
    const expected = avatarFromCharacterKey(key);
    if (!expected || expected === 'unknown.png') return true;
    const current = currentCharacterAvatarFilename();
    // A missing preview means the editor is no longer active. Reject delayed UI
    // writes rather than applying them to a stale card identity.
    if (!current) return false;
    return current === expected;
}

export function buildCharacterCustomColorizerKey(_charName: unknown, avatarFilename: string | null | undefined): string {
    return canonicalCharacterKey(avatarFilename);
}

export function buildCustomColorizerKey(type: string, _uid: unknown, domAvatarUrl: unknown): string {
    const avatarFilename = extractAvatarFilenameFromUrl(domAvatarUrl, getType(type) === 'persona' ? 'user.png' : 'unknown.png');
    return getType(type) === 'persona' ? avatarFilename : canonicalCharacterKey(avatarFilename);
}

export function buildCustomColorizerKeyFromFilename(type: string, _uid: unknown, avatarFileName: string | null | undefined): string {
    return getType(type) === 'persona'
        ? (avatarFileName || 'user.png')
        : canonicalCharacterKey(avatarFileName);
}

export function buildColorizerCustomEntry(type: string, patch: Partial<ColorizerCustomEntry> = {}): ColorizerCustomEntry {
    const defaults = DEFAULTS[getType(type)];
    const entry = { ...defaults, ...patch };
    const targetNum = Number(entry.colorizeTarget);
    return {
        dialogSource: (SOURCE_VALUES.has(entry.dialogSource) ? entry.dialogSource : defaults.dialogSource) as ColorizerSource,
        dialogStatic: normalizeHexColor(entry.dialogStatic, defaults.dialogStatic),
        bubbleMode: normalizeBubbleMode(entry, defaults.bubbleMode),
        bubbleStatic1: normalizeHexColor(entry.bubbleStatic1, defaults.bubbleStatic1),
        bubbleStatic2: normalizeHexColor(entry.bubbleStatic2, defaults.bubbleStatic2),
        colorizeTarget: (TARGET_VALUES.has(targetNum) ? targetNum : defaults.colorizeTarget) as ColorizeTarget,
        bubbleOpacity: clampNumber(entry.bubbleOpacity, defaults.bubbleOpacity, 0, 1),
        bubbleGradientStops: normalizeGradientStops(entry.bubbleGradientStops, defaults.dialogStatic),
        bubbleGradientAngle: clampNumber(entry.bubbleGradientAngle, defaults.bubbleGradientAngle, 0, 360),
    };
}

export function resolveCustomColorizerSettings(
    settingsStore: ColorizerSettingsStore,
    type: string,
    key: string,
): ResolvedCustomColorizerSettings {
    const resolved = resolveStoredEntry(settingsStore, type, key);
    const value = buildColorizerCustomEntry(type, resolved.raw || {});
    return {
        enabled: resolved.enabled,
        value,
        raw: resolved.raw,
        key: resolved.canonicalKey,
        sourceKey: resolved.sourceKey,
    };
}

export async function updateCustomColorizerSettings(
    settingsStore: ColorizerSettingsStore,
    type: string,
    key: string,
    options: { enabled?: boolean; patch?: Partial<ColorizerCustomEntry> } = {},
): Promise<boolean> {
    if (!key) return false;

    const storeType = getType(type);
    if (storeType === 'character' && !characterUpdateMatchesOpenEditor(key)) {
        console.warn(`[PTMT] Ignoring stale Character Colorizer write for "${key}"; the editor now points at another card.`);
        return false;
    }

    const keys = STORE_KEYS[storeType];
    const resolved = resolveStoredEntry(settingsStore, storeType, key);
    const canonicalKey = resolved.canonicalKey;
    const enabledList = [...resolved.enabledList];
    const settingsMap = { ...resolved.settingsMap };

    const removeEnabled = (value: string): void => {
        let index: number;
        while ((index = enabledList.indexOf(value)) !== -1) enabledList.splice(index, 1);
    };

    if (options.enabled === false) {
        // Disable without destroying the user's colors. This makes the checkbox
        // reversible and avoids surprising data loss.
        removeEnabled(canonicalKey);
        if (resolved.sourceKey !== canonicalKey) removeEnabled(resolved.sourceKey);
        await settingsStore.update({ [keys.enabled]: enabledList, [keys.settings]: settingsMap }, true);
        return true;
    }

    const oldEntry = buildColorizerCustomEntry(storeType, resolved.raw || {});
    const nextEntry = buildColorizerCustomEntry(storeType, { ...oldEntry, ...(options.patch || {}) });

    if (options.enabled === true && !enabledList.includes(canonicalKey)) enabledList.push(canonicalKey);
    settingsMap[canonicalKey] = nextEntry;

    // Successful writes are also lazy migrations from the old name+avatar key.
    if (resolved.sourceKey !== canonicalKey) {
        removeEnabled(resolved.sourceKey);
        delete settingsMap[resolved.sourceKey];
    }

    await settingsStore.update({ [keys.enabled]: enabledList, [keys.settings]: settingsMap }, true);
    return true;
}

export function migrateColorizerSettings(loadedSettings: Record<string, any>, currentVersion: number): boolean {
    const loadedVersion = Number(loadedSettings.dialogueColorizerSettingsVersion || 0);
    if (loadedVersion >= currentVersion) return false;

    // Do not wipe per-character/persona overrides on a schema bump. Current
    // resolvers tolerate the legacy v2 keys and migrate them lazily on write.
    loadedSettings.charCustomColorizerEnabled ??= [];
    loadedSettings.charCustomColorizerSettings ??= {};
    loadedSettings.personaCustomColorizerEnabled ??= [];
    loadedSettings.personaCustomColorizerSettings ??= {};
    loadedSettings.dialogueColorizerSettingsVersion = currentVersion;
    return true;
}
