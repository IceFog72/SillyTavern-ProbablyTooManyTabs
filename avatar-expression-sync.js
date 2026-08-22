import { settings } from './settings.js';
import { SELECTORS } from './constants.js';
import { eventSource, event_types } from '../../../../script.js';

let observer = null;
let retryTimer = null;
let initialized = false;
const delayedTimers = new Set();

function clearDelayedTimers() {
    for (const timer of delayedTimers) clearTimeout(timer);
    delayedTimers.clear();
}

function scheduleAvatarUpdate(delay = 100) {
    const timer = setTimeout(() => {
        delayedTimers.delete(timer);
        updateLastMessageAvatar();
    }, delay);
    delayedTimers.add(timer);
}

function handleSettingsChanged(e) {
    if (e.detail?.changed?.includes('enableAvatarExpressionSync') && settings.get('enableAvatarExpressionSync')) {
        updateLastMessageAvatar();
    }
}

function handleCharacterMessageRendered() {
    if (settings.get('enableAvatarExpressionSync')) scheduleAvatarUpdate();
}

function handleMessageUpdated() {
    if (settings.get('enableAvatarExpressionSync')) scheduleAvatarUpdate();
}

export function cleanupAvatarExpressionSync() {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    clearDelayedTimers();
    observer?.disconnect();
    observer = null;
    if (initialized) {
        window.removeEventListener('ptmt:settingsChanged', handleSettingsChanged);
        try { eventSource.off(event_types.CHARACTER_MESSAGE_RENDERED, handleCharacterMessageRendered); } catch {}
        try { eventSource.off(event_types.MESSAGE_UPDATED, handleMessageUpdated); } catch {}
    }
    initialized = false;
}

/** Initializes Avatar/Expression synchronization with fully reversible listeners/timers. */
export function initAvatarExpressionSync() {
    cleanupAvatarExpressionSync();
    initialized = true;

    let retryCount = 0;
    const MAX_RETRIES = 15;

    const startObserving = () => {
        retryTimer = null;
        if (!initialized) return;
        const expressionHolder = document.querySelector('#expression-holder, #expression-plus-holder');
        if (!expressionHolder) {
            if (retryCount++ >= MAX_RETRIES) {
                console.warn('[PTMT] Avatar-Expression Sync: expression holder not found after max retries.');
                return;
            }
            retryTimer = setTimeout(startObserving, 2000);
            return;
        }

        observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    const added = Array.from(mutation.addedNodes).some(node =>
                        node instanceof Element && node.matches('#expression-image, .expression'));
                    const removed = Array.from(mutation.removedNodes).some(node =>
                        node instanceof Element && node.matches('#expression-plus-image, .expression-plus.expression-plus-animating'));
                    if (added || removed) shouldUpdate = true;
                }
                if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'data-expression')) {
                    const target = mutation.target;
                    if (target instanceof Element && (target.id === 'expression-image' || target.matches('.expression, .expression-plus'))) {
                        shouldUpdate = true;
                    }
                }
            }
            if (shouldUpdate) updateLastMessageAvatar();
        });

        observer.observe(expressionHolder, {
            childList: true,
            attributes: true,
            subtree: true,
            attributeFilter: ['src', 'data-expression'],
        });
    };

    startObserving();
    window.addEventListener('ptmt:settingsChanged', handleSettingsChanged);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleCharacterMessageRendered);
    eventSource.on(event_types.MESSAGE_UPDATED, handleMessageUpdated);
}

function updateLastMessageAvatar() {
    if (!settings.get('enableAvatarExpressionSync')) return;
    const expressionImg = document.querySelector(SELECTORS.ST_EXPRESSION_IMAGE);
    if (!expressionImg || !expressionImg.src) return;
    const messages = Array.from(document.querySelectorAll(`${SELECTORS.ST_MESSAGE}[is_user="false"]`));
    if (!messages.length) return;
    const lastMes = messages[messages.length - 1];
    const charFolder = expressionImg.getAttribute('data-sprite-folder-name');
    const mesAuthorUid = lastMes.getAttribute('xdc-author-uid');
    const chName = lastMes.getAttribute('ch_name');
    const matchesFolder = charFolder && mesAuthorUid && mesAuthorUid.toLowerCase().includes(charFolder.toLowerCase());
    const matchesName = charFolder && chName && chName.toLowerCase() === charFolder.toLowerCase();
    if (matchesFolder || matchesName) {
        const avatarImg = lastMes.querySelector(`${SELECTORS.ST_AVATAR} img`);
        if (avatarImg && avatarImg.src !== expressionImg.src) avatarImg.src = expressionImg.src;
    }
}
