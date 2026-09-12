// tab-actions.js

// RPG Companion decides mobile vs desktop from window.innerWidth. PTMT only
// overrides that signal while the RPG panel is actually open/selected and
// restores the original descriptor as soon as the panel collapses.
let _rpgInnerWidthRestore = null;

function forceRpgDesktop() {
    if (_rpgInnerWidthRestore) return;

    const ownDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(Window.prototype, 'innerWidth');
    const effectiveDescriptor = ownDescriptor || prototypeDescriptor;
    const nativeGet = effectiveDescriptor?.get;
    const readReal = nativeGet
        ? () => nativeGet.call(window)
        : () => document.documentElement.clientWidth;

    try {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            get() { return Math.max(readReal(), 1001); },
        });
    } catch (error) {
        console.warn('[PTMT] Unable to clamp innerWidth for RPG Companion:', error);
        return;
    }

    _rpgInnerWidthRestore = () => {
        try {
            if (ownDescriptor) Object.defineProperty(window, 'innerWidth', ownDescriptor);
            else delete window.innerWidth;
        } catch (error) {
            console.warn('[PTMT] Unable to restore innerWidth after RPG Companion:', error);
        } finally {
            _rpgInnerWidthRestore = null;
        }
        window.dispatchEvent(new Event('resize'));
    };

    window.dispatchEvent(new Event('resize'));
}

function restoreRpgDesktopOverride() {
    _rpgInnerWidthRestore?.();
}

// charlib-embedded-container start
let _charLibListenerAttached = false;
let _charLibEmbeddedVisible = false;
let _charLibMessageHandler = null;

// AbortControllers to prevent listener leaks in onInit handlers
let _characterPopupAC = null;
let _mainContentAC = null;

function ensureCharLibCloseListener() {
    if (_charLibListenerAttached) return;
    _charLibListenerAttached = true;
    _charLibMessageHandler = (e) => {
        if (e.origin !== window.location.origin) return;
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.source === 'character-library' && msg.type === 'cl-close') {
            _charLibEmbeddedVisible = false;
            window.dispatchEvent(new CustomEvent('ptmt:charlibClosed'));
        }
    };
    window.addEventListener('message', _charLibMessageHandler);
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

// expressions_plus_carousel_body overrides start
function hideExpressionsPlusCarouselFrame() {
    const container = document.getElementById('expressions_plus_carousel_panel');
    container?.remove();
}
// expressions_plus_carousel_body overrides end

const tabActions = {
    gallery: {
        onInit: (_panel) => {}, onSelect: (_panel) => {}, onCollapse: (_panel) => {}, onOpen: (_panel) => {},
    },
    notebookPanel: {
        onInit: (_panel) => {}, onSelect: (_panel) => {}, onCollapse: (_panel) => {}, onOpen: (_panel) => {},
    },
    character_popup: {
        onInit: (panel) => {
            $('#character_popup').css({ display: 'flex' }).addClass('open');
            _characterPopupAC?.abort();
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
        onSelect: () => $('#character_popup').css({ display: 'flex', opacity: 1 }).addClass('open'),
        onCollapse: () => $('#character_popup').css('display', 'none').removeClass('open'),
        onOpen: () => $('#character_popup').css({ display: 'flex', opacity: 1 }).addClass('open'),
    },
    extensionSideBar: {
        onInit: (_panel) => {},
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {},
        onOpen: () => {
            const sidebar = document.getElementById('extensionSideBar');
            const toggleButton = document.getElementById('extensionTopBarToggleSidebar');
            if (!sidebar || !toggleButton) return;
            const isVisible = sidebar.classList.contains('draggable') && sidebar.classList.contains('visible');
            if (!isVisible) toggleButton.click();
        },
    },
    'stqrd--drawer-v2': {
        onInit: () => ensureQuickRepliesPopout(),
        onSelect: () => ensureQuickRepliesPopout(),
        onCollapse: (_panel) => {},
        onOpen: () => ensureQuickRepliesPopout(),
    },
    'ptmt-main-content': {
        onInit: (panel) => {
            _mainContentAC?.abort();
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
            panel._charlibAC?.abort();
            panel._charlibAC = new AbortController();

            window.addEventListener('ptmt:charlibClosed', () => {
                const pid = panel.dataset.panelId;
                if (pid) window.ptmtTabs?.closeTabById(pid);
            }, { signal: panel._charlibAC.signal });

            panel._charlibObserver?.disconnect();
            const observer = new MutationObserver(() => {
                const settingsPanel = document.getElementById('charlib-settings-injected');
                if (!settingsPanel) return;
                observer.disconnect();
                panel._charlibObserver = null;

                const exclusiveCheckbox = document.getElementById('charlib-exclusive-panes');
                const topbarCheckbox = document.getElementById('charlib-show-topbar');
                if (!exclusiveCheckbox || !topbarCheckbox) return;
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
        onSelect: () => showCharLibEmbedded(),
        onCollapse: () => hideCharLibEmbedded(),
        onOpen: () => showCharLibEmbedded(),
    },
    'rpg-companion-panel': {
        // Do not clamp onInit: panels are initialized even while hidden.
        onInit: (_panel) => {},
        onSelect: () => forceRpgDesktop(),
        onCollapse: () => restoreRpgDesktopOverride(),
        onOpen: () => {
            forceRpgDesktop();
            document.querySelector('.rpg-mobile-overlay')?.remove();
            document.getElementById('rpg-mobile-toggle')?.click();
        },
    },
    expressions_plus_carousel_body: {
        onInit: () => hideExpressionsPlusCarouselFrame(),
        onSelect: (_panel) => {},
        onCollapse: (_panel) => {},
        onOpen: (_panel) => {},
    },
};

function ensureQuickRepliesPopout() {
    const settings = document.getElementById('qr--settings');
    if (settings && getComputedStyle(settings).display !== 'none') {
        document.querySelector('.stqrd--action.stqrd--popout')?.click();
    }
}

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
        } catch (error) {
            console.error(`[PTMT-Actions] Error running action '${actionType}' for tab '${sourceId}':`, error);
        }
    }
}

/** Best-effort teardown for global hooks owned by tab actions. */
export function cleanupTabActions() {
    restoreRpgDesktopOverride();
    _characterPopupAC?.abort();
    _mainContentAC?.abort();
    _characterPopupAC = null;
    _mainContentAC = null;
    if (_charLibMessageHandler) window.removeEventListener('message', _charLibMessageHandler);
    _charLibMessageHandler = null;
    _charLibListenerAttached = false;
    _charLibEmbeddedVisible = false;
    document.querySelectorAll('.ptmt-panel').forEach(panel => {
        panel._charlibAC?.abort?.();
        panel._charlibObserver?.disconnect?.();
        panel._charlibAC = null;
        panel._charlibObserver = null;
    });
}
