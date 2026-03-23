# Snapshot Migration System

## Overview

The snapshot migration system prevents data loss when the layout format changes. Instead of auto-resetting older snapshots to defaults, it runs sequential migrations to upgrade them to the current version.

## Version Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SNAPSHOT_VERSION` | 15 | Minimum supported version (rejects below this) |
| `SNAPSHOT_CURRENT_VERSION` | 16 | Version written by `generateLayoutSnapshot()` |

## How It Works

```
User loads saved snapshot (v15)
    │
    ▼
validateSnapshot()
    │
    ├─ version < 15? → reject (too old, show toast, load default)
    │
    ├─ version < 16? → migrateSnapshot()
    │       │
    │       ├─ SNAPSHOT_MIGRATIONS[15](snap) → snap.version = 16
    │       │
    │       ├─ success? → use migrated snapshot
    │       │
    │       └─ failure? → reject (show toast, load default)
    │
    └─ version >= 16? → use as-is
```

## Adding a Future Migration

When the snapshot format changes:

### 1. Bump the current version

```js
const SNAPSHOT_CURRENT_VERSION = 17;
```

### 2. Add a migration function

```js
const SNAPSHOT_MIGRATIONS = {
    15: (snap) => {
        snap.version = 16;
        return snap;
    },
    16: (snap) => {
        // Your transformation here
        snap.newField = snap.oldField || defaultValue;
        delete snap.oldField;
        snap.version = 17;
        return snap;
    },
};
```

### 3. Update default layouts

In `settings.js`, bump both `defaultLayout.version` and `mobileLayout.version`:

```js
defaultLayout: { version: 17, ... },
mobileLayout:  { version: 17, ... },
```

### 4. Update the test

In `__tests__/settings.test.js`:

```js
expect(layout.version).toBe(17);
```

## Migration Rules

- **Pure function**: Each migration takes a snapshot and returns a new/modified snapshot. Don't rely on external state.
- **Sequential**: Migrations run in order (15→16→17). Skipping versions is not supported.
- **Idempotent-safe**: If a migration runs twice (shouldn't happen), it should not corrupt data.
- **Fail loudly**: Throw on unrecoverable errors. The engine catches the error, logs it, and falls back to defaults.
- **Safety limit**: Max 10 migration steps per load to prevent infinite loops.

## Example: Adding a Field

```js
16: (snap) => {
    // v16 added per-pane view settings
    for (const col of ['left', 'center', 'right']) {
        const content = snap.columns[col]?.content;
        if (content?.type === 'pane') {
            content.viewSettings = content.viewSettings || {
                minimalPanelSize: 250,
                defaultOrientation: 'auto',
            };
        }
    }
    snap.version = 17;
    return snap;
},
```

## Example: Renaming a Field

```js
16: (snap) => {
    // Rename columnSizes.leftCollapsed → columnSizes.leftIsCollapsed
    if (snap.columnSizes) {
        snap.columnSizes.leftIsCollapsed = snap.columnSizes.leftCollapsed;
        delete snap.columnSizes.leftCollapsed;
    }
    snap.version = 17;
    return snap;
},
```

## Example: Restructuring Nested Data

```js
16: (snap) => {
    // Flatten ghostTabs from per-column to top-level
    snap.ghostTabs = [
        ...(snap.columns.left?.ghostTabs || []),
        ...(snap.columns.center?.ghostTabs || []),
        ...(snap.columns.right?.ghostTabs || []),
    ];
    for (const col of ['left', 'center', 'right']) {
        delete snap.columns[col]?.ghostTabs;
    }
    snap.version = 17;
    return snap;
},
```

## Failure Behavior

| Scenario | Result |
|----------|--------|
| Migration function throws | Log error → toast → load default layout |
| No migration registered for version | Log warning → toast → load default layout |
| Migration loop exceeds 10 steps | Log warning → load default layout |
| Final version != `SNAPSHOT_CURRENT_VERSION` | Log warning → load default layout |
| Snapshot version > current (future format) | Use as-is (forward compatibility) |
