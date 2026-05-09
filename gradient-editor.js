import { el } from './utils.js';

let editorIdCounter = 0;
let stopIdCounter = 0;

const COLOR_INPUT_ID = 'ptmt-ge-color-input';
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
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
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

function shouldFlipStopAxis(angle) {
    const normalized = ((normalizeAngle(angle) % 360) + 360) % 360;
    return normalized >= 180 && normalized < 360;
}

export class GradientEditor {
    constructor({
        stops = [],
        onChange = () => {},
        angle = 225,
        showAngle = true,
        showReset = false,
        showPalette = true,
        showTrack = true,
        onReset = () => {},
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
        this._trackEl = null;
        this._thumbLayerEl = null;
        this._angleInput = null;
        this._angleValue = null;
        this._emptyEl = null;

        this._drag = null;
        this._boundMove = null;
        this._boundEnd = null;
    }

    get stops() {
        return serializeStops(this._stops);
    }

    set stops(value) {
        this._stops = this._normalizeStops(value);
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
        return shouldFlipStopAxis(this._angle) ? 1 - normalizePosition(position) : normalizePosition(position);
    }

    _displayToPosition(displayPosition) {
        return shouldFlipStopAxis(this._angle) ? 1 - normalizePosition(displayPosition) : normalizePosition(displayPosition);
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
                role: 'slider',
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
        if (this._trackEl) this._root.appendChild(this._trackEl);
        container.appendChild(this._root);
        this._render();
    }

    destroy() {
        this._stopDrag();
        this._root?.remove();
        this._root = null;
        this._paletteEl = null;
        this._trackEl = null;
        this._thumbLayerEl = null;
        this._angleInput = null;
        this._angleValue = null;
        this._emptyEl = null;
    }

    _buildControls() {
        const controls = el('div', { className: 'ptmt-ge-controls' });

        if (this._showAngle) {
            this._angleInput = el('input', {
                type: 'range',
                min: '0',
                max: '360',
                step: '1',
                value: String(this._angle),
                className: 'ptmt-ge-angle-slider',
                title: 'Gradient angle',
            });
            this._angleValue = el('span', { className: 'ptmt-ge-angle-value' }, `${this._angle}deg`);
            this._angleInput.addEventListener('input', () => {
                this._angle = normalizeAngle(this._angleInput.value);
                this._angleValue.textContent = `${this._angle}deg`;
                this._renderStops();
                this._updatePreview();
                this._emitChange();
            });

            controls.append(this._angleInput, this._angleValue);
        }

        if (this._showReset && !this._showPalette) {
            const resetButton = el('button', {
                type: 'button',
                className: 'ptmt-ge-reset-btn',
                title: 'Reset gradient',
                textContent: 'Reset',
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
            });
            swatch.addEventListener('click', () => this._togglePaletteColor(color));
            this._paletteEl.appendChild(swatch);
        }

        const addColorButton = el('button', {
            type: 'button',
            className: 'ptmt-ge-add-btn',
            title: 'Add custom color',
            textContent: '+',
        });
        addColorButton.addEventListener('click', () => this._pickCustomColor());
        this._paletteEl.appendChild(addColorButton);

        if (this._showReset) {
            const resetButton = el('button', {
                type: 'button',
                className: 'ptmt-ge-reset-btn',
                title: 'Reset to auto-detected colors',
                textContent: 'Reset',
            });
            resetButton.addEventListener('click', () => this._onReset());
            this._paletteEl.appendChild(resetButton);
        }
    }

    _renderStops() {
        if (!this._thumbLayerEl) return;
        this._thumbLayerEl.replaceChildren();

        const sorted = [...this._stops].sort((a, b) => a.position - b.position);
        for (const stop of sorted) {
            const thumb = el('button', {
                type: 'button',
                className: 'ptmt-ge-thumb',
                style: `left: ${this._positionToDisplay(stop.position) * 100}%;`,
                title: `Stop at ${Math.round(stop.position * 100)}%`,
                dataset: { stopId: stop.id },
            });

            const dot = el('span', {
                className: 'ptmt-ge-thumb-dot',
                style: `background-color: ${stop.color};`,
            });
            const label = el('span', { className: 'ptmt-ge-thumb-pos' }, `${Math.round(stop.position * 100)}%`);
            thumb.append(dot, label);

            if (this._stops.length > 1) {
                const deleteButton = el('span', {
                    className: 'ptmt-ge-thumb-del',
                    title: 'Remove stop',
                    textContent: 'x',
                });
                deleteButton.addEventListener('pointerdown', event => event.stopPropagation());
                deleteButton.addEventListener('click', event => {
                    event.stopPropagation();
                    this._removeStop(stop.id);
                });
                thumb.appendChild(deleteButton);
            }

            thumb.addEventListener('pointerdown', event => this._startDrag(event, stop.id));
            thumb.addEventListener('keydown', event => this._handleThumbKeyDown(event, stop.id));
            this._thumbLayerEl.appendChild(thumb);
        }
    }

    _updatePreview() {
        if (!this._trackEl || !this._emptyEl) return;
        this._trackEl.style.background = this.cssGradient;
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
        let input = document.getElementById(COLOR_INPUT_ID);
        if (!input) {
            input = document.createElement('input');
            input.id = COLOR_INPUT_ID;
            input.type = 'color';
            input.style.position = 'fixed';
            input.style.opacity = '0';
            input.style.pointerEvents = 'none';
            document.body.appendChild(input);
        }

        input.value = this._stops.at(-1)?.color || this._palette.at(-1) || DEFAULT_COLOR;
        input.onchange = () => {
            const color = normalizeColor(input.value);
            this._addPaletteColor(color);
            this._addStop(color, this._findOpenPosition());
            input.onchange = null;
            this._render();
            this._emitChange();
        };
        input.click();
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
        const direction = shouldFlipStopAxis(this._angle) ? -1 : 1;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stop.position = normalizePosition(stop.position - (step * direction));
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            stop.position = normalizePosition(stop.position + (step * direction));
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
        this._emitChange();
    }

    _startDrag(event, stopId) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const stop = this._stops.find(item => item.id === stopId);
        if (!stop || !this._trackEl) return;

        this._drag = { stopId };
        event.currentTarget.setPointerCapture?.(event.pointerId);

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
        this._stops.push(createStop({ color, position }));
        this._stops.sort((a, b) => a.position - b.position);
    }

    _removeStop(stopId) {
        if (this._stops.length <= 1) return;
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
