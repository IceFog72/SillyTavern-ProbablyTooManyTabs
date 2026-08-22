import { eventSource, event_types, chat } from '../../../../script.js';
import { debounce } from './utils.js';
import { settings } from './settings.js';
import { itemizedPrompts, itemizedParams, findItemizedPromptSet } from '../../../../scripts/itemized-prompts.js';

let statusBarElement = null;
let lastUpdateData = null;

const updateStatusBar = debounce(async function () {
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

    let thisPromptSet = findItemizedPromptSet(itemizedPrompts, lastMesId);
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
        const currentData = JSON.stringify({
            api: params.this_main_api,
            max: params.thisPrompt_max_context,
            sys: params.oaiSystemTokens,
            prompt: params.oaiPromptTokens || params.storyStringTokens,
            world: params.worldInfoStringTokens,
            chat: params.ActualChatHistoryTokens,
            anchors: params.allAnchorsTokens
        });
        if (currentData === lastUpdateData && statusBarElement.style.display === 'flex') return;
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

let isStatusBarInitialized = false;
const handleSettingsChanged = (event) => {
    const { changed } = event.detail || {};
    if (changed?.includes('showContextStatusBar')) updateStatusBar();
};

export function initStatusBar() {
    if (isStatusBarInitialized) return;
    isStatusBarInitialized = true;
    const formSheld = document.getElementById('form_sheld');
    if (!formSheld) {
        isStatusBarInitialized = false;
        return;
    }

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
    window.addEventListener('ptmt:settingsChanged', handleSettingsChanged);
    updateStatusBar();
}

let worldInfoStatusBarElement = null;
let currentWorldInfoEntries = [];

const getWIStrategy = (entry) => {
    if (entry.constant === true) return { emoji: '🔵', label: 'constant' };
    if (entry.vectorized === true) return { emoji: '🔗', label: 'vectorized' };
    return { emoji: '🟢', label: 'normal' };
};

function removeWorldInfoTooltip() {
    document.querySelector('.ptmt-wi-tooltip')?.remove();
}

function handleEntriesMouseOver(e) {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest('.ptmt-wi-entry-item');
    if (!target) return;
    removeWorldInfoTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'ptmt-wi-tooltip';
    tooltip.textContent = target.dataset.tooltip || '';
    document.body.appendChild(tooltip);
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 10}px`;
}

function handleEntriesMouseOut(e) {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest('.ptmt-wi-entry-item');
    if (!target) return;
    if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
    removeWorldInfoTooltip();
}

const renderWorldInfoStatusBar = debounce(function () {
    if (!worldInfoStatusBarElement) return;
    if (!settings.get('showWorldInfoStatusBar')) {
        worldInfoStatusBarElement.style.display = 'none';
        removeWorldInfoTooltip();
        return;
    }
    if (currentWorldInfoEntries.length === 0) {
        worldInfoStatusBarElement.style.display = 'none';
        worldInfoStatusBarElement.innerHTML = '';
        removeWorldInfoTooltip();
        return;
    }

    worldInfoStatusBarElement.style.display = 'flex';
    worldInfoStatusBarElement.innerHTML = '';
    const groupedByWorld = {};
    for (const entry of currentWorldInfoEntries) {
        const world = entry.world || 'Unknown';
        (groupedByWorld[world] ||= []).push(entry);
    }

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

            const stratEl = document.createElement('span');
            stratEl.className = 'ptmt-wi-strategy';
            const strategy = getWIStrategy(entry);
            stratEl.textContent = strategy.emoji;
            stratEl.title = `Strategy: ${strategy.label}`;
            entryEl.appendChild(stratEl);

            const keyEl = document.createElement('span');
            keyEl.className = 'ptmt-wi-key';
            const keyString = Array.isArray(entry.key) ? entry.key.join(', ') : (entry.key || entry.uid || '?');
            keyEl.textContent = keyString;
            entryEl.appendChild(keyEl);

            const displayName = entry.comment?.length ? entry.comment : keyString;
            const tooltipText = `[${entry.world}] ${displayName}\n---\n${entry.content || ''}`.trim();
            entryEl.dataset.tooltip = tooltipText;
            entryEl.title = tooltipText;

            if (entry.sticky) {
                const stickyEl = document.createElement('span');
                stickyEl.className = 'ptmt-wi-sticky';
                stickyEl.textContent = `📌${entry.sticky}`;
                stickyEl.title = `Sticky for ${entry.sticky} more rounds`;
                entryEl.appendChild(stickyEl);
            }
            entriesList.appendChild(entryEl);
        }

        // One delegated handler pair per group, not one pair per entry.
        entriesList.addEventListener('mouseover', handleEntriesMouseOver);
        entriesList.addEventListener('mouseout', handleEntriesMouseOut);
        worldGroup.appendChild(entriesList);
        worldInfoStatusBarElement.appendChild(worldGroup);
    }
}, 100);

let isWorldInfoStatusBarInitialized = false;
const handleWorldInfoActivated = (entryList) => {
    currentWorldInfoEntries = entryList || [];
    renderWorldInfoStatusBar();
};
const handleWorldInfoChatChanged = () => {
    currentWorldInfoEntries = [];
    renderWorldInfoStatusBar();
};
const handleWorldInfoSettingsChanged = (event) => {
    const { changed } = event.detail || {};
    if (changed?.includes('showWorldInfoStatusBar')) renderWorldInfoStatusBar();
};

export function initWorldInfoStatusBar() {
    if (isWorldInfoStatusBarInitialized) return;
    isWorldInfoStatusBarInitialized = true;
    const formSheld = document.getElementById('form_sheld');
    if (!formSheld) {
        isWorldInfoStatusBarInitialized = false;
        return;
    }

    worldInfoStatusBarElement = document.getElementById('world-info-status-bar');
    if (!worldInfoStatusBarElement) {
        worldInfoStatusBarElement = document.createElement('div');
        worldInfoStatusBarElement.id = 'world-info-status-bar';
        formSheld.before(worldInfoStatusBarElement);
    }

    eventSource.on(event_types.WORLD_INFO_ACTIVATED, handleWorldInfoActivated);
    eventSource.on(event_types.CHAT_CHANGED, handleWorldInfoChatChanged);
    window.addEventListener('ptmt:settingsChanged', handleWorldInfoSettingsChanged);
    renderWorldInfoStatusBar();
}

export function cleanupStatusBars() {
    try {
        eventSource.off(event_types.MESSAGE_RECEIVED, updateStatusBar);
        eventSource.off(event_types.MESSAGE_SENT, updateStatusBar);
        eventSource.off(event_types.CHAT_CHANGED, updateStatusBar);
        eventSource.off(event_types.GENERATION_STOPPED, updateStatusBar);
        eventSource.off(event_types.WORLD_INFO_ACTIVATED, handleWorldInfoActivated);
        eventSource.off(event_types.CHAT_CHANGED, handleWorldInfoChatChanged);
    } catch (e) {
        console.warn('[CSB] Failed to remove eventSource listeners:', e);
    }

    window.removeEventListener('ptmt:settingsChanged', handleSettingsChanged);
    window.removeEventListener('ptmt:settingsChanged', handleWorldInfoSettingsChanged);
    removeWorldInfoTooltip();
    statusBarElement?.remove();
    worldInfoStatusBarElement?.remove();
    statusBarElement = null;
    worldInfoStatusBarElement = null;
    currentWorldInfoEntries = [];
    lastUpdateData = null;
    isStatusBarInitialized = false;
    isWorldInfoStatusBarInitialized = false;
}
