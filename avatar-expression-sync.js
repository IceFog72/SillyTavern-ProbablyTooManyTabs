import { settings } from './settings.js';
import { SELECTORS } from './constants.js';
import { trackObserver } from './utils.js';
import { eventSource, event_types } from '../../../../script.js';

let observer = null;

/**
 * Initializes the Avatar-Expression Sync feature.
 * Monitors the #expression-image element for source changes and updates the last message's avatar.
 */
export function initAvatarExpressionSync() {
    console.log('[PTMT] Initializing Avatar-Expression Sync...');

    if (observer) {
        observer.disconnect();
    }

    // Since #expression-image might not be in the DOM immediately or could be removed/added
    // we use a more robust approach to check periodically or use a parent observer.
    // However, usually it's there after extensions load.

    let retryCount = 0;
    const MAX_RETRIES = 15; // 30 seconds total at 2s intervals

    const startObserving = () => {
        const expressionHolder = document.querySelector('#expression-holder');
        if (!expressionHolder) {
            if (retryCount++ >= MAX_RETRIES) {
                console.warn('[PTMT] Avatar-Expression Sync: #expression-holder not found after max retries. Giving up.');
                return;
            }
            setTimeout(startObserving, 2000);
            return;
        }

        observer = trackObserver(new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                // If the image element was replaced (SillyTavern's fade transition)
                if (mutation.type === 'childList') {
                    const addedNode = Array.from(mutation.addedNodes).find(node => node.id === 'expression-image' || (node.classList && node.classList.contains('expression')));
                    if (addedNode) shouldUpdate = true;
                }
                // If attributes on the image changed
                if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'data-expression')) {
                    if (mutation.target.id === 'expression-image' || mutation.target.classList.contains('expression')) {
                        shouldUpdate = true;
                    }
                }
            }

            if (shouldUpdate) {
                updateLastMessageAvatar();
            }
        }));

        observer.observe(expressionHolder, {
            childList: true,
            attributes: true,
            subtree: true,
            attributeFilter: ['src', 'data-expression']
        });
        console.log('[PTMT] Observer attached to #expression-holder (subtree mode)');
    };

    startObserving();

    // Handle settings changes
    window.addEventListener('ptmt:settingsChanged', (e) => {
        if (e.detail.changed.includes('enableAvatarExpressionSync')) {
            if (settings.get('enableAvatarExpressionSync')) {
                updateLastMessageAvatar();
            }
        }
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        if (settings.get('enableAvatarExpressionSync')) {
            setTimeout(updateLastMessageAvatar, 100);
        }
    });

    eventSource.on(event_types.MESSAGE_UPDATED, () => {
        if (settings.get('enableAvatarExpressionSync')) {
            setTimeout(updateLastMessageAvatar, 100);
        }
    });
}

/**
 * Updates the avatar of the last message in the chat with the current expression image.
 */
function updateLastMessageAvatar() {
    if (!settings.get('enableAvatarExpressionSync')) return;

    const expressionImg = document.querySelector(SELECTORS.ST_EXPRESSION_IMAGE);
    if (!expressionImg || !expressionImg.src) return;

    const messages = Array.from(document.querySelectorAll(`${SELECTORS.ST_MESSAGE}[is_user="false"]`));
    if (messages.length === 0) return;

    // Target the last non-user message
    const lastMes = messages[messages.length - 1];
    if (!lastMes) return;

    const charFolder = expressionImg.getAttribute('data-sprite-folder-name');
    const mesAuthorUid = lastMes.getAttribute('xdc-author-uid');
    const chName = lastMes.getAttribute('ch_name');

    // Verification: Ensure the message belongs to the character currently expressing
    const matchesFolder = charFolder && mesAuthorUid && mesAuthorUid.toLowerCase().includes(charFolder.toLowerCase());
    const matchesName = charFolder && chName && chName.toLowerCase() === charFolder.toLowerCase();

    if (matchesFolder || matchesName) {
        const avatarImg = lastMes.querySelector(`${SELECTORS.ST_AVATAR} img`);
        if (avatarImg && avatarImg.src !== expressionImg.src) {
            console.log(`[PTMT] Syncing avatar for ${charFolder || chName} with expression: ${expressionImg.src}`);
            avatarImg.src = expressionImg.src;
        }
    }
}
