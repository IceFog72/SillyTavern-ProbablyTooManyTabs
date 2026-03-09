// context-menu.js

import { el } from './utils.js';

let currentMenu = null;

export function showContextMenu(e, items) {
    e.preventDefault();
    hideContextMenu();

    const menu = el('div', { className: 'ptmt-context-menu' });

    items.forEach(item => {
        if (item.separator) {
            menu.appendChild(el('div', { className: 'ptmt-context-menu-separator' }));
            return;
        }

        const menuItem = el('div', { className: 'ptmt-context-menu-item' },
            el('span', { className: 'ptmt-context-menu-icon' }, item.icon || ''),
            el('span', {}, item.label)
        );

        menuItem.addEventListener('click', () => {
            item.onClick();
            hideContextMenu();
        });

        menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);
    currentMenu = menu;

    // Position menu
    const { clientX: x, clientY: y } = e;
    const { innerWidth: windowWidth, innerHeight: windowHeight } = window;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menu;

    let posX = x;
    let posY = y;

    if (x + menuWidth > windowWidth) posX = x - menuWidth;
    if (y + menuHeight > windowHeight) posY = y - menuHeight;

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    // Close menu on click outside
    const closeOnOutsideClick = (event) => {
        if (!menu.contains(event.target)) {
            hideContextMenu();
            document.removeEventListener('mousedown', closeOnOutsideClick);
        }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
}

export function hideContextMenu() {
    if (currentMenu) {
        currentMenu.remove();
        currentMenu = null;
    }
}
