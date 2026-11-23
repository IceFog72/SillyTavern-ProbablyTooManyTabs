/** CSS position-anchor compatibility helper for PTMT-integrated extension menus. */
import { registerBodyObserver } from '../core/utils.js';

const lastClickedMenuTriggers = new Map<string, Element>();
let unregisterObserver: (() => void) | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;

export function cleanupPositionAnchor(): void {
    unregisterObserver?.();
    unregisterObserver = null;
    if (clickHandler) document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
    lastClickedMenuTriggers.clear();
}

export function positionAnchor(): void {
    cleanupPositionAnchor();
    if (CSS.supports('position-anchor', '--test')) return;

    const menuPrefixes = ['stqrd--', 'stwid--'];
    clickHandler = (e: MouseEvent) => {
        if (!(e.target instanceof Element)) return;
        for (const prefix of menuPrefixes) {
            const triggerClass = `.${prefix}action`;
            const trigger = e.target.closest(`${triggerClass}.${prefix}context`) ||
                e.target.closest(`${triggerClass}.${prefix}menuTrigger`);
            if (trigger) lastClickedMenuTriggers.set(prefix, trigger);
        }
    };
    document.addEventListener('click', clickHandler, true);

    unregisterObserver = registerBodyObserver('position-anchor', { childList: true }, (mutations) => {
        for (const { addedNodes } of mutations) {
            for (const node of addedNodes) {
                if (!(node instanceof Element)) continue;
                for (const prefix of menuPrefixes) {
                    if (!node.classList.contains(`${prefix}blocker`)) continue;
                    const menu = node.querySelector<HTMLElement>(`.${prefix}menu`);
                    const trigger = lastClickedMenuTriggers.get(prefix);
                    if (menu && trigger) positionMenu(trigger, menu);
                }
            }
        }
    });
}

function positionMenu(trigger: Element, menu: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    setTimeout(() => {
        if (!menu.isConnected || !trigger.isConnected) return;
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) menu.style.right = '10px';
        if (menuRect.bottom > window.innerHeight) menu.style.top = `${rect.top - menuRect.height - 5}px`;
    }, 0);
}
