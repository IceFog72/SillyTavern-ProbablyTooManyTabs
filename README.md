# SillyTavern — ProbablyTooManyTabs

An extension that transforms the SillyTavern interface into a flexible tabbed workspace, allowing you to organize all UI elements into customizable columns.

<img width="2560" height="1402" alt="image" src="https://github.com/user-attachments/assets/b2383dd1-0bed-4180-9c5e-441a0d306381" />

---
[SillyTavern-ProbablyTooManyTabs short video preview](https://youtu.be/U-8KmMOxBiY?si=MeKfrM42STPKlSpf)

[v0.12 preview](https://youtu.be/O_-PirGq3x8)

---

## Features

- **Multi-column layout**: Left, center, and right columns with resizable widths
- **Draggable tabs**: Move tabs between panes with drag-and-drop
- **Pane splitting**: Split panes horizontally or vertically
- **Layout persistence**: Layouts are automatically saved and restored
- **Mobile support**: Optimized mobile layout with icon-only tabs; PTMT blocks SillyTavern's default `mobile-styles.css` while active so ST mobile CSS does not fight the layout
- **Presets**: Save and load custom layouts
- **Theme integration**: Custom colors and theme overrides
- **Dialogue Colorizer**: Avatar-based quoted text and bubble tinting, with global and per-character/persona overrides
- **Reset shortcut**: Press `Alt+Shift+R` outside text inputs to reset the layout after confirmation

---

## Installation

1. Install via SillyTavern's extension installer, or
2. Clone into `SillyTavern/public/scripts/extensions/third-party/`

---

## Requirements

- SillyTavern (staging branch)
- Modern browser (Chrome, Firefox, Edge)


## Status

 Due to lack of support, development of PTMT and other extensions is currently frozen. Existing installations remain functional, but no new features or updates are being added at this time.


## Quick Start

### Basic Usage

1. **Move tabs**: Drag tabs between panes or columns
2. **Resize**: Drag column or pane dividers
3. **Split panes**: Drag a tab to the edge of a pane
4. **Collapse**: Click active tab to collapse pane
5. **Reset layout**: Open Layout Settings and click **Reset Layout to Default**, or press `Alt+Shift+R` outside text inputs


---

## Adapted Extensions

PTMT integrates with these SillyTavern extensions:

- [Extension-Notebook](https://github.com/SillyTavern/Extension-Notebook)
- [SillyTavern-QuickRepliesDrawer](https://github.com/LenAnderson/SillyTavern-QuickRepliesDrawer)
- [Extension-Objective](https://github.com/SillyTavern/Extension-Objective) (popup)
- [ST-SuperObjective](https://github.com/ForgottenGlory/ST-SuperObjective) (popup)
- [Extension-TopInfoBar](https://github.com/SillyTavern/Extension-TopInfoBar)
- [st-memory-enhancement](https://github.com/muyoou/st-memory-enhancement)
- [SillyTavern-MoonlitEchoesTheme](https://github.com/RivelleDays/SillyTavern-MoonlitEchoesTheme) (popup)
- [expressions-plus](https://github.com/Tyranomaster/expressions-plus)
- [SillyTavern-CharacterLibrary](https://github.com/Sillyanonymous/SillyTavern-CharacterLibrary)
- [SillyTavern-WorldInfoInfo](https://github.com/LenAnderson/SillyTavern-WorldInfoInfo) (World Info integration as status bar)
- [SillyTavern-Tracker](https://github.com/kaldigo/SillyTavern-Tracker)
- [SillyTavern-Variable-Viewer](https://github.com/LenAnderson/SillyTavern-Variable-Viewer)
- [RPG Companion](https://github.com/SpicyMarinara/rpg-companion-sillytavern)

> **Note**: For popup windows, press the extension's popup button to be added as tab

**Need another extension adapted?** Reach out on Discord.

---

### Project Structure

```text
SillyTavern-ProbablyTooManyTabs/
├── src/
│   ├── index.js       # Entry point, public API and lifecycle
│   ├── core/          # Settings, constants, shared helpers and reload recovery
│   ├── layout/        # Panes, sizing, resizing, snapshots and transactions
│   ├── tabs/          # Tab lifecycle, pending tabs, actions and drag-and-drop
│   ├── editor/        # Layout editor, settings dialogs and Info panel
│   ├── theme/         # Image palettes, theme colors and browser tint
│   ├── colorizer/     # Dialogue colors, personal overrides and gradient editor
│   ├── integrations/  # SillyTavern UI integrations and compatibility helpers
│   └── ui/            # Context menus and injected controls
├── scripts/           # Development checks
├── tests/             # Regression checks and palette preview
├── style.css
├── theme-overrides.css
└── content/           # In-app Guide / What's New / More
```

---

## Support

- **Discord**: [https://discord.gg/2tJcWeMjFQ](https://discord.gg/2tJcWeMjFQ)
- **SillyTavern Discord**: Find me on the official server
- **GitHub Issues**: Bug reports and feature requests

---

## Support Development


Support my projects: [💸 PayPal](https://www.paypal.com/ncp/payment/ABWFG6Y3SRGE6)

---

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=IceFog72/SillyTavern-ProbablyTooManyTabs&type=date&legend=top-left)](https://www.star-history.com/?repos=IceFog72%2FSillyTavern-ProbablyTooManyTabs&type=date&legend=top-left)

---

## Development checks

Run `npm test` for regression checks and `npm run check` for JavaScript syntax checks. No dependency install is needed. See [tests/README.md](tests/README.md) for requirements and coverage limits.

## License

GNU License - See [LICENSE](LICENSE) for details.
