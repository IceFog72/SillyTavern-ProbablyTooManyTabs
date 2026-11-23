// context-menu.ts
import { el } from '../core/utils.js';
let currentMenu = null;
let outsideHandler = null;
let escapeHandler = null;
function removeOutsideHandler() {
    if (outsideHandler) {
        document.removeEventListener('pointerdown', outsideHandler);
        document.removeEventListener('mousedown', outsideHandler);
        outsideHandler = null;
    }
    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}
export function showContextMenu(event, items) {
    event.preventDefault();
    hideContextMenu();
    const menu = el('div', { className: 'ptmt-context-menu' });
    for (const item of items) {
        if (item.separator) {
            menu.appendChild(el('div', { className: 'ptmt-context-menu-separator' }));
            continue;
        }
        const icon = item.icon?.includes('fa-')
            ? el('i', { className: `ptmt-context-menu-icon ${item.icon}` })
            : el('span', { className: 'ptmt-context-menu-icon' }, item.icon || '');
        const menuItem = el('div', {
            className: `ptmt-context-menu-item${item.disabled ? ' ptmt-context-menu-item-disabled' : ''}`,
        }, icon, el('span', {}, item.label));
        if (item.disabled) {
            if (item.disabledTitle)
                menuItem.title = item.disabledTitle;
        }
        else {
            menuItem.addEventListener('click', () => {
                try {
                    item.onClick?.();
                }
                finally {
                    hideContextMenu();
                }
            });
        }
        menu.appendChild(menuItem);
    }
    document.body.appendChild(menu);
    currentMenu = menu;
    const { clientX: x, clientY: y } = event;
    const { offsetWidth: width, offsetHeight: height } = menu;
    const rawLeft = x + width > window.innerWidth ? x - width : x;
    const rawTop = y + height > window.innerHeight ? y - height : y;
    const clampedLeft = Math.max(8, Math.min(window.innerWidth - width - 8, rawLeft));
    const clampedTop = Math.max(8, Math.min(window.innerHeight - height - 8, rawTop));
    menu.style.left = `${clampedLeft}px`;
    menu.style.top = `${clampedTop}px`;
    outsideHandler = (pointerEvent) => {
        if (!menu.contains(pointerEvent.target))
            hideContextMenu();
    };
    escapeHandler = (keyEvent) => {
        if (keyEvent.key === 'Escape')
            hideContextMenu();
    };
    document.addEventListener('pointerdown', outsideHandler);
    document.addEventListener('mousedown', outsideHandler);
    document.addEventListener('keydown', escapeHandler);
}
export function hideContextMenu() {
    removeOutsideHandler();
    currentMenu?.remove();
    currentMenu = null;
}
//# sourceMappingURL=context-menu.js.map