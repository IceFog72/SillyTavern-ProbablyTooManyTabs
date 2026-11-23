import type { TabActionType } from '../core/types.js';
/**
 * Runs a specified action for a tab.
 */
export declare function runTabAction(sourceId: string | null | undefined, actionType: TabActionType, panel: HTMLElement | null | undefined): void;
/** Best-effort teardown for global hooks owned by tab actions. */
export declare function cleanupTabActions(): void;
