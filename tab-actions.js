// tab-actions.js
export const tabActions = {
    'gallery': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] Gallery panel initialized.', panel);
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] Gallery panel selected.', panel);

        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] Gallery tab collapsed.', panel);
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] Gallery tab opened.', panel);
        },
    },
    'notebookPanel': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] notebookPanel panel initialized.', panel);
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] notebookPanel panel selected.', panel);

        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] notebookPanel tab collapsed.', panel);
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] notebookPanel tab opened.', panel);
        },
    },
    'character_popup': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] character_popup panel initialized.', panel);
            //if (!is_advanced_char_open) {
            //   is_advanced_char_open = true;
            $('#character_popup').css({ 'display': 'flex' }).addClass('open');
            // }
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] character_popup panel selected.', panel);


        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] character_popup tab collapsed.', panel);
            //if (is_advanced_char_open) {
            //   is_advanced_char_open = false;
            $('#character_popup').css('display', 'none').removeClass('open');
            //}
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] character_popup tab opened.', panel);
            $('#character_popup').css({ 'display': 'flex', 'opacity': 100.0 }).addClass('open');
        },
    },
    'extensionSideBar': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] extensionSideBar panel initialized.', panel);

        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] extensionSideBar panel selected.', panel);

        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] extensionSideBar tab collapsed.', panel);

        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] extensionSideBar tab opened.', panel);
              const sidebar = document.getElementById('extensionSideBar');
            if (!sidebar) return;

            const toggleButton = document.getElementById('extensionTopBarToggleSidebar');
            if (!toggleButton) return;

            const isVisible = sidebar.classList.contains('draggable') && sidebar.classList.contains('visible');

            if (!isVisible) {
                console.log('[PTMT] Sidebar is not visible, attempting to open it.');
                toggleButton.click();
            }
        },
    },

};

/**
 * Runs a specified action for a tab.
 * @param {string} sourceId The source element ID of the panel.
 * @param {'onInit'|'onSelect'|'onCollapse'|'onOpen'} actionType The type of action to run.
 * @param {HTMLElement} panel The panel element associated with the tab.
 */
export function runTabAction(sourceId, actionType, panel) {
    if (!sourceId || !panel) return;

    const actions = tabActions[sourceId];
    if (actions && typeof actions[actionType] === 'function') {
        try {
            actions[actionType](panel);
        } catch (e) {
            console.error(`[PTMT-Actions] Error running action '${actionType}' for tab '${sourceId}':`, e);
        }
    }
}