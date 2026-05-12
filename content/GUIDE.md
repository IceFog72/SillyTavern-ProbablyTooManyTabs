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

### 1. Columns & Behaviour

- **Show Left Column** — toggles the left column on/off.
- **Show Right Column** — toggles the right column on/off.

> You cannot hide a column that contains the Layout Settings tab itself. Move the tab to another column first.

- **Auto-Open First Center Tab** — when all center-column tabs are collapsed, PTMT automatically opens the first one rather than leaving the center empty.
- **Show Context Size Status Bar** — shows a coloured progress bar at the top of the center column indicating how many tokens are used (system, prompt, world info, chat, anchors, remaining).
- **Sync Avatar with Expression** — mirrors the expression image updates to the character's tab icon.
- **Hide on Resize** — hides heavy content during column/pane resize to prevent browser rendering lag.

### 2. Global Style

This section controls the visual aesthetic of the extension without affecting your structural layout.

- **UI Theme** — Choose between **Sharp** (classic, tight corners) and **Smooth** (modern, rounded glassmorphism).
- **Tab Strip Mode** — Sets how tab strips behave. 
  - *Normal*: Tabs are always visible.
  - *Auto-Hide*: Tabs minimize to a thin line when the pane is expanded and reveal on hover.
  - *Shy Mode*: Minimizes tabs to a thin line even when collapsed, appearing as a floating overlay on hover.
- **Show Icons Only** — Hides all tab text labels, showing only icons for a minimalist look.
- **Enable Animations** — Toggles the surgical animation system. When on, UI transitions are fluid. When off, PTMT's layout changes are instant, but internal tab content (like chat bubbles or third-party widgets) will still retain their native fluidity.
- **Enable Shadows** — Toggles visual depth (box-shadows) on panes and menus.
- **Enable Blur Effect** — Toggles the backdrop-filter blur on glassmorphic elements.

### Background & Theme

- **Move BG Under Chat** — moves the SillyTavern background image (#bg1) underneath the chat area instead of behind the whole UI. When enabled, reveals a **Background Color** colour picker to set the area outside the chat.
- **Theme Colors** — extra PTMT colour pickers for UI Background 2, Text Box Background, Tabs Color, and Tabs Background.
- **Generate colors from background** — the wand button in Theme Colors samples the active background image and fills the SillyTavern/PTMT theme colour pickers automatically.
- **Palette Profile** — the dropdown beside the wand controls the generated palette style. *Alpha* profiles keep the main UI tint translucent; *Solid* profiles make the main UI tint opaque while leaving supporting generated colours mostly translucent.

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
- **Auto Contrast Text Colors** — automatically adjusts UI and chat text colour for contrast. Chat messages use their own adaptive calculation based on chat/message bubble backgrounds rather than the global UI background, so Dialogue Colorizer bubble colours and gradients stay readable.
- **Optimize Performance with Long Chat** — uses an IntersectionObserver to only render messages currently in view. Reduces frame budget in very long chats. *Minor scroll jumps may occur until each message has been seen once.*

---

## Layout Settings — Dialogue Colorizer

Tints quoted dialogue text and/or chat bubble backgrounds using each character's avatar colour.

### Global Settings

- **Enable Dialogue Colorizer** — master switch for all colorizer effects.
- **Wipe All** — resets all Dialogue Colorizer settings to defaults, including per-character and per-persona overrides.

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

Each column (Left, Center, Right) is shown as a labelled box. If a column is hidden, it's shown as dimmed with "(Hidden)".

### Panes

Each pane appears as a box inside its column. The pane title displays a row of status icons showing its active settings at a glance, alongside a **⚙ gear button** that opens the **Pane Settings popup**:
- **Minimum Panel Width (px)** — smallest width the pane may shrink to during column resize.
- **When Expanded** — tab strip orientation while the pane is open: Auto, Horizontal, or Vertical.
- **When Collapsed** — tab strip orientation while the pane is collapsed: Auto, Horizontal, or Vertical.
- **Content Order** — whether the tab strip appears before (*Tabs First*) or after (*Content First*) the panel body.
- **Icons Only** checkbox — hide tab labels in just this pane to save space.
- **Tab Strip Mode** dropdown — override the global visibility behavior for this specific pane (Normal, Auto-Hide, or Shy).

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
- **Right-click an empty area of the tab strip** → **Edit Pane** (opens Pane Settings), **Icons Only / Show Labels** toggle, and **Cycle Tab Strip Mode** (cycles between Normal → Auto-Hide → Shy for that pane).

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
