import {
    extractAvatarFilenameFromUrl,
    normalizeHexColor,
} from './colorizer-helpers.js';

const DEFAULTS = {
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

const STORE_KEYS = {
    character: {
        enabled: 'charCustomColorizerEnabled',
        settings: 'charCustomColorizerSettings',
    },
    persona: {
        enabled: 'personaCustomColorizerEnabled',
        settings: 'personaCustomColorizerSettings',
    },
};

const SOURCE_VALUES = new Set(['avatar_vibrant', 'static_color']);
const BUBBLE_MODE_VALUES = new Set(['avatar_light', 'avatar_dark', 'static_color', 'gradient']);
const TARGET_VALUES = new Set([1, 2, 3]);
const CHARACTER_KEY_PREFIX = 'avatar:';

function getType(type) {
    return type === 'persona' ? 'persona' : 'character';
}

function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function normalizeGradientStops(stops, fallbackColor) {
    if (!Array.isArray(stops)) return [];
    return stops.map(stop => ({
        color: normalizeHexColor(stop?.color, fallbackColor),
        position: clampNumber(stop?.position, 0, 0, 1),
    }));
}

function normalizeBubbleMode(entry, fallback) {
    if (BUBBLE_MODE_VALUES.has(entry?.bubbleMode)) return entry.bubbleMode;
    if (entry?.bubbleColorMode === 3) return 'gradient';
    return fallback;
}

function canonicalCharacterKey(avatarFilename) {
    return `${CHARACTER_KEY_PREFIX}${avatarFilename || 'unknown.png'}`;
}

function avatarFromCharacterKey(key) {
    const value = String(key || '');
    if (value.startsWith(CHARACTER_KEY_PREFIX)) return value.slice(CHARACTER_KEY_PREFIX.length) || 'unknown.png';
    return '';
}

function legacyCharacterCandidates(enabledList, settingsMap, avatarFilename) {
    if (!avatarFilename) return [];
    const suffix = `__${avatarFilename}`;
    const all = new Set([...enabledList, ...Object.keys(settingsMap)]);
    return [...all].filter(key => !String(key).startsWith(CHARACTER_KEY_PREFIX) && String(key).endsWith(suffix));
}

function resolveStoredEntry(settingsStore, type, key) {
    const storeType = getType(type);
    const keys = STORE_KEYS[storeType];
    const enabledList = settingsStore.get(keys.enabled) ?? [];
    const settingsMap = settingsStore.get(keys.settings) ?? {};

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

function currentCharacterAvatarFilename() {
    if (typeof document === 'undefined') return '';
    const preview = document.getElementById('avatar_load_preview');
    const src = preview?.getAttribute('src') || '';
    return src ? extractAvatarFilenameFromUrl(src, '') : '';
}

function characterUpdateMatchesOpenEditor(key) {
    const expected = avatarFromCharacterKey(key);
    if (!expected || expected === 'unknown.png') return true;
    const current = currentCharacterAvatarFilename();
    // A missing preview means the editor is no longer active. Reject delayed UI
    // writes rather than applying them to a stale card identity.
    if (!current) return false;
    return current === expected;
}

export function buildCharacterCustomColorizerKey(_charName, avatarFilename) {
    return canonicalCharacterKey(avatarFilename);
}

export function buildCustomColorizerKey(type, _uid, domAvatarUrl) {
    const avatarFilename = extractAvatarFilenameFromUrl(domAvatarUrl, getType(type) === 'persona' ? 'user.png' : 'unknown.png');
    return getType(type) === 'persona' ? avatarFilename : canonicalCharacterKey(avatarFilename);
}

export function buildCustomColorizerKeyFromFilename(type, _uid, avatarFileName) {
    return getType(type) === 'persona'
        ? (avatarFileName || 'user.png')
        : canonicalCharacterKey(avatarFileName);
}

export function buildColorizerCustomEntry(type, patch = {}) {
    const defaults = DEFAULTS[getType(type)];
    const entry = { ...defaults, ...patch };
    return {
        dialogSource: SOURCE_VALUES.has(entry.dialogSource) ? entry.dialogSource : defaults.dialogSource,
        dialogStatic: normalizeHexColor(entry.dialogStatic, defaults.dialogStatic),
        bubbleMode: normalizeBubbleMode(entry, defaults.bubbleMode),
        bubbleStatic1: normalizeHexColor(entry.bubbleStatic1, defaults.bubbleStatic1),
        bubbleStatic2: normalizeHexColor(entry.bubbleStatic2, defaults.bubbleStatic2),
        colorizeTarget: TARGET_VALUES.has(Number(entry.colorizeTarget)) ? Number(entry.colorizeTarget) : defaults.colorizeTarget,
        bubbleOpacity: clampNumber(entry.bubbleOpacity, defaults.bubbleOpacity, 0, 1),
        bubbleGradientStops: normalizeGradientStops(entry.bubbleGradientStops, defaults.dialogStatic),
        bubbleGradientAngle: clampNumber(entry.bubbleGradientAngle, defaults.bubbleGradientAngle, 0, 360),
    };
}

export function resolveCustomColorizerSettings(settingsStore, type, key) {
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

export async function updateCustomColorizerSettings(settingsStore, type, key, options = {}) {
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

    const removeEnabled = value => {
        let index;
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

export function migrateColorizerSettings(loadedSettings, currentVersion) {
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
