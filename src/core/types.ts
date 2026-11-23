// types.ts - PTMT (ProbablyTooManyTabs) Type Definitions
// Core type definitions for the SillyTavern PTMT extension

export type ColumnName = 'left' | 'center' | 'right';
export type Orientation = 'horizontal' | 'vertical';
export type ViewOrientationSetting = 'auto' | 'horizontal' | 'vertical';
export type ContentFlow = 'default' | 'reversed';
export type TabStripMode = 'normal' | 'auto-hide' | 'shy';
export type ColorizerSource = 'avatar_vibrant' | 'static_color';
export type BubbleMode = 'avatar_light' | 'avatar_dark' | 'static_color' | 'gradient';
export type ColorizeTarget = 1 | 2 | 3;
export type MessageRailFilter = 'all' | 'user' | 'char' | 'bookmarked' | string;
export type TabActionType = 'onInit' | 'onSelect' | 'onCollapse' | 'onOpen';
export type RelativePanePosition = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'strip';

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export interface HSL {
    h: number;
    s: number;
    l: number;
}

export interface GradientStop {
    color: string;
    position: number;
}

export interface ColorizerCustomEntry {
    dialogSource: ColorizerSource;
    dialogStatic: string;
    bubbleMode: BubbleMode;
    bubbleStatic1: string;
    bubbleStatic2: string;
    colorizeTarget: ColorizeTarget;
    bubbleOpacity: number;
    bubbleGradientStops: GradientStop[];
    bubbleGradientAngle: number;
    bubbleColorMode?: number;
}

export interface TabData {
    panelId?: string | null;
    sourceId?: string | null;
    title?: string | null;
    icon?: string | null;
    color?: string | null;
    collapsed?: boolean;
    active?: boolean;
    order?: number;
    isDefault?: boolean;
    customContent?: string | null;
    customData?: Record<string, unknown>;
}

export interface ViewSettings {
    minimalPanelSize: number;
    defaultOrientation: ViewOrientationSetting;
    collapsedOrientation: ViewOrientationSetting;
    contentFlow: ContentFlow;
    tabStripMode?: TabStripMode;
    iconOnly?: boolean;
    tabAlignEnd?: boolean;
    showTabListButton?: boolean;
    showMaximizeButton?: boolean;
    showUndockHandle?: boolean;
    appliedOrientation?: string | null;
    lastExpandedOrientation?: string | null;
}

export interface PaneNode {
    type: 'pane';
    paneId?: string;
    flex?: string | null;
    lastFlex?: string | null;
    minWidth?: string | null;
    minHeight?: string | null;
    actualWidth?: string;
    actualHeight?: string;
    viewSettings?: Partial<ViewSettings>;
    tabs: TabData[];
    isCollapsed?: boolean;
    columnLocation?: string | null;
}

export interface SplitNode {
    type: 'split';
    flex?: string | null;
    lastFlex?: string | null;
    orientation: Orientation;
    naturalOrientation?: Orientation;
    orientationExpanded?: string | null;
    orientationCollapsed?: string | null;
    sizingStrategy?: string | null;
    children: LayoutNode[];
    splitRatios?: number[];
    actualWidth?: string;
    actualHeight?: string;
    isCollapsed?: boolean;
    columnLocation?: string | null;
}

export type LayoutNode = PaneNode | SplitNode;

export interface GhostTab {
    searchId: string;
    searchClass: string;
    paneId?: string;
    column?: string;
    sourceId?: string;
    active?: boolean;
    collapsed?: boolean;
}

export interface ResizerState {
    type: Orientation;
    prevFlex: string;
    nextFlex: string;
    disabled: boolean;
}

export interface HiddenTab {
    sourceId: string;
    title?: string;
    icon?: string;
    color?: string | null;
    active?: boolean;
    collapsed?: boolean;
    searchId?: string;
    panelId?: string;
}

export interface ColumnLayout {
    flex?: string | null;
    content: LayoutNode | null;
    ghostTabs: GhostTab[];
}

export interface ColumnSizes {
    left: string;
    center: string;
    right: string;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftLastFlex?: string | null;
    centerLastFlex?: string | null;
    rightLastFlex?: string | null;
}

export interface PanelLocation {
    column: ColumnName;
    paneIndex: number;
}

export interface LayoutSnapshot {
    version: number;
    timestamp?: number;
    mode?: 'mobile' | 'desktop';
    showIconsOnly: boolean;
    showLeft: boolean;
    showRight: boolean;
    columnSizes: ColumnSizes;
    columns: {
        left: ColumnLayout;
        center: ColumnLayout;
        right: ColumnLayout;
    };
    resizerStates?: ResizerState[];
    hiddenTabs: HiddenTab[];
    panelLocations?: Array<[string, PanelLocation]>;
    dockState?: import('../dock/dock-types.js').SerializedDockExtensionState;
}

export interface Preset {
    id?: string;
    name: string;
    layout: LayoutSnapshot;
}

export interface PanelMapping {
    id: string;
    title: string;
    icon: string;
    color?: string;
}

export interface ThemeConfig {
    name: string;
    description: string;
    variables: Record<string, string>;
}

export interface PTMTSettings {
    showLeftPane: boolean;
    showRightPane: boolean;
    showIconsOnly: boolean;
    tabStripAutoHide: boolean;
    tabStripMode: TabStripMode;
    maxLayersLeft: number;
    maxLayersCenter: number;
    maxLayersRight: number;
    runMoveBgDivs: boolean;
    moveBg1ToSheld: boolean;
    isMobile: boolean;
    hideContentWhileResizing: boolean;
    showContextStatusBar: boolean;
    showWorldInfoStatusBar: boolean;
    enableAnimations: boolean;
    enableShadows: boolean;
    enableBlurEffect: boolean;
    enableOverride1: boolean;
    enableAutoContrast: boolean;
    enableBrowserBackgroundTint: boolean;
    enableDialogueColorizer: boolean;
    autoOpenFirstCenterTab: boolean;
    enableAvatarExpressionSync: boolean;
    dialogueColorizerSource: ColorizerSource;
    dialogueColorizerStaticColor: string;
    dialogueColorizerBubbleSource: ColorizerSource;
    dialogueColorizerBubbleStaticColor1: string;
    dialogueColorizerBubbleStaticColor2: string;
    dialogueColorizerPersonaSource: ColorizerSource;
    dialogueColorizerPersonaStaticColor: string;
    dialogueColorizerPersonaBubbleSource: ColorizerSource;
    dialogueColorizerPersonaBubbleStaticColor1: string;
    dialogueColorizerPersonaBubbleStaticColor2: string;
    messageRailEnabled: boolean;
    messageRailFilter: MessageRailFilter;
    messageRailExcludeSystem: boolean;
    messageRailMaxDots: number;
    messageRailScrollBehavior: ScrollBehavior;
    dialogueColorizerColorizeTarget: ColorizeTarget;
    dialogueColorizerPersonaColorizeTarget: ColorizeTarget;
    dialogueColorizerBubbleOpacityBot: number;
    dialogueColorizerBubbleOpacityUser: number;
    dialogueColorizerBubbleMode: BubbleMode;
    dialogueColorizerPersonaBubbleMode: BubbleMode;
    dialogueColorizerBubbleGradientStops: GradientStop[];
    dialogueColorizerBubbleGradientAngle: number;
    dialogueColorizerPersonaBubbleGradientStops: GradientStop[];
    dialogueColorizerPersonaBubbleGradientAngle: number;
    dialogueColorizerSettingsVersion: number;
    charCustomColorizerEnabled: string[];
    charCustomColorizerSettings: Record<string, Partial<ColorizerCustomEntry>>;
    personaCustomColorizerEnabled: string[];
    personaCustomColorizerSettings: Record<string, Partial<ColorizerCustomEntry>>;
    avatarBaseHeight: string;
    avatarBaseWidth: string;
    avatarBaseBorderRadius: string;
    normalAvatarSize: string;
    avatarScaleWidth: string;
    avatarScaleHeight: string;
    charListAvatarWidth: string;
    charListAvatarHeight: string;
    charListAvatarScale: string;
    bodyBgColor: string;
    lastSeenVersion: string | null;
    uiTheme: string;
    panelMappings: PanelMapping[];
    presets: Preset[];
    savedLayoutDesktop: LayoutSnapshot | null;
    savedLayoutMobile: LayoutSnapshot | null;
    defaultLayout: LayoutSnapshot;
    mobileLayout: LayoutSnapshot;
    dockingSizeStrategy?: import('../dock/dock-types.js').DockingSizeStrategy;
    tabAlignEnd?: boolean;
    showTabListButton?: boolean;
    showMaximizeButton?: boolean;
    showUndockHandle?: boolean;
}

export interface PTMTRefs {
    main: HTMLElement | null;
    mainBody: HTMLElement | null;
    leftBody: HTMLElement | null;
    centerBody: HTMLElement | null;
    rightBody: HTMLElement | null;
    dropIndicator: HTMLElement | null;
    splitOverlay: HTMLElement | null;
}

export interface DragContext {
    pid: string;
    elUnder: Element | null;
    paneUnder: HTMLElement;
    overTabStrip: boolean;
    wantsCopy: boolean;
    clientX: number;
    clientY: number;
}

export interface PTMTAppState {
    isHydrating: boolean;
    isPTMTResetting: boolean;
    updateTabStripMode?: () => void;
}

export interface SettingsChangedEventDetail {
    changed: string[];
    allSettings: Partial<PTMTSettings>;
}

export interface LayoutChangedEventDetail {
    reason?: string;
    pane?: HTMLElement;
    [key: string]: unknown;
}

export interface OpenTabSettingsEventDetail {
    sourceId?: string;
    panelId?: string;
    tabElement?: HTMLElement | null;
    tabRow?: HTMLElement | null;
    [key: string]: unknown;
}

export interface PTMTAPI {
    createTabFromContent: (...args: any[]) => any;
    moveNodeIntoTab: (...args: any[]) => any;
    listTabs: (...args: any[]) => any;
    openTab: (...args: any[]) => any;
    closeTabById: (...args: any[]) => any;
    getPanelById: (pid: string) => HTMLElement | null;
    getTabById: (pid: string) => HTMLElement | null;
    setDefaultPanelById: (...args: any[]) => any;
    moveTabIntoPaneAtIndex: (...args: any[]) => any;
    openViewSettingsDialog: (...args: any[]) => any;
    readPaneViewSettings: (pane: HTMLElement | null) => ViewSettings;
    writePaneViewSettings: (pane: HTMLElement, newPaneSettings: Partial<ViewSettings>) => void;
    setActivePanelInPane: (...args: any[]) => any;
    setTabCollapsed: (...args: any[]) => any;
    applyPaneOrientation: (...args: any[]) => any;
    attachResizer: (...args: any[]) => any;
    setSplitOrientation: (...args: any[]) => any;
    updateSplitCollapsedState: (...args: any[]) => any;
    applySplitOrientation: (...args: any[]) => any;
    generateLayoutSnapshot: () => LayoutSnapshot | null;
    applyLayoutSnapshot?: (snapshot: LayoutSnapshot | null) => void;
    destroyTabById: (...args: any[]) => any;
    updatePendingTabColumn: (...args: any[]) => any;
    checkPaneForIconMode: (...args: any[]) => any;
    hideTabById?: (panelId: string, index?: number | null) => boolean;
    restoreHiddenTab?: (sourceId: string) => boolean;
    isTabHidden?: (sourceId: string) => boolean;
    saveLayout: () => void;
    loadLayout: () => void;
    resetLayout: () => Promise<void> | void;
    savePreset: (name: string) => void;
    loadPreset: (id: string) => void;
    deletePreset: (id: string) => Promise<void> | void;
    switchToMobileLayout: (sourceLayout?: LayoutSnapshot | null) => void;
    switchToDesktopLayout: (sourceLayout?: LayoutSnapshot | null) => void;
    toggleMobileMode: () => Promise<void> | void;
    getAvailableThemes?: () => Array<{ id: string; name: string; description: string }>;
    setUITheme?: (themeName: string) => void;
    getCurrentUITheme?: () => string;
    dock?: import('../dock/dock-reconciler.js').PTMTDockController;
    floatTab?: (panelId: string, geometry?: Partial<import('../dock/dock-types.js').DockFloatingGeometry>) => string | null;
    floatTabGroup?: (panelIds: readonly string[], geometry?: Partial<import('../dock/dock-types.js').DockFloatingGeometry>, activePanelId?: string) => string | null;
    floatPane?: (paneOrId: HTMLElement | string | null | undefined, geometry?: Partial<import('../dock/dock-types.js').DockFloatingGeometry>) => string | null;
    dockFloatingContainer?: (containerId: string, targetPaneEl?: HTMLElement | null, zone?: import('../dock/dock-types.js').DockZone, column?: ColumnName) => HTMLElement | null;
    mergeFloatingContainers?: (sourceContainerId: string, targetContainerId: string) => boolean;
    maximizePane?: (paneOrId: HTMLElement | string | null) => boolean;
    setDockingSizeStrategy?: (strategy: import('../dock/dock-types.js').DockingSizeStrategy) => void;
    savePerspective?: (name: string) => void;
    openPerspective?: (name: string) => import('../dock/dock-types.js').DockRestoreResult;
    removePerspective?: (name: string) => boolean;
    listPerspectives?: () => string[];
    manager?: { cleanup(): void; [key: string]: any };
    _refs: () => PTMTRefs;
    [key: string]: any;
}
