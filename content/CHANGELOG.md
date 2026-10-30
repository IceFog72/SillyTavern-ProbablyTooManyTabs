# Changelog


 **ANNOUNCEMENT:** Active development of PTMT and other extensions is currently paused due to no support (update-fix only what pissed me off). New features, updates, and further development depend on community support. If you use and enjoy my extensions, please consider donating — every contribution helps make continued development possible.

## v0.13.5 — 2026-10-30

*Layout, editor, colorizer and message rail fixes*

- ✔ Fix · **Split Orientation Changes** — changing a split's orientation no longer throws an error that skipped column updates and the layout autosave. Only the split's own splitters change direction. Nested splits keep theirs, and disabled splitters stay disabled.
- ✔ Fix · **Editor Split Orientation** — changing a split's Expanded orientation in the Layout Settings editor now saves the layout, so the choice survives a reload.
- ✔ Fix · **Dropping Tabs on Splitters** — releasing a dragged tab over a splitter between panes no longer moves it into, or splits, an unrelated pane.
- ✔ Fix · **Closing a Nested Split** — when the second-to-last pane in a nested split closes, the remaining pane takes the whole space of the removed split instead of shrinking to its old share.
- ✔ Fix · **Layout Editor Drops** — dropping a pane tab or a file on the Layout Settings editor no longer throws an error.
- ✔ Fix · **Personal Color Pickers** — dragging a personal dialogue or bubble color picker saves once after the drag settles instead of sending a full settings save for every color update. Switching to another character or persona now saves a pending personal color, opacity or gradient change instead of discarding it.
- ✦ Performance · **Personal Colorizer Saves** — personal color changes no longer clear every author's cached avatar colors. Avatars are re-read only when the color source, bubble mode or gradient changes, or when personal colors are turned on or off.
- ✦ Performance · **Drawer Pinning** — new chat content inside PTMT panels is checked for drawers without rescanning the whole panel for every inserted element, which removes repeated full-chat scans while messages stream.
- ✦ Performance · **Colorizer Logging** — removed per-author console logging from colorizer restyles.
- ✔ Fix · **Message Rail Listeners** — switching chats no longer adds another set of rail listeners and keeps the old rail in memory. A disabled rail no longer builds its hidden UI.
- ✔ Fix · **Pane Observer Cleanup** — splitting a pane stops observing the replaced pane's tab strip.
- ✦ Development · **Regression Checks** — added a small fake DOM to the test harness and regression tests for each fix above.

## v0.13.4 — 2026-10-30

*Theme generation, runtime fixes & source organization — manifest version v0.13.4*

- ✦ Polish · **Generated Theme Palettes** — rebuilt image-based color generation around an OKLCH tonal scale for Dark, Bright, Balanced, Vivid, and Soft profiles, retaining their Alpha and Solid variants. Muted surfaces follow the image seed hue, quoted text uses that hue, italics use an analogous hue, and underlines use a split complementary accent. Warm images retain warm surfaces instead of being shifted toward blue, and neutral images remain neutral.
- ✔ Fix · **Generated Text Contrast** — generated main text targets at least 7:1 contrast and italics, quotes, and underlines target at least 4.5:1 against generated surfaces and their modeled blends. Translucent surfaces over arbitrary wallpaper can change visible contrast; the Guide now explains the generated color roles and recommends Auto Contrast Text Colors for those cases.
- ✔ Fix · **Black and White Image Sampling** — retained near-black and near-white pixels during image color extraction so monochrome images produce neutral palettes instead of falling back to an unrelated color.
- ✔ Fix · **Partial Theme Loading** — clears previous PTMT color overrides before applying a theme, including partial themes with top-level color values, so omitted colors do not retain stale overrides.
- ✔ Fix · **Mobile Deferred Tabs** — mobile layout conversion now collects deferred tabs from all columns, deduplicates ID and class matches separately, and assigns them to the center pane so they remain available when their panels appear.
- ✔ Fix · **Closing the Active Tab** — closing an active tab selects another open tab when available. If no open tab remains, it clears the active state instead of reopening a collapsed tab; the existing center-pane auto-open policy still applies.
- ✔ Fix · **Avatar Expression Replacement** — removing a native expression image now triggers an avatar refresh, including animated replacements that remove the previous image.
- ✔ Fix · **World Info Group Names** — World Info status grouping now accepts names such as `constructor` and `__proto__` without colliding with inherited object properties.
- ✔ Fix · **Extension Shutdown Cleanup** — runtime shutdown now also cleans up the layout editor, character colorizer UI, dialogue colorizer and its generated styles, and tab actions when the extension is disabled, deleted, or initialized again.
- ✦ Refactor · **Source Organization** — moved JavaScript into `src/` folders for core, layout, tabs, editor, theme, colorizer, integrations, and UI. Updated module imports, type references, the manifest entry point to `src/index.js`, and the README project tree. The manifest version is now v0.13.4, up from v0.13.2.
- ✦ Refactor · **Theme Stylesheet Name** — renamed the global theme and adaptive contrast stylesheet to `theme-overrides.css` and updated its loader and documentation references. Removed unused palette helpers from the theme-color integration now that generation uses the shared palette module.
- ✦ Development · **Regression Checks** — added a dependency-free Node regression suite and `npm test`, covering source imports, palette generation, theme loading, mobile layouts, tab closing, lifecycle cleanup, avatar expressions, World Info, browser tint, reload recovery, startup, colorizer settings and alpha, gradient editing, and performance behavior. Added `npm run check` for JavaScript syntax validation across `src/`.
- ✦ Development · **Palette Preview & Check Documentation** — added a browser palette preview for warm, cool, and neutral samples across all five styles, documented Node requirements and the limits of module tests, and described optional live SillyTavern smoke checks. Updated the README development instructions and ignore rules to include the regression suite, harness, test documentation, and palette preview while keeping other local test artifacts ignored.
- ✦ New · **More Extensions** — added LanguageTool and CodexPet to the More tab alongside Every Text Line Editor, MoreReasoning, PocketTTS WebSocket, Card Gallery Viewer, and Inline Assistant.

## v0.13.1 — 2026-10-09

*Colorizer polish & cleanup*

- ✦ Polish · **Personal Colorizer UI** — regrouped character and persona controls into clearer dialogue and bubble sections, tightened the row layout, and added a reset action that restores the active persona or character defaults.
- ✔ Fix · **Target Visibility & State Sync** — colorizer settings now hide and show the correct controls when the target mode changes, and the active target keeps the UI synchronized with saved values.
- ✦ Polish · **Gradient Editor Cleanup** — updated gradient editor lifecycle handling so injected editor instances are safely destroyed on refresh and repeated UI rebuilds no longer leave stale state behind.
- ✔ Fix · **Color Picker & Contrast Tuning** — refreshed the shared picker styling and adjusted the dialogue contrast mix for cleaner custom-color editing and more consistent text contrast.

## v0.13 — 2026-10-03

*Startup, Message Rail & Layout Performance*

- ✦ Polish · **Browser Background Tint** — samples the wallpaper at startup and sets the `theme-color` metadata to its opaque average RGB. Background changes update the metadata, late ST theme application keeps the wallpaper value, and disabling PTMT restores ST’s latest tint. Layout Settings → Global Style includes a Use Wallpaper for Browser Tint toggle, enabled by default. Turning it off uses `--ptmt-body-bg-color` immediately. Visible browser/window tint depends on browser support.
- ✦ New · **Startup Loading Screen** — covers the unfinished interface until PTMT has built and painted the layout. The screen clears on startup errors, extension disable/delete, or after 30 seconds if startup stalls.
- ✦ Polish · **Message Rail on the Left** — moved the rail to the left edge of the chat and its enable checkbox to the first Global Layout settings position.
- ✔ Fix · **Message Rail Hover Position** — expanding the rail centers the current chat message instead of starting at the first message. Rebuilding the rail also restores the active marker.
- ✦ Polish · **Toolcool Gradient Picker** — replaced the native system color picker with `toolcool-color-picker` in the shared gradient editor used by Character Dialogue Colorizer, persona overrides, and global settings. Choose a custom color, then press **+** to add a gradient stop.
- ✦ Removal · **Optimize Performance with Long Chat** — removed the setting and its message content-visibility CSS.
- ✔ Fix · **Colorizer Alpha** — custom gradient stops retain picker opacity when added, edited, and restored. Adaptive dialogue text and the gradient contrast estimate preserve alpha. Bubble opacity multiplies the chosen color opacity.
- ✦ Polish · **Layout Settings** — replaced stretched panels with a compact grid that follows the settings pane width. Character and Persona colorizer controls use matching columns, labeled gradient angles, and aligned opacity values. Layout actions have their own footer, and the colorizer sizing class is preserved.
- ✔ Fix · **Chat Composer** — excluded the message textarea from generic field styling and restored ST’s native sizing, focus ring, and command-progress border. Composer buttons also retain their native minimum height so stacked Input History arrows do not enlarge the send row.
- ✦ Polish · **ST Controls** — consistent 28px control spacing, visible keyboard focus, circular radio choices, and keyboard access to message actions. Selected settings buttons retain their highlight, delete buttons retain their destructive color, and control transitions respect reduced motion.
- ✦ Polish · **Adaptive Text and Shadows** — uses native contrast selection where supported, with a lightness fallback. Body-local and bubble backgrounds recompute their own text colors. Shadow colors use controlled opacity, text shadows have valid geometry, and No Text Shadows remains effective.
- ✔ Fix · **State Across Reloads** — restores collapsed panes before calculating sizes and preserves the Info tab state. A tab-local, account-scoped reload checkpoint retains the latest layout, theme colors, and background while server saves are pending. Snapshots now copy panel metadata into serializable objects.
- ✔ Fix · **Layout Restore Cleanup** — disposes obsolete pane wrappers, observers, and resizer handlers while preserving reusable panel content. Repeated restores reuse custom panels and recover tabs whose original placeholder has been replaced.
- ✦ Performance · **Layout Editor Updates** — defers rendering while the editor is hidden and coalesces visible updates into one animation frame.
- ✦ Performance · **Settings and Avatar Updates** — unchanged scalar settings skip saves and events, setting changes update only affected UI, and bursts of avatar events share one delayed scan.

---

## v0.12.12 — 2026-06-19

*RPG Companion Integration*

- ✦ New · **RPG Companion Tab** — added native support for the RPG Companion panel on desktop and mobile, including scoped layout overrides that keep its fixed-position UI contained inside a PTMT tab.
- © Migration · **Existing Layout Support** — snapshot migration v28 automatically adds RPG Companion as a pending tab to existing desktop and mobile layouts; no layout reset is required.

---


## v0.12.11 — 2026-06-16

*Per-Persona Colorizer Persistence*

- ✔ Fix · **Enable Toggle Persisting** — *Enable Personal Dialogue Colorizer* now saves reliably and stays on across reloads. The active persona is read from SillyTavern's live `user_avatar` binding instead of the persona grid tile, which could be missing when the list is paginated or in list view (silently aborting the save).
- ✔ Fix · **Selected-Persona Targeting** — corrected the grid selector to `.avatar-container.selected` (ST marks the container, not the inner `.avatar`), so the correct persona is read when a grid tile is used as fallback.
- ✔ Fix · **State Restored on Startup** — the persona colorizer panel now repopulates its saved state on init and `APP_READY`, not only on `PERSONA_CHANGED` (which can fire before the UI is ready and leave the toggle visually off).

---

## v0.12.10 — 2026-06-16

*Dialogue Colorizer Fixes*

- ✔ Fix · **Per-Persona Colorizer** — Persona Management's *Enable Personal Dialogue Colorizer* now targets the **selected** persona instead of the first avatar in the grid, so saved overrides match the persona used in chat and actually apply.
- ✔ Fix · **Scrollback Defaulting to Global** — custom character/persona colors no longer revert to the global colorizer when scrolling back through older messages. Override keys now derive from the stable avatar identity rather than a message's live avatar URL, which could be empty while the image lazy-loads.

---

## v0.12.8 — 2026-05-28

- ✔ Fix · **Guide — Hide Tab** — the Right-Click Context Menu section of the Guide now documents the **Hide Tab** option (removes tab to Hidden Tabs storage; drag back from Layout Editor to restore).
- ✔ Fix · **Layout Settings Column Toggles** — **Show Left Column** and **Show Right Column** now apply column visibility immediately and stay synced when layouts or side-column cleanup update visibility in the background.

---

## v0.12.6 — 2026-05-21

*Colorizer Settings Module*

- ✦ Refactor · **Centralized Colorizer Settings** — extracted all schema validation, defaults, key building, and persistence for character and persona custom colorizer settings into a dedicated `colorizer-settings.js` module. `character-colorizer-ui.js`, `dialogue-colorizer.js`, and `settings.js` now delegate to this single source of truth.
- ✦ Refactor · **Schema-Validated Writes** — `updateCustomColorizerSettings` validates and coerces every field through `buildColorizerCustomEntry` before persisting, eliminating silent data corruption from stale or malformed entries.
- ✦ Refactor · **Unified Key Builders** — `buildCharacterCustomColorizerKey`, `buildCustomColorizerKey`, and `resolveCustomColorizerSettings` provide a consistent API for looking up character and persona overrides across all call sites.

---

## v0.12.5 — 2026-05-20

*Layout Migration & Editor UX*

- ✔ Fix · **Saved Layout Migration** — desktop and mobile saved layouts now both migrate on extension start, ensuring new/default tabs are present somewhere in the UI without duplicating hidden tabs.
- ✔ Fix · **Pending Tab Cleanup** — tabs that changed from pending to normal, including Every Text Line Editor, are removed from stale Pending Tabs entries and restored as normal tabs.
- ✦ Polish · **Layout Editor Drag Targets** — pending-tab drags now visually highlight pending panes and no longer interact with normal tab containers.
- ✦ New · **More Extensions** — added Custom Parameters, Every Text Line Editor, and Card Gallery Viewer to the More tab.

---

## v0.12.4 — 2026-05-20

*Extension Tabs*

- ✦ New · **Card Gallery Tab** — added `cardGalleryViewer` support so the Card Gallery can be captured as a PTMT tab. Existing layouts will automatically migrate to include the new tab.

---

## v0.12.3 — 2026-05-17

*Extension Tabs*

- ✦ New · **Every Text Line Editor Tab** — added `etle--panel` support so SillyTavern-EveryTextLineEditor can be captured as a PTMT tab through pending-tab hydration.

---

## v0.12.2 — 2026-05-13

*Message Rail & UI Opacity*

- ✦ New · **Integrated Message Rail** — ported and rebranded the GPT Message Rail extension into a built-in PTMT subsystem. It provides a sleek, vertical message indicator rail that expands on hover for rapid chat navigation.
- ✔ Fix · **Panel Background Opacity** — forced background alpha to 1 (fully opaque) for drawers, popups, draggable panels, and zoomed avatars in `theme-overrides.css`, ensuring text readability is preserved.

---

## v0.12.1 — 2026-05-13

*Shy Mode Stability*

- ✔ Fix · **Reversed Flow Runaway Hover** — fixed an issue where the tab strip would slide away from the cursor during shy mode reveal in reversed flow panes (tabs on the right/bottom). The strip now correctly anchors to the outer pane edge and expands inward.
- ✔ Fix · **Shy Mode Hover Loop** — fixed an infinite flickering loop that occurred when moving the mouse slightly during the shy tab strip reveal. The tab strip now elevates above the main content area to securely capture pointer events without interference.

---

## v0.12.0 — 2026-05-12

*Theme Palette & Modern Controls*

- ✦ New · **Background Palette Generator** — Theme Colors now includes a wand button that generates SillyTavern and PTMT theme colours from the active background image.
- ✦ New · **Palette Profiles** — added shared Alpha/Solid palette profiles for generated themes, with Solid making the main UI tint opaque while preserving the supporting alpha values.
- ✦ New · **Character Image Palette Generator** — the Character Editor now adds a Character Palette header above Character Dialogue Colorizer, with a wand button and profile selector that generate the same theme colours from the current character image.
- ✔ Fix · **Color Picker Stability** — generated `rgba(...)` colours are preserved for the theme while picker swatches receive safe hex values, preventing accidental alpha loss.
- ✔ Fix · **Message Adaptive Contrast** — chat messages keep their own contrast model based on chat/message bubble backgrounds, including Character Dialogue Colorizer bubble colours and gradients.
- ✔ Fix · **Generated Text Shadows** — generated text shadow colour now moves opposite the main text polarity: darker for bright text, brighter for dark text.
- ✦ Polish · **Modern Flat ST Controls** — refreshed sliders, toggles, checkboxes, inputs, drawers, and settings panels with compact flat styling and consistent theme-derived colours.

---

## v0.11.6 — 2026-05-09

*Split Compass Routing*

- ✦ New · **Existing Pane Drop Targets** — when dragging over a pane that is already part of a split, the split compass now shows an extra target for the neighboring existing pane so tabs can be moved into it directly.
- ✔ Fix · **Tab Strip Drag Updates** — corrected the drag fast-path so tab-strip drop indicators continue updating when hovering the same tab-strip element.
- ✔ Fix · **Split Compass Robustness** — disabled split directions no longer visually activate, invalid drag sessions are guarded, and existing-pane targets are positioned from actual pane geometry.
- ✔ Fix · **Orientation-Aware Panel Motion** — panel switch animations now mirror correctly for top, bottom, left, and right tab strip flows.
- ✔ Fix · **Shy Tab Strip Motion** — shy-mode tab strip reveal/hide now uses consistent transform and grid-track transitions across horizontal, vertical, and reversed panes.

---

## v0.11.5 — 2026-05-09

*Dialogue Colorizer Rewrite*

- ✦ Refactor/New · **Split Character / Persona Controls** — Layout Settings now gives Characters and Personas (User) their own Colorize Target, Bubble Color Mode, gradient angle, static colours, and opacity controls.
- ✦ New · **Gradient Bubble Mode** — bubble gradients now pick the inner avatar palette pair (second-darkest + second-lightest when available)
- ✦ New · **Gradient Editor Rebuild** — rebuilt the gradient editor with stable stop dragging, keyboard support, reset handling, and angle-aware thumb flipping for 180°+ / 270°+ gradients.
- © Migration · Legacy per-character and per-persona Dialogue Colorizer overrides are reset once for the new key format. Global Dialogue Colorizer settings and layout settings are preserved.

---

## v0.11.4 — 2026-05-08

*Expanded Extension Ecosystem*

- ✦ New · **Supported Extensions** — added native support for [SillyTavern-Tracker](https://github.com/kaldigo/SillyTavern-Tracker) and [SillyTavern-Variable-Viewer](https://github.com/LenAnderson/SillyTavern-Variable-Viewer).

---

## v0.11.3 — 2026-05-06

*Surgical Animation Control*

- ✦ New · **Opt-in Animation Model** — completely refactored the animation system to be additive rather than suppressive. Instead of forcing animations off globally, PTMT now surgically injects transitions and animations only when the global toggle is active, preventing interference with third-party extensions and internal tab content.
- ✔ Fix · **Internal Tab Fluidity** — internal chat animations, message bubbles, and external extension UIs inside tabs now retain their native transitions regardless of PTMT's global animation setting.
- ✔ Fix · **Clean DOM** — removed legacy `animation` attributes from the DOM; all motion is now handled natively via CSS scoping on `body.ptmt-enable-animations`.

---

## v0.11.2 — 2026-05-06

*Global Style Reorganization*

- ✦ New · **Global Style Section** — introduced a dedicated **Global Style** section in the settings panel, separating visual aesthetics from structural layout.
- ✦ New · **Style Modularization** — moved **UI Theme**, **Animations**, **Shadows**, **Tab Strip Mode**, **Icons Only**, and **Background Over Chat** settings into the Global Style section for better discoverability.
- © Integration · Refined the settings panel assembly for smoother rendering and more consistent state management.

---

## v0.11.1 — 2026-05-06

*Shy Mode Polish*

- ✔ Fix · **Shy Mode in Splits** — hovering a shy indicator for a pane inside a split container now perfectly floats the tab strip over adjacent panes instead of pushing them and disrupting the split layout.

---

## v0.11.0 — 2026-05-05

*Unified Tab Strip Modes & Layout Editor UX*

- ✦ New · **Tab Strip Mode** setting introduced, replacing the old Auto-Hide checkbox. Features three states: **Normal**, **Auto-Hide**, and **Shy**.
- ✦ New · **Shy Mode** — minimizes the tab strip to a thin indicator bar *even when the pane is collapsed*. Hovering the indicator brings the tab strip out as a sleek floating overlay.
- ✦ New · **Layout Editor Indicator Icons** — pane titles now display a row of subtle icons indicating their active settings (Expanded/Collapsed Orientation, Flow, Icons Only, Tab Strip Mode) at a glance.
- ✦ New · Replaced the right-click "Auto-Hide" toggle on tab strips with a **Cycle Tab Strip Mode** button (Normal → Auto-Hide → Shy).
- ✦ New · Redesigned the Layout Editor with a modern glassmorphism aesthetic and interactive hover states for config buttons.
- ✔ Fix · **Panel Drift** — resolved an issue where layout columns would micro-shift by a few pixels on each collapse-expand cycle due to splitter widths (6px) not being correctly factored into the flex basis calculation.
- © Integration · Automated background migration smoothly converts legacy `tabStripAutoHide` settings to the new `tabStripMode` format.

---

## v0.10.6 — 2026-05-01

*World Info Status Bar*

- ✦ New · **World Info Status Bar** — Shows active World Info entries
- © Integration · Based on [SillyTavern-WorldInfoInfo](https://github.com/LenAnderson/SillyTavern-WorldInfoInfo) by LenAnderson

---

## v0.10.5 — 2026-04-29

*Layout Integrity · Context Menu UX*

- ✔ Fix · Switching back from Mobile Layout to Desktop Layout no longer leaves tabs in icon-only mode (missing text)
- ✔ Fix · Users already affected by the broken-save bug are auto-healed on next load via snapshot v19→v20 migration — `showIconsOnly` is now stored in each layout snapshot so desktop and mobile layouts always restore their own correct tab-label state
- ✦ New · Per-pane **Icons Only** and **Auto-Hide Tab Strip** toggles in the right-click context menu are now disabled (greyed out) when the respective global setting is ON, with a tooltip explaining the global override
- ✦ New · Same global override lockout applied in the **Edit Pane** dialog — fields show *(Global)* suffix and are non-interactive when the global setting controls them

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
