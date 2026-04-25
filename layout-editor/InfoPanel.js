// layout-editor/InfoPanel.js
// Internal PTMT Info panel — not an extension tab.
// Contains 3 sub-tabs: Guide, What's New (changelog), More.
// Content is loaded at runtime from /content/*.md files —
// edit those files to update the panel without touching JS.

import { el } from '../utils.js';

export const PTMT_INFO_PANEL_ID = 'ptmt-info-wrapper-content';

// Version is fetched from manifest.json at initialization
let PTMT_INFO_CURRENT_VERSION = '0.10.2';  // fallback
const EXTENSION_PATH = '/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs/';

// Load version from manifest on module load
try {
    const manifestUrl = `${EXTENSION_PATH}/manifest.json`;
    fetch(manifestUrl)
        .then(r => r.json())
        .then(m => { PTMT_INFO_CURRENT_VERSION = m.version; })
        .catch(e => console.warn('[PTMT InfoPanel] Could not load manifest version:', e));
} catch (e) {
    console.warn('[PTMT InfoPanel] Manifest fetch failed, using fallback version');
}

export function getPTMTInfoCurrentVersion() {
    return PTMT_INFO_CURRENT_VERSION;
}

// ─── Lightweight Markdown → HTML renderer ─────────────────────────────────────
// Handles: h1-h3, bold, italic, inline code, links, ul lists, blockquotes,
// horizontal rules and paragraph breaks. Safe for static content files.

function parseMd(md) {
    if (!md || typeof md !== 'string') return '';

    const lines = md.split('\n');
    const htmlLines = [];
    let inList = false;
    let inBlockquote = false;

    const closeList = () => { if (inList) { htmlLines.push('</ul>'); inList = false; } };
    const closeBlockquote = () => { if (inBlockquote) { htmlLines.push('</blockquote>'); inBlockquote = false; } };

    const inlineFormat = (text) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="ptmt-info-link">$1</a>');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();

        if (/^---+$/.test(line.trim())) {
            closeList(); closeBlockquote();
            htmlLines.push('<hr class="ptmt-md-hr">');
            continue;
        }

        const h3 = line.match(/^### (.+)/);
        if (h3) { closeList(); closeBlockquote(); htmlLines.push(`<h3 class="ptmt-md-h3">${inlineFormat(h3[1])}</h3>`); continue; }
        const h2 = line.match(/^## (.+)/);
        if (h2) { closeList(); closeBlockquote(); htmlLines.push(`<h2 class="ptmt-md-h2">${inlineFormat(h2[1])}</h2>`); continue; }
        const h1 = line.match(/^# (.+)/);
        if (h1) { closeList(); closeBlockquote(); htmlLines.push(`<h1 class="ptmt-md-h1">${inlineFormat(h1[1])}</h1>`); continue; }

        const bq = line.match(/^> (.+)/);
        if (bq) {
            closeList();
            if (!inBlockquote) { htmlLines.push('<blockquote class="ptmt-md-blockquote">'); inBlockquote = true; }
            htmlLines.push(`<p>${inlineFormat(bq[1])}</p>`);
            continue;
        }
        closeBlockquote();

        const li = line.match(/^[-*] (.+)/);
        if (li) {
            if (!inList) { htmlLines.push('<ul class="ptmt-md-list">'); inList = true; }
            htmlLines.push(`<li>${inlineFormat(li[1])}</li>`);
            continue;
        }
        closeList();

        if (line.trim() === '') { htmlLines.push(''); continue; }

        htmlLines.push(`<p class="ptmt-md-p">${inlineFormat(line)}</p>`);
    }

    closeList();
    closeBlockquote();
    return htmlLines.join('\n');
}

// ─── Panel Entry Point ─────────────────────────────────────────────────────────

/**
 * Creates the Info Panel DOM element with its 3 internal sub-tabs.
 * Content is fetched from /content/*.md at runtime.
 *
 * @param {object} [settings]  PTMT SettingsManager instance — required for the
 *                             "Never show again" footer on the changelog tab.
 *
 * Call panel._activateTab('guide'|'changelog'|'more') to switch tabs.
 */
export function createInfoPanel(settings) {
    const panel = el('div', { className: 'ptmt-info-panel' });

    const tabNav     = el('nav', { className: 'ptmt-info-tabnav', 'aria-label': 'Info tabs' });
    const tabContent = el('div', { className: 'ptmt-info-tabcontent' });

    // "Never show again" row — built synchronously so it is never part of the
    // async render path (avoids race conditions with concurrent fetches).
    // It lives as a sticky footer at the bottom of the panel, shown only while
    // the changelog tab is active.
    const neverShowFooter = settings ? createNeverShowRow(settings) : null;
    if (neverShowFooter) {
        neverShowFooter.style.display = 'none';  // hidden until changelog is active
    }

    const tabDefs = [
        { id: 'guide',     label: "Beginner's Guide", icon: 'fa-graduation-cap',    file: 'GUIDE.md'     },
        { id: 'changelog', label: "What's New",        icon: 'fa-fire-flame-curved', file: 'CHANGELOG.md' },
        { id: 'more',      label: 'More',              icon: 'fa-layer-group',       file: 'MORE.md'      },
    ];

    // Per-tab HTML cache — fetched once, reused on every subsequent visit
    const cache = {};
    // Monotonic counter — lets us discard stale renders when activate() is
    // called again before the previous fetch resolves.
    let renderToken = 0;

    const renderContent = async (id) => {
        const myToken = ++renderToken;
        const tabDef = tabDefs.find(t => t.id === id);
        if (!tabDef) return;

        tabContent.innerHTML = '';
        const loading = el('div', { className: 'ptmt-info-loading' },
            el('i', { className: 'fa-solid fa-circle-notch fa-spin ptmt-info-loading-icon' }),
            el('span', {}, ' Loading…')
        );
        tabContent.appendChild(loading);

        if (!cache[id]) {
            try {
                const url = `${EXTENSION_PATH}/content/${tabDef.file}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                cache[id] = parseMd(await res.text());
            } catch (err) {
                console.warn(`[PTMT InfoPanel] Failed to load ${tabDef.file}:`, err);
                cache[id] = '<p class="ptmt-md-p ptmt-info-error">Could not load content. Check the browser console for details.</p>';
            }
        }

        // Discard if a newer render was requested while we were awaiting
        if (myToken !== renderToken) return;

        tabContent.innerHTML = '';
        const contentEl = el('div', { className: `ptmt-info-content ptmt-md-content ptmt-info-${id}` });
        contentEl.innerHTML = cache[id];
        tabContent.appendChild(contentEl);
    };

    const activate = (id, forceRefresh = false) => {
        tabNav.querySelectorAll('.ptmt-info-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tabId === id);
        });

        // Show sticky footer only for the changelog tab
        if (neverShowFooter) {
            neverShowFooter.style.display = (id === 'changelog') ? '' : 'none';
        }

        if (forceRefresh) delete cache[id];
        renderContent(id);
    };

    tabDefs.forEach(({ id, label, icon }) => {
        const btn = el('button', { className: 'ptmt-info-tab-btn', type: 'button' });
        btn.dataset.tabId = id;
        btn.appendChild(el('i', { className: `fa-solid ${icon} ptmt-info-tab-icon` }));
        btn.appendChild(el('span', { className: 'ptmt-info-tab-label' }, label));
        btn.addEventListener('click', () => activate(id));
        tabNav.appendChild(btn);
    });

    panel.appendChild(tabNav);
    panel.appendChild(tabContent);
    if (neverShowFooter) panel.appendChild(neverShowFooter);  // sticky footer at bottom

    // Default: open guide
    activate('guide');

    // Expose programmatic tab switching (called from snapshot.js)
    panel._activateTab = activate;

    return panel;
}

// ─── "Never show again" sticky footer ─────────────────────────────────────────

function createNeverShowRow(settings) {
    const cbId = 'ptmt-never-show-changelog';
    const isNever = settings.get('lastSeenVersion') === 'never';

    const row = el('div', { className: 'ptmt-changelog-never-row' });
    const cb  = el('input', { type: 'checkbox', id: cbId });
    cb.checked = isNever;

    cb.addEventListener('change', (e) => {
        if (e.target.checked) {
            settings.update({ lastSeenVersion: 'never' });
        } else {
            settings.update({ lastSeenVersion: getPTMTInfoCurrentVersion() });
        }
    });

    row.append(
        cb,
        el('label', { for: cbId }, "Don't show What's New automatically after updates")
    );
    return row;
}
