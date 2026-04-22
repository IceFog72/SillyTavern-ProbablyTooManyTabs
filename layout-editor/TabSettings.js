import { el, hexToRgba } from '../utils.js';
import { SELECTORS, EVENTS } from '../constants.js';
import { showFontAwesomePicker } from '../../../../utils.js';

export async function pickIcon(manager, btn, sourceId, tabElement) {
    const mapping = manager.settings.getMapping(sourceId);
    const selectedIcon = await showFontAwesomePicker();
    if (selectedIcon) {
        manager.updateIconBtn(btn, selectedIcon);
        manager.saveIconToMapping(sourceId, tabElement, selectedIcon);
    }
}

export function openTabSettingsDialog(manager, sourceId, tabElement, tabRow, isPendingOrHidden = false) {
    if (!sourceId) return;

    const existing = document.getElementById('ptmt-view-settings-dialog') || document.getElementById('ptmt-tab-settings-dialog');
    if (existing) existing.remove();

    const mappings = manager.settings.get('panelMappings');
    const mapping = mappings.find(m => m.id === sourceId) || { id: sourceId, title: sourceId };
    const currentTitle = mapping.title || sourceId;
    const currentColor = mapping.color || '#00000000';

    const createField = (labelText, helpText, input) => {
        const wrapper = el('div', { className: 'ptmt-vs-field' });
        const labelEl = el('label', { className: 'ptmt-vs-label' }, labelText);
        if (helpText) {
            labelEl.title = helpText;
            labelEl.style.cursor = 'help';
        }
        const inputWrapper = el('div', { className: 'ptmt-vs-input-wrapper' }, input);
        if (helpText) {
            inputWrapper.appendChild(el('span', { className: 'ptmt-vs-help-icon', title: helpText }, '?'));
        }
        wrapper.append(labelEl, inputWrapper);
        return wrapper;
    };

    const titleInput = el('input', {
        type: 'text',
        value: currentTitle,
        id: 'ptmt-ts-title',
        className: 'text_edit',
        placeholder: 'Enter tab name...'
    });

    const iconBtn = el('button', {
        className: 'ptmt-icon-picker-btn',
        id: 'ptmt-ts-icon-btn',
        type: 'button',
        title: 'Choose icon'
    });

    const colorValue = (currentColor && currentColor.length >= 7) ? currentColor : '#000000';

    // Ensure toolcool-color-picker script is loaded
    if (typeof customElements !== 'undefined' && !customElements.get('toolcool-color-picker')) {
        const script = document.createElement('script');
        script.src = '/lib/toolcool-color-picker.js';
        document.head.appendChild(script);
    }

    // Track current color value for save/reset operations
    let currentColorValue = colorValue;

    // Create toolcool-color-picker with base attributes
    const colorInput = el('toolcool-color-picker', {
        id: 'ptmt-ts-color',
        'popup-position': 'left',
        'button-width': '40px',
        'button-height': '32px'
    });

    // Explicitly set color attribute for proper initialization
    colorInput.setAttribute('color', colorValue);

    const saveBtn = el('button', {
        id: 'ptmt-ts-save',
        className: 'ptmt-vs-button primary',
        type: 'button'
    },
        el('i', { className: 'fa-solid fa-floppy-disk', style: { marginRight: '6px' } }),
        'Save'
    );

    const cancelBtn = el('button', {
        id: 'ptmt-ts-cancel',
        className: 'ptmt-vs-button secondary',
        type: 'button'
    }, 'Cancel');

    const footer = el('div', { className: 'ptmt-vs-footer' }, saveBtn, cancelBtn);

    const dialog = el('div', { id: 'ptmt-tab-settings-dialog', className: 'ptmt-view-settings-dialog' },
        el('div', { className: 'ptmt-vs-content' },
            el('h3', { className: 'ptmt-vs-title' },
                el('i', { className: 'fa-solid fa-tag', style: { marginRight: '8px' } }),
                'Tab Settings'
            ),
            el('div', { className: 'ptmt-vs-section' },
                el('h4', { className: 'ptmt-vs-section-title' },
                    el('i', { className: 'fa-solid fa-id-card', style: { marginRight: '6px' } }),
                    'Identification'
                ),
                el('div', { className: 'ptmt-vs-id-section', style: { padding: '0' } },
                    el('div', { className: 'ptmt-vs-label', style: { margin: '0' } }, 'Internal ID'),
                    el('div', { className: 'ptmt-vs-id-display', style: { margin: '0' } },
                        el('span', { className: 'ptmt-vs-id-value' }, sourceId),
                        el('button', {
                            className: 'ptmt-vs-copy-btn',
                            title: 'Copy ID to clipboard',
                            type: 'button'
                        },
                            el('i', { className: 'fa-solid fa-copy', style: { marginRight: '4px' } })
                        )
                    )
                )
            ),
            el('div', { className: 'ptmt-vs-section' },
                el('h4', { className: 'ptmt-vs-section-title' },
                    el('i', { className: 'fa-solid fa-palette', style: { marginRight: '6px' } }),
                    'Appearance'
                ),
                createField('Tab Title', 'Custom name displayed on the tab', titleInput),
                createField('Tab Icon', 'Click to choose FontAwesome icon', iconBtn),
                el('div', { className: 'ptmt-vs-field' },
                    el('label', { className: 'ptmt-vs-label' }, 'Highlight Color'),
                    el('div', { className: 'ptmt-vs-input-wrapper' },
                        colorInput,
                        el('button', {
                            className: 'ptmt-vs-button ptmt-ts-color-reset',
                            id: 'ptmt-ts-color-reset',
                            type: 'button',
                            title: 'Reset to default'
                        },
                            el('i', { className: 'fa-solid fa-rotate-right', style: { marginRight: '4px' } })
                        )
                    )
                )
            ),
            footer
        )
    );

    // Setup copy button
    const copyBtn = dialog.querySelector('.ptmt-vs-copy-btn');
    copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(sourceId).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1500);
        }).catch(err => console.warn('[PTMT] Failed to copy:', err));
    });

    // Setup icon button
    const currentIcon = mapping.icon || '';
    manager.updateIconBtn(iconBtn, currentIcon);
    iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pickIcon(manager, iconBtn, sourceId, tabElement);
    });

    // Setup color reset (only track reset state, don't update on every color change)
    let colorReset = !mapping.color;
    const colorResetBtn = dialog.querySelector('#ptmt-ts-color-reset');
    colorResetBtn.addEventListener('click', () => {
        const resetColor = '#00000000';
        currentColorValue = resetColor;
        colorInput.setAttribute('color', resetColor);
        colorReset = true;
        colorResetBtn.style.opacity = '0.5';
    });

    // Capture color when color picker change finalizes
    colorInput.addEventListener('change', (evt) => {
        colorReset = false;
        colorResetBtn.style.opacity = '1';
        // Get color from event details (hex8 for RGBA or hex for RGB)
        currentColorValue = evt.detail?.hex8 || evt.detail?.hex || currentColorValue;
    });

    // Ensure toolcool-color-picker popup escapes dialog scrolling
    // Watch for popup creation and reposition it as fixed
    const observePopup = () => {
        const popup = document.querySelector('toolcool-color-picker-popup');
        if (popup && popup.parentElement) {
            popup.style.position = 'fixed';
            popup.style.zIndex = '20001';
        }
    };

    colorInput.addEventListener('click', () => setTimeout(observePopup, 50));

    // Setup save/cancel handlers
    cancelBtn.addEventListener('click', () => dialog.remove());
    saveBtn.addEventListener('click', () => {
        const newTitle = titleInput.value.trim();
        const newColor = colorReset ? null : currentColorValue;

        if (newTitle !== currentTitle || newColor !== mapping.color) {
            const updatedMappings = manager.settings.get('panelMappings').slice();
            let m = updatedMappings.find(item => item.id === sourceId);
            if (!m) {
                // Preserve icon and other properties from the current mapping when creating a new entry
                m = { ...mapping, id: sourceId, title: newTitle, color: newColor };
                updatedMappings.push(m);
            } else {
                m.title = newTitle;
                m.color = newColor;
            }
            manager.debouncedSettingsUpdate(updatedMappings);

            const liveTabs = document.querySelectorAll(SELECTORS.TAB);
            liveTabs.forEach(liveTab => {
                const pid = liveTab.dataset.for;
                const panel = manager.appApi.getPanelById(pid);
                if (panel?.dataset.sourceId === sourceId) {
                    const lbl = liveTab.querySelector(SELECTORS.TAB_LABEL);
                    if (lbl) lbl.textContent = newTitle || sourceId;
                    const bg = liveTab.querySelector('.ptmt-tab-bg');
                    if (bg) bg.style.backgroundColor = newColor ? hexToRgba(newColor) : '';
                }
            });

            const editorRows = document.querySelectorAll(SELECTORS.EDITOR_TAB);
            editorRows.forEach(row => {
                if (row.dataset.sourceId !== sourceId) return;
                const lbl = row.querySelector(SELECTORS.TAB_LABEL);
                if (lbl) lbl.textContent = newTitle || sourceId;
                const bg = row.querySelector('.ptmt-tab-bg');
                if (bg) bg.style.backgroundColor = newColor ? hexToRgba(newColor) : '';
            });
        }
        dialog.remove();
    });

    // Auto-focus title field for better UX
    titleInput.focus();
    titleInput.select();

    // Append dialog to DOM
    document.body.appendChild(dialog);

    // Keyboard shortcuts
    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dialog.remove();
        if (e.key === 'Enter') saveBtn?.click();
    });
}
