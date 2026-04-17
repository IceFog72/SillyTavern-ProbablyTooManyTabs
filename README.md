# SillyTavern — ProbablyTooManyTabs

An extension that transforms the SillyTavern interface into a flexible tabbed workspace, allowing you to organize all UI elements into customizable columns.

<img width="2560" height="1392" alt="PTMT Desktop Layout" src="https://github.com/user-attachments/assets/f3b9670b-d447-46a0-9b12-6f7c8e9383fd" />

<img width="2560" height="1392" alt="PTMT Mobile Layout" src="https://github.com/user-attachments/assets/12260322-ffa2-4bc0-9593-d60f186cbd67" />

---

## Features

- **Multi-column layout**: Left, center, and right columns with resizable widths
- **Draggable tabs**: Move tabs between panes with drag-and-drop
- **Pane splitting**: Split panes horizontally or vertically
- **Layout persistence**: Layouts are automatically saved and restored
- **Mobile support**: Optimized mobile layout with icon-only tabs
- **Presets**: Save and load custom layouts
- **Theme integration**: Custom colors and theme overrides

---

## Installation

1. Install via SillyTavern's extension installer, or
2. Clone into `SillyTavern/public/scripts/extensions/third-party/`

---

## Requirements

- SillyTavern (staging branch)
- Modern browser (Chrome, Firefox, Edge)

---

## Quick Start

### Basic Usage

1. **Move tabs**: Drag tabs between panes or columns
2. **Resize**: Drag column or pane dividers
3. **Split panes**: Drag a tab to the edge of a pane
4. **Collapse**: Click active tab to collapse pane


---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API_REFERENCE.md) | Complete API documentation |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [Snapshot Migration](docs/SNAPSHOT_MIGRATION.md) | Layout version migrations |

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

> **Note**: For popup windows, press the extension's popup button to integrate.

**Need another extension adapted?** Reach out on Discord.

---

### Project Structure

```
SillyTavern-ProbablyTooManyTabs/
├── index.js        # Entry point, API
├── tabs.js         # Tab lifecycle
├── pane.js         # Pane management
├── layout.js       # Column layout
├── resizer.js      # Resize handling
├── drag-drop.js    # Drag and drop
├── snapshot.js     # Layout persistence
├── settings.js     # Settings management
├── style.css       # Styles (2200+ lines)
└── __tests__/ # Test files
```

---

## Support

- **Discord**: [https://discord.gg/2tJcWeMjFQ](https://discord.gg/2tJcWeMjFQ)
- **SillyTavern Discord**: Find me on the official server
- **GitHub Issues**: Bug reports and feature requests

---

## Support Development

[Patreon](https://www.patreon.com/cw/IceFog72)

---

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=IceFog72/SillyTavern-ProbablyTooManyTabs&type=date&legend=top-left)](https://www.star-history.com/?repos=IceFog72%2FSillyTavern-ProbablyTooManyTabs&type=date&legend=top-left)

---

## License

MIT License - See [LICENSE](LICENSE) for details.
