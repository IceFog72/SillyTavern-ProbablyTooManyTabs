import type { BubbleMode } from '../core/types.js';

export const DEFAULT_COLORIZER_RGB: [number, number, number] = [225, 138, 36];

export interface ColorizerAvatarInfo {
    type: 'character' | 'persona' | 'system';
    uid: string;
    characterName?: string;
    avatarFileName: string;
    domAvatarUrl: string;
    domImgElement?: HTMLImageElement | null;
}

export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

export function rgbToHex([r, g, b]: number[]): string {
    return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

export function normalizeHexColor(hex: unknown, fallback = rgbToHex(DEFAULT_COLORIZER_RGB)): string {
    if (typeof hex !== 'string') return fallback;
    const trimmed = hex.trim();
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(trimmed)) return trimmed;
    return fallback;
}

export function hexToRgbaWithAlpha(hex: unknown, alpha = 1): string {
    const safeHex = normalizeHexColor(hex);
    const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    const r = parseInt(safeHex.slice(1, 3), 16);
    const g = parseInt(safeHex.slice(3, 5), 16);
    const b = parseInt(safeHex.slice(5, 7), 16);
    let finalAlpha = clampedAlpha;

    if (safeHex.length === 9) {
        const hexAlpha = parseInt(safeHex.slice(7, 9), 16) / 255;
        finalAlpha = hexAlpha * clampedAlpha;
    }

    return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
}

export function normalizeCharacterName(charName: string | null | undefined): string {
    return (charName || '').trim().replace(/\W/g, '_').toLowerCase();
}

export function extractAvatarFilenameFromUrl(url: unknown, fallback = 'unknown.png'): string {
    if (!url || typeof url !== 'string') return fallback;
    const fileMatch = url.match(/[?&]file=([^&]+)/i);
    let avatarFileName = url.split('/').pop() || fallback;
    if (fileMatch) {
        try {
            avatarFileName = decodeURIComponent(fileMatch[1]);
        } catch {
            avatarFileName = fileMatch[1] || fallback;
        }
    }
    return avatarFileName.split(/[?#]/)[0] || fallback;
}

export function extractIdentifierFromUid(uid: unknown): string {
    const parts = String(uid || '').split(':');
    return parts.length > 1 ? parts[1] : String(uid || '');
}

export function buildCharacterColorizerKeyFromParts(charName: string | null | undefined, avatarFilename: string | null | undefined): string {
    return `${normalizeCharacterName(charName)}__${avatarFilename || 'unknown.png'}`;
}

export function buildCharacterColorizerKey(uid: unknown, domAvatarUrl: unknown): string {
    return buildCharacterColorizerKeyFromParts(
        extractIdentifierFromUid(uid),
        extractAvatarFilenameFromUrl(domAvatarUrl, 'unknown.png'),
    );
}

export function buildPersonaColorizerKey(uid: unknown, domAvatarUrl: unknown): string {
    const fromUrl = extractAvatarFilenameFromUrl(domAvatarUrl, '');
    return fromUrl || extractIdentifierFromUid(uid) || 'user.png';
}

export function buildColorizerCacheKey(info: ColorizerAvatarInfo | null | undefined): string {
    if (!info) return 'unknown';
    if (info.type === 'system') return 'system';
    // Key off the stable avatarFileName (canonical char avatar / captured filename)
    // rather than the live DOM URL, which can be empty mid lazy-load.
    if (info.type === 'persona') {
        return `persona:${info.avatarFileName || buildPersonaColorizerKey(info.uid, info.domAvatarUrl)}`;
    }
    return `character:${buildCharacterColorizerKeyFromParts(extractIdentifierFromUid(info.uid), info.avatarFileName)}`;
}

export function normalizeBubbleMode(
    customSettings: { bubbleMode?: BubbleMode; bubbleColorMode?: number } | null | undefined,
    fallback: BubbleMode = 'gradient',
): BubbleMode {
    if (customSettings?.bubbleMode) return customSettings.bubbleMode;
    return customSettings?.bubbleColorMode === 3 ? 'gradient' : fallback;
}
