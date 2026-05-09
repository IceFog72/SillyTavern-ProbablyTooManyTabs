import { el } from './utils.js';

let pickerIdCounter = 0;
const COLOR_INPUT_ID = 'ptmt-ge-color-input';

export class GradientEditor {
    constructor({
        stops = [],
        onChange = () => {},
        angle = 225,
        showAngle = true,
        showReset = false,
        onReset = () => {},
        colors = [],
    } = {}) {
        this._stops = stops.length > 0 ? [...stops] : [];
        this._onChange = onChange;
        this._onReset = onReset;
        this._angle = angle;
        this._showAngle = showAngle;
        this._showReset = showReset;
        this._id = `ge-${++pickerIdCounter}`;
        this._root = null;
        this._previewBar = null;
        this._thumbTrack = null;
        this._angleInput = null;
        this._dragging = null;
        this._paletteEl = null;

        if (colors.length > 0) {
            this._allColors = [...colors];
        } else if (stops.length > 0) {
            this._allColors = [...new Set(stops.map(s => s.color))];
        } else {
            this._allColors = [];
        }
    }

    get stops() {
        return [...this._stops];
    }

    set stops(newStops) {
        this._stops = [...newStops];
        this._normalizeStops();
        if (this._allColors.length === 0 && newStops.length > 0) {
            this._allColors = [...new Set(newStops.map(s => s.color))];
        }
        this._renderStops();
        this._renderPalette();
        this._updatePreview();
    }

    get colors() {
        return [...this._allColors];
    }

    set colors(newColors) {
        this._allColors = [...newColors];
        this._renderPalette();
    }

    get angle() {
        return this._angle;
    }

    set angle(deg) {
        this._angle = deg;
        if (this._angleInput) this._angleInput.value = deg;
        this._updatePreview();
    }

    get cssGradient() {
        if (this._stops.length === 0) return 'none';
        const parts = this._stops
            .sort((a, b) => a.position - b.position)
            .map(s => `${s.color} ${Math.round(s.position * 100)}%`);
        return `linear-gradient(${this._angle}deg, ${parts.join(', ')})`;
    }

    mount(container) {
        if (this._root) return;

        this._root = el('div', { className: 'ptmt-gradient-editor', id: this._id });

        const palette = el('div', { className: 'ptmt-ge-palette' });
        this._paletteEl = palette;

        const topRow = el('div', { className: 'ptmt-ge-top-row' });
        topRow.appendChild(palette);
        topRow.appendChild(this._buildControls());

        const previewBar = el('div', { className: 'ptmt-ge-preview-bar' });
        this._previewBar = previewBar;

        const thumbTrack = el('div', { className: 'ptmt-ge-thumb-track' });
        this._thumbTrack = thumbTrack;
        previewBar.appendChild(thumbTrack);

        this._root.appendChild(topRow);
        this._root.appendChild(previewBar);

        container.appendChild(this._root);

        this._renderStops();
        this._renderPalette();
        this._updatePreview();
    }

    destroy() {
        if (this._root && this._root.parentElement) {
            this._root.parentElement.removeChild(this._root);
        }
        this._root = null;
    }

    _buildControls() {
        const controls = el('div', { className: 'ptmt-ge-controls' });

        if (this._showAngle) {
            const angleInp = el('input', {
                type: 'range', min: '0', max: '360', step: '1',
                value: String(this._angle),
                className: 'ptmt-ge-angle-slider',
            });
            this._angleInput = angleInp;
            const angleVal = el('span', { className: 'ptmt-ge-angle-value' }, `${this._angle}°`);
            angleInp.addEventListener('input', () => {
                const v = parseInt(angleInp.value, 10);
                this._angle = v;
                angleVal.textContent = `${v}°`;
                this._updatePreview();
                this._emitChange();
            });
            controls.appendChild(angleInp);
            controls.appendChild(angleVal);
        }

        return controls;
    }

    _renderPalette() {
        if (!this._paletteEl) return;
        this._paletteEl.innerHTML = '';
        this._allColors.forEach(color => {
            const active = this._stops.some(s => s.color === color);
            const swatch = el('div', {
                className: `ptmt-ge-swatch${active ? ' active' : ''}`,
                style: `background-color: ${color};`,
            });
            swatch.addEventListener('click', () => this._toggleColor(color));
            this._paletteEl.appendChild(swatch);
        });
        // "+" button to add custom color
        const addBtn = el('button', {
            className: 'ptmt-ge-add-btn',
            type: 'button',
            title: 'Add custom color',
            textContent: '+',
        });
        addBtn.addEventListener('click', () => this._pickCustomColor());
        this._paletteEl.appendChild(addBtn);
        // Reset button at end of palette
        if (this._showReset) {
            const resetBtn = el('button', {
                className: 'ptmt-ge-reset-btn',
                type: 'button',
                title: 'Reset to auto-detected colors',
                innerHTML: '&#x21bb;',
            });
            resetBtn.addEventListener('click', () => this._onReset());
            this._paletteEl.appendChild(resetBtn);
        }
    }

    _toggleColor(color) {
        const idx = this._stops.findIndex(s => s.color === color);
        if (idx !== -1) {
            if (this._stops.length <= 1) return;
            this._stops.splice(idx, 1);
        } else {
            if (this._stops.length === 0) {
                this._stops.push({ color, position: 0.5 });
            } else {
                const sorted = [...this._stops].sort((a, b) => a.position - b.position);
                let maxGap = 0;
                let insertPos = 0.5;
                for (let i = 0; i < sorted.length - 1; i++) {
                    const gap = sorted[i + 1].position - sorted[i].position;
                    if (gap > maxGap) {
                        maxGap = gap;
                        insertPos = (sorted[i].position + sorted[i + 1].position) / 2;
                    }
                }
                this._stops.push({ color, position: Math.round(insertPos * 100) / 100 });
            }
        }
        this._normalizeStops();
        this._renderStops();
        this._renderPalette();
        this._updatePreview();
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
        const handler = () => {
            const color = input.value;
            input.removeEventListener('input', handler);
            // Add to stops at largest gap
            if (this._stops.length === 0) {
                this._stops.push({ color, position: 0.5 });
            } else {
                const sorted = [...this._stops].sort((a, b) => a.position - b.position);
                let maxGap = 0;
                let insertPos = 0.5;
                for (let i = 0; i < sorted.length - 1; i++) {
                    const gap = sorted[i + 1].position - sorted[i].position;
                    if (gap > maxGap) {
                        maxGap = gap;
                        insertPos = (sorted[i].position + sorted[i + 1].position) / 2;
                    }
                }
                this._stops.push({ color, position: Math.round(insertPos * 100) / 100 });
            }
            this._normalizeStops();
            this._renderStops();
            this._renderPalette();
            this._updatePreview();
            this._emitChange();
        };
        input.addEventListener('input', handler);
        input.click();
    }

    _renderStops() {
        if (!this._thumbTrack) return;
        this._thumbTrack.innerHTML = '';
        this._stops.forEach((stop, i) => {
            const thumb = el('div', {
                className: 'ptmt-ge-thumb',
                style: `left: ${stop.position * 100}%;`,
                'data-index': String(i),
            });

            const dot = el('div', {
                className: 'ptmt-ge-thumb-dot',
                style: `background-color: ${stop.color};`,
            });

            const posLbl = el('span', { className: 'ptmt-ge-thumb-pos' }, `${Math.round(stop.position * 100)}%`);

            thumb.appendChild(dot);
            thumb.appendChild(posLbl);

            // Delete button for non-palette (custom) colors
            if (!this._allColors.includes(stop.color)) {
                const delBtn = el('span', { className: 'ptmt-ge-thumb-del', textContent: '✕' });
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = this._stops.findIndex(s => s.color === stop.color && s.position === stop.position);
                    if (idx !== -1 && this._stops.length > 1) {
                        this._stops.splice(idx, 1);
                        this._normalizeStops();
                        this._renderStops();
                        this._renderPalette();
                        this._updatePreview();
                        this._emitChange();
                    }
                });
                thumb.appendChild(delBtn);
            }

            this._thumbTrack.appendChild(thumb);
            this._bindDrag(thumb, i);
        });
    }

    _updatePreview() {
        if (!this._previewBar) return;
        const parts = this._stops
            .sort((a, b) => a.position - b.position)
            .map(s => `${s.color} ${Math.round(s.position * 100)}%`);
        this._previewBar.style.background = `linear-gradient(90deg, ${parts.join(', ')})`;
    }

    _bindDrag(thumb, index) {
        const onMove = (e) => {
            e.preventDefault();
            const rect = this._previewBar.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let pos = (clientX - rect.left) / rect.width;
            pos = Math.max(0.01, Math.min(0.99, pos));

            if (index === 0) pos = 0;
            else if (index === this._stops.length - 1) pos = 1;

            this._stops[index].position = Math.round(pos * 100) / 100;
            thumb.style.left = `${this._stops[index].position * 100}%`;
            const posLbl = thumb.querySelector('.ptmt-ge-thumb-pos');
            if (posLbl) posLbl.textContent = `${Math.round(this._stops[index].position * 100)}%`;

            this._updatePreview();
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            this._dragging = null;
            this._emitChange();
        };

        thumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._dragging = index;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        thumb.addEventListener('touchstart', (e) => {
            this._dragging = index;
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        }, { passive: true });
    }

    _normalizeStops() {
        this._stops.sort((a, b) => a.position - b.position);
        if (this._stops.length === 0) return;
        this._stops[0].position = 0;
        this._stops[this._stops.length - 1].position = 1;
    }

    _emitChange() {
        this._onChange({
            stops: [...this._stops],
            angle: this._angle,
            cssGradient: this.cssGradient,
        });
    }
}
