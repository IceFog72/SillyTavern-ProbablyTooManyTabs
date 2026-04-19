# Welcome to ProbablyTooManyTabs!

PTMT transforms the SillyTavern interface into a **flexible, fully customisable tabbed workspace**. Every panel, sidebar, and tool can be placed exactly where you need it.

---

## The Layout: Columns, Panes, and Tabs

Your workspace has three **columns**: Left, Center, and Right.

Each column can contain one or more **panes** — stacked or split-view containers. Each pane holds **tabs** — the individual panels like Chat, API settings, Characters, etc.

- **Resize columns** — drag the thin vertical divider between columns.
- **Collapse a column** — happens automatically when all panes inside it are collapsed. To re-expand, click any tab inside the column's narrow strip.
- **Resize panes** — drag the horizontal divider between panes inside a column.

---

## Moving Tabs

Every tab bar is interactive:

- **Click a tab** to switch to it.
- **Click the active tab** to collapse/expand the pane. When all panes in a column are collapsed, the column auto-shrinks to a narrow strip.
- **Right-click a tab** to open the context menu (Edit Tab).
- **Drag a tab** to reorder it within the same pane, or move it to a different pane or column.
- **Drag a tab over a pane body** (not the tab strip) to open the **Split Compass** — a cross-shaped widget that lets you choose exactly where to place the tab.

---

## Split Compass

When you drag a tab over the content area of a pane (below the tab strip), a **Split Compass** appears centred on that pane:

- **Center** — drop the tab into the same pane as an additional tab.
- **▲ Top / ▼ Bottom** — split the pane horizontally; new pane appears above or below.
- **◄ Left / ► Right** — split the pane vertically; new pane appears to the left or right.

A blue preview overlay shows exactly which half of the pane the new split will occupy. Hover over a zone to see the preview, then release to confirm.

---

## Layout Settings — Global Controls

Open the **Layout Settings** tab (🔧 wrench icon) to access all global controls.

### Column Visibility

- **Show Left Column** — toggles the left column on/off.
- **Show Right Column** — toggles the right column on/off.

> You cannot hide a column that contains the Layout Settings tab itself. Move the tab to another column first.

### Behaviour

- **Auto-Open First Center Tab** — when all center-column tabs are collapsed, PTMT automatically opens the first one rather than leaving the center empty.
- **Show Icons Only (Global)** — hides tab labels across all columns, showing only icons. Useful on narrow panes.
- **Show Context Size Status Bar** — shows a coloured progress bar at the top of the center column indicating how many tokens are used (system, prompt, world info, chat, anchors, remaining).
- **Sync Avatar with Expression** — mirrors the expression image updates to the character's tab icon.
- **Hide on Resize (Chrome)** — hides some content during column/pane resize to prevent Chrome rendering lag when the character cards list is long.

### Background & Theme

- **Move BG Under Chat** — moves the SillyTavern background image (#bg1) underneath the chat area instead of behind the whole UI. When enabled, reveals a **Background Color** colour picker to set the area outside the chat.
- **UI Theme** — dropdown to pick between available themes (e.g. Sharp, Smooth). Applies immediately.

### Layout Actions

- **Switch to Mobile Layout / Switch to Desktop Layout** — swaps between single-column mobile and full desktop mode. **Reloads the page.**
- **Reset Layout to Default** — resets the tab arrangement to the built-in default. Your settings (theme, colours, etc.) are preserved. **Cannot be undone.**

---

## Layout Settings — Extension CSS Overrides

Tick **Extension CSS Overrides** to unlock a set of overrides that modify SillyTavern CSS on top of the normal theme.

When enabled, additional controls appear:

- **Avatar Sizes** button — opens a popup with text inputs for:
  - *Chat Messages (Big Avatars)*: base height, base width, scale width factor, scale height factor.
  - *Chat Messages (Normal)*: avatar size.
  - *Character List*: avatar width, height, and scale factor.
  - All fields accept valid CSS units: `px`, `%`, `vh`, `vw`, `em`, `rem`, `vmin`, `vmax`.
  - A **Reset All** button restores all avatar values to defaults.
- **Auto Contrast Text Colors** — automatically adjusts chat text colour for contrast when the Dialogue Colorizer tints bubble backgrounds.
- **Optimize Performance with Long Chat** — uses an IntersectionObserver to only render messages currently in view. Reduces frame budget in very long chats. *Minor scroll jumps may occur until each message has been seen once.*

---

## Layout Settings — Dialogue Colorizer

Tints quoted dialogue text and/or chat bubble backgrounds using each character's avatar colour.

- **Enable Dialogue Colorizer** — master switch for all colorizer effects.
- **Colorize Target** — choose what gets tinted:
  - *Quoted Text Only*
  - *Chat Bubbles Only*
  - *Both*
- **Dialogue Color Mode** — which dominant colour is extracted from the avatar for dialogue tinting: *1st Dominant* or *2nd Dominant*.
- **Bubble Color Mode** — colour used for bubble backgrounds: *1st Dominant*, *2nd Dominant*, or *Gradient* (blends two dominant colours).
- **Char Bubble Opacity** — slider (0–100 %) for the character bubble background opacity.
- **User Bubble Opacity** — slider (0–100 %) for the user/persona bubble background opacity.

**Characters sub-section:**
- *Dialogue Color Source* — auto-extract from avatar (*Avatar Vibrant*) or use a fixed *Static Color*.
- *Dialogue Static Color* — colour picker (shown when Static Color is selected).
- *Bubble Color Source* — same choice for bubble backgrounds.
- *Bubble Static Colors (Gradients)* — two colour pickers for the start/end of the gradient.

**Personas (User) sub-section** — same controls as Characters, applied to the user's persona avatar.

---

## The Layout Editor

At the bottom of Layout Settings is the **Layout Editor** — a visual map of all your tabs.

### Columns

Each column (Left, Center, Right) is shown as a labelled box. If a column is hidden, it's shown as dimmed with "(Hidden)".

### Panes

Each pane appears as a box inside its column, with a **⚙ gear button** that opens the **Pane Settings popup**:
- **Minimum Panel Width (px)** — smallest width the pane may shrink to during column resize.
- **When Expanded** — tab strip orientation while the pane is open: Auto, Horizontal, or Vertical.
- **When Collapsed** — tab strip orientation while the pane is collapsed: Auto, Horizontal, or Vertical.
- **Content Order** — whether the tab strip appears before (*Tabs First*) or after (*Content First*) the panel body.
- **Icons Only** checkbox — hide tab labels in just this pane to save space.

### Tabs in the Editor

Each tab in a pane is shown as a draggable chip with:
- **☰ drag handle** — drag to reorder within the pane, or drag to a different pane/column.
- **Icon button** — click to open an emoji/icon picker so you can change the tab icon.
- **Tab name** — the current label.
- **⚙ gear button** — opens the **Tab Settings popup**:
  - Rename the tab.
  - Pick a custom accent colour.

### Split Containers

When a column has a split (two panes stacked or side-by-side), you'll see a **Split Container** box with orientation dropdowns:
- *Expanded*: layout direction when the split is open (Auto, Vertical, Horizontal).
- *Collapsed*: layout direction when the split is collapsed.

### Pending Tabs

Below each active column, a **Pending Tabs** section lists any panels that exist in the DOM but couldn't be placed (e.g. an extension that loaded after the layout was restored). Drag them into an active pane to make them live.

### Hidden Tabs

A **Hidden Tabs** storage section at the bottom holds tabs you've intentionally removed from the layout. Drag them back to any pane to restore them, or drag live tabs here to hide them.

> The Layout Settings and Info & Guide tabs cannot be hidden or moved to hidden/pending storage.

---

## Right-Click Context Menu

Right-clicking within PTMT opens context menus:

- **Right-click a tab** → **Edit Tab** — opens the Tab Settings popup (rename, icon, colour).
- **Right-click an empty area of the tab strip** → **Edit Pane** (opens Pane Settings) and **Icons Only / Show Labels** (quick toggle for that pane).

---

## Resetting the Layout

If something breaks or the UI looks wrong:

1. Open **Layout Settings**
2. Click **Reset Layout to Default**

This restores the default tab arrangement. Your theme, colours, and other settings are not affected.

---

## Mobile Mode

Click **Switch to Mobile Layout** in Layout Settings. PTMT collapses everything into a single-column, touch-friendly layout with icon-only tabs. Switch back with **Switch to Desktop Layout**. Both actions reload the page.

---

## Notes

- After major PTMT updates the layout may reset automatically if the internal snapshot format changed.
- If a new extension's tab doesn't appear after installing it, try **Reset Layout to Default**.
- **Pending Tabs** lists panels that were injected dynamically by JavaScript at runtime (by other extensions or ST itself) and not yet assigned to a column.
---

## Help & Support

- [💬 Discord — IceFog's AI Brew Bar](https://discord.gg/2tJcWeMjFQ)
- [🐛 GitHub Issues](https://github.com/IceFog72/SillyTavern-ProbablyTooManyTabs/issues)
