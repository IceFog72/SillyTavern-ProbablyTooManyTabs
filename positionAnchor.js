/**
 * positionAnchor.js — CSS `position-anchor` polyfill for PTMT menus
 *
 * PURPOSE
 * -------
 * The CSS Anchor Positioning spec (`position-anchor`, `anchor()`) lets absolutely-
 * positioned elements be placed relative to an arbitrary anchor element. At the
 * time of writing, browser support is incomplete (Chrome 125+; Firefox & Safari
 * behind flags). Extensions like SillyTavern-QuickRepliesDrawer (prefix `stqrd--`)
 * and SillyTavern-Widgets (prefix `stwid--`) use dropdowns / context menus that
 * rely on anchor positioning to appear next to their trigger buttons.
 *
 * WHAT IT DOES
 * ------------
 * When `CSS.supports('position-anchor', '--test')` returns false (i.e. the
 * browser does NOT natively support anchor positioning), this module:
 *  1. Tracks the last clicked trigger element for each known extension prefix via
 *     a capturing click listener on `document`.
 *  2. Watches for blocker overlay elements (e.g. `.stqrd--blocker`) being added
 *     to the DOM via the shared unified body observer (`registerBodyObserver`).
 *  3. When a blocker is added, reads the trigger's `getBoundingClientRect()` and
 *     manually positions the menu below (or above, if it would overflow) it.
 *
 * REMOVAL CONDITION
 * -----------------
 * This polyfill can be removed once ALL of these are true:
 *  - Firefox and Safari ship full spec-compliant `position-anchor` support, AND
 *  - SillyTavern's minimum supported browser versions include those releases.
 * Check current support at: https://caniuse.com/css-anchor-positioning
 *
 * EXTENSIONS COVERED
 *  - SillyTavern-QuickRepliesDrawer (`stqrd--` prefix)
 *  - SillyTavern-Widgets            (`stwid--` prefix)
 */
import { registerBodyObserver } from './utils.js';

export function positionAnchor() {
    // Early exit: native CSS anchor positioning is supported — polyfill not needed.
    if (CSS.supports('position-anchor', '--test')) return;

    const menuPrefixes = ['stqrd--', 'stwid--'];
    window.lastClickedMenuTriggers = {};

    document.addEventListener('click', (e) => {
        menuPrefixes.forEach(prefix => {
            const triggerClass = `.${prefix}action`;
            const trigger = e.target.closest(`${triggerClass}.${prefix}context`) ||
                e.target.closest(`${triggerClass}.${prefix}menuTrigger`);
            if (trigger) window.lastClickedMenuTriggers[prefix] = trigger;
        });
    }, true);

    registerBodyObserver(
        'position-anchor',
        { childList: true },
        (mutations) => {
            mutations.forEach(({ addedNodes }) => {
                addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    menuPrefixes.forEach(prefix => {
                        if (node.classList?.contains(`${prefix}blocker`)) {
                            const menu = node.querySelector(`.${prefix}menu`);
                            const trigger = window.lastClickedMenuTriggers[prefix];
                            if (menu && trigger) positionMenu(trigger, menu);
                        }
                    });
                });
            });
        }
    );

    function positionMenu(trigger, menu) {
        const rect = trigger.getBoundingClientRect();
        menu.style.position = 'absolute';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        menu.style.left = 'auto';

        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth) menu.style.right = '10px';
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = `${rect.top - menuRect.height - 5}px`;
            }
        }, 0);
    }
}