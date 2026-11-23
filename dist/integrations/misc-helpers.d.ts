/**
 * Deprecated compatibility shim. PTMT must not remove SillyTavern's shared
 * html mousedown/touchstart handler because it also owns unrelated popup logic.
 */
export declare function removeMouseDownDrawerHandler(): boolean;
/**
 * Keep only drawers hosted inside PTMT panels open using SillyTavern's native
 * pinnedOpen contract. ST's global mousedown auto-close handler explicitly
 * ignores .pinnedOpen drawers, preventing openDrawer -> closedDrawer ->
 * openDrawer flicker without touching ST's global event handlers.
 */
export declare function pinPtmtDrawers(root?: ParentNode): number;
/**
 * Watches only for newly inserted/moved PTMT content. It intentionally does
 * not observe class mutations, so it cannot fight SillyTavern after a click.
 */
export declare function initDrawerObserver(): void;
export declare function cleanupDrawerObserver(): void;
/**
 * Legacy public helper retained for compatibility. It now scopes its default
 * behavior to PTMT-hosted drawers rather than opening every drawer globally.
 */
export declare function openAllDrawersJq(context?: unknown): number;
export declare function moveBg1ToSheld(): boolean;
export declare function moveBg1BackToPtmtMain(): boolean;
/** Moves specified elements to the #movingDivs container. */
export declare function moveToMovingDivs(ids?: string[]): HTMLElement[];
/**
 * Legacy helper retained for API compatibility. New PTMT code does not use it.
 */
export declare function overrideDelegatedEventHandler(eventType: string, selector: string, findFunction: (handlerSource: string) => boolean, newHandler: (...args: any[]) => unknown): void;
