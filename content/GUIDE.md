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

## Moving Tabs, Panes & Floating Windows

Every tab bar is interactive:

- **Click a tab** to switch to it.
- **Click the active tab** to collapse/expand the pane. When all panes in a column are collapsed, the column auto-shrinks to a narrow strip. Pulling an open pane out of a split automatically opens a surviving collapsed sibling pane.
- **Ctrl/Cmd + Click tabs** to multi-select a group of tabs and drag or float them together.
- **Right-click a tab** (or **long-press** on touch screens) to open the tab context menu.
- **Drag a tab** to reorder it within the same pane, or move it to a different pane or column.
- **Pane Action Buttons** (at the end of each tab bar):
  - **▾ All Tabs** — quick dropdown listing every tab in the pane with its icon.
  - **⛶ Maximize / Restore** — expands the pane over the workspace (above splitters); press `Esc` or click again to restore.
  - **⋮ Undock Handle** — grab and drag to pull the entire pane out into a **Floating Window**.
- **Drag Reveal** — starting any tab or floating window drag temporarily reveals hidden/empty Left and Right columns and expands Auto-Hide/Shy tab strips so you can drop into them easily.

### Floating Windows

- **Create** — drag a pane's `⋮` undock handle, or right-click its tab bar and choose **Float Entire Pane**.
- **Move & Resize** — drag the floating window's tab bar to move it, drag any edge or corner to resize it, or double-click empty space on its tab bar to maximize/restore.
- **Dock & Split** — drag a floating window onto any docked pane's tab bar to split that pane, onto another floating window to merge them, or onto a **Split Compass** zone to dock back. Docking restores the pane's original view settings from before it was floated.
- **Auto-Cleanup** — floating windows close automatically when their last tab is removed, and stay clamped inside the viewport if you resize the browser window.

---

## Split Compass

When you drag a tab or floating window over the content area of a pane (below the tab strip), a **Split Compass** appears centred on that pane:

- **Center** — drop into the same pane as additional tab(s).
- **▲ Top / ▼ Bottom** — split the pane horizontally; new pane appears above or below.
- **◄ Left / ► Right** — split the pane vertically; new pane appears to the left or right.
- **Outer Edge Arrows** — dock at the top, bottom, left, or right outer edge of the entire column.
- **Neighbor Targets** — when adjacent split panes exist, extra target buttons let you drop directly into a neighbouring pane.

A blue preview overlay shows exactly where the dropped tab or floating window will land. Hover over a zone to see the preview, then release to confirm.

---

## Layout Settings — Global Controls

Open the **Layout Settings** tab (🔧 wrench icon) to access all global controls.

### 1. Global Layout

- **Enable Message Rail** — shows a clickable navigation dot rail along the chat edge.
- **Auto-Open First Center Tab** — when all center-column tabs are collapsed, PTMT automatically opens the first one rather than leaving the center empty.
- **Show Context Size Status Bar** — shows a coloured progress bar at the top of the center column indicating how many tokens are used (system, prompt, world info, chat, anchors, remaining).
- **Show World Info Status Bar** — displays active World Info entries in a compact status bar.
- **Sync Avatar with Expression** — mirrors expression image updates to the character's tab icon.
- **Hide on Resize (Chrome)** — hides heavy content during column/pane resize to prevent browser rendering lag.
- **Flip Tab Direction (Right/Bottom)** — reverses tab order and places the action bar on the opposite end of tab strips globally.
- **Show All Tabs Button / Show Maximize Button / Show Undock Handle** — globally show or hide each of the 3 pane action buttons (can also be overridden per pane).

> **Show Left Column** and **Show Right Column** toggles live directly in the `LEFT COLUMN` and `RIGHT COLUMN` headers of the Layout Editor below. You cannot hide a column that contains the Layout Settings tab itself — move the tab to another column first.

### 2. Global Style

This section controls the visual aesthetic of the extension without affecting your structural layout.

- **UI Theme** — Choose between **Sharp** (classic 0px corners with bottom glow), **Smooth** (rounded glassmorphism pills), **Minimal** (borderless transparent tabs with a 2px accent underline), and **Compact IDE** (dense 30px matte strip with an outer accent stripe).
- **Tab Strip Mode** — Sets how tab strips behave. 
  - *Normal*: Tabs are always visible.
  - *Auto-Hide*: Tabs minimize to a thin line when the pane is expanded and reveal on hover.
  - *Shy Mode*: Minimizes tabs to a thin line even when collapsed, appearing as a floating overlay on hover.
- **Show Icons Only** — Hides all tab text labels, showing only icons for a minimalist look.
- **Enable Animations** — Toggles the surgical animation system. When on, UI transitions are fluid. When off, PTMT's layout changes are instant, but internal tab content (like chat bubbles or third-party widgets) will still retain their native fluidity.
- **Enable Shadows** — Toggles visual depth (box-shadows) on panes and menus.
- **Use Wallpaper for Browser Tint** — Uses the active wallpaper’s average color for browser `theme-color`. Enabled by default. Turning it off uses `--ptmt-body-bg-color`. Visible window tint depends on browser support.
- **Enable Blur Effect** — Toggles the backdrop-filter blur on glassmorphic elements.

### Background & Theme

- **Move BG Under Chat** — moves the SillyTavern background image (#bg1) underneath the chat area instead of behind the whole UI. When enabled, reveals a **Background Color** colour picker to set the area outside the chat.
- **Theme Colors** — extra PTMT colour pickers for UI Background 2, Text Box Background, Tabs Color, and Tabs Background.
- **Generate colors from background** — the wand button in Theme Colors samples the active background image and fills the SillyTavern/PTMT theme colour pickers automatically.
- **Generated color roles** — the image supplies a seed hue. Related muted surfaces use an OKLCH tonal scale. Quoted text keeps the seed hue, italics use an analogous hue, and underlines use a split complementary accent. Each profile controls tone and chroma. Neutral images stay neutral. Text roles target at least 4.5:1 contrast against generated surfaces, with 7:1 for main text. Translucent surfaces over arbitrary wallpaper can change the visible contrast. Keep Auto Contrast Text Colors enabled for those cases.
- **Palette Profile** — the dropdown beside the wand controls the generated palette style. *Alpha* profiles keep the main UI tint translucent; *Solid* profiles make the main UI tint opaque while leaving supporting generated colours mostly translucent.

### Layout Actions

- **Switch to Mobile Layout / Switch to Desktop Layout** — swaps between single-column mobile and full desktop mode. **Reloads the page.**
- **Reset Layout to Default** — resets the tab arrangement to the built-in default. Your settings (theme, colours, etc.) are preserved. **Cannot be undone.**
- **Keyboard shortcut** — press `Alt+Shift+R` outside text inputs to trigger the same reset confirmation.

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
- **Auto Contrast Text Colors** — automatically adjusts UI and chat text colour for contrast. Chat messages use their own adaptive calculation based on chat/message bubble backgrounds rather than the global UI background, so Dialogue Colorizer bubble colours and gradients stay readable.

---

## Layout Settings — Dialogue Colorizer

Tints quoted dialogue text and/or chat bubble backgrounds using each character's avatar colour.

### Global Settings

- **Enable Dialogue Colorizer** — master switch for all colorizer effects.
- **Reset colorizer** — resets all Dialogue Colorizer settings to defaults, including per-character and per-persona overrides.

When the master switch is off, the Characters and Personas (User) sub-sections are hidden.

**Characters sub-section:**
- *Colorize Target* — choose what gets tinted: *Quoted Text Only*, *Chat Bubbles Only*, or *Both*.
- *Dialogue Color Source* — extract from avatar (*Avatar Vibrant*) or use a fixed *Static Color*.
- *Dialogue Static Color* — colour picker (shown when Static Color is selected).
- *Bubble Color Mode*:
  - *Avatar Light* — uses the lightest colour from the avatar palette.
  - *Avatar Dark* — uses the darkest colour from the avatar palette.
  - *Static* — uses the two Bubble Static Colors.
  - *Gradient* — builds a two-colour gradient from the avatar palette, using the inner lightness pair when enough colours are available.
- *Gradient Angle* — shown for Gradient. Global settings only control the angle; the gradient colours are chosen automatically from each avatar.
- *Bubble Static Colors* — two colour pickers shown for Static mode.
- *Bubble Opacity* — slider (0–100 %) for character bubble backgrounds.

**Personas (User) sub-section** — same controls as Characters, but stored separately and applied to the user's persona avatar.

### Personal Dialogue Colorizer

Override the global dialogue colorizer settings for individual characters or personas:

- **Character Editor** — At the top of a character's bio section, find the **Character Dialogue Colorizer** panel with a toggle to enable personal settings.
- **Character Palette** — above Character Dialogue Colorizer, use the wand button to generate the same Theme Colors from the current character image instead of the background. The selector beside it uses the same palette profiles as the background generator.
- **Persona Management** — In the persona selector, find the **Persona Dialogue Colorizer** panel with a toggle to enable personal settings.

When enabled, both provide these controls (in order):
1. **Colorize Target** — override global target setting
2. **Dialogue Color Source** — avatar-extracted or static colour for dialogue
3. **Dialogue Static Color** — shown when Static Color is selected
4. **Bubble Color Mode** — Avatar Light, Avatar Dark, Static, or Gradient
5. **Bubble Static Colors** — shown when Static is selected
6. **Gradient Editor** — shown when Gradient is selected; lets you adjust colours, stop positions, and angle for this specific character or persona
7. **Char/User Bubble Opacity** — opacity override for this character or persona

Gradient starts from the avatar palette. If at least four colours are extracted, PTMT uses the second-darkest and second-lightest colours; with fewer colours, it falls back to the available darkest/lightest pair. Auto Contrast Text Colors evaluates message text against those bubble colours/gradients separately from the global UI background.

Settings are saved automatically and persist across sessions. Disable the toggle to revert to global settings for that character or persona.

After the v0.11.5 colorizer rewrite, old per-character and per-persona overrides are reset once because the storage keys changed. Global Dialogue Colorizer settings are preserved.

Generated palettes update the colour pickers visually, but translucent theme colours remain saved as `rgba(...)` so alpha is preserved.

---

## The Layout Editor

At the bottom of Layout Settings is the **Layout Editor** — a visual map of all your tabs.

### Columns

Each column (Left, Center, Right) is shown as a labelled box. **Left Column** and **Right Column** include an inline toggle switch right in the column header to show or hide that column (dimmed with `(Hidden)` when off).

### Panes

Each pane appears as a box inside its column. Drag a pane by its **☰ header handle** to move or split the entire pane onto another pane (top/bottom/left/right edge = split, center = merge) or into an empty column. The header also displays status icons alongside a **⚙ gear button** that opens **Pane Settings**:
- **Minimum Panel Width (px)** — smallest width the pane may shrink to during resize (`40–1200px`).
- **When Expanded** — tab strip orientation while the pane is open: Auto, Horizontal, or Vertical.
- **When Collapsed** — tab strip orientation while the pane is collapsed: Auto, Horizontal, or Vertical.
- **Content Order** — whether the tab strip appears before (*Tabs First*) or after (*Content First*) the panel body.
- **Tab Direction** — Start → End (default) or End → Start (flipped).
- **Icons Only** — hide tab labels in just this pane to save space.
- **Tab Strip Mode** — override the global visibility behavior for this specific pane (Normal, Auto-Hide, or Shy).
- **Action Button Toggles** — individually show or hide the All Tabs button, Maximize button, and Undock Handle for this pane.

### Tabs in the Editor

Each tab in a pane is shown as a draggable chip with:
- **☰ drag handle** — drag to reorder within the pane, or drag to a different pane/column (works with both mouse and touch).
- **Icon button** — click to open an emoji/icon picker so you can change the tab icon.
- **Tab name** — the current label.
- **⚙ gear button** — opens the **Tab Settings popup**:
  - Rename the tab.
  - Pick a custom accent colour.

### Split Containers

When a column has a split (two panes stacked or side-by-side), you'll see a **Split Container** box with 3 compact cycle icon buttons:
- **Expanded** — layout direction when the split is open (Auto, Vertical, Horizontal).
- **Collapsed** — layout direction when the split is collapsed (Auto, Vertical, Horizontal).
- **Sizing Strategy** — how new splits divide space (Split Reference 50/50, Equal Distribution, or Proportional).

### Pending Tabs

**Pending Tabs** are placeholders for panels that PTMT expects to appear later.

Some SillyTavern panels do not exist when PTMT first restores your layout. For example, an avatar zoom window or gallery image popout is only created after you click an avatar or open an image. PTMT cannot put that panel into a normal tab until the panel actually exists, so it keeps a **Pending Tab** as a reminder: "when this panel appears, put it here."

In simple terms:
- **Normal tabs** are real tabs for panels that can be placed now.
- **Pending tabs** are waiting spots for temporary or late-created panels.
- When the matching panel appears, PTMT automatically turns the pending entry into a real tab.
- Pending tabs are not broken tabs. They are watchers/listeners for panels that have not appeared yet.

You can drag pending tabs between **Pending Tabs** sections to choose where those future panels should open. Pending tabs do not mix with normal tabs in the editor.

### Hidden Tabs

A **Hidden Tabs** storage section at the bottom holds tabs you've intentionally removed from the layout. Drag them back to any pane to restore them, or drag live tabs here to hide them.

> The Layout Settings and Info & Guide tabs cannot be hidden or moved to hidden/pending storage.

---

## Right-Click Context Menu

Right-clicking (or **long-pressing** on phones/tablets) opens PTMT context menus. Press `Esc` or tap outside to close.

- **Right-click a tab** → **Edit Tab** (rename, icon, colour) or **Hide Tab** (sends the tab to Hidden Tabs in the Layout Editor; drag it back to restore).
- **Right-click an empty area of the tab strip or the action buttons** → **Edit Pane**, **Maximize / Restore Pane**, **Float Entire Pane**, **Tab Direction**, **Icons Only / Show Labels**, and **Tab Strip Mode** (cycles Normal → Auto-Hide → Shy for that pane).

---

## Resetting the Layout

If something breaks or the UI looks wrong:

1. Open **Layout Settings**
2. Click **Reset Layout to Default**

Or press `Alt+Shift+R` while focus is not inside a text input.

This restores the default tab arrangement after confirmation. Your theme, colours, and other settings are not affected.

---

## Mobile Mode

Click **Switch to Mobile Layout** in Layout Settings. PTMT collapses everything into a single-column, touch-friendly layout with icon-only tabs. Switch back with **Switch to Desktop Layout**. Both actions reload the page.

While PTMT is active, SillyTavern's default `mobile-styles.css` is disabled/removed so it cannot override the PTMT layout.

---

## Notes

- After major PTMT updates the layout may reset automatically if the internal snapshot format changed.
- If a new extension's tab doesn't appear after installing it, try **Reset Layout to Default**.
- **Pending Tabs** are waiting spots for panels that only appear after an action, such as clicking an avatar or opening a temporary extension panel. They become real tabs when the matching panel appears.
---

## Help & Support

- [💬 Discord — IceFog's AI Brew Bar](https://discord.gg/2tJcWeMjFQ)
- [🐛 GitHub Issues](https://github.com/IceFog72/SillyTavern-ProbablyTooManyTabs/issues)
