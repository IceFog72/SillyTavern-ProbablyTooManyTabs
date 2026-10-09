import { el } from './utils.js';

let editorIdCounter = 0;
let stopIdCounter = 0;

const DEFAULT_COLOR = '#ffffff';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizePosition(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(clamp(number, 0, 1) * 1000) / 1000;
}

function normalizeAngle(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 225;
    return Math.round(clamp(number, 0, 360));
}

function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim());
}

function normalizeColor(value) {
    return isHexColor(value) ? value.trim().toLowerCase() : DEFAULT_COLOR;
}

function createStop({ color = DEFAULT_COLOR, position = 0.5, id = null } = {}) {
    return {
        id: id || `ptmt-ge-stop-${++stopIdCounter}`,
        color: normalizeColor(color),
        position: normalizePosition(position),
    };
}

function serializeStops(stops) {
    return [...stops]
        .sort((a, b) => a.position - b.position)
        .map(({ color, position }) => ({ color, position }));
}

function gradientCss(stops, angle) {
    const sorted = serializeStops(stops);
    if (sorted.length === 0) return 'none';
    if (sorted.length === 1) return sorted[0].color;
    const parts = sorted.map(stop => `${stop.color} ${Math.round(stop.position * 100)}%`);
    return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

export class GradientEditor {
    constructor({
        stops = [],
        onChange = () => { },
        angle = 225,
        showAngle = true,
        showReset = false,
        showPalette = true,
        showTrack = true,
        onReset = () => { },
        colors = [],
    } = {}) {
        this._id = `ptmt-ge-${++editorIdCounter}`;
        this._stops = this._normalizeStops(stops);
        this._palette = this._normalizePalette(colors.length > 0 ? colors : stops.map(stop => stop.color));
        this._angle = normalizeAngle(angle);
        this._onChange = onChange;
        this._onReset = onReset;
        this._showAngle = showAngle;
        this._showReset = showReset;
        this._showPalette = showPalette;
        this._showTrack = showTrack;

        this._root = null;
        this._paletteEl = null;
        this._customColor = this._palette.at(-1) || DEFAULT_COLOR;
        this._customPicker = null;
        this._trackEl = null;
        this._thumbLayerEl = null;
        this._angleInput = null;
        this._angleValue = null;
        this._emptyEl = null;

        this._selectedStopId = this._stops[0]?.id ?? null;
        this._selectionEl = null;
        this._stopPicker = null;
        this._stopColorInput = null;
        this._stopPositionInput = null;
        this._removeButton = null;
        this._syncingSelection = false;

        this._drag = null;
        this._boundMove = null;
        this._boundEnd = null;
    }

    get stops() {
        return serializeStops(this._stops);
    }

    set stops(value) {
        this._stopDrag();
        this._stops = this._normalizeStops(value);
        this._selectedStopId = this._stops[0]?.id ?? null;
        if (this._palette.length === 0) {
            this._palette = this._normalizePalette(this._stops.map(stop => stop.color));
        }
        this._render();
    }

    get colors() {
        return [...this._palette];
    }

    set colors(value) {
        this._palette = this._normalizePalette(value);
        this._renderPalette();
    }

    get angle() {
        return this._angle;
    }

    set angle(value) {
        this._angle = normalizeAngle(value);
        if (this._angleInput) this._angleInput.value = String(this._angle);
        if (this._angleValue) this._angleValue.textContent = `${this._angle}deg`;
        this._renderStops();
        this._updatePreview();
    }

    get cssGradient() {
        return gradientCss(this._stops, this._angle);
    }

    _positionToDisplay(position) {
        return normalizePosition(position);
    }

    _displayToPosition(displayPosition) {
        return normalizePosition(displayPosition);
    }

    mount(container) {
        if (this._root) return;

        this._root = el('div', { id: this._id, className: 'ptmt-gradient-editor' });

        const topRow = el('div', { className: 'ptmt-ge-top-row' });
        if (this._showPalette) {
            this._paletteEl = el('div', { className: 'ptmt-ge-palette' });
            topRow.appendChild(this._paletteEl);
        }
        topRow.appendChild(this._buildControls());

        if (this._showTrack) {
            this._trackEl = el('div', {
                className: 'ptmt-ge-preview-bar',
                role: 'group',
                'aria-label': 'Gradient scale. Press Enter to add a stop.',
                tabindex: '0',
                title: 'Click to add a color stop',
            });
            this._thumbLayerEl = el('div', { className: 'ptmt-ge-thumb-track' });
            this._emptyEl = el('div', { className: 'ptmt-ge-empty' }, 'No gradient stops');
            this._trackEl.append(this._emptyEl, this._thumbLayerEl);

            this._trackEl.addEventListener('pointerdown', (event) => this._handleTrackPointerDown(event));
            this._trackEl.addEventListener('keydown', (event) => this._handleTrackKeyDown(event));
        }

        this._root.appendChild(topRow);
        if (this._trackEl) {
            this._root.appendChild(this._trackEl);
            this._root.appendChild(this._buildSelectionControls());
        }
        container.appendChild(this._root);
        this._render();
    }

    destroy() {
        this._stopDrag();
        this._root?.remove();
        this._root = null;
        this._paletteEl = null;
        this._customColor = this._palette.at(-1) || DEFAULT_COLOR;
        this._customPicker = null;
        this._trackEl = null;
        this._thumbLayerEl = null;
        this._angleInput = null;
        this._angleValue = null;
        this._emptyEl = null;
        this._selectionEl = null;
        this._stopPicker = null;
        this._stopColorInput = null;
        this._stopPositionInput = null;
        this._removeButton = null;
    }

    _buildControls() {
        const controls = el('div', { className: 'ptmt-ge-controls' });

        if (this._showAngle) {

            this._angleValue = el('span', { className: 'ptmt-ge-angle-value' }, `${this._angle}deg`);
            this._angleInput = el('input', {
                type: 'range',
                min: '0',
                max: '360',
                step: '1',
                value: String(this._angle),
                className: 'ptmt-ge-angle-slider',
                title: 'Gradient angle',
                'aria-label': 'Gradient angle',
            });
            this._angleInput.addEventListener('input', () => {
                this._angle = normalizeAngle(this._angleInput.value);
                this._angleValue.textContent = `${this._angle}deg`;
                this._renderStops();
                this._updatePreview();
                this._emitChange();
            });

            controls.append(el('span', { className: 'ptmt-ge-angle-label' }, 'Angle'), this._angleInput, this._angleValue);
        }

        if (this._showReset) {
            const resetButton = el('button', {
                type: 'button',
                className: 'ptmt-ge-reset-btn',
                title: 'Reset gradient',
                textContent: 'Reset gradient',
            });
            resetButton.addEventListener('click', () => this._onReset());
            controls.appendChild(resetButton);
        }

        return controls;
    }

    _render() {
        this._renderPalette();
        this._renderStops();
        this._updatePreview();
        this._syncSelection();
    }

    _renderPalette() {
        if (!this._paletteEl) return;
        this._paletteEl.replaceChildren();

        for (const color of this._palette) {
            const isActive = this._stops.some(stop => stop.color === color);
            const swatch = el('button', {
                type: 'button',
                className: `ptmt-ge-swatch${isActive ? ' active' : ''}`,
                title: isActive ? 'Remove this color from the gradient' : 'Add this color to the gradient',
                style: `background-color: ${color};`,
                dataset: { color },
                'aria-label': `${isActive ? 'Remove' : 'Add'} palette color ${color}`,
            });
            swatch.addEventListener('click', () => this._togglePaletteColor(color));
            this._paletteEl.appendChild(swatch);
        }

        this._customPicker = el('toolcool-color-picker', {
            className: 'ptmt-ge-custom-picker',
            'popup-position': 'left',
            'button-width': '28px',
            'button-height': '28px',
            title: 'Choose a custom gradient color',
            'aria-label': 'Custom gradient color',
        });
        this._customPicker.setAttribute('color', this._customColor);
        this._customPicker.addEventListener('change', event => {
            const color = event.detail?.hex8 || event.detail?.hex;
            if (isHexColor(color)) this._customColor = normalizeColor(color);
        });
        this._paletteEl.appendChild(this._customPicker);

        const addColorButton = el('button', {
            type: 'button',
            className: 'ptmt-ge-add-btn',
            title: 'Add selected custom color',
            textContent: '+',
        });
        addColorButton.addEventListener('click', () => this._pickCustomColor());
        this._paletteEl.appendChild(addColorButton);


    }

    _buildSelectionControls() {
        this._selectionEl = el('div', { className: 'ptmt-ge-selection' });
        const colorLabel = el('label', { className: 'ptmt-ge-field' });
        colorLabel.appendChild(el('span', {}, 'Stop color'));
        const colorControls = el('div', { className: 'ptmt-ge-color-controls' });
        this._stopPicker = el('toolcool-color-picker', {
            'popup-position': 'left', 'button-width': '32px', 'button-height': '32px',
            'aria-label': 'Selected stop color',
        });
        this._stopColorInput = el('input', {
            type: 'text', className: 'ptmt-ge-color-input', spellcheck: 'false',
            'aria-label': 'Selected stop hex color', placeholder: '#rrggbb or #rrggbbaa',
        });
        this._stopPicker.addEventListener('change', event => {
            if (this._syncingSelection) return;
            this._setSelectedColor(event.detail?.hex8 || event.detail?.hex);
        });
        this._stopColorInput.addEventListener('change', () => {
            if (!isHexColor(this._stopColorInput.value)) {
                this._stopColorInput.setCustomValidity('Use #rrggbb or #rrggbbaa.');
                this._stopColorInput.reportValidity();
                return;
            }
            this._stopColorInput.setCustomValidity('');
            this._setSelectedColor(this._stopColorInput.value);
        });
        this._stopColorInput.addEventListener('input', () => this._stopColorInput.setCustomValidity(''));
        colorControls.append(this._stopPicker, this._stopColorInput);
        colorLabel.appendChild(colorControls);
        const positionLabel = el('label', { className: 'ptmt-ge-field' });
        positionLabel.appendChild(el('span', {}, 'Position %'));
        this._stopPositionInput = el('input', {
            type: 'number', min: '0', max: '100', step: '0.1',
            className: 'ptmt-ge-position-input', 'aria-label': 'Selected stop position in percent',
        });
        this._stopPositionInput.addEventListener('change', () => {
            const stop = this._selectedStop();
            if (!stop) return;
            if (this._stopPositionInput.value === '' || !this._stopPositionInput.checkValidity()) {
                this._syncSelection();
                return;
            }
            stop.position = normalizePosition(Number(this._stopPositionInput.value) / 100);
            this._renderStops();
            this._updatePreview();
            this._syncSelection();
            this._emitChange();
        });
        positionLabel.appendChild(this._stopPositionInput);
        this._removeButton = el('button', {
            type: 'button', className: 'ptmt-ge-remove-btn', textContent: 'Remove',
            title: 'Remove selected stop',
        });
        this._removeButton.addEventListener('click', () => this._removeStop(this._selectedStopId));
        this._selectionEl.append(colorLabel, positionLabel, this._removeButton);
        return this._selectionEl;
    }

    _selectedStop() {
        return this._stops.find(stop => stop.id === this._selectedStopId);
    }

    _selectStop(stopId) {
        this._selectedStopId = stopId;
        for (const thumb of this._thumbLayerEl?.children || []) {
            const selected = thumb.dataset.stopId === stopId;
            thumb.className = `ptmt-ge-thumb${selected ? ' selected' : ''}`;
        }
        this._syncSelection();
    }

    _syncSelection() {
        if (!this._selectionEl) return;
        const stop = this._selectedStop();
        this._selectionEl.hidden = !stop;
        if (!stop) return;
        this._syncingSelection = true;
        try {
            if (this._stopPicker.getAttribute('color') !== stop.color) this._stopPicker.setAttribute('color', stop.color);
            this._stopColorInput.value = stop.color;
            this._stopColorInput.setCustomValidity('');
            this._stopPositionInput.value = String(Math.round(stop.position * 1000) / 10);
            this._removeButton.disabled = this._stops.length <= 1;
        } finally {
            this._syncingSelection = false;
        }
    }

    _setSelectedColor(color) {
        const stop = this._selectedStop();
        if (!stop || !isHexColor(color)) return;
        const normalized = normalizeColor(color);
        if (stop.color === normalized) return;
        stop.color = normalized;
        // Keep the picker mounted while its popup is open.
        this._renderStops();
        this._updatePreview();
        for (const swatch of this._paletteEl?.querySelectorAll('.ptmt-ge-swatch') || []) {
            const active = this._stops.some(item => item.color === swatch.dataset.color);
            swatch.className = `ptmt-ge-swatch${active ? ' active' : ''}`;
        }
        this._syncSelection();
        this._emitChange();
    }

    _renderStops() {
        if (!this._thumbLayerEl) return;
        const focusedId = this._thumbLayerEl.contains(document.activeElement)
            && document.activeElement.dataset.stopId === this._selectedStopId
            ? this._selectedStopId : null;
        this._thumbLayerEl.replaceChildren();
        if (!this._selectedStop()) this._selectedStopId = this._stops[0]?.id ?? null;
        const sorted = [...this._stops].sort((a, b) => a.position - b.position);
        for (const stop of sorted) {
            const thumb = el('button', {
                type: 'button', role: 'slider',
                className: `ptmt-ge-thumb${stop.id === this._selectedStopId ? ' selected' : ''}`,
                style: `left: ${this._positionToDisplay(stop.position) * 100}%;`,
                title: `${stop.color} at ${Math.round(stop.position * 100)}% — select to edit`,
                'aria-label': 'Gradient color stop', 'aria-valuemin': '0', 'aria-valuemax': '100',
                'aria-valuenow': String(stop.position * 100),
                'aria-valuetext': `${stop.color} at ${Math.round(stop.position * 100)}%`,
                dataset: { stopId: stop.id },
            });
            thumb.append(
                el('span', { className: 'ptmt-ge-thumb-dot', style: `background-color: ${stop.color};` }),
                el('span', { className: 'ptmt-ge-thumb-pos' }, `${Math.round(stop.position * 100)}%`),
            );
            thumb.addEventListener('click', () => this._selectStop(stop.id));
            thumb.addEventListener('focus', () => this._selectStop(stop.id));
            thumb.addEventListener('pointerdown', event => this._startDrag(event, stop.id));
            thumb.addEventListener('keydown', event => this._handleThumbKeyDown(event, stop.id));
            this._thumbLayerEl.appendChild(thumb);
            if (focusedId === stop.id) thumb.focus();
        }
    }

    _updatePreview() {
        if (!this._trackEl || !this._emptyEl) return;
        // The scale represents stop positions; angle only affects the bubble.
        this._trackEl.style.background = gradientCss(this._stops, 90);
        this._emptyEl.style.display = this._stops.length === 0 ? 'flex' : 'none';
    }

    _togglePaletteColor(color) {
        const normalized = normalizeColor(color);
        const matching = this._stops.filter(stop => stop.color === normalized);

        if (matching.length > 0) {
            if (this._stops.length <= matching.length) return;
            const removeIds = new Set(matching.map(stop => stop.id));
            this._stops = this._stops.filter(stop => !removeIds.has(stop.id));
        } else {
            this._addStop(normalized, this._findOpenPosition());
        }

        this._render();
        this._emitChange();
    }

    _pickCustomColor() {
        const color = normalizeColor(this._customColor);
        this._addPaletteColor(color);
        this._addStop(color, this._findOpenPosition());
        this._render();
        this._emitChange();
    }

    _handleTrackPointerDown(event) {
        if (event.button !== 0) return;
        if (event.target.closest?.('.ptmt-ge-thumb')) return;
        const position = this._positionFromPointer(event);
        const color = this._colorForInsertedStop(position);
        this._addStop(color, position);
        this._render();
        this._emitChange();
    }

    _handleTrackKeyDown(event) {
        if (event.target !== this._trackEl) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const color = this._palette[0] || this._stops[0]?.color || DEFAULT_COLOR;
        this._addStop(color, this._findOpenPosition());
        this._render();
        this._emitChange();
    }

    _handleThumbKeyDown(event, stopId) {
        const stop = this._stops.find(item => item.id === stopId);
        if (!stop) return;

        const step = event.shiftKey ? 0.1 : 0.01;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stop.position = normalizePosition(stop.position - step);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            stop.position = normalizePosition(stop.position + step);
        } else if (event.key === 'Home') {
            event.preventDefault();
            stop.position = this._displayToPosition(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            stop.position = this._displayToPosition(1);
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && this._stops.length > 1) {
            event.preventDefault();
            this._removeStop(stopId);
            return;
        } else {
            return;
        }

        this._renderStops();
        this._updatePreview();
        this._syncSelection();
        this._emitChange();
    }

    _startDrag(event, stopId) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const stop = this._stops.find(item => item.id === stopId);
        if (!stop || !this._trackEl) return;

        this._stopDrag();
        this._selectStop(stopId);
        event.currentTarget.focus();
        this._drag = { stopId };

        this._boundMove = moveEvent => this._moveDrag(moveEvent);
        this._boundEnd = () => this._endDrag();
        document.addEventListener('pointermove', this._boundMove);
        document.addEventListener('pointerup', this._boundEnd, { once: true });
        document.addEventListener('pointercancel', this._boundEnd, { once: true });
    }

    _moveDrag(event) {
        if (!this._drag) return;
        event.preventDefault();

        const stop = this._stops.find(item => item.id === this._drag.stopId);
        if (!stop) return;

        stop.position = this._positionFromPointer(event);
        const thumb = this._thumbLayerEl?.querySelector(`[data-stop-id="${CSS.escape(stop.id)}"]`);
        if (thumb) {
            thumb.style.left = `${this._positionToDisplay(stop.position) * 100}%`;
            const label = thumb.querySelector('.ptmt-ge-thumb-pos');
            if (label) label.textContent = `${Math.round(stop.position * 100)}%`;
            thumb.title = `Stop at ${Math.round(stop.position * 100)}%`;
        }
        this._updatePreview();
        this._syncSelection();
    }

    _endDrag() {
        if (!this._drag) return;
        this._stopDrag();
        this._stops.sort((a, b) => a.position - b.position);
        this._renderStops();
        this._updatePreview();
        this._emitChange();
    }

    _stopDrag() {
        if (this._boundMove) {
            document.removeEventListener('pointermove', this._boundMove);
            this._boundMove = null;
        }
        if (this._boundEnd) {
            document.removeEventListener('pointerup', this._boundEnd);
            document.removeEventListener('pointercancel', this._boundEnd);
            this._boundEnd = null;
        }
        this._drag = null;
    }

    _positionFromPointer(event) {
        const rect = this._trackEl.getBoundingClientRect();
        if (!rect.width) return 0;
        return this._displayToPosition((event.clientX - rect.left) / rect.width);
    }

    _addStop(color, position) {
        const stop = createStop({ color, position });
        this._stops.push(stop);
        this._selectedStopId = stop.id;
        this._stops.sort((a, b) => a.position - b.position);
    }

    _removeStop(stopId) {
        if (this._stops.length <= 1) return;
        this._stopDrag();
        this._stops = this._stops.filter(stop => stop.id !== stopId);
        this._render();
        this._emitChange();
    }

    _addPaletteColor(color) {
        const normalized = normalizeColor(color);
        if (!this._palette.includes(normalized)) {
            this._palette.push(normalized);
        }
    }

    _findOpenPosition() {
        const sorted = [...this._stops].sort((a, b) => a.position - b.position);
        if (sorted.length === 0) return 0.5;
        if (sorted.length === 1) return sorted[0].position <= 0.5 ? 1 : 0;

        let bestPosition = 0.5;
        let bestGap = -1;
        const candidates = [
            { gap: sorted[0].position, position: sorted[0].position / 2 },
            { gap: 1 - sorted[sorted.length - 1].position, position: (1 + sorted[sorted.length - 1].position) / 2 },
        ];

        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1].position - sorted[i].position;
            candidates.push({ gap, position: sorted[i].position + gap / 2 });
        }

        for (const candidate of candidates) {
            if (candidate.gap > bestGap) {
                bestGap = candidate.gap;
                bestPosition = candidate.position;
            }
        }

        return normalizePosition(bestPosition);
    }

    _colorForInsertedStop(position) {
        if (this._stops.length === 0) return this._palette[0] || DEFAULT_COLOR;
        const sorted = [...this._stops].sort((a, b) => a.position - b.position);
        let nearest = sorted[0];
        let distance = Math.abs(position - nearest.position);
        for (const stop of sorted.slice(1)) {
            const nextDistance = Math.abs(position - stop.position);
            if (nextDistance < distance) {
                nearest = stop;
                distance = nextDistance;
            }
        }
        return nearest.color;
    }

    _normalizeStops(stops) {
        if (!Array.isArray(stops)) return [];
        return stops
            .filter(stop => stop && isHexColor(stop.color))
            .map(stop => createStop(stop))
            .sort((a, b) => a.position - b.position);
    }

    _normalizePalette(colors) {
        if (!Array.isArray(colors)) return [];
        const seen = new Set();
        const normalized = [];
        for (const color of colors) {
            if (!isHexColor(color)) continue;
            const clean = normalizeColor(color);
            if (seen.has(clean)) continue;
            seen.add(clean);
            normalized.push(clean);
        }
        return normalized;
    }

    _emitChange() {
        this._onChange({
            stops: serializeStops(this._stops),
            angle: this._angle,
            cssGradient: this.cssGradient,
        });
    }
}
