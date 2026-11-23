import type { GradientStop } from '../core/types.js';
interface InternalStop extends GradientStop {
    id: string;
}
export interface GradientChangePayload {
    stops: GradientStop[];
    angle: number;
    cssGradient: string;
}
export interface GradientEditorOptions {
    stops?: GradientStop[];
    onChange?: (payload: GradientChangePayload) => void;
    angle?: number;
    showAngle?: boolean;
    showReset?: boolean;
    showPalette?: boolean;
    showTrack?: boolean;
    onReset?: () => void;
    colors?: string[];
}
export declare class GradientEditor {
    _id: string;
    _stops: InternalStop[];
    _palette: string[];
    _angle: number;
    _onChange: (payload: GradientChangePayload) => void;
    _onReset: () => void;
    _showAngle: boolean;
    _showReset: boolean;
    _showPalette: boolean;
    _showTrack: boolean;
    _root: HTMLDivElement | null;
    _paletteEl: HTMLDivElement | null;
    _customColor: string;
    _customPicker: ToolCoolColorPickerElement | null;
    _trackEl: HTMLDivElement | null;
    _thumbLayerEl: HTMLDivElement | null;
    _angleInput: HTMLInputElement | null;
    _angleValue: HTMLSpanElement | null;
    _emptyEl: HTMLDivElement | null;
    _selectedStopId: string | null;
    _selectionEl: HTMLDivElement | null;
    _stopPicker: ToolCoolColorPickerElement | null;
    _stopColorInput: HTMLInputElement | null;
    _stopPositionInput: HTMLInputElement | null;
    _removeButton: HTMLButtonElement | null;
    _syncingSelection: boolean;
    _drag: {
        stopId: string;
    } | null;
    _boundMove: ((event: PointerEvent) => void) | null;
    _boundEnd: (() => void) | null;
    constructor({ stops, onChange, angle, showAngle, showReset, showPalette, showTrack, onReset, colors, }?: GradientEditorOptions);
    get stops(): GradientStop[];
    set stops(value: GradientStop[]);
    get colors(): string[];
    set colors(value: string[]);
    get angle(): number;
    set angle(value: number);
    get cssGradient(): string;
    _positionToDisplay(position: number): number;
    _displayToPosition(displayPosition: number): number;
    mount(container: HTMLElement): void;
    destroy(): void;
    _buildControls(): HTMLDivElement;
    _render(): void;
    _renderPalette(): void;
    _buildSelectionControls(): HTMLDivElement;
    _selectedStop(): InternalStop | undefined;
    _selectStop(stopId: string): void;
    _syncSelection(): void;
    _setSelectedColor(color: unknown): void;
    _renderStops(): void;
    _updatePreview(): void;
    _togglePaletteColor(color: string): void;
    _pickCustomColor(): void;
    _handleTrackPointerDown(event: PointerEvent): void;
    _handleTrackKeyDown(event: KeyboardEvent): void;
    _handleThumbKeyDown(event: KeyboardEvent, stopId: string): void;
    _startDrag(event: PointerEvent, stopId: string): void;
    _moveDrag(event: PointerEvent): void;
    _endDrag(): void;
    _stopDrag(): void;
    _positionFromPointer(event: PointerEvent): number;
    _addStop(color: string, position: number): void;
    _removeStop(stopId: string): void;
    _addPaletteColor(color: string): void;
    _findOpenPosition(): number;
    _colorForInsertedStop(position: number): string;
    _normalizeStops(stops: GradientStop[]): InternalStop[];
    _normalizePalette(colors: string[]): string[];
    _emitChange(): void;
}
export {};
