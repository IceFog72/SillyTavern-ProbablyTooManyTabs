// dock-types.ts - Unified types for the PTMT Dock Engine (synthesizing lace-ts, dock-spawn-ts, and PTMT)
export const PTMT_DOCK_SCHEMA_VERSION = 1;
export var DockFeature;
(function (DockFeature) {
    DockFeature[DockFeature["None"] = 0] = "None";
    DockFeature[DockFeature["Closable"] = 1] = "Closable";
    DockFeature[DockFeature["Movable"] = 2] = "Movable";
    DockFeature[DockFeature["Floatable"] = 4] = "Floatable";
    DockFeature[DockFeature["Pinnable"] = 8] = "Pinnable";
    DockFeature[DockFeature["Maximizable"] = 16] = "Maximizable";
    DockFeature[DockFeature["Collapsible"] = 32] = "Collapsible";
    DockFeature[DockFeature["AllFeatures"] = 63] = "AllFeatures";
})(DockFeature || (DockFeature = {}));
export var DockConfigFlags;
(function (DockConfigFlags) {
    DockConfigFlags[DockConfigFlags["None"] = 0] = "None";
    DockConfigFlags[DockConfigFlags["OpaqueSplitterResize"] = 1] = "OpaqueSplitterResize";
    DockConfigFlags[DockConfigFlags["OpaqueUndocking"] = 2] = "OpaqueUndocking";
    DockConfigFlags[DockConfigFlags["AlwaysShowTabs"] = 4] = "AlwaysShowTabs";
    DockConfigFlags[DockConfigFlags["ShowTabCloseButton"] = 8] = "ShowTabCloseButton";
    DockConfigFlags[DockConfigFlags["ActiveTabHasCloseButton"] = 16] = "ActiveTabHasCloseButton";
    DockConfigFlags[DockConfigFlags["MiddleMouseButtonClosesTab"] = 32] = "MiddleMouseButtonClosesTab";
    DockConfigFlags[DockConfigFlags["DockAreaHasPinButton"] = 64] = "DockAreaHasPinButton";
    DockConfigFlags[DockConfigFlags["DockAreaHasUndockButton"] = 128] = "DockAreaHasUndockButton";
    DockConfigFlags[DockConfigFlags["DockAreaHasMaximizeButton"] = 256] = "DockAreaHasMaximizeButton";
    DockConfigFlags[DockConfigFlags["DockAreaHasCloseButton"] = 512] = "DockAreaHasCloseButton";
    DockConfigFlags[DockConfigFlags["DockAreaHasTabsMenuButton"] = 1024] = "DockAreaHasTabsMenuButton";
    DockConfigFlags[DockConfigFlags["DockAreaHasWrapToggleButton"] = 2048] = "DockAreaHasWrapToggleButton";
    DockConfigFlags[DockConfigFlags["EnableAutoHide"] = 4096] = "EnableAutoHide";
    DockConfigFlags[DockConfigFlags["EnableFullscreen"] = 8192] = "EnableFullscreen";
    DockConfigFlags[DockConfigFlags["EnableTabGroups"] = 16384] = "EnableTabGroups";
    DockConfigFlags[DockConfigFlags["PersistTabGroups"] = 32768] = "PersistTabGroups";
    DockConfigFlags[DockConfigFlags["FloatableTabs"] = 65536] = "FloatableTabs";
    DockConfigFlags[DockConfigFlags["PinnableTabs"] = 131072] = "PinnableTabs";
    DockConfigFlags[DockConfigFlags["DefaultConfig"] = 261607] = "DefaultConfig";
})(DockConfigFlags || (DockConfigFlags = {}));
export const AUTO_HIDE_SIDES = ['left', 'right', 'top', 'bottom'];
export function hasDockFeature(mask, feature) {
    return (mask & feature) === feature;
}
export function hasDockConfigFlag(mask, flag) {
    return (mask & flag) === flag;
}
export function isOuterDockZone(zone) {
    return zone === 'outer-left' || zone === 'outer-right' || zone === 'outer-top' || zone === 'outer-bottom';
}
export function isExistingDockZone(zone) {
    return zone === 'existing-left' || zone === 'existing-right' || zone === 'existing-top' || zone === 'existing-bottom';
}
export function zoneDirection(zone) {
    switch (zone) {
        case 'left':
        case 'outer-left':
        case 'existing-left':
            return 'left';
        case 'right':
        case 'outer-right':
        case 'existing-right':
            return 'right';
        case 'top':
        case 'outer-top':
        case 'existing-top':
            return 'top';
        case 'bottom':
        case 'outer-bottom':
        case 'existing-bottom':
            return 'bottom';
        default:
            return 'center';
    }
}
export function splitOrientationForZone(zone) {
    const dir = zoneDirection(zone);
    // In PTMT, 'vertical' splits place children side-by-side (left/right) with a vertical splitter bar,
    // and 'horizontal' splits stack children top-to-bottom with a horizontal splitter bar.
    return dir === 'top' || dir === 'bottom' ? 'horizontal' : 'vertical';
}
export function isInsertBeforeZone(zone) {
    const dir = zoneDirection(zone);
    return dir === 'left' || dir === 'top';
}
//# sourceMappingURL=dock-types.js.map