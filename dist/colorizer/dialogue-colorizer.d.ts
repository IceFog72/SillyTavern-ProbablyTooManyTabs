/**
 * Dialogue Colorizer logic for PTMT.
 * Adapted from SillyTavern-Dialogue-Colorizer-Plus by zerofata.
 *
 * Character identity is avatar/card based rather than display-name based. Legacy
 * v2 per-character settings are resolved and lazily migrated by colorizer-settings.js.
 */
export declare function cleanupColorizer({ clearStyles }?: {
    clearStyles?: boolean | undefined;
}): void;
export declare function initColorizer(): void;
