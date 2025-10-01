// extensions/third-party/PTMT-Tabs/js/tab-actions.js
export const tabActions = {
    'gallery': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] Gallery panel initialized.', panel);
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] Gallery panel selected.', panel);
            // Example: trigger a resize on an element inside gallery if it needs it.
            const gallery = panel.querySelector('#gallery');
            if (gallery) {
                // Some components only resize correctly when they are visible.
                // This hook allows us to trigger that resize.
                window.dispatchEvent(new Event('resize'));
            }
        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] Gallery tab collapsed.', panel);
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] Gallery tab opened.', panel);
        },
    },
    // To add actions for another tab, uncomment and modify the following:
    /*
    'WorldInfo': { 
        onSelect: (panel) => { 
            console.log('[PTMT-Actions] World Info selected. Maybe refresh data?', panel);
        } 
    },
    */
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