import { settings } from '../core/settings.js';
import { SELECTORS } from '../core/constants.js';
import { eventSource, event_types } from '../../../../../../script.js';
import type { SettingsChangedEventDetail } from '../core/types.js';

let observer: MutationObserver | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let avatarUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAvatarUpdate(delay = 100): void {
    if (avatarUpdateTimer !== null) clearTimeout(avatarUpdateTimer);
    avatarUpdateTimer = setTimeout(() => {
        avatarUpdateTimer = null;
        updateLastMessageAvatar();
    }, delay);
}

function handleSettingsChanged(e: Event): void {
    const detail = (e as CustomEvent<SettingsChangedEventDetail>).detail;
    if (detail?.changed?.includes('enableAvatarExpressionSync') && settings.get('enableAvatarExpressionSync')) {
        updateLastMessageAvatar();
    }
}

function handleCharacterMessageRendered(): void {
    if (settings.get('enableAvatarExpressionSync')) scheduleAvatarUpdate();
}

function handleMessageUpdated(): void {
    if (settings.get('enableAvatarExpressionSync')) scheduleAvatarUpdate();
}

export function cleanupAvatarExpressionSync(): void {
    if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    if (avatarUpdateTimer !== null) clearTimeout(avatarUpdateTimer);
    avatarUpdateTimer = null;
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
export function initAvatarExpressionSync(): void {
    cleanupAvatarExpressionSync();
    initialized = true;

    let retryCount = 0;
    const MAX_RETRIES = 15;

    const startObserving = (): void => {
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
                        node instanceof Element && node.matches('#expression-image, .expression, #expression-plus-image, .expression-plus.expression-plus-animating'));
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

function updateLastMessageAvatar(): void {
    if (!settings.get('enableAvatarExpressionSync')) return;
    const expressionImg = document.querySelector<HTMLImageElement>(SELECTORS.ST_EXPRESSION_IMAGE);
    if (!expressionImg || !expressionImg.src) return;
    const messages = document.querySelectorAll(`${SELECTORS.ST_MESSAGE}[is_user="false"]`);
    if (!messages.length) return;
    const lastMes = messages[messages.length - 1];
    const charFolder = expressionImg.getAttribute('data-sprite-folder-name');
    const mesAuthorUid = lastMes.getAttribute('xdc-author-uid');
    const chName = lastMes.getAttribute('ch_name');
    const matchesFolder = Boolean(charFolder && mesAuthorUid && mesAuthorUid.toLowerCase().includes(charFolder.toLowerCase()));
    const matchesName = Boolean(charFolder && chName && chName.toLowerCase() === charFolder.toLowerCase());
    if (matchesFolder || matchesName) {
        const avatarImg = lastMes.querySelector<HTMLImageElement>(`${SELECTORS.ST_AVATAR} img`);
        if (avatarImg && avatarImg.src !== expressionImg.src) avatarImg.src = expressionImg.src;
    }
}
