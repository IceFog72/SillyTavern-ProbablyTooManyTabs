import type { SettingsManager } from '../core/settings.js';
export declare const PTMT_INFO_PANEL_ID = "ptmt-info-wrapper-content";
export declare function getPTMTInfoCurrentVersion(): string;
/**
 * Creates the Info Panel DOM element with its 3 internal sub-tabs.
 * Content is fetched from /content/*.md at runtime.
 *
 * Call panel._activateTab('guide'|'changelog'|'more') to switch tabs.
 */
export declare function createInfoPanel(settings?: SettingsManager): HTMLDivElement;
