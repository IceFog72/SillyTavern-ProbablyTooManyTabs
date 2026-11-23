import { el, debounce, createIconElement } from '../core/utils.js';
import { SELECTORS, EVENTS } from '../core/constants.js';
import { createSettingsPanel } from './SettingsPanel.js';
import { renderUnifiedEditor } from './EditorRenderer.js';
import { handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleTouchStart, handleTouchMove, handleTouchEnd } from './EditorDragDrop.js';
import type { DraggedTabInfo } from './EditorDragDrop.js';
import { openTabSettingsDialog, pickIcon } from './TabSettings.js';
import type { SettingsManager } from '../core/settings.js';
import type { OpenTabSettingsEventDetail, PanelMapping, PTMTAPI } from '../core/types.js';

export class LayoutManager {
    appApi: PTMTAPI;
    settings: SettingsManager;
    rootElement: HTMLElement | null;
    draggedTabInfo: DraggedTabInfo | null;
    draggedPaneId: string | null;
    paneDropZone: { targetEl: HTMLElement; zone: 'top' | 'bottom' | 'left' | 'right' | 'center' } | null;
    touchDragGhost: HTMLElement | null;
    lastTouchCoords: { x: number; y: number } | null;
    editorDirty: boolean;
    editorFrame: number | null;
    editorVisibilityObserver: ResizeObserver | null;
    indicator: HTMLDivElement;
    debouncedSettingsUpdate: (updatedMappings: PanelMapping[]) => void;
    _openSettingsHandler: EventListener | null;
    _layoutChangeHandler: EventListener | null;
    _settingsCheckboxSyncHandler: EventListener | null;

    constructor(appApi: PTMTAPI, settings: SettingsManager) {
        this.appApi = appApi;
        this.settings = settings;
        this.rootElement = null;
        this.draggedTabInfo = null;
        this.draggedPaneId = null;
        this.paneDropZone = null;
        this.touchDragGhost = null;
        this.lastTouchCoords = null;
        this.editorDirty = false;
        this.editorFrame = null;
        this.editorVisibilityObserver = null;
        this.indicator = el('div', { className: SELECTORS.DROP_INDICATOR_CLASS.substring(1) });
        this.debouncedSettingsUpdate = debounce((updatedMappings: PanelMapping[]) => {
            settings.update({ panelMappings: updatedMappings });
        }, 400);

        this._layoutChangeHandler = null;
        this._settingsCheckboxSyncHandler = null;
        this._openSettingsHandler = (e: Event) => {
            const { sourceId, tabElement, tabRow } = (e as CustomEvent<OpenTabSettingsEventDetail>).detail;
            this.openTabSettingsDialog(sourceId, tabElement, tabRow, false);
        };
        window.addEventListener(EVENTS.OPEN_TAB_SETTINGS, this._openSettingsHandler);
    }

    createSettingsPanel(): HTMLDivElement { return createSettingsPanel(this); }
    renderUnifiedEditor(): void {
        this.editorDirty = false;
        return renderUnifiedEditor(this);
    }

    scheduleEditorRender(): void {
        this.editorDirty = true;
        if (this.editorFrame !== null) return;
        this.editorFrame = requestAnimationFrame(() => {
            this.editorFrame = null;
            if (this.rootElement?.getClientRects().length) this.renderUnifiedEditor();
        });
    }
    handleDragStart(e: DragEvent | TouchEvent, pid?: string | null): void { return handleDragStart(this, e, pid); }
    handleDragOver(e: DragEvent): void { return handleDragOver(this, e); }
    handleDragLeave(e: DragEvent): void { return handleDragLeave(this, e); }
    handleDrop(e: DragEvent): void { return handleDrop(this, e); }
    handleTouchStart(e: TouchEvent, pid?: string | null): void { return handleTouchStart(this, e, pid); }
    handleTouchMove(e: TouchEvent): void { return handleTouchMove(this, e); }
    handleTouchEnd(e: TouchEvent): void { return handleTouchEnd(this, e); }
    openTabSettingsDialog(sid: string | null | undefined, tel: HTMLElement | null | undefined, row: HTMLElement | null | undefined, ph = false): void {
        return openTabSettingsDialog(this, sid, tel, row, ph);
    }
    pickIcon(btn: HTMLElement, sid: string, tel: HTMLElement | null | undefined): Promise<void> { return pickIcon(this, btn, sid, tel); }

    updateIconBtn(btn: HTMLElement | null | undefined, iconName: string): void {
        if (!btn) return;
        btn.innerHTML = '';
        if (iconName) {
            const iconEl = createIconElement(iconName);
            if (iconEl) {
                btn.appendChild(iconEl);
                return;
            }
        }
        btn.textContent = iconName || '';
    }

    saveIconToMapping(sourceId: string, tabElement: HTMLElement | null | undefined, iconName: string): void {
        const mappings = this.settings.get('panelMappings').slice();
        const lookupId = sourceId.startsWith('id:') ? sourceId.substring(3) : sourceId.startsWith('class:') ? sourceId.substring(6) : sourceId;
        const mapping = mappings.find(m => m.id === lookupId || m.id === sourceId);
        if (mapping) {
            mapping.icon = iconName;
            this.debouncedSettingsUpdate(mappings);
        }
        if (tabElement) {
            let iconEl: Element | null = tabElement.querySelector(SELECTORS.TAB_ICON);
            if (iconName) {
                if (!iconEl) {
                    iconEl = createIconElement(iconName);
                    if (iconEl) tabElement.prepend(iconEl);
                } else {
                    iconEl.className = SELECTORS.TAB_ICON.substring(1);
                    if (iconName.startsWith('fa-')) {
                        iconEl.classList.add('fa-solid', ...iconName.split(' '));
                        iconEl.textContent = '';
                    } else {
                        iconEl.textContent = iconName;
                    }
                }
            } else if (iconEl) {
                iconEl.remove();
            }
        }
        if (this.rootElement) {
            const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(sourceId) : sourceId.replace(/"/g, '\\"');
            const editorBtns = this.rootElement.querySelectorAll<HTMLElement>(`${SELECTORS.EDITOR_TAB}[data-source-id="${escaped}"] ${SELECTORS.ICON_PICKER_BTN}`);
            editorBtns.forEach(btn => this.updateIconBtn(btn, iconName));
        }
    }

    attachTouchDragListeners(container: HTMLElement, pid: string | null = null): void {
        container.addEventListener('touchstart', (e) => this.handleTouchStart(e, pid), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
    }

    attachDragListeners(container: HTMLElement): void {
        container.addEventListener('dragover', this.handleDragOver.bind(this));
        container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        container.addEventListener('drop', (e) => this.handleDrop(e));
    }

    attachSettingsButtonListener(
        button: HTMLElement,
        sourceId: string,
        tabElement: HTMLElement | null,
        container: HTMLElement,
        isHidden = false,
    ): void {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTabSettingsDialog(sourceId, tabElement, container, isHidden);
        });
    }

    cleanup(): void {
        if (this.editorFrame !== null) cancelAnimationFrame(this.editorFrame);
        this.editorFrame = null;
        this.editorVisibilityObserver?.disconnect();
        this.editorVisibilityObserver = null;
        if (this._layoutChangeHandler) {
            window.removeEventListener(EVENTS.LAYOUT_CHANGED, this._layoutChangeHandler);
            this._layoutChangeHandler = null;
        }
        if (this._settingsCheckboxSyncHandler) {
            window.removeEventListener(EVENTS.SETTINGS_CHANGED, this._settingsCheckboxSyncHandler);
            this._settingsCheckboxSyncHandler = null;
        }
        if (this._openSettingsHandler) {
            window.removeEventListener(EVENTS.OPEN_TAB_SETTINGS, this._openSettingsHandler);
            this._openSettingsHandler = null;
        }
        if (this.touchDragGhost) {
            this.touchDragGhost.remove();
            this.touchDragGhost = null;
        }
    }
}
