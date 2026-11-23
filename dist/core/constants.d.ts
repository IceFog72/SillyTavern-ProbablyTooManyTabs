/**
 * SillyTavern-specific selectors and constants.
 */
export declare const SELECTORS: {
    readonly ST_CHAT_CONTAINER: "#sheld";
    readonly ST_TEXTAREA: "#curEditTextarea";
    readonly ST_MESSAGE: ".mes";
    readonly ST_AVATAR: ".avatar";
    readonly ST_SWIPE_RIGHT: ".swipe_right";
    readonly ST_SWIPE_LEFT: ".swipe_left";
    readonly ST_ZOOMED_AVATAR_TEMPLATE: "#zoomed_avatar_template";
    readonly ST_MOVING_DIVS: "#movingDivs";
    readonly ST_DRAWER_CLOSED: ".closedDrawer";
    readonly ST_DRAWER_OPEN: ".openDrawer";
    readonly ST_INTERACTABLE: ".interactable";
    readonly ST_MENU_BUTTON: ".menu_button";
    readonly ST_MENU_BUTTON_ICON: ".menu_button_icon";
    readonly ST_DRAG_GRABBER: ".drag-grabber";
    readonly ST_DRAG_CLOSE: ".dragClose";
    readonly ST_ZOOMED_AVATAR: ".zoomed_avatar";
    readonly ST_ZOOMED_AVATAR_CONTAINER: ".zoomed_avatar_container";
    readonly ST_EXPRESSION_IMAGE: "#expression-image, #expression-plus-image:not(.expression-plus-animating)";
    readonly MAIN: "#ptmt-main";
    readonly MAIN_BODY: "#ptmt-mainBody";
    readonly LEFT_BODY: "#ptmt-leftBody";
    readonly CENTER_BODY: "#ptmt-centerBody";
    readonly RIGHT_BODY: "#ptmt-rightBody";
    readonly DROP_INDICATOR: "#ptmt-drop-indicator";
    readonly SPLIT_OVERLAY: "#ptmt-split-overlay";
    readonly STAGING_AREA: "#ptmt-staging-area";
    readonly SETTINGS_WRAPPER: "#ptmt-settings-wrapper";
    readonly OVERRIDES_LINK: "#ptmt-overrides-1";
    readonly COLUMN: ".ptmt-body-column";
    readonly SPLIT: ".ptmt-split";
    readonly PANE: ".ptmt-pane";
    readonly TAB: ".ptmt-tab";
    readonly TAB_STRIP: ".ptmt-tabStrip";
    readonly PANEL: ".ptmt-panel";
    readonly PANEL_CONTAINER: ".ptmt-panelContainer";
    readonly RESIZER_V: ".ptmt-resizer-vertical";
    readonly RESIZER_H: ".ptmt-resizer-horizontal";
    readonly COLUMN_RESIZER: ".ptmt-column-resizer";
    readonly VIEW_COLLAPSED: ".view-collapsed";
    readonly CONTAINER_COLLAPSED: ".ptmt-container-collapsed";
    readonly TAB_ICON: ".ptmt-tab-icon";
    readonly TAB_LABEL: ".ptmt-tab-label";
    readonly EDITOR_TAB: ".ptmt-editor-tab";
    readonly ICON_PICKER_BTN: ".ptmt-icon-picker-btn";
    readonly UNIFIED_EDITOR: "#ptmt-unified-editor";
    readonly DROP_INDICATOR_CLASS: ".drop-indicator";
    readonly TAB_CONFIG_BTN: ".ptmt-tab-config-btn";
    readonly PANE_CONFIG_BTN: ".ptmt-pane-config-btn";
};
/**
 * Common event names used within PTMT.
 */
export declare const EVENTS: {
    readonly LAYOUT_CHANGED: "ptmt:layoutChanged";
    readonly SETTINGS_CHANGED: "ptmt:settingsChanged";
    readonly OPEN_TAB_SETTINGS: "ptmt:openTabSettings";
};
/**
 * Layout and animation constants.
 */
export declare const LAYOUT: {
    readonly MIN_COLLAPSED_PIXELS: () => number;
    readonly SHY_INDICATOR_WIDTH: 10;
    readonly NARROW_PANE_THRESHOLD_PX: 120;
    readonly MAX_PANE_LAYERS: 3;
    readonly DEFAULT_MIN_PANEL_SIZE_PX: 250;
    readonly DEFAULT_PANE_FLEX_BASIS: "1 1 50%";
    readonly DEFAULT_PANE_FLEX_BASIS_FULL: "1 1 100%";
    readonly SETTINGS_PANEL_FLEX: "1 1 300px";
    readonly RESIZER_WIDTH: 6;
};
export declare const MESSAGES: {
    readonly RESET_CONFIRMATION: "Are you sure you want to reset ALL SETTINGS to factory default? This will reload the page.";
    readonly LAYOUT_SAVED: (mode: string) => string;
    readonly LAYOUT_NOT_FOUND: (mode: string) => string;
};
