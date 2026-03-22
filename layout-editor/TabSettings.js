import { el } from '../utils.js';
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

    const dialog = el('div', { id: 'ptmt-view-settings-dialog', className: 'ptmt-view-settings-dialog' },
        el('div', null,
            el('h3', null, 'Tab Settings'),
            el('div', { className: 'ptmt-vs-row ptmt-vs-id-row' },
                el('label', null, 'Internal ID: '),
                el('span', { className: 'ptmt-vs-id-value' }, sourceId)
            ),
            el('div', { className: 'ptmt-vs-row' },
                el('label', { for: 'ptmt-ts-title' }, 'Tab Title: '),
                el('input', { type: 'text', value: currentTitle, id: 'ptmt-ts-title', className: 'text_edit', placeholder: 'Enter tab name...' })
            ),
            el('div', { className: 'ptmt-vs-row' },
                el('label', { for: 'ptmt-ts-icon' }, 'Tab Icon: '),
                el('button', { className: 'ptmt-icon-picker-btn', id: 'ptmt-ts-icon-btn', type: 'button', title: 'Choose icon' })
            ),
            el('div', { className: 'ptmt-vs-row' },
                el('label', { for: 'ptmt-ts-color' }, 'Tab Color (Tint): '),
                el('input', { type: 'color', value: (currentColor && currentColor.length === 7) ? currentColor : '#000000', id: 'ptmt-ts-color', className: 'text_edit' }),
                el('button', { className: 'ptmt-vs-button ptmt-vs-button-reset', id: 'ptmt-ts-color-reset' }, 'Reset')
            ),
            el('div', { className: 'ptmt-vs-footer' },
                el('button', { id: 'ptmt-ts-save', className: 'ptmt-vs-button primary' }, 'Save'),
                el('button', { id: 'ptmt-ts-cancel', className: 'ptmt-vs-button' }, 'Cancel')
            )
        )
    );

    document.body.appendChild(dialog);
    const input = dialog.querySelector('#ptmt-ts-title');
    if (input) {
        input.focus();
        input.select();
    }

    const iconBtn = dialog.querySelector('#ptmt-ts-icon-btn');
    const currentIcon = mapping.icon || '';
    manager.updateIconBtn(iconBtn, currentIcon);

    iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pickIcon(manager, iconBtn, sourceId, tabElement);
    });

    const colorInput = dialog.querySelector('#ptmt-ts-color');
    let colorReset = !mapping.color;
    dialog.querySelector('#ptmt-ts-color-reset').addEventListener('click', () => {
        colorInput.value = '#000000';
        colorReset = true;
    });
    colorInput.addEventListener('input', () => { colorReset = false; });

    const saveBtn = dialog.querySelector('#ptmt-ts-save');
    const cancelBtn = dialog.querySelector('#ptmt-ts-cancel');

    if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.remove());
    if (saveBtn) saveBtn.addEventListener('click', () => {
        const newTitle = input.value.trim();
        const newColor = colorReset ? null : colorInput.value;

        if (newTitle !== currentTitle || newColor !== mapping.color) {
            const updatedMappings = manager.settings.get('panelMappings').slice();
            let m = updatedMappings.find(item => item.id === sourceId);
            if (!m) {
                m = { id: sourceId, title: newTitle, color: newColor };
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
                    if (bg) bg.style.backgroundColor = newColor;
                }
            });

            const editorRows = document.querySelectorAll(SELECTORS.EDITOR_TAB);
            editorRows.forEach(row => {
                if (row.dataset.sourceId !== sourceId) return;
                const lbl = row.querySelector(SELECTORS.TAB_LABEL);
                if (lbl) lbl.textContent = newTitle || sourceId;
                const bg = row.querySelector('.ptmt-tab-bg');
                if (bg) bg.style.backgroundColor = newColor;
            });
        }
        dialog.remove();
    });

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') dialog.remove();
            if (e.key === 'Enter') saveBtn?.click();
        });
    }
}
