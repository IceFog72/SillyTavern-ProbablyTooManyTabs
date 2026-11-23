import type { DraggedTabInfo } from './EditorDragDrop.js';
import type { SettingsManager } from '../core/settings.js';
import type { PanelMapping, PTMTAPI } from '../core/types.js';
export declare class LayoutManager {
    appApi: PTMTAPI;
    settings: SettingsManager;
    rootElement: HTMLElement | null;
    draggedTabInfo: DraggedTabInfo | null;
    draggedPaneId: string | null;
    paneDropZone: {
        targetEl: HTMLElement;
        zone: 'top' | 'bottom' | 'left' | 'right' | 'center';
    } | null;
    touchDragGhost: HTMLElement | null;
    lastTouchCoords: {
        x: number;
        y: number;
    } | null;
    editorDirty: boolean;
    editorFrame: number | null;
    editorVisibilityObserver: ResizeObserver | null;
    indicator: HTMLDivElement;
    debouncedSettingsUpdate: (updatedMappings: PanelMapping[]) => void;
    _openSettingsHandler: EventListener | null;
    _layoutChangeHandler: EventListener | null;
    _settingsCheckboxSyncHandler: EventListener | null;
    constructor(appApi: PTMTAPI, settings: SettingsManager);
    createSettingsPanel(): HTMLDivElement;
    renderUnifiedEditor(): void;
    scheduleEditorRender(): void;
    handleDragStart(e: DragEvent | TouchEvent, pid?: string | null): void;
    handleDragOver(e: DragEvent): void;
    handleDragLeave(e: DragEvent): void;
    handleDrop(e: DragEvent): void;
    handleTouchStart(e: TouchEvent, pid?: string | null): void;
    handleTouchMove(e: TouchEvent): void;
    handleTouchEnd(e: TouchEvent): void;
    openTabSettingsDialog(sid: string | null | undefined, tel: HTMLElement | null | undefined, row: HTMLElement | null | undefined, ph?: boolean): void;
    pickIcon(btn: HTMLElement, sid: string, tel: HTMLElement | null | undefined): Promise<void>;
    updateIconBtn(btn: HTMLElement | null | undefined, iconName: string): void;
    saveIconToMapping(sourceId: string, tabElement: HTMLElement | null | undefined, iconName: string): void;
    attachTouchDragListeners(container: HTMLElement, pid?: string | null): void;
    attachDragListeners(container: HTMLElement): void;
    attachSettingsButtonListener(button: HTMLElement, sourceId: string, tabElement: HTMLElement | null, container: HTMLElement, isHidden?: boolean): void;
    cleanup(): void;
}
