# Memory Leak Fixes - Summary

This document summarizes all the memory leak fixes applied to the ProbablyTooManyTabs extension.

## 1. ResizeObserver Leak in pane.js

**Problem:** The `tabStripOverflowObserver` ResizeObserver was created once at module load time and observed tab strips when panes were created, but was never disconnected when panes were removed.

**Solution:**
- Added `cleanupPaneObservers()` function to unobserve tab strips
- Called in `removePaneIfEmpty()` before pane removal

**Files Modified:**
- `pane.js` (lines 371-382): Added cleanup function and call site

**Code Changes:**
```javascript
export function cleanupPaneObservers(pane) {
  if (pane && pane._tabStrip) {
    tabStripOverflowObserver.unobserve(pane._tabStrip);
  }
}

export function removePaneIfEmpty(pane, depth = 0) {
  // ... existing code ...
  
  // Clean up observers before removing the pane to prevent memory leaks
  cleanupPaneObservers(pane);
  
  // ... rest of function ...
}
```

---

## 2. Event Listener Accumulation in LayoutManager.js

**Problem:** The `ptmt:layoutChanged` event listener was added every time `createSettingsPanel()` was called, but never removed. This caused the listener to accumulate if the settings panel was destroyed and recreated.

**Solution:**
- Store event handler reference in constructor
- Remove existing listener before adding new one
- Added `cleanup()` method to properly remove listener
- Added `handleTouchCancel()` method for touch event cleanup

**Files Modified:**
- `LayoutManager.js` (lines 8-17, 162-170, 1093-1115)

**Code Changes:**
```javascript
// In constructor:
this._layoutChangeHandler = null;

// In createSettingsPanel():
if (this._layoutChangeHandler) {
    window.removeEventListener('ptmt:layoutChanged', this._layoutChangeHandler);
}
this._layoutChangeHandler = () => this.renderUnifiedEditor();
window.addEventListener('ptmt:layoutChanged', this._layoutChangeHandler);

// New cleanup method:
cleanup() {
    if (this._layoutChangeHandler) {
        window.removeEventListener('ptmt:layoutChanged', this._layoutChangeHandler);
        this._layoutChangeHandler = null;
    }
    if (this.touchDragGhost) {
        this.touchDragGhost.remove();
        this.touchDragGhost = null;
    }
}
```

---

## 3. Observer Cleanup in pending-tabs.js

**Problem:** 
- `hydrationObserver` was disconnected but not set to null when reinitializing
- No cleanup function existed for the observers
- Early return in `initPendingTabsManager` could leave observer in inconsistent state

**Solution:**
- Set `hydrationObserver` to null after disconnecting
- Added `cleanupPendingTabsObservers()` function
- Export cleanup function for external use

**Files Modified:**
- `pending-tabs.js` (lines 180-186, 252-268)

**Code Changes:**
```javascript
// In initPendingTabsManager():
if (hydrationObserver) {
    hydrationObserver.disconnect();
    hydrationObserver = null;
}

// New cleanup function:
export function cleanupPendingTabsObservers() {
    if (hydrationObserver) {
        hydrationObserver.disconnect();
        hydrationObserver = null;
    }
    if (demotionObserver) {
        demotionObserver.disconnect();
        demotionObserver = null;
    }
    pendingTabsMap.clear();
}
```

---

## 4. MutationObserver Leak in misc-helpers.js

**Problem:** The drawer observer created in `initDrawerObserver()` was not stored globally and couldn't be cleaned up if the function was called multiple times.

**Solution:**
- Store observer in module-level variable
- Disconnect existing observer before creating new one
- Added `cleanupDrawerObserver()` function

**Files Modified:**
- `misc-helpers.js` (lines 3, 109-145)

**Code Changes:**
```javascript
let drawerObserver = null;

export function initDrawerObserver() {
    // Disconnect existing observer to prevent memory leaks
    if (drawerObserver) {
        drawerObserver.disconnect();
        drawerObserver = null;
    }

    drawerObserver = new MutationObserver((mutationsList) => {
        // ... existing observer logic ...
    });

    // ... existing setup code ...
    return drawerObserver;
}

export function cleanupDrawerObserver() {
    if (drawerObserver) {
        drawerObserver.disconnect();
        drawerObserver = null;
        console.log('[PTMT] Drawer state observer cleaned up.');
    }
}
```

---

## Testing

To verify the memory leak fixes:

1. **ResizeObserver Test:**
   - Open Chrome DevTools Performance monitor
   - Create and close multiple tabs repeatedly
   - Observer count should remain stable

2. **Event Listener Test:**
   - Open Layout Settings multiple times
   - Check Event Listeners in DevTools
   - `ptmt:layoutChanged` listeners should not accumulate

3. **MutationObserver Test:**
   - Reload extension multiple times
   - Check Memory tab in DevTools
   - Observer-related memory should be freed

## Impact

These fixes prevent:
- Gradual memory accumulation during long sessions
- Performance degradation over time
- Potential browser tab crashes after extended use
- DOM nodes not being garbage collected

## Next Steps

To complete the cleanup system:
1. Call `LayoutManager.cleanup()` when settings panel is destroyed
2. Call `cleanupPendingTabsObservers()` when extension unloads
3. Call `cleanupDrawerObserver()` when extension unloads
4. Add extension unload detection in index.js to trigger all cleanup
