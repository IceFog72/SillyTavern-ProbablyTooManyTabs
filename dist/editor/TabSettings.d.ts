import type { LayoutManager } from './LayoutManager.js';
export declare function pickIcon(manager: LayoutManager, btn: HTMLElement, sourceId: string, tabElement: HTMLElement | null | undefined): Promise<void>;
export declare function openTabSettingsDialog(manager: LayoutManager, sourceId: string | null | undefined, tabElement: HTMLElement | null | undefined, _tabRow: HTMLElement | null | undefined, _isPendingOrHidden?: boolean): void;
