import { eventSource, event_types } from '../../../../../../script.js';
import { settings } from '../core/settings.js';
import type { SettingsChangedEventDetail } from '../core/types.js';

let root: HTMLDivElement | null = null;
let dotsContainer: HTMLDivElement | null = null;
let mutationObserver: MutationObserver | null = null;
let scrollRaf: number | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let activeIndex = -1;
let items: HTMLElement[] = [];
let initialized = false;
const nativeCleanups: Array<() => void> = [];
// Listeners on the current rail root. ST's clearChat() removes the root with
// #chat's children, so these are released whenever the root is rebuilt.
const rootCleanups: Array<() => void> = [];
const sourceBindings: Array<[string, (...args: any[]) => void]> = [];
let momentumRaf: number | null = null;
let centerRaf: number | null = null;

function listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
    cleanups?: Array<() => void>,
): void;
function listen(
    target: EventTarget | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
    cleanups?: Array<() => void>,
): void;
function listen(
    target: EventTarget | null,
    type: string,
    handler: any,
    options?: boolean | AddEventListenerOptions,
    cleanups: Array<() => void> = nativeCleanups,
): void {
    if (!target) return;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
}

function listenRoot<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
): void;
function listenRoot(
    target: EventTarget | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): void;
function listenRoot(
    target: EventTarget | null,
    type: string,
    handler: any,
    options?: boolean | AddEventListenerOptions,
): void {
    listen(target, type, handler, options, rootCleanups);
}

function releaseRoot(): void {
    for (const cleanup of rootCleanups.splice(0)) {
        try { cleanup(); } catch {}
    }
    root?.remove();
    root = null;
    dotsContainer = null;
}

function bindSource(type: string, handler: (...args: any[]) => void): void {
    if (!type) return;
    eventSource.on(type, handler);
    sourceBindings.push([type, handler]);
}

function getChatContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>('#chat');
}

function getScrollContainer(): Element | null {
    const chat = getChatContainer();
    if (!chat) return null;

    let node: HTMLElement | null = chat;
    while (node && node !== document.body && node !== document.documentElement) {
        const style = window.getComputedStyle(node);
        const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
        if (canScrollY && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function getRenderedMessages(): HTMLElement[] {
    const chat = getChatContainer();
    if (!chat) return [];

    return Array.from(chat.querySelectorAll<HTMLElement>(':scope > .mes')).filter((node) => {
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

function createUi(): void {
    const chat = getChatContainer();
    if (!chat) return;

    chat.classList.add('gmr-chat-host');
    if (root && root.isConnected) return;
    releaseRoot();

    root = document.createElement('div');
    root.id = 'gpt-message-rail';
    root.className = 'gmr-root gmr-inside-chat';
    root.setAttribute('aria-label', 'Message/page indicator');

    dotsContainer = document.createElement('div');
    dotsContainer.className = 'gmr-dots';

    let isDown = false;
    let isDragging = false;
    let startY = 0;
    let scrollTop = 0;
    let velocity = 0;
    let lastY = 0;
    let lastTime = 0;

    listenRoot(dotsContainer, 'mousedown', (e: MouseEvent) => {
        if (e.button !== 0 || !dotsContainer) return;
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

    function startMomentum(): void {
        if (!isDragging) return;
        if (performance.now() - lastTime > 100) return;

        let lastFrameTime = performance.now();
        function loop(time: number): void {
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

    listenRoot(dotsContainer, 'mouseleave', () => {
        if (isDown) {
            isDown = false;
            if (dotsContainer) dotsContainer.style.cursor = '';
            startMomentum();
        }
    });

    listenRoot(window, 'mouseup', () => {
        if (isDown) {
            isDown = false;
            if (dotsContainer) dotsContainer.style.cursor = '';
            startMomentum();
            setTimeout(() => { isDragging = false; }, 0);
        }
    });

    listenRoot(dotsContainer, 'mousemove', (e: MouseEvent) => {
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

    listenRoot(dotsContainer, 'click', (e: MouseEvent) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    listenRoot(root, 'mouseenter', scheduleCenterActiveDot);
    listenRoot(root, 'focusin', scheduleCenterActiveDot);
    listenRoot(root, 'mouseleave', scheduleCenterActiveDot);
    listenRoot(dotsContainer, 'transitionend', (event: TransitionEvent) => {
        if (event.target === dotsContainer && !isDown) scheduleCenterActiveDot();
    });

    root.append(dotsContainer);
    chat.prepend(root);
}

function applyPosition(): void {
    if (!root) return;
    root.classList.add('gmr-left');
    root.classList.remove('gmr-right');
}

function shouldUseCompressedDots(total: number): boolean {
    return total > (settings.get('messageRailMaxDots') || 64);
}

function mapDotToItemIndex(dotIndex: number, dotCount: number, itemCount: number): number {
    if (itemCount <= 1 || dotCount <= 1) return 0;
    return Math.round((dotIndex / (dotCount - 1)) * (itemCount - 1));
}

function mapItemToDotIndex(itemIndex: number, dotCount: number, itemCount: number): number {
    if (itemCount <= 1 || dotCount <= 1) return 0;
    return Math.round((itemIndex / (itemCount - 1)) * (dotCount - 1));
}

function getDotLabel(node: HTMLElement | undefined, itemIndex: number): string {
    const mesId = node?.getAttribute('mesid');
    const name = node?.getAttribute('ch_name') || node?.querySelector('.name_text')?.textContent?.trim() || 'Message';
    const text = node?.querySelector('.mes_text')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const clipped = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    const promptNumber = Number.isFinite(Number(mesId)) ? Number(mesId) + 1 : itemIndex + 1;
    return clipped ? `${promptNumber}: ${name} — ${clipped}` : `${promptNumber}: ${name}`;
}

function rebuildDots(): void {
    if (!initialized) return;
    if (!settings.get('messageRailEnabled')) {
        releaseRoot();
        return;
    }
    createUi();
    applyPosition();
    if (!root || !dotsContainer) return;

    items = getRenderedMessages();
    if (!items.length) {
        root.hidden = true;
        return;
    }

    root.hidden = false;
    dotsContainer.replaceChildren();
    activeIndex = -1;

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
    scheduleCenterActiveDot();
}

function scheduleRebuild(): void {
    if (rebuildTimer !== null) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildDots, 80);
}

function scrollMessageInsideContainer(container: Element | Window, node: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    const isDocument = container === document.documentElement || container === document.scrollingElement || container === document.body || container === window;
    if (isDocument) {
        const rect = node.getBoundingClientRect();
        const targetTop = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
        window.scrollTo({ top: targetTop, behavior });
        return;
    }

    const elem = container as HTMLElement;
    const containerRect = elem.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const currentScrollTop = elem.scrollTop;
    const nodeTopInsideContainer = nodeRect.top - containerRect.top + currentScrollTop;
    const targetTop = nodeTopInsideContainer - elem.clientHeight / 2 + node.offsetHeight / 2;
    const maxScrollTop = elem.scrollHeight - elem.clientHeight;
    elem.scrollTo({ top: Math.max(0, Math.min(targetTop, maxScrollTop)), behavior });
}

function jumpToItem(index: number): void {
    const scrollContainer = getScrollContainer();
    const node = items[index];
    if (!scrollContainer || !node) return;
    scrollMessageInsideContainer(scrollContainer, node, settings.get('messageRailScrollBehavior') || 'smooth');
    pulseMessage(node);
}

function pulseMessage(node: HTMLElement): void {
    node.classList.remove('gmr-pulse');
    void node.offsetWidth;
    node.classList.add('gmr-pulse');
    setTimeout(() => node.classList.remove('gmr-pulse'), 900);
}

function getNearestMessageIndex(): number {
    const container = getScrollContainer();
    if (!container || !items.length) return -1;
    const isDocument = container === document.documentElement || container === document.scrollingElement || container === document.body || (container as unknown) === window;
    let containerCenter: number;
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

function updateActiveDot(): void {
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

function scheduleCenterActiveDot(): void {
    if (centerRaf) cancelAnimationFrame(centerRaf);
    centerRaf = requestAnimationFrame(() => {
        centerRaf = null;
        if (!root || root.hidden || !dotsContainer) return;
        updateActiveDot();
        const active = dotsContainer.querySelector('.gmr-active');
        if (!active) return;
        const dotRect = active.getBoundingClientRect();
        const containerRect = dotsContainer.getBoundingClientRect();
        const target = dotsContainer.scrollTop + dotRect.top - containerRect.top
            + dotRect.height / 2 - dotsContainer.clientHeight / 2;
        dotsContainer.scrollTop = Math.max(0, Math.min(target, dotsContainer.scrollHeight - dotsContainer.clientHeight));
    });
}

function scheduleActiveUpdate(): void {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateActiveDot();
    });
}

function bindChatObserver(): void {
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
            if (mutation.type === 'attributes' && target instanceof HTMLElement && target.classList?.contains('mes')) {
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

function bindEvents(): void {
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

    const refresh = (): void => {
        bindChatObserver();
        scheduleRebuild();
    };
    for (const eventType of eventsToRefresh) bindSource(eventType, refresh);

    const settingsChanged = (e: Event): void => {
        const detail = (e as CustomEvent<SettingsChangedEventDetail>).detail;
        if (detail?.changed?.some(k => k.startsWith('messageRail'))) scheduleRebuild();
    };
    listen(window, 'ptmt:settingsChanged', settingsChanged);
}

function bindScrollEvents(): void {
    listen(window, 'scroll', scheduleActiveUpdate, { passive: true });
    const chat = getChatContainer();
    listen(chat, 'scroll', scheduleActiveUpdate, { passive: true });
    const scrollContainer = getScrollContainer();
    if (scrollContainer && scrollContainer !== chat && (scrollContainer as unknown) !== window) {
        listen(scrollContainer, 'scroll', scheduleActiveUpdate, { passive: true });
    }
}

export function cleanupMessageRail(): void {
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (rebuildTimer !== null) clearTimeout(rebuildTimer);
    rebuildTimer = null;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
    if (momentumRaf) cancelAnimationFrame(momentumRaf);
    momentumRaf = null;
    if (centerRaf) cancelAnimationFrame(centerRaf);
    centerRaf = null;

    for (const [type, handler] of sourceBindings.splice(0)) {
        try { eventSource.off(type, handler); } catch {}
    }
    for (const cleanup of nativeCleanups.splice(0)) {
        try { cleanup(); } catch {}
    }

    releaseRoot();
    getChatContainer()?.classList.remove('gmr-chat-host');
    items = [];
    activeIndex = -1;
    initialized = false;
}

export function initMessageRail(): void {
    if (initialized) cleanupMessageRail();
    initialized = true;
    const chat = getChatContainer();
    chat?.classList.add('gmr-chat-host');
    bindChatObserver();
    bindEvents();
    bindScrollEvents();
    scheduleRebuild();
}
