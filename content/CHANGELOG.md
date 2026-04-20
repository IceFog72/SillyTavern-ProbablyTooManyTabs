# Changelog

---

## v0.10.0 — 2026-04-20

*Personal Dialogue Colorizer*

- ✦ New · **Personal Dialogue Colorizer** — per-character and per-persona custom dialogue colorizer settings that override global settings
- ✦ New · Per-character colorizer UI injected above character bio in character editor
- ✦ New · Per-persona colorizer UI injected in persona management panel
- ✔ Fix · Colorizer control order: Colorize Target → Dialogue Color Source → Dialogue Color Mode → Bubble Color Source → Bubble Color Mode → Opacity

---

## v0.9.9 — 2026-04-19

*Guide Accuracy · Dead Code Cleanup · More Extensions*

- ✔ Fix · Removed fabricated "Hold Ctrl to copy tab" hint — feature was never wired up
- ✔ Fix · Right-click context menu docs now correctly describe both tab menu (Edit Tab) and tab strip menu (Edit Pane, Icons Only)
- ✔ Fix · Pane Settings popup fields documented accurately (Orientation, Content Order, Icons Only)
- ✔ Fix · Pending Tabs description corrected — panels injected dynamically by JS at runtime
- ✔ Fix · Removed stale `cloneTabIntoPane` / `cloneTabIntoSplit` imports from drag-drop.js (dead callers)
- ✦ New · More tab: added PocketTTS-WebSocket, pocket-tts-openapi, SimpleQRBarToggle, CustomThemeStyleInputs

---

## v0.9.7 — 2026-04-19

*Info Panel, Guide & Changelog · Split Compass*

- ✦ New · Added in-app Info panel with Beginner's Guide, Changelog, and More tabs
- ✦ New · New users are greeted with the Guide on first open
- ✦ New · Changelog tab opens automatically after an update
- ✦ New · Split Compass widget — drag a tab over any pane to get a precise 5-zone drop target (center, top, bottom, left, right)
- ✔ Fix · Tab sizing consistency across Sharp and Smooth themes

---

## v0.9.6 — 2026-04-18

*Theme-Aware Tab UI*

- ✦ New · Standardized theme-aware tab sizing via CSS variables
- ✦ New · Uniform icon-only square tabs across all themes
- ✔ Fix · Tab strip padding sync for horizontal and vertical orientations
- ✔ Fix · Layout shift prevention on hover for all themes

