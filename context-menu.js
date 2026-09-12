// context-menu.js

import { el } from './utils.js';

let currentMenu = null;
let outsideHandler = null;

function removeOutsideHandler() {
    if (!outsideHandler) return;
    document.removeEventListener('mousedown', outsideHandler);
    outsideHandler = null;
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
            if (item.disabledTitle) menuItem.title = item.disabledTitle;
        } else {
            menuItem.addEventListener('click', () => {
                try { item.onClick?.(); } finally { hideContextMenu(); }
            });
        }
        menu.appendChild(menuItem);
    }

    document.body.appendChild(menu);
    currentMenu = menu;

    const { clientX: x, clientY: y } = event;
    const { offsetWidth: width, offsetHeight: height } = menu;
    menu.style.left = `${x + width > window.innerWidth ? x - width : x}px`;
    menu.style.top = `${y + height > window.innerHeight ? y - height : y}px`;

    outsideHandler = (pointerEvent) => {
        if (!menu.contains(pointerEvent.target)) hideContextMenu();
    };
    document.addEventListener('mousedown', outsideHandler);
}

export function hideContextMenu() {
    removeOutsideHandler();
    currentMenu?.remove();
    currentMenu = null;
}
