import { eventSource, event_types } from '../../../../script.js';
import { settings } from './settings.js';

const MODULE_NAME = 'st_prompt_dots';

let root = null;
let dotsContainer = null;
let mutationObserver = null;
let scrollRaf = null;
let rebuildTimer = null;
let activeIndex = -1;
let items = [];
let initialized = false;
const nativeCleanups = [];
const sourceBindings = [];
let momentumRaf = null;

function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    nativeCleanups.push(() => target.removeEventListener(type, handler, options));
}

function bindSource(type, handler) {
    if (!type) return;
    eventSource.on(type, handler);
    sourceBindings.push([type, handler]);
}

function getChatContainer() {
    return document.querySelector('#chat');
}

function getScrollContainer() {
    const chat = getChatContainer();
    if (!chat) return null;

    let node = chat;
    while (node && node !== document.body && node !== document.documentElement) {
        const style = window.getComputedStyle(node);
        const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
        if (canScrollY && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function getRenderedMessages() {
    const chat = getChatContainer();
    if (!chat) return [];

    return Array.from(chat.querySelectorAll(':scope > .mes')).filter((node) => {
        const isUser = node.getAttribute('is_user') === 'true';
        const isSystem = node.getAttribute('is_system') === 'true';

        if (settings.get('messageRailExcludeSystem') && isSystem) return false;
        const filter = settings.get('messageRailFilter');
        if (filter === 'user') return isUser;
        if (filter === 'character') return !isUser && !isSystem;
        if (filter === 'reasoning') {
            return node.classList.contains('reasoning') || Boolean(node.dataset.reasoningState);
        }
        return true;
    });
}

function createUi() {
    const chat = getChatContainer();
    if (!chat) return;

    chat.classList.add('gmr-chat-host');
    if (root && root.isConnected) return;

    root = document.createElement('div');
    root.id = 'gpt-message-rail';
    root.className = 'gmr-root gmr-inside-chat';
    root.setAttribute('aria-label', 'Message/page indicator');

    dotsContainer = document.createElement('div');
    dotsContainer.className = 'gmr-dots';

    let isDown = false;
    let isDragging = false;
    let startY;
    let scrollTop;
    let velocity = 0;
    let lastY = 0;
    let lastTime = 0;

    listen(dotsContainer, 'mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (momentumRaf) cancelAnimationFrame(momentumRaf);
        momentumRaf = null;

        isDown = true;
        isDragging = false;
        startY = e.pageY - dotsContainer.offsetTop;
        scrollTop = dotsContainer.scrollTop;
        lastY = e.pageY;
        lastTime = performance.now();
        velocity = 0;
    });

    function startMomentum() {
        if (!isDragging) return;
        if (performance.now() - lastTime > 100) return;

        let lastFrameTime = performance.now();
        function loop(time) {
            const dt = time - lastFrameTime;
            lastFrameTime = time;
            if (dt > 0 && dotsContainer) {
                dotsContainer.scrollTop += velocity * dt;
                velocity *= Math.pow(0.996, dt);
            }
            if (Math.abs(velocity) > 0.05 && dotsContainer) {
                momentumRaf = requestAnimationFrame(loop);
            } else {
                momentumRaf = null;
            }
        }
        momentumRaf = requestAnimationFrame(loop);
    }

    listen(dotsContainer, 'mouseleave', () => {
        if (isDown) {
            isDown = false;
            dotsContainer.style.cursor = '';
            startMomentum();
        }
    });

    listen(window, 'mouseup', () => {
        if (isDown) {
            isDown = false;
            if (dotsContainer) dotsContainer.style.cursor = '';
            startMomentum();
            setTimeout(() => { isDragging = false; }, 0);
        }
    });

    listen(dotsContainer, 'mousemove', (e) => {
        if (!isDown || !dotsContainer) return;
        const now = performance.now();
        const y = e.pageY - dotsContainer.offsetTop;
        const walk = (y - startY) * 1.5;

        if (Math.abs(walk) > 3) {
            isDragging = true;
            dotsContainer.style.cursor = 'grabbing';
        }

        if (isDragging) {
            e.preventDefault();
            dotsContainer.scrollTop = scrollTop - walk;
            const dt = now - lastTime;
            if (dt > 0) {
                const dy = e.pageY - lastY;
                velocity = -(dy * 1.5) / dt;
            }
            lastY = e.pageY;
            lastTime = now;
        }
    });

    listen(dotsContainer, 'click', (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    root.append(dotsContainer);
    chat.prepend(root);
}

function applyPosition() {
    if (!root) return;
    const side = settings.get('messageRailSide');
    root.classList.toggle('gmr-left', side === 'left');
    root.classList.toggle('gmr-right', side !== 'left');
}

function shouldUseCompressedDots(total) {
    return total > (settings.get('messageRailMaxDots') || 64);
}

function mapDotToItemIndex(dotIndex, dotCount, itemCount) {
    if (itemCount <= 1 || dotCount <= 1) return 0;
    return Math.round((dotIndex / (dotCount - 1)) * (itemCount - 1));
}

function mapItemToDotIndex(itemIndex, dotCount, itemCount) {
    if (itemCount <= 1 || dotCount <= 1) return 0;
    return Math.round((itemIndex / (itemCount - 1)) * (dotCount - 1));
}

function getDotLabel(node, itemIndex) {
    const mesId = node?.getAttribute('mesid');
    const name = node?.getAttribute('ch_name') || node?.querySelector('.name_text')?.textContent?.trim() || 'Message';
    const text = node?.querySelector('.mes_text')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const clipped = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    const promptNumber = Number.isFinite(Number(mesId)) ? Number(mesId) + 1 : itemIndex + 1;
    return clipped ? `${promptNumber}: ${name} — ${clipped}` : `${promptNumber}: ${name}`;
}

function rebuildDots() {
    if (!initialized) return;
    createUi();
    applyPosition();
    if (!root || !dotsContainer) return;

    if (!settings.get('messageRailEnabled')) {
        root.hidden = true;
        return;
    }

    items = getRenderedMessages();
    if (!items.length) {
        root.hidden = true;
        return;
    }

    root.hidden = false;
    dotsContainer.replaceChildren();

    const compressed = shouldUseCompressedDots(items.length);
    const maxDots = settings.get('messageRailMaxDots') || 64;
    const dotCount = compressed ? maxDots : items.length;
    root.classList.toggle('gmr-compressed', compressed);

    for (let dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
        const itemIndex = compressed ? mapDotToItemIndex(dotIndex, dotCount, items.length) : dotIndex;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gmr-dot';
        button.dataset.dotIndex = String(dotIndex);
        button.dataset.itemIndex = String(itemIndex);
        const label = getDotLabel(items[itemIndex], itemIndex);
        button.setAttribute('aria-label', label);
        button.title = label;

        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            jumpToItem(itemIndex);
        });
        dotsContainer.append(button);
    }
    updateActiveDot();
}

function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildDots, 80);
}

function scrollMessageInsideContainer(container, node, behavior = 'smooth') {
    const isDocument = container === document.documentElement || container === document.scrollingElement || container === document.body || container === window;
    if (isDocument) {
        const rect = node.getBoundingClientRect();
        const targetTop = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
        window.scrollTo({ top: targetTop, behavior });
        return;
    }

    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const currentScrollTop = container.scrollTop;
    const nodeTopInsideContainer = nodeRect.top - containerRect.top + currentScrollTop;
    const targetTop = nodeTopInsideContainer - container.clientHeight / 2 + node.offsetHeight / 2;
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: Math.max(0, Math.min(targetTop, maxScrollTop)), behavior });
}

function jumpToItem(index) {
    const scrollContainer = getScrollContainer();
    const node = items[index];
    if (!scrollContainer || !node) return;
    scrollMessageInsideContainer(scrollContainer, node, settings.get('messageRailScrollBehavior') || 'smooth');
    pulseMessage(node);
}

function pulseMessage(node) {
    node.classList.remove('gmr-pulse');
    void node.offsetWidth;
    node.classList.add('gmr-pulse');
    setTimeout(() => node.classList.remove('gmr-pulse'), 900);
}

function getNearestMessageIndex() {
    const container = getScrollContainer();
    if (!container || !items.length) return -1;
    const isDocument = container === document.documentElement || container === document.scrollingElement || container === document.body || container === window;
    let containerCenter;
    if (isDocument) containerCenter = window.innerHeight / 2;
    else {
        const containerRect = container.getBoundingClientRect();
        containerCenter = containerRect.top + container.clientHeight / 2;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    items.forEach((node, index) => {
        const rect = node.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - containerCenter);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });
    return nearestIndex;
}

function updateActiveDot() {
    if (!root || !dotsContainer || root.hidden) return;
    const nextActiveIndex = getNearestMessageIndex();
    if (nextActiveIndex === -1) return;
    if (nextActiveIndex === activeIndex && activeIndex !== -1) return;
    activeIndex = nextActiveIndex;

    const buttons = Array.from(dotsContainer.querySelectorAll('.gmr-dot'));
    const compressed = shouldUseCompressedDots(items.length);
    const activeDotIndex = compressed ? mapItemToDotIndex(activeIndex, buttons.length, items.length) : activeIndex;
    buttons.forEach((button, dotIndex) => {
        const isActive = dotIndex === activeDotIndex;
        button.classList.toggle('gmr-active', isActive);
        button.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
}

function scheduleActiveUpdate() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateActiveDot();
    });
}

function bindChatObserver() {
    const chat = getChatContainer();
    if (!chat) return;
    mutationObserver?.disconnect();

    mutationObserver = new MutationObserver((mutations) => {
        let needsRebuild = false;
        for (const mutation of mutations) {
            const target = mutation.target;
            if (target === root || root?.contains(target)) continue;
            if (mutation.type === 'childList' && target === chat) {
                needsRebuild = true;
                break;
            }
            if (mutation.type === 'attributes' && target.classList?.contains('mes')) {
                if (mutation.attributeName === 'class') {
                    const oldSet = new Set((mutation.oldValue || '').split(/\s+/).filter(Boolean));
                    const newSet = new Set((target.className || '').split(/\s+/).filter(Boolean));
                    oldSet.delete('gmr-pulse');
                    newSet.delete('gmr-pulse');
                    if (oldSet.size !== newSet.size || ![...oldSet].every(c => newSet.has(c))) {
                        needsRebuild = true;
                        break;
                    }
                } else {
                    needsRebuild = true;
                    break;
                }
            }
        }
        if (needsRebuild) scheduleRebuild();
    });

    mutationObserver.observe(chat, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'style', 'is_user', 'is_system', 'data-reasoning-state'],
    });
}

function bindEvents() {
    const eventsToRefresh = [
        event_types.APP_READY,
        event_types.CHAT_CHANGED,
        event_types.USER_MESSAGE_RENDERED,
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.MESSAGE_EDITED,
        event_types.MESSAGE_DELETED,
        event_types.MESSAGE_SWIPED,
        event_types.GENERATION_ENDED,
    ].filter(Boolean);

    const refresh = () => {
        bindChatObserver();
        scheduleRebuild();
    };
    for (const eventType of eventsToRefresh) bindSource(eventType, refresh);

    const settingsChanged = (e) => {
        if (e.detail?.changed?.some(k => k.startsWith('messageRail'))) scheduleRebuild();
    };
    listen(window, 'ptmt:settingsChanged', settingsChanged);
}

function bindScrollEvents() {
    listen(window, 'scroll', scheduleActiveUpdate, { passive: true });
    const chat = getChatContainer();
    listen(chat, 'scroll', scheduleActiveUpdate, { passive: true });
    const scrollContainer = getScrollContainer();
    if (scrollContainer && scrollContainer !== chat && scrollContainer !== window) {
        listen(scrollContainer, 'scroll', scheduleActiveUpdate, { passive: true });
    }
}

export function cleanupMessageRail() {
    mutationObserver?.disconnect();
    mutationObserver = null;
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
    if (momentumRaf) cancelAnimationFrame(momentumRaf);
    momentumRaf = null;

    for (const [type, handler] of sourceBindings.splice(0)) {
        try { eventSource.off(type, handler); } catch {}
    }
    for (const cleanup of nativeCleanups.splice(0)) {
        try { cleanup(); } catch {}
    }

    root?.remove();
    root = null;
    dotsContainer = null;
    getChatContainer()?.classList.remove('gmr-chat-host');
    items = [];
    activeIndex = -1;
    initialized = false;
}

export function initMessageRail() {
    if (initialized) cleanupMessageRail();
    initialized = true;
    const chat = getChatContainer();
    chat?.classList.add('gmr-chat-host');
    createUi();
    bindChatObserver();
    bindEvents();
    bindScrollEvents();
    scheduleRebuild();
}
