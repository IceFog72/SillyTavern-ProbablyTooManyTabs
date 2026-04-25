// tab-actions.js
// charlib-embedded-container start
let _charLibListenerAttached = false;
let _charLibEmbeddedVisible = false;

// AbortControllers to prevent listener leaks in onInit handlers
let _characterPopupAC = null;
let _mainContentAC = null;

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
        onInit: (_panel) => {},
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {},
        onOpen: (_panel) => {},
    },
    'notebookPanel': {
        onInit: (_panel) => {},
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {},
        onOpen: (_panel) => {},
    },
    'character_popup': {
        onInit: (panel) => {
            $('#character_popup').css({ 'display': 'flex' }).addClass('open');
            if (_characterPopupAC) _characterPopupAC.abort();
            _characterPopupAC = new AbortController();
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#advanced_div')) return;
                if (window.ptmtTabs?.isTabHidden?.('character_popup')) {
                    alert('Adv. Definitions tab is hidden.');
                    return;
                }
                window.ptmtTabs?.openTab(panel.dataset.panelId);
            }, { capture: true, signal: _characterPopupAC.signal });
        },
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {
            $('#character_popup').css('display', 'none').removeClass('open');
        },
        onOpen: (_panel) => {
            $('#character_popup').css({ 'display': 'flex', 'opacity': 100.0 }).addClass('open');
        },
    },
    'extensionSideBar': {
        onInit: (_panel) => {},
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {},
        onOpen: (_panel) => {
            const sidebar = document.getElementById('extensionSideBar');
            if (!sidebar) return;
            const toggleButton = document.getElementById('extensionTopBarToggleSidebar');
            if (!toggleButton) return;
            const isVisible = sidebar.classList.contains('draggable') && sidebar.classList.contains('visible');
            if (!isVisible) {
                console.log('[PTMT] extensionSideBar not visible, attempting to open it.');
                toggleButton.click();
            }
        },
    },
    'stqrd--drawer-v2': {
        onInit: (_panel) => {
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) popoutBtn.click();
            }
        },
        onSelect: (_panel) => {
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) popoutBtn.click();
            }
        },
        onCollapse: (_panel) => {},
        onOpen: (_panel) => {
            const settings = document.getElementById('qr--settings');
            if (settings && getComputedStyle(settings).display !== 'none') {
                const popoutBtn = document.querySelector('.stqrd--action.stqrd--popout');
                if (popoutBtn) popoutBtn.click();
            }
        },
    },
    'ptmt-main-content': {
        onInit: (panel) => {
            if (_mainContentAC) _mainContentAC.abort();
            _mainContentAC = new AbortController();
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.chat-action-btn') && !e.target.closest('#editTagsBtn')) return;
                if (window.ptmtTabs?.isTabHidden?.('sheld')) {
                    alert('Main tab is hidden.');
                    return;
                }
                window.ptmtTabs?.openTab(panel.dataset.panelId);
            }, { capture: true, signal: _mainContentAC.signal });
        },
    },
    'charlib-embedded-container': {
        onInit: (panel) => {
            ensureCharLibCloseListener();

            // Abort previous listeners if re-initialized
            if (panel._charlibAC) panel._charlibAC.abort();
            panel._charlibAC = new AbortController();

            window.addEventListener('ptmt:charlibClosed', () => {
                const pid = panel.dataset.panelId;
                if (pid) window.ptmtTabs?.closeTabById(pid);
            }, { signal: panel._charlibAC.signal });

            // Disconnect previous observer if re-initialized
            if (panel._charlibObserver) panel._charlibObserver.disconnect();

            const observer = new MutationObserver(() => {
                const settingsPanel = document.getElementById('charlib-settings-injected');
                if (!settingsPanel) return;
                observer.disconnect();
                panel._charlibObserver = null;

                const exclusiveCheckbox = document.getElementById('charlib-exclusive-panes');
                const topbarCheckbox = document.getElementById('charlib-show-topbar');
                if (!exclusiveCheckbox || !topbarCheckbox) return;

                // Turn off and disable exclusive panes in PTMT mode
                if (exclusiveCheckbox.checked) {
                    exclusiveCheckbox.checked = false;
                    exclusiveCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
                exclusiveCheckbox.disabled = true;
                topbarCheckbox.disabled = false;
            });
            panel._charlibObserver = observer;
            observer.observe(document.body, { childList: true, subtree: true });
        },
        onSelect: (_panel) => { showCharLibEmbedded(); },
        onCollapse: (_panel) => { hideCharLibEmbedded(); },
        onOpen: (_panel) => { showCharLibEmbedded(); },
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


