// tab-actions.js
// charlib-embedded-container start
let _charLibListenerAttached = false;
let _charLibEmbeddedVisible = false;
let _charLibFirstOpen = true;

function ensureCharLibCloseListener() {
    if (_charLibListenerAttached) return;
    _charLibListenerAttached = true;
    window.addEventListener('message', (e) => {
        if (e.origin !== window.location.origin) return;
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.source === 'character-library' && msg.type === 'cl-close') {
            _charLibEmbeddedVisible = false;
            window.dispatchEvent(new CustomEvent('ptmt:charlibClosed'));
        }
    });
}

function showCharLibEmbedded() {
    const container = document.getElementById('charlib-embedded-container');
    if (!container || _charLibEmbeddedVisible) return;
    _charLibEmbeddedVisible = true;
    container.style.display = '';
    if (_charLibFirstOpen) {
        _charLibFirstOpen = false;
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.src) {
            iframe.src = iframe.src;
        }
    }
}

function hideCharLibEmbedded() {
    const container = document.getElementById('charlib-embedded-container');
    if (!container || !_charLibEmbeddedVisible) return;
    _charLibEmbeddedVisible = false;
    container.style.display = 'none';
}
// charlib-embedded-container end

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
    'stqrd--drawer-v2': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] Quick Replies panel initialized.', panel);
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) {
                    console.log('[PTMT-Actions] Triggering Quick Replies popout.');
                    popoutBtn.click();
                }
            }
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] Quick Replies panel selected.', panel);
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) {
                    console.log('[PTMT-Actions] Triggering Quick Replies popout.');
                    popoutBtn.click();
                }
            }
        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] Quick Replies panel collapsed.', panel);
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] Quick Replies panel opened.', panel);
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) {
                    console.log('[PTMT-Actions] Triggering Quick Replies popout.');
                    popoutBtn.click();
                }
            }
        },
    },
    'charlib-embedded-container': {
        onInit: (panel) => {
            console.log('[PTMT-Actions] CharLib panel initialized.', panel);
            ensureCharLibCloseListener();
            window.addEventListener('ptmt:charlibClosed', () => {
                const pid = panel.dataset.panelId;
                if (pid) window.ptmtTabs?.closeTabById(pid);
            });
            const container = document.getElementById('charlib-embedded-container');
            if (container) container.style.display = 'none';

            const observer = new MutationObserver(() => {
                const settingsPanel = document.getElementById('charlib-settings-injected');
                if (!settingsPanel) return;
                observer.disconnect();

                const exclusiveCheckbox = document.getElementById('charlib-exclusive-panes');
                const topbarCheckbox = document.getElementById('charlib-show-topbar');
                if (!exclusiveCheckbox || !topbarCheckbox) return;

                // Turn off exclusive panes in PTMT mode
                if (exclusiveCheckbox.checked) {
                    exclusiveCheckbox.checked = false;
                    exclusiveCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
                topbarCheckbox.disabled = false;

                exclusiveCheckbox.addEventListener('change', () => {
                    topbarCheckbox.disabled = exclusiveCheckbox.checked;
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        },
        onSelect: (panel) => {
            console.log('[PTMT-Actions] CharLib panel selected.', panel);
            showCharLibEmbedded();
        },
        onCollapse: (panel) => {
            console.log('[PTMT-Actions] CharLib panel collapsed.', panel);
            hideCharLibEmbedded();
        },
        onOpen: (panel) => {
            console.log('[PTMT-Actions] CharLib panel opened.', panel);
            showCharLibEmbedded();
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


