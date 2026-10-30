// Blocks SillyTavern's default mobile stylesheet while PTMT owns layout, and restores it on teardown.
const MOBILE_STYLESHEET_MATCH = '/css/mobile-styles.css';
const blockedLinks = new Map();
let observer = null;

function isDefaultMobileStylesheet(node) {
    if (!(node instanceof HTMLLinkElement)) return false;
    const href = node.getAttribute('href') || node.href || '';
    return href.includes(MOBILE_STYLESHEET_MATCH) || href.endsWith('css/mobile-styles.css');
}

function blockMobileStylesheet(link) {
    if (!blockedLinks.has(link)) {
        blockedLinks.set(link, {
            disabled: link.disabled,
            media: link.getAttribute('media'),
            parent: link.parentNode,
            nextSibling: link.nextSibling,
        });
    }
    // Do not remove the node: keeping it in place makes disable/re-enable reversible.
    link.disabled = true;
    link.media = 'not all';
}

function blockExistingMobileStylesheets(root = document) {
    root.querySelectorAll?.('link[rel="stylesheet"], link[href]').forEach(link => {
        if (isDefaultMobileStylesheet(link)) blockMobileStylesheet(link);
    });
}

export function cleanupStMobileStylesBlocker() {
    observer?.disconnect();
    observer = null;
    for (const [link, state] of blockedLinks) {
        if (!link.isConnected && state.parent?.isConnected) {
            if (state.nextSibling?.parentNode === state.parent) state.parent.insertBefore(link, state.nextSibling);
            else state.parent.appendChild(link);
        }
        link.disabled = state.disabled;
        if (state.media == null) link.removeAttribute('media');
        else link.setAttribute('media', state.media);
    }
    blockedLinks.clear();
}

export function initStMobileStylesBlocker() {
    cleanupStMobileStylesBlocker();
    blockExistingMobileStylesheets();
    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (isDefaultMobileStylesheet(node)) blockMobileStylesheet(node);
                else if (node instanceof Element) blockExistingMobileStylesheets(node);
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return cleanupStMobileStylesBlocker;
}
