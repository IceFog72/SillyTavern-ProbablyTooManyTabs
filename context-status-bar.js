import { eventSource, event_types, chat } from '../../../../script.js';
import { debounce } from './utils.js';
import { settings } from './settings.js';
import { itemizedPrompts, itemizedParams, findItemizedPromptSet } from '../../../../scripts/itemized-prompts.js';

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

    // Attempt to find the exact matching set for the current last message
    let thisPromptSet = findItemizedPromptSet(itemizedPrompts, lastMesId);

    // Fallback: If no exact match (e.g. while typing), find the LATEST available set
    if (thisPromptSet === undefined) {
        let maxId = -1;
        for (let i = 0; i < itemizedPrompts.length; i++) {
            if (itemizedPrompts[i].mesId > maxId) {
                maxId = itemizedPrompts[i].mesId;
                thisPromptSet = i;
            }
        }
    }

    if (thisPromptSet === undefined) {
        statusBarElement.style.display = 'none';
        return;
    }

    try {
        const foundMesId = itemizedPrompts[thisPromptSet].mesId;
        const params = await itemizedParams(itemizedPrompts, thisPromptSet, foundMesId);

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
            const numTokens = Number(tokens) || 0;
            if (numTokens <= 0) return;
            const percentage = (numTokens / maxContext) * 100;
            usedTokens += numTokens;

            const segment = document.createElement('div');
            segment.className = `csb-segment ${colorClass}`;
            segment.style.width = `${percentage}%`;

            segment.title = `${label}: ${numTokens} tokens (${percentage.toFixed(1)}%)`;

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

// ─────────────────────────────────────────────────────────────────────────────
// World Info Status Bar
// ─────────────────────────────────────────────────────────────────────────────

let worldInfoStatusBarElement = null;
let currentWorldInfoEntries = [];

const getWIStrategy = (entry) => {
    if (entry.constant === true) return { emoji: '🔵', label: 'constant' };
    if (entry.vectorized === true) return { emoji: '🔗', label: 'vectorized' };
    return { emoji: '🟢', label: 'normal' };
};

const renderWorldInfoStatusBar = debounce(function () {
    if (!worldInfoStatusBarElement) return;

    if (!settings.get('showWorldInfoStatusBar')) {
        worldInfoStatusBarElement.style.display = 'none';
        return;
    }

    // Handle empty state
    if (currentWorldInfoEntries.length === 0) {
        worldInfoStatusBarElement.style.display = 'none';
        worldInfoStatusBarElement.innerHTML = '';
        return;
    }

    worldInfoStatusBarElement.style.display = 'flex';
    worldInfoStatusBarElement.innerHTML = '';

    // Group by world book
    const groupedByWorld = {};
    for (const entry of currentWorldInfoEntries) {
        const world = entry.world || 'Unknown';
        if (!groupedByWorld[world]) {
            groupedByWorld[world] = [];
        }
        groupedByWorld[world].push(entry);
    }

    // Render each world group
    for (const [worldName, entries] of Object.entries(groupedByWorld)) {
        const worldGroup = document.createElement('div');
        worldGroup.className = 'ptmt-wi-world-group';

        const worldTitle = document.createElement('div');
        worldTitle.className = 'ptmt-wi-world-title';
        worldTitle.textContent = `📚 ${worldName}`;
        worldGroup.appendChild(worldTitle);

        const entriesList = document.createElement('div');
        entriesList.className = 'ptmt-wi-entries-list';

        for (const entry of entries) {
            const entryEl = document.createElement('div');
            entryEl.className = 'ptmt-wi-entry-item';

            // Strategy indicator (emoji)
            const stratEl = document.createElement('span');
            stratEl.className = 'ptmt-wi-strategy';
            const strategy = getWIStrategy(entry);
            stratEl.textContent = strategy.emoji;
            stratEl.title = `Strategy: ${strategy.label}`;
            entryEl.appendChild(stratEl);

            // Entry key/label - key is an array
            const keyEl = document.createElement('span');
            keyEl.className = 'ptmt-wi-key';
            const keyString = Array.isArray(entry.key) ? entry.key.join(', ') : (entry.key || entry.uid || '?');
            keyEl.textContent = keyString;
            entryEl.appendChild(keyEl);

            // Store tooltip data - match WorldInfoInfo format
            const displayName = entry.comment?.length ? entry.comment : keyString;
            const tooltipText = `[${entry.world}] ${displayName}\n---\n${entry.content || ''}`.trim();
            entryEl.dataset.tooltip = tooltipText;
            entryEl.title = tooltipText;

            // Optional: Sticky indicator
            if (entry.sticky) {
                const stickyEl = document.createElement('span');
                stickyEl.className = 'ptmt-wi-sticky';
                stickyEl.textContent = `📌${entry.sticky}`;
                stickyEl.title = `Sticky for ${entry.sticky} more rounds`;
                entryEl.appendChild(stickyEl);
            }

            // Add custom tooltip on hover (mouseover bubbles, mouseenter doesn't)
            entriesList.addEventListener('mouseover', (e) => {
                const target = e.target.closest('.ptmt-wi-entry');
                if (!target) return;

                const existing = document.querySelector('.ptmt-wi-tooltip');
                if (existing) existing.remove();

                const tooltip = document.createElement('div');
                tooltip.className = 'ptmt-wi-tooltip';
                tooltip.textContent = target.dataset.tooltip;
                document.body.appendChild(tooltip);

                const rect = target.getBoundingClientRect();
                tooltip.style.left = (rect.left + rect.width / 2) + 'px';
                tooltip.style.top = (rect.top - 10) + 'px';
            });

            entriesList.addEventListener('mouseout', (e) => {
                const target = e.target.closest('.ptmt-wi-entry');
                if (!target) return;
                const tooltip = document.querySelector('.ptmt-wi-tooltip');
                if (tooltip) tooltip.remove();
            });

            entriesList.appendChild(entryEl);
        }

        worldGroup.appendChild(entriesList);
        worldInfoStatusBarElement.appendChild(worldGroup);
    }
}, 100);

export function initWorldInfoStatusBar() {
    const formSheld = document.getElementById('form_sheld');
    if (!formSheld) return;

    worldInfoStatusBarElement = document.getElementById('world-info-status-bar');
    if (!worldInfoStatusBarElement) {
        worldInfoStatusBarElement = document.createElement('div');
        worldInfoStatusBarElement.id = 'world-info-status-bar';
        formSheld.before(worldInfoStatusBarElement);
    }

    // Listen for World Info activation events
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entryList) => {
        currentWorldInfoEntries = entryList || [];
        renderWorldInfoStatusBar();
    });

    // Fallback: Listen to console for "0 entries found" cases (SillyTavern doesn't emit event for empty state)
    const originalDebug = console.debug;
    console.debug = function(...args) {
        const zeroEntryTriggers = [
            '[WI] Found 0 world lore entries. Sorted by strategy',
            '[WI] Adding 0 entries to prompt',
        ];
        if (zeroEntryTriggers.includes(args[0])) {
            currentWorldInfoEntries = [];
            renderWorldInfoStatusBar();
        }
        return originalDebug.apply(console, args);
    };

    const originalLog = console.log;
    console.log = function(...args) {
        const zeroEntryTriggers = [
            '[WI] Found 0 world lore entries. Sorted by strategy',
            '[WI] Adding 0 entries to prompt',
        ];
        if (zeroEntryTriggers.includes(args[0])) {
            currentWorldInfoEntries = [];
            renderWorldInfoStatusBar();
        }
        return originalLog.apply(console, args);
    };

    // Clear on chat change
    eventSource.on(event_types.CHAT_CHANGED, () => {
        currentWorldInfoEntries = [];
        renderWorldInfoStatusBar();
    });

    // Listen for settings changes
    window.addEventListener('ptmt:settingsChanged', (event) => {
        const { changed } = event.detail || {};
        if (changed && changed.includes('showWorldInfoStatusBar')) {
            renderWorldInfoStatusBar();
        }
    });

    // Initial render
    renderWorldInfoStatusBar();
}
