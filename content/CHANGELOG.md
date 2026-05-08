# Changelog

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
