# Changelog

---

## v0.12.3 — 2026-05-17

*Extension Tabs*

- ✦ New · **Every Text Line Editor Tab** — added `etle--panel` support so SillyTavern-EveryTextLineEditor can be captured as a PTMT tab through pending-tab hydration.

---

## v0.12.2 — 2026-05-13

*Message Rail & UI Opacity*

- ✦ New · **Integrated Message Rail** — ported and rebranded the GPT Message Rail extension into a built-in PTMT subsystem. It provides a sleek, vertical message indicator rail that expands on hover for rapid chat navigation.
- ✔ Fix · **Panel Background Opacity** — forced background alpha to 1 (fully opaque) for drawers, popups, draggable panels, and zoomed avatars in `overrides-1.css`, ensuring text readability is preserved.

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
