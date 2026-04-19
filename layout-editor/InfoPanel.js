// layout-editor/InfoPanel.js
// Internal PTMT Info panel — not an extension tab.
// Contains 3 sub-tabs: Guide, What's New (changelog), More.
// Content is loaded at runtime from /content/*.md files —
// edit those files to update the panel without touching JS.

import { el } from '../utils.js';

export const PTMT_INFO_PANEL_ID = 'ptmt-info-wrapper-content';
export const PTMT_INFO_CURRENT_VERSION = '0.9.7';

const EXTENSION_PATH = '/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs';

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
        // HTML-escape first to prevent injection
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold + italic: ***text***
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        // Bold: **text**
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic: *text*
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code: `text`
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Links: [label](url)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="ptmt-info-link">$1</a>');

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trimEnd();

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            closeList();
            closeBlockquote();
            htmlLines.push('<hr class="ptmt-md-hr">');
            continue;
        }

        // Headings
        const h3 = line.match(/^### (.+)/);
        if (h3) { closeList(); closeBlockquote(); htmlLines.push(`<h3 class="ptmt-md-h3">${inlineFormat(h3[1])}</h3>`); continue; }
        const h2 = line.match(/^## (.+)/);
        if (h2) { closeList(); closeBlockquote(); htmlLines.push(`<h2 class="ptmt-md-h2">${inlineFormat(h2[1])}</h2>`); continue; }
        const h1 = line.match(/^# (.+)/);
        if (h1) { closeList(); closeBlockquote(); htmlLines.push(`<h1 class="ptmt-md-h1">${inlineFormat(h1[1])}</h1>`); continue; }

        // Blockquote
        const bq = line.match(/^> (.+)/);
        if (bq) {
            closeList();
            if (!inBlockquote) { htmlLines.push('<blockquote class="ptmt-md-blockquote">'); inBlockquote = true; }
            htmlLines.push(`<p>${inlineFormat(bq[1])}</p>`);
            continue;
        }
        closeBlockquote();

        // Unordered list
        const li = line.match(/^[-*] (.+)/);
        if (li) {
            if (!inList) { htmlLines.push('<ul class="ptmt-md-list">'); inList = true; }
            htmlLines.push(`<li>${inlineFormat(li[1])}</li>`);
            continue;
        }
        closeList();

        // Blank line
        if (line.trim() === '') {
            htmlLines.push('');
            continue;
        }

        // Regular paragraph line
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
 * @param {object} [settings]  The PTMT SettingsManager instance — required for the
 *                             "Never show again" checkbox on the changelog tab.
 * Call panel._activateTab('guide'|'changelog'|'more') to switch tabs.
 */
export function createInfoPanel(settings) {
    const panel = el('div', { className: 'ptmt-info-panel' });

    const tabNav = el('nav', { className: 'ptmt-info-tabnav', 'aria-label': 'Info tabs' });
    const tabContent = el('div', { className: 'ptmt-info-tabcontent' });

    const tabDefs = [
        { id: 'guide',     label: "Beginner's Guide", icon: 'fa-graduation-cap',     file: 'GUIDE.md'     },
        { id: 'changelog', label: "What's New",        icon: 'fa-fire-flame-curved',  file: 'CHANGELOG.md' },
        { id: 'more',      label: 'More',              icon: 'fa-layer-group',        file: 'MORE.md'      },
    ];

    // Cache fetched content so switching tabs doesn't re-fetch
    const cache = {};

    const renderContent = async (id) => {
        const tabDef = tabDefs.find(t => t.id === id);
        if (!tabDef) return;

        tabContent.innerHTML = '';

        // Show spinner while loading
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
                const mdText = await res.text();
                cache[id] = parseMd(mdText);
            } catch (err) {
                console.warn(`[PTMT InfoPanel] Failed to load ${tabDef.file}:`, err);
                cache[id] = `<p class="ptmt-md-p ptmt-info-error">Could not load content. Check the browser console for details.</p>`;
            }
        }

        tabContent.innerHTML = '';
        const contentEl = el('div', { className: `ptmt-info-content ptmt-md-content ptmt-info-${id}` });
        contentEl.innerHTML = cache[id];

        // Append "Never show again" checkbox below changelog content
        if (id === 'changelog' && settings) {
            contentEl.appendChild(createNeverShowRow(settings));
        }

        tabContent.appendChild(contentEl);
    };

    const activate = (id, forceRefresh = false) => {
        tabNav.querySelectorAll('.ptmt-info-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tabId === id);
        });
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

    // Default to guide tab
    activate('guide');

    // Expose programmatic switching (called from snapshot.js for auto-open)
    panel._activateTab = activate;

    return panel;
}

// ─── "Never show again" checkbox ──────────────────────────────────────────────

function createNeverShowRow(settings) {
    const cbId = 'ptmt-never-show-changelog';
    const isNever = settings.get('lastSeenVersion') === 'never';

    const row = el('div', { className: 'ptmt-changelog-never-row' });
    const cb = el('input', { type: 'checkbox', id: cbId });
    cb.checked = isNever;

    cb.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Sentinel value — auto-open will never fire again for any version
            settings.update({ lastSeenVersion: 'never' });
        } else {
            // Restore: pin to the current version so this update isn't re-shown
            settings.update({ lastSeenVersion: PTMT_INFO_CURRENT_VERSION });
        }
    });

    row.append(
        cb,
        el('label', { for: cbId }, "Don't show What's New automatically after updates")
    );
    return row;
}
