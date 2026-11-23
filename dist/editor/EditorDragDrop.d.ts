import type { LayoutManager } from './LayoutManager.js';
export interface DraggedTabInfo {
    pid?: string | null;
    sourceId?: string;
    searchId?: string;
    searchClass?: string;
    isPending: boolean;
    isHidden: boolean;
    isActive: boolean;
    isCollapsed: boolean;
}
interface SyntheticDragOverEvent {
    preventDefault(): void;
    currentTarget: HTMLElement;
    target: Element;
    clientX?: number;
    clientY: number;
    dataTransfer: {
        dropEffect: string;
    };
}
interface SyntheticDropEvent {
    preventDefault(): void;
    stopPropagation(): void;
    target: Element;
}
export declare function handleDragStart(manager: LayoutManager, e: DragEvent | TouchEvent, pid?: string | null): void;
export declare function handleDragOver(manager: LayoutManager, e: DragEvent | SyntheticDragOverEvent): void;
export declare function handleDragLeave(manager: LayoutManager, _e: DragEvent): void;
export declare function handleDrop(manager: LayoutManager, e: DragEvent | SyntheticDropEvent): void;
export declare function handleTouchStart(manager: LayoutManager, e: TouchEvent, pid?: string | null): void;
export declare function handleTouchMove(manager: LayoutManager, e: TouchEvent): void;
export declare function handleTouchEnd(manager: LayoutManager, e: TouchEvent): void;
export {};
