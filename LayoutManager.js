// LayoutManager.js - Orchestrator for PTMT layout management
// Refactored from monolithic class to composition of focused components

import { SettingsUIRenderer } from './SettingsUIRenderer.js';
import { LayoutEditorRenderer } from './LayoutEditorRenderer.js';
import { DragDropManager } from './DragDropManager.js';
import { debounce } from './utils.js';

/** @typedef {import('./types.js').PTMTAPI} PTMTAPI */
/** @typedef {import('./settings.js').SettingsManager} SettingsManager */

/**
 * LayoutManager - Main entry point for layout management
 * 
 * This class now acts as a facade/orchestrator that coordinates between:
 * - SettingsUIRenderer: Renders global settings panel UI
 * - LayoutEditorRenderer: Renders the visual layout editor
 * - DragDropManager: Handles all drag-drop and touch interactions
 */
export class LayoutManager {
    /**
     * @param {PTMTAPI} appApi - PTMT API instance
     * @param {SettingsManager} settingsManager - Settings manager instance
     */
    constructor(appApi, settingsManager) {
        this.appApi = appApi;
        this.settings = settingsManager;
        
        // Initialize specialized renderers
        this.settingsUIRenderer = new SettingsUIRenderer(settingsManager, appApi);
        this.layoutEditorRenderer = new LayoutEditorRenderer(settingsManager, appApi);
        this.dragDropManager = new DragDropManager(
            this.layoutEditorRenderer,
            appApi,
            settingsManager
        );
        
        // Create debounced settings update and inject into renderers
        this.debouncedSettingsUpdate = debounce((updatedMappings) => {
            settingsManager.update({ panelMappings: updatedMappings });
        }, 400);
        this.layoutEditorRenderer.setDebouncedSettingsUpdate(this.debouncedSettingsUpdate);
        
        // Bind layout change handler
        this._layoutChangeHandler = () => this.renderUnifiedEditor();
    }

    /**
     * Creates and returns the settings panel
     * This is the main entry point used by snapshot.js and other consumers
     * @returns {HTMLElement}
     */
    createSettingsPanel() {
        const panel = this.settingsUIRenderer.createSettingsPanel();
        
        // Connect root elements
        this.layoutEditorRenderer.rootElement = panel;
        
        // Render the unified editor inside the panel
        this.renderUnifiedEditor();
        
        // Attach layout change listener
        window.addEventListener('ptmt:layoutChanged', this._layoutChangeHandler);
        
        return panel;
    }

    /**
     * Renders the unified visual editor showing columns, panes, and tabs
     * Delegates to LayoutEditorRenderer
     */
    renderUnifiedEditor() {
        this.layoutEditorRenderer.renderUnifiedEditor();
        
        // After rendering, attach drag-drop listeners to all interactive elements
        this.attachDragDropListeners();
    }

    /**
     * Attaches drag-drop event listeners to rendered elements
     */
    attachDragDropListeners() {
        const rootEl = this.layoutEditorRenderer.rootElement;
        if (!rootEl) return;
        
        // Attach to all tab elements (both live and pending)
        rootEl.querySelectorAll('.ptmt-editor-tab').forEach(tabEl => {
            const pid = tabEl.dataset.pid;
            this.dragDropManager.attachListeners(tabEl, pid);
        });
        
        // Attach to hidden tab elements
        rootEl.querySelectorAll('[data-is-hidden-item="true"]').forEach(tabEl => {
            this.dragDropManager.attachListeners(tabEl);
        });
        
        // Attach to pending tab elements
        rootEl.querySelectorAll('[data-is-pending="true"]').forEach(tabEl => {
            this.dragDropManager.attachListeners(tabEl);
        });
        
        // Attach to pane containers for dropping
        rootEl.querySelectorAll('.ptmt-editor-pane').forEach(paneEl => {
            this.dragDropManager.attachListeners(paneEl);
        });
        
        // Attach to tabs containers
        rootEl.querySelectorAll('.ptmt-editor-tabs-container').forEach(container => {
            this.dragDropManager.attachListeners(container);
        });
    }

    /**
     * Cleanup method - removes all event listeners and resources
     */
    cleanup() {
        // Remove layout change listener
        if (this._layoutChangeHandler) {
            window.removeEventListener('ptmt:layoutChanged', this._layoutChangeHandler);
            this._layoutChangeHandler = null;
        }
        
        // Cleanup all renderers
        this.settingsUIRenderer.cleanup();
        this.layoutEditorRenderer.cleanup();
        this.dragDropManager.cleanup();
    }

    // ==========================================
    // Backward Compatibility Properties
    // ==========================================

    /**
     * Gets the root element (delegates to SettingsUIRenderer)
     * @returns {HTMLElement|null}
     */
    get rootElement() {
        return this.settingsUIRenderer.rootElement;
    }

    /**
     * Sets the root element (delegates to both renderers)
     * @param {HTMLElement|null} el
     */
    set rootElement(el) {
        this.settingsUIRenderer.rootElement = el;
        this.layoutEditorRenderer.rootElement = el;
    }

    // ==========================================
    // Backward Compatibility Methods
    // These delegate to the appropriate specialized renderer
    // ==========================================

    /**
     * Creates a setting checkbox (delegates to SettingsUIRenderer)
     * @param {string} labelText
     * @param {string} settingKey
     * @returns {HTMLElement}
     */
    createSettingCheckbox(labelText, settingKey) {
        return this.settingsUIRenderer.createSettingCheckbox(labelText, settingKey);
    }

    /**
     * Creates the mobile toggle button (delegates to SettingsUIRenderer)
     * @param {boolean} isMobile
     * @returns {HTMLElement}
     */
    createMobileToggleButton(isMobile) {
        return this.settingsUIRenderer.createMobileToggleButton(isMobile);
    }

    /**
     * Creates the reset button (delegates to SettingsUIRenderer)
     * @returns {HTMLElement}
     */
    createResetButton() {
        return this.settingsUIRenderer.createResetButton();
    }

    /**
     * Renders a column (delegates to LayoutEditorRenderer)
     * @param {string} name
     * @param {string} title
     * @param {HTMLElement} element
     * @param {boolean} [isHidden]
     * @returns {HTMLElement}
     */
    renderColumn(name, title, element, isHidden = false) {
        return this.layoutEditorRenderer.renderColumn(name, title, element, isHidden);
    }

    /**
     * Renders a tree element (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} element
     * @returns {HTMLElement|null}
     */
    renderTreeElement(element) {
        return this.layoutEditorRenderer.renderTreeElement(element);
    }

    /**
     * Renders a split (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderSplit(element) {
        return this.layoutEditorRenderer.renderSplit(element);
    }

    /**
     * Renders a pane (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} element
     * @returns {HTMLElement}
     */
    renderPane(element) {
        return this.layoutEditorRenderer.renderPane(element);
    }

    /**
     * Renders a tab (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} tabElement
     * @param {HTMLElement} paneElement
     * @returns {HTMLElement}
     */
    renderTab(tabElement, paneElement) {
        return this.layoutEditorRenderer.renderTab(tabElement, paneElement);
    }

    /**
     * Renders the hidden column (delegates to LayoutEditorRenderer)
     * @returns {HTMLElement}
     */
    renderHiddenColumn() {
        return this.layoutEditorRenderer.renderHiddenColumn();
    }

    /**
     * Renders a hidden tab (delegates to LayoutEditorRenderer)
     * @param {string|Object} entry
     * @returns {HTMLElement}
     */
    renderHiddenTab(entry) {
        return this.layoutEditorRenderer.renderHiddenTab(entry);
    }

    /**
     * Renders pending tree element (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} element
     * @param {string} columnName
     * @returns {HTMLElement|null}
     */
    renderPendingTreeElement(element, columnName) {
        return this.layoutEditorRenderer.renderPendingTreeElement(element, columnName);
    }

    /**
     * Renders a pending pane (delegates to LayoutEditorRenderer)
     * @param {HTMLElement} element
     * @param {string} columnName
     * @returns {HTMLElement}
     */
    renderPendingPane(element, columnName) {
        return this.layoutEditorRenderer.renderPendingPane(element, columnName);
    }

    /**
     * Renders a pending tab (delegates to LayoutEditorRenderer)
     * @param {Object} tabInfo
     * @returns {HTMLElement}
     */
    renderPendingTab(tabInfo) {
        return this.layoutEditorRenderer.renderPendingTab(tabInfo);
    }

    // ==========================================
    // Drag-Drop Event Handlers (Backward Compatibility)
    // These delegate to DragDropManager
    // ==========================================

    handleDragStart(e, pid) {
        return this.dragDropManager.handleDragStart(e, pid);
    }

    handleDragOver(e) {
        return this.dragDropManager.handleDragOver(e);
    }

    handleDragLeave(e) {
        return this.dragDropManager.handleDragLeave(e);
    }

    handleDrop(e) {
        return this.dragDropManager.handleDrop(e);
    }

    handleLiveToLiveDrop(targetContainer, newIndex) {
        return this.dragDropManager.handleLiveToLiveDrop(targetContainer, newIndex);
    }

    handleRestoreHiddenToLive(targetContainer, newIndex) {
        return this.dragDropManager.handleRestoreHiddenToLive(targetContainer, newIndex);
    }

    handleRestorePendingToLive(targetContainer, newIndex) {
        return this.dragDropManager.handleRestorePendingToLive(targetContainer, newIndex);
    }

    handlePendingTabDrop(targetContainer, newIndex) {
        return this.dragDropManager.handlePendingTabDrop(targetContainer, newIndex);
    }

    handleHiddenTabDrop(targetContainer, newIndex) {
        return this.dragDropManager.handleHiddenTabDrop(targetContainer, newIndex);
    }

    handleTouchStart(e, pid) {
        return this.dragDropManager.handleTouchStart(e, pid);
    }

    handleTouchMove(e) {
        return this.dragDropManager.handleTouchMove(e);
    }

    handleTouchEnd(e) {
        return this.dragDropManager.handleTouchEnd(e);
    }

    handleTouchCancel(e) {
        return this.dragDropManager.handleTouchCancel(e);
    }
}
