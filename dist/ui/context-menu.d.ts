export interface ContextMenuSeparator {
    separator: true;
}
export interface ContextMenuAction {
    separator?: false;
    label: string;
    icon?: string;
    disabled?: boolean;
    disabledTitle?: string;
    onClick?: () => void;
}
export type ContextMenuItem = ContextMenuSeparator | ContextMenuAction;
export declare function showContextMenu(event: MouseEvent, items: ContextMenuItem[]): void;
export declare function hideContextMenu(): void;
