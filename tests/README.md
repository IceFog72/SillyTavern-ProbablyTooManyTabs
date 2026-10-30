# Regression checks

From the extension directory, run `npm test` for the Node regression suite and `npm run check` for JavaScript syntax checks.

No dependency install is needed. Use Node 22 or later. Tests use the built-in test runner and experimental VM modules, with SillyTavern imports replaced at their boundaries. The experimental VM warning is expected.

These tests cover module behavior. They do not replace live SillyTavern checks of layout, browser rendering, or third-party extension integration.

Open `tests/palette-preview.html` through a local HTTP server to compare generated themes for warm, cool and neutral images across the five styles.

## Existing local browser smoke checks

Local smoke scripts remain optional and are not part of the Node suite. Load SillyTavern with PTMT enabled, then run this in the browser developer console if the script exists locally:

```js
const { runRuntimeSmoke } = await import('/scripts/extensions/third-party/SillyTavern-ProbablyTooManyTabs/tests/runtime-smoke.js');
await runRuntimeSmoke(window.ptmtTabs);
```

The check restores the persisted snapshot five times, verifies content identity and stable pane/tab counts, checks custom panel reuse, hides and recovers an external panel, checks editor visibility, and checks settings routing. It temporarily changes avatar scale and the selected tab, then restores them in a finally block.

`rail-runtime-smoke.js` prepares 100 temporary DOM messages for hover checks. Inspect `readRailSmoke()`, then run `cleanupRailSmoke()` to restore settings/layout and remove those messages.

`picker-runtime-smoke.js` mounts an isolated gradient editor without changing character colors. Run `cleanupPickerSmoke()` afterward.

`reload-runtime-smoke.js` compares snapshots and rendered theme/background colors across a browser reload. Capture `captureReloadState()` before reloading and pass it to `compareReloadState()` after startup settles. It ignores snapshot timestamps and runtime panel IDs.

`adaptive-contrast-runtime-smoke.js` checks 256 gray levels and six colored backgrounds in an isolated iframe, including body and bubble contrast, text shadows, and the No Text Shadows setting. Pass `{ nativeContrast: false }` to force the fallback.

`composer-runtime-smoke.js` compares the composer with native ST CSS in an isolated iframe. It checks field geometry, multiline sizing, vertical resizing, the outer focus ring, and command-progress clipping without sending or saving text.
