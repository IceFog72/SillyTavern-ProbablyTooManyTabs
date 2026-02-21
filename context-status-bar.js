import { eventSource, event_types, chat } from '../../../../script.js';
import { debounce } from './utils.js';
import { itemizedPrompts, itemizedParams, findItemizedPromptSet } from '../../../../scripts/itemized-prompts.js';
import { settings } from './settings.js';

/**
 * Context Status Bar Extension
 */

let statusBarElement = null;

let lastUpdateData = null;

export const updateStatusBar = debounce(async function () {
    if (!statusBarElement) return;

    if (!settings.get('showContextStatusBar')) {
        statusBarElement.style.display = 'none';
        return;
    }

    if (!Array.isArray(itemizedPrompts) || itemizedPrompts.length === 0) {
        statusBarElement.style.display = 'none';
        return;
    }

    const lastMesId = chat.length - 1;
    if (lastMesId < 0) {
        statusBarElement.style.display = 'none';
        return;
    }

    const thisPromptSet = findItemizedPromptSet(itemizedPrompts, lastMesId);
    if (thisPromptSet === undefined) {
        statusBarElement.style.display = 'none';
        return;
    }

    try {
        const params = await itemizedParams(itemizedPrompts, thisPromptSet, lastMesId);

        // Optimization: only re-render if token data has changed
        const currentData = JSON.stringify({
            api: params.this_main_api,
            max: params.thisPrompt_max_context,
            sys: params.oaiSystemTokens,
            prompt: params.oaiPromptTokens || params.storyStringTokens,
            world: params.worldInfoStringTokens,
            chat: params.ActualChatHistoryTokens,
            anchors: params.allAnchorsTokens
        });

        if (currentData === lastUpdateData && statusBarElement.style.display === 'flex') {
            return;
        }
        lastUpdateData = currentData;

        const maxContext = params.thisPrompt_max_context || 8192;

        statusBarElement.style.display = 'flex';
        let scaleBar = statusBarElement.querySelector('#context-scale-bar');
        if (!scaleBar) {
            scaleBar = document.createElement('div');
            scaleBar.id = 'context-scale-bar';
            statusBarElement.appendChild(scaleBar);
        }
        scaleBar.innerHTML = '';

        let usedTokens = 0;

        const createSegment = (tokens, colorClass, label) => {
            if (tokens <= 0) return;
            const percentage = (tokens / maxContext) * 100;
            usedTokens += tokens;

            const segment = document.createElement('div');
            segment.className = `csb-segment ${colorClass}`;
            segment.style.width = `${percentage}%`;

            segment.title = `${label}: ${tokens} tokens (${percentage.toFixed(1)}%)`;
            // Only show labels for non-chat segments if they're wide enough
            if (label !== 'Chat' && percentage >= 10) {
                segment.innerText = label.split(' ')[0];
            }

            scaleBar.appendChild(segment);
        };

        if (params.this_main_api === 'openai') {
            createSegment(params.oaiSystemTokens, 'csb-system', 'System');
            createSegment(params.oaiPromptTokens, 'csb-prompt', 'Prompt');
            createSegment(params.worldInfoStringTokens, 'csb-world', 'World');
            createSegment(params.ActualChatHistoryTokens, 'csb-chat', 'Chat');
        } else {
            createSegment(params.storyStringTokens, 'csb-prompt', 'Prompt');
            createSegment(params.worldInfoStringTokens, 'csb-world', 'World');
            createSegment(params.ActualChatHistoryTokens, 'csb-chat', 'Chat');
            createSegment(params.allAnchorsTokens, 'csb-anchors', 'Anchors');
        }

        // Add remaining space segment
        const remaining = maxContext - usedTokens;
        if (remaining > 0) {
            const remPercentage = (remaining / maxContext) * 100;
            const remSegment = document.createElement('div');
            remSegment.className = 'csb-segment csb-remaining';
            remSegment.style.width = `${remPercentage}%`;
            remSegment.title = `Remaining: ${remaining} tokens (${remPercentage.toFixed(1)}%)`;
            scaleBar.appendChild(remSegment);
        }

    } catch (e) {
        console.error('[CSB] Error updating status bar:', e);
    }
}, 100);

export function initStatusBar() {
    const formSheld = document.getElementById('form_sheld');
    if (!formSheld) return;

    statusBarElement = document.getElementById('context-status-bar');
    if (!statusBarElement) {
        statusBarElement = document.createElement('div');
        statusBarElement.id = 'context-status-bar';
        statusBarElement.style.setProperty('width', '100%', 'important');
        statusBarElement.style.setProperty('position', 'inherit', 'important');
        formSheld.before(statusBarElement);
    }

    eventSource.on(event_types.MESSAGE_RECEIVED, updateStatusBar);
    eventSource.on(event_types.MESSAGE_SENT, updateStatusBar);
    eventSource.on(event_types.CHAT_CHANGED, updateStatusBar);
    eventSource.on(event_types.GENERATION_STOPPED, updateStatusBar);

    window.addEventListener('ptmt:settingsChanged', (event) => {
        const { changed } = event.detail || {};
        if (changed && changed.includes('showContextStatusBar')) {
            updateStatusBar();
        }
    });

    // Initial update
    updateStatusBar();
}
