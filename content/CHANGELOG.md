# Changelog

---

## v0.10.3 — 2026-04-25

*Code Quality & Correctness*

- ✔ Fix · Auto-hide tab strip now uses the shared unified body observer instead of a separate subtree watcher (performance)
- ✔ Fix · `onEnable` lifecycle hook now reloads the page so the layout is fully restored after a disable/enable cycle
- ✔ Fix · Background color fallback corrected (was briefly applying a bright purple on fresh installs)
- ✔ Fix · Removed ~80 lines of dead code from Settings Panel — orphaned duplicate CSS overrides section
- ✔ Fix · Removed excessive console.log calls that fired on every tab click/collapse/open
- ✔ Fix · `manifest.json` now declares `minimum_client_version` for clearer compatibility errors

---

## v0.10.2 — 2026-04-24

*Global Auto-Hide Tab Strip*

- ✦ New · Global **Auto-Hide Tab Strip** toggle in Layout Settings — hides the tab strip when a pane is not hovered
- ✦ New · Per-pane **Auto-Hide Tab Strip** override in the individual Pane Settings dialog

---

## v0.10.1 — 2026-04-22

*Icon Sync · Drag Polishing*

- ✔ Fix · Layout editor drag clones are now visually stable, matching the main drag feel
- ✔ Fix · FontAwesome icons with multiple classes (e.g., `fa-regular fa-user`) no longer throw DOM errors
- ✔ Fix · Missing icons restored for tabs using `id:` or `class:` mapping prefixes (Gallery, Avatar, etc.)
- ✔ Fix · Legacy snapshots now correctly migrate updated titles and icons for "API Sliders" and "Characters" tabs
- ✔ Fix · Fallback icon `fa-tab` replaced with `fa-layer-group` across the extension

---

## v0.10.0 — 2026-04-20

*Personal Dialogue Colorizer*

- ✦ New · **Per-character Dialogue Colorizer** — override global colorizer settings for any individual character
- ✦ New · **Per-persona Dialogue Colorizer** — override global colorizer settings for any persona
- ✦ New · Colorizer UI injected above character bio in the character editor
- ✦ New · Colorizer UI injected in the persona management panel
- ✔ Fix · Colorizer control order standardized: Target → Dialogue Source → Dialogue Mode → Bubble Source → Bubble Mode → Opacity

---

## v0.9.9 — 2026-04-19

*Guide Accuracy · Dead Code Cleanup · More Extensions*

- ✔ Fix · Removed fabricated "Hold Ctrl to copy tab" hint — feature was never implemented
- ✔ Fix · Right-click context menu guide now accurately describes tab menu vs. strip menu actions
- ✔ Fix · Pane Settings popup fields documented correctly (Orientation, Content Order, Icons Only)
- ✔ Fix · Pending Tabs description corrected — panels that are injected dynamically by JS at runtime
- ✔ Fix · Removed dead `cloneTabIntoPane` / `cloneTabIntoSplit` code from drag-drop.js
- ✦ New · More tab: added PocketTTS-WebSocket, pocket-tts-openapi, SimpleQRBarToggle, CustomThemeStyleInputs extensions

---

## v0.9.7 — 2026-04-19

*Info Panel · Split Compass*

- ✦ New · In-app **Info Panel** with Beginner's Guide, What's New, and More sub-tabs
- ✦ New · New users see the Guide automatically on first open
- ✦ New · What's New tab opens automatically after each update
- ✦ New · **Split Compass** — precise 5-zone drop target (center, top, bottom, left, right) when dragging tabs
- ✔ Fix · Tab sizing consistency across Sharp and Smooth themes

---

## v0.9.6 — 2026-04-18

*Theme-Aware Tab UI*

- ✦ New · Theme-aware tab sizing and spacing via CSS variables
- ✦ New · Uniform square icon-only tabs across all UI themes
- ✔ Fix · Tab strip padding sync for horizontal and vertical orientations
- ✔ Fix · Layout shift on hover prevented for all themes

---

## v0.9.5 — 2026-04-18 *(approx)*

*UI Themes · Icons-Only Mode · Performance*

- ✦ New · Extensible **UI Theme system** with configurable corner radii (Sharp, Soft, Smooth)
- ✦ New · **Icons-only mode** per pane — collapse the tab strip to just icons via Pane Settings
- ✦ New · Batched DOM measurements and layout recalculation caching for smoother performance
- ✦ New · **UI Injection system** for theme-consistent sidebar content
- ✦ New · Character list avatar scale slider in inspector controls
- ✦ New · Message selection checkboxes and refined chat bubble styling

---

## v0.9.0 — 2026-04-10 *(approx)*

*Character Library · Dialogue Colorizer · Avatar Tuning*

- ✦ New · **Embedded Character Library tab** — integrated directly into the layout, with exclusive-panes mode disabled automatically in PTMT
- ✦ New · **Dialogue Colorizer** — automatically color quoted text and chat bubbles based on each character's avatar color
- ✦ New · **Adaptive text contrast** — auto-adjusts text color for readability on colored backgrounds
- ✦ New · Separate bubble opacity controls for characters and user messages
- ✦ New · **Configurable avatar dimensions** — base height, width, border-radius, and scale for chat and character list
- ✦ New · `layout-math.js` module — flex calculations, normalization, and split ratios extracted for clarity
- ✔ Fix · Snapshot migration system added — old layouts migrate forward automatically without data loss
- ✔ Fix · Tabs now uncollapse and become active when moved to a new pane
- ✔ Fix · Recurring class-based tabs (e.g., Gallery zoom) reuse existing panels instead of stacking duplicates

---

## v0.8.5 — 2026-04-01 *(approx)*

*Stability · Memory · Auto-Open*

- ✦ New · **Auto-open first center tab** — option to automatically open the first tab when all center tabs collapse
- ✦ New · **Chat message visibility optimization** for long chats — lazy-renders off-screen messages to reduce DOM load
- ✦ New · **Avatar expression sync** — syncs the floating avatar image with the character's current expression
- ✦ New · Scroll buttons on tab strips for navigating many tabs
- ✔ Fix · Memory leaks fixed — AbortControllers added across event listeners; observers cleaned up on unload
- ✔ Fix · `jQuery._data()` private API usage guarded with version check
- ✔ Fix · Dragging tabs no longer throws errors when the tab element is missing
- ✔ Fix · Body observer batched and debounced to prevent redundant updates
- ✔ Fix · Splitter width calculation excludes disabled resizers

---

## v0.8.0 — 2026-03-15 *(approx)*

*Pending Tabs · Lifecycle Hooks · Gallery Support*

- ✦ New · **Pending Tabs** system — dynamically injected panels (e.g., popups created by extensions at runtime) are automatically captured and placed into the correct column
- ✦ New · **Demotion observer** — when a panel's content is removed from the DOM, it re-arms as a pending tab automatically
- ✦ New · Extension lifecycle hooks — `onActivate`, `onInstall`, `onDelete`, `onEnable`, `onDisable`, `onUpdate`
- ✦ New · Gallery tab support with tab action callbacks
- ✦ New · Tab settings dialog redesigned with native range inputs
- ✔ Fix · Panel min-size calculation no longer causes layout explosions on reload
- ✔ Fix · Smart resizer handles complex multi-pane splits correctly
