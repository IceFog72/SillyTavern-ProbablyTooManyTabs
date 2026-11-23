import type { BubbleMode } from '../core/types.js';
export declare const DEFAULT_COLORIZER_RGB: [number, number, number];
export interface ColorizerAvatarInfo {
    type: 'character' | 'persona' | 'system';
    uid: string;
    characterName?: string;
    avatarFileName: string;
    domAvatarUrl: string;
    domImgElement?: HTMLImageElement | null;
}
export declare function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number];
export declare function rgbToHex([r, g, b]: number[]): string;
export declare function normalizeHexColor(hex: unknown, fallback?: string): string;
export declare function hexToRgbaWithAlpha(hex: unknown, alpha?: number): string;
export declare function normalizeCharacterName(charName: string | null | undefined): string;
export declare function extractAvatarFilenameFromUrl(url: unknown, fallback?: string): string;
export declare function extractIdentifierFromUid(uid: unknown): string;
export declare function buildCharacterColorizerKeyFromParts(charName: string | null | undefined, avatarFilename: string | null | undefined): string;
export declare function buildCharacterColorizerKey(uid: unknown, domAvatarUrl: unknown): string;
export declare function buildPersonaColorizerKey(uid: unknown, domAvatarUrl: unknown): string;
export declare function buildColorizerCacheKey(info: ColorizerAvatarInfo | null | undefined): string;
export declare function normalizeBubbleMode(customSettings: {
    bubbleMode?: BubbleMode;
    bubbleColorMode?: number;
} | null | undefined, fallback?: BubbleMode): BubbleMode;
