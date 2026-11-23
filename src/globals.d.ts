declare module '*/script.js' {
    export const event_types: Record<string, string>;
    export const eventSource: {
        on(event: string, handler: (...args: any[]) => void): void;
        off(event: string, handler: (...args: any[]) => void): void;
        once?(event: string, handler: (...args: any[]) => void): void;
        emit?(event: string, ...args: any[]): void;
    };
    export const chat: Array<Record<string, any>>;
    export const user_avatar: string;
    export function saveSettingsDebounced(): void;
    export function saveSettings(): Promise<void> | void;
    export function getRequestHeaders(): Record<string, string>;
    export function swipe(event: unknown, direction: number, options?: Record<string, unknown>): Promise<void> | void;
    export function isSwipingAllowed(): boolean;
}

declare module '*/extensions.js' {
    export const extension_settings: {
        PTMT?: Partial<import('./core/types.js').PTMTSettings> & { savedLayout?: unknown };
        [key: string]: any;
    };
    export function getContext(): {
        characters?: Array<Record<string, any>>;
        characterId?: string | number | null;
        chat?: Array<Record<string, any>>;
        groupId?: string | null;
        groups?: Array<Record<string, any>>;
        name1?: string;
        name2?: string;
        [key: string]: any;
    };
}

declare module '*/user.js' {
    export function getCurrentUserHandle(): string;
}

declare module '*/power-user.js' {
    export const power_user: Record<string, any>;
    export function getThemeObject(name?: string): Record<string, any>;
    export function applyPowerUserSettings(): void;
}

declare module '*/backgrounds.js' {
    export const background_settings: Record<string, any>;
    export function loadBackgroundSettings(data: { background: Record<string, any> }): void;
}

declare module '*/scripts/constants.js' {
    export const SWIPE_DIRECTION: {
        LEFT: number;
        RIGHT: number;
        [key: string]: number;
    };
    export const SWIPE_SOURCE: {
        KEYBOARD: string | number;
        [key: string]: string | number;
    };
}

declare module '*/itemized-prompts.js' {
    export const itemizedPrompts: Array<{ mesId: number; [key: string]: any }>;
    export function itemizedParams(
        prompts: Array<{ mesId: number; [key: string]: any }>,
        promptSetIndex: number,
        mesId: number,
    ): Promise<Record<string, any>>;
    export function findItemizedPromptSet(
        prompts: Array<{ mesId: number; [key: string]: any }>,
        mesId: number,
    ): number | undefined;
}

declare module '*/../../utils.js' {
    export function showFontAwesomePicker(): Promise<string | null | undefined>;
}

interface ToolCoolColorPickerElement extends HTMLElement {
    color: string;
    rgba?: string;
    hex?: string;
    hex8?: string;
    opened?: boolean;
    popupPosition?: string;
}

interface ToastrAPI {
    success(message: string, title?: string, options?: Record<string, unknown>): void;
    error(message: string, title?: string, options?: Record<string, unknown>): void;
    info(message: string, title?: string, options?: Record<string, unknown>): void;
    warning(message: string, title?: string, options?: Record<string, unknown>): void;
}

interface JQueryStaticLike {
    (selector: unknown): {
        off(eventType: string, selector?: string, handler?: unknown): unknown;
        on(eventType: string, selector?: string, handler?: unknown): unknown;
        [key: string]: any;
    };
    _data?(element: EventTarget, key: string): Record<string, Array<{ selector?: string; handler?: (...args: any[]) => unknown }>> | undefined;
}

declare const jQuery: JQueryStaticLike | undefined;
declare const $: JQueryStaticLike;

interface Window {
    ptmtTabs?: import('./core/types.js').PTMTAPI;
    toastr?: ToastrAPI;
    jQuery?: JQueryStaticLike;
    SillyTavern?: Record<string, any>;
    __ptmtThemeAppearance?: Record<string, any>;
}

interface HTMLElement {
    _viewSettingsCache?: import('./core/types.js').ViewSettings;
    _grid?: HTMLElement;
    _tabStrip?: HTMLElement;
    _tabStripOuter?: HTMLElement;
    _panelContainer?: HTMLElement;
    _ptmtOriginalParent?: Node | null;
    _ptmtOriginalNextSibling?: Node | null;
    _ptmtPlaceholder?: Comment | null;
    _ptmtStripObserver?: ResizeObserver;
    _ptmtPanel?: HTMLElement;
    _ptmtPanelAnimTimer?: ReturnType<typeof setTimeout> | null;
    _panelRef?: HTMLElement;
    _charlibAC?: AbortController | null;
    _charlibObserver?: MutationObserver | null;
    _ptmtLayoutManager?: any;
    _activateTab?: (tabId: string) => void;
}

interface HTMLElementTagNameMap {
    'toolcool-color-picker': ToolCoolColorPickerElement;
}
