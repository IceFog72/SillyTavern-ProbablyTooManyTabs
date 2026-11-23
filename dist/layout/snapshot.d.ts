import { SettingsManager } from '../core/settings.js';
import type { LayoutSnapshot, PTMTAPI } from '../core/types.js';
export declare function migrateSavedLayouts(settingsManager: SettingsManager): void;
export declare function generateLayoutSnapshot(): LayoutSnapshot | null;
export declare function applyLayoutSnapshot(snapshot: LayoutSnapshot | null | undefined, api: PTMTAPI, settingsInstance: SettingsManager): void;
