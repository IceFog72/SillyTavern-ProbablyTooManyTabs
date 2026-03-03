// constants.js

/**
 * SillyTavern-specific selectors and constants.
 */
export const SELECTORS = {
    // SillyTavern Core
    ST_CHAT_CONTAINER: '#sheld',
    ST_TEXTAREA: '#curEditTextarea',
    ST_MESSAGE: '.mes',
    ST_AVATAR: '.avatar',
    ST_SWIPE_RIGHT: '.swipe_right',
    ST_SWIPE_LEFT: '.swipe_left',
    ST_ZOOMED_AVATAR_TEMPLATE: '#zoomed_avatar_template',
    ST_MOVING_DIVS: '#movingDivs',
    ST_DRAWER_CLOSED: '.closedDrawer',
    ST_DRAWER_OPEN: '.openDrawer',
    ST_INTERACTABLE: '.interactable',
    ST_MENU_BUTTON: '.menu_button',
    ST_MENU_BUTTON_ICON: '.menu_button_icon',
    ST_DRAG_GRABBER: '.drag-grabber',
    ST_DRAG_CLOSE: '.dragClose',
    ST_ZOOMED_AVATAR: '.zoomed_avatar',
    ST_ZOOMED_AVATAR_CONTAINER: '.zoomed_avatar_container',

    // PTMT Internal Structure
    MAIN: '#ptmt-main',
    MAIN_BODY: '#ptmt-mainBody',
    LEFT_BODY: '#ptmt-leftBody',
    CENTER_BODY: '#ptmt-centerBody',
    RIGHT_BODY: '#ptmt-rightBody',
    DROP_INDICATOR: '#ptmt-drop-indicator',
    SPLIT_OVERLAY: '#ptmt-split-overlay',
    STAGING_AREA: '#ptmt-staging-area',
    SETTINGS_WRAPPER: '#ptmt-settings-wrapper',
    OVERRIDES_LINK: '#ptmt-overrides-1',

    // PTMT Component Classes
    COLUMN: '.ptmt-body-column',
    SPLIT: '.ptmt-split',
    PANE: '.ptmt-pane',
    TAB: '.ptmt-tab',
    TAB_STRIP: '.ptmt-tabStrip',
    PANEL: '.ptmt-panel',
    PANEL_CONTAINER: '.ptmt-panelContainer',
    RESIZER_V: '.ptmt-resizer-vertical',
    RESIZER_H: '.ptmt-resizer-horizontal',
    COLUMN_RESIZER: '.ptmt-column-resizer',
    VIEW_COLLAPSED: '.view-collapsed',
    CONTAINER_COLLAPSED: '.ptmt-container-collapsed',

    // UI and Editor elements
    TAB_ICON: '.ptmt-tab-icon',
    TAB_LABEL: '.ptmt-tab-label',
    EDITOR_TAB: '.ptmt-editor-tab',
    ICON_PICKER_BTN: '.ptmt-icon-picker-btn',
    UNIFIED_EDITOR: '#ptmt-unified-editor',
    DROP_INDICATOR_CLASS: '.drop-indicator',
    TAB_CONFIG_BTN: '.ptmt-tab-config-btn',
    PANE_CONFIG_BTN: '.ptmt-pane-config-btn',
};


/**
 * Common event names used within PTMT.
 */
export const EVENTS = {
    LAYOUT_CHANGED: 'ptmt:layoutChanged',
    SETTINGS_CHANGED: 'ptmt:settingsChanged',
    OPEN_TAB_SETTINGS: 'ptmt:openTabSettings',
};

/**
 * Layout and animation constants.
 */
export const LAYOUT = {
    MIN_COLLAPSED_PIXELS: 38,
    NARROW_PANE_THRESHOLD_PX: 120,
    MAX_PANE_LAYERS: 3,
    DEFAULT_MIN_PANEL_SIZE_PX: 250,
    DEFAULT_PANE_FLEX_BASIS: '1 1 50%',
    DEFAULT_PANE_FLEX_BASIS_FULL: '1 1 100%',
};

