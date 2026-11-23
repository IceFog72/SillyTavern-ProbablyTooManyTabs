// misc-helpers.ts

import { isElement, registerBodyObserver } from '../core/utils.js';
import { SELECTORS } from '../core/constants.js';

/**
 * Deprecated compatibility shim. PTMT must not remove SillyTavern's shared
 * html mousedown/touchstart handler because it also owns unrelated popup logic.
 */
export function removeMouseDownDrawerHandler(): boolean {
    return false;
}

let drawerUnregister: (() => void) | null = null;
const drawersPinnedByPtmt = new Set<Element>();

function getPtmtDrawers(root: ParentNode = document): Element[] {
    const drawers: Element[] = [];
    if (root instanceof Element && root.matches('.ptmt-panel-content .drawer-content')) {
        drawers.push(root);
    }
    if (root?.querySelectorAll) {
        drawers.push(...root.querySelectorAll('.ptmt-panel-content .drawer-content'));
    }
    return drawers;
}

/**
 * Keep only drawers hosted inside PTMT panels open using SillyTavern's native
 * pinnedOpen contract. ST's global mousedown auto-close handler explicitly
 * ignores .pinnedOpen drawers, preventing openDrawer -> closedDrawer ->
 * openDrawer flicker without touching ST's global event handlers.
 */
export function pinPtmtDrawers(root: ParentNode = document): number {
    const closedClass = SELECTORS.ST_DRAWER_CLOSED.substring(1);
    const openClass = SELECTORS.ST_DRAWER_OPEN.substring(1);
    let changed = 0;

    for (const drawer of getPtmtDrawers(root)) {
        if (!drawer.classList.contains('pinnedOpen')) {
            drawer.classList.add('pinnedOpen');
            drawersPinnedByPtmt.add(drawer);
            changed++;
        }
        if (drawer.classList.contains(closedClass)) {
            drawer.classList.remove(closedClass);
            changed++;
        }
        if (!drawer.classList.contains(openClass)) {
            drawer.classList.add(openClass);
            changed++;
        }
    }

    return changed;
}

/**
 * Watches only for newly inserted/moved PTMT content. It intentionally does
 * not observe class mutations, so it cannot fight SillyTavern after a click.
 */
export function initDrawerObserver(): void {
    cleanupDrawerObserver();
    pinPtmtDrawers();

    drawerUnregister = registerBodyObserver(
        'drawer-observer',
        { childList: true },
        (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    // Scan the inserted subtree only: panels host #chat, so a whole-panel
                    // scan per streamed node is quadratic on long chats.
                    if (node.closest?.('.ptmt-panel-content') || node.querySelector?.('.ptmt-panel-content')) {
                        pinPtmtDrawers(node);
                    }
                }
            }
        },
    );
}

export function cleanupDrawerObserver(): void {
    drawerUnregister?.();
    drawerUnregister = null;

    // Remove only pins PTMT itself added; leave pre-existing ST/user pins alone.
    for (const drawer of drawersPinnedByPtmt) {
        if (drawer?.isConnected) drawer.classList.remove('pinnedOpen');
    }
    drawersPinnedByPtmt.clear();
}

/**
 * Legacy public helper retained for compatibility. It now scopes its default
 * behavior to PTMT-hosted drawers rather than opening every drawer globally.
 */
export function openAllDrawersJq(context: unknown = document): number {
    try {
        const rootEl: ParentNode = isElement(context) ? context : document;
        return pinPtmtDrawers(rootEl);
    } catch {
        return 0;
    }
}

export function moveBg1ToSheld(): boolean {
    const bg1 = document.getElementById('bg1');
    const sheld = document.getElementById('sheld');
    if (bg1 && sheld) {
        sheld.appendChild(bg1);
        return true;
    }
    return false;
}

export function moveBg1BackToPtmtMain(): boolean {
    const bg1 = document.getElementById('bg1');
    const ptmtMain = document.getElementById('ptmt-main');
    if (bg1 && ptmtMain) {
        ptmtMain.appendChild(bg1);
        return true;
    }
    return false;
}

/** Moves specified elements to the #movingDivs container. */
export function moveToMovingDivs(ids: string[] = ['expression-plus-wrapper']): HTMLElement[] {
    if (!document?.body) return [];
    let movingDivs = document.querySelector<HTMLElement>(SELECTORS.ST_MOVING_DIVS);
    if (!movingDivs) {
        movingDivs = document.createElement('div');
        movingDivs.id = SELECTORS.ST_MOVING_DIVS.split(',')[0].trim().substring(1);
        document.body.appendChild(movingDivs);
    }

    const found = ids.map(id => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    found.forEach(eln => {
        if (eln.parentElement !== movingDivs) movingDivs.appendChild(eln);
    });
    return found;
}

/**
 * Legacy helper retained for API compatibility. New PTMT code does not use it.
 */
export function overrideDelegatedEventHandler(
    eventType: string,
    selector: string,
    findFunction: (handlerSource: string) => boolean,
    newHandler: (...args: any[]) => unknown,
): void {
    const jq = window.jQuery || (typeof jQuery !== 'undefined' ? jQuery : undefined);
    if (!jq || !jq._data) return;
    try {
        const delegatedEvents = jq._data(document, 'events');
        if (!delegatedEvents || !delegatedEvents[eventType]) return;
        const handlerToRemove = delegatedEvents[eventType]
            .find(handler => handler.selector === selector && handler.handler && findFunction(handler.handler.toString()))?.handler;
        if (handlerToRemove) {
            jq(document).off(eventType, selector, handlerToRemove);
            jq(document).on(eventType, selector, newHandler);
        }
    } catch (e) {
        console.error('[PTMT] Error while overriding event handler:', e);
    }
}
