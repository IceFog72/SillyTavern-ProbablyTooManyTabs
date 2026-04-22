import { settings as globalSettings } from './settings.js';
import { el, debounce, createIconElement } from './utils.js';
import { SELECTORS, EVENTS } from './constants.js';
import { createSettingsPanel } from './layout-editor/SettingsPanel.js';
import { renderUnifiedEditor } from './layout-editor/EditorRenderer.js';
import { handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleTouchStart, handleTouchMove, handleTouchEnd } from './layout-editor/EditorDragDrop.js';
import { openTabSettingsDialog, pickIcon } from './layout-editor/TabSettings.js';

export class LayoutManager {
    constructor(appApi, settings) {
        this.appApi = appApi;
        this.settings = settings;
        this.rootElement = null;
        this.draggedTabInfo = null;
        this.touchDragGhost = null;
        this.indicator = el('div', { className: SELECTORS.DROP_INDICATOR_CLASS.substring(1) });
        this.debouncedSettingsUpdate = debounce((updatedMappings) => {
            settings.update({ panelMappings: updatedMappings });
        }, 400);

        this._openSettingsHandler = (e) => {
            const { sourceId, tabElement, tabRow } = e.detail;
            this.openTabSettingsDialog(sourceId, tabElement, tabRow, false);
        };
        window.addEventListener(EVENTS.OPEN_TAB_SETTINGS, this._openSettingsHandler);
    }

    createSettingsPanel() { return createSettingsPanel(this); }
    renderUnifiedEditor() { return renderUnifiedEditor(this); }
    handleDragStart(e, pid) { return handleDragStart(this, e, pid); }
    handleDragOver(e) { return handleDragOver(this, e); }
    handleDragLeave(e) { return handleDragLeave(this, e); }
    handleDrop(e) { return handleDrop(this, e); }
    handleTouchStart(e, pid) { return handleTouchStart(this, e, pid); }
    handleTouchMove(e) { return handleTouchMove(this, e); }
    handleTouchEnd(e) { return handleTouchEnd(this, e); }
    openTabSettingsDialog(sid, tel, row, ph) { return openTabSettingsDialog(this, sid, tel, row, ph); }
    pickIcon(btn, sid, tel) { return pickIcon(this, btn, sid, tel); }

    updateIconBtn(btn, iconName) {
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

    saveIconToMapping(sourceId, tabElement, iconName) {
        const mappings = this.settings.get('panelMappings').slice();
        const lookupId = sourceId.startsWith('id:') ? sourceId.substring(3) : sourceId.startsWith('class:') ? sourceId.substring(6) : sourceId;
        const mapping = mappings.find(m => m.id === lookupId || m.id === sourceId);
        if (mapping) {
            mapping.icon = iconName;
            this.debouncedSettingsUpdate(mappings);
        }
        if (tabElement) {
            let iconEl = tabElement.querySelector(SELECTORS.TAB_ICON);
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
            const editorBtns = this.rootElement.querySelectorAll(`${SELECTORS.EDITOR_TAB}[data-source-id="${sourceId}"] ${SELECTORS.ICON_PICKER_BTN}`);
            editorBtns.forEach(btn => this.updateIconBtn(btn, iconName));
        }
    }

    attachTouchDragListeners(container, pid = null) {
        container.addEventListener('touchstart', (e) => this.handleTouchStart(e, pid), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
    }

    attachDragListeners(container) {
        container.addEventListener('dragover', this.handleDragOver.bind(this));
        container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        container.addEventListener('drop', (e) => this.handleDrop(e));
    }

    attachSettingsButtonListener(button, sourceId, tabElement, container, isHidden = false) {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTabSettingsDialog(sourceId, tabElement, container, isHidden);
        });
    }

    cleanup() {
        if (this._layoutChangeHandler) {
            window.removeEventListener(EVENTS.LAYOUT_CHANGED, this._layoutChangeHandler);
            this._layoutChangeHandler = null;
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
