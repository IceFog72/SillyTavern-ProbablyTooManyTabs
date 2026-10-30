import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildThemeFromColors, buildThemeFromImage, PALETTE_PROFILES } from '../src/theme/palette-generator.js';

function parse(value) {
    const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
    assert.ok(match, `valid sRGB output: ${value}`);
    const [r, g, b, a] = match.slice(1).map(Number);
    assert.ok([r, g, b].every(channel => channel >= 0 && channel <= 255));
    assert.ok(a >= 0 && a <= 1);
    return { r, g, b, a };
}
function luminance(color) {
    return ['r', 'g', 'b'].reduce((sum, key, i) => {
        const value = color[key] / 255;
        return sum + [0.2126, 0.7152, 0.0722][i] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    }, 0);
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + 0.05) / (values[0] + 0.05);
}
const samples = [
    ['#000000'], ['#ffffff'], ['#808080'], ['#775533', '#aa7733', '#dd9944'],
    ['#051525', '#144d81', '#57cbd9'], ['#ff0000', '#00ff00', '#0000ff'],
    ['#fef7f0', '#edcbbc', '#a3476b'],
];
for (const profile of Object.keys(PALETTE_PROFILES)) {
    test(`${profile} produces readable text roles across neutral, warm, cool and vivid images`, () => {
        for (const sample of samples) {
            const colors = Object.fromEntries(Object.entries(buildThemeFromColors(sample, profile)).map(([key, value]) => [key, parse(value)]));
            const surfaces = ['chat_tint_color', 'ptmt_ui_background_2', 'blur_tint_color', 'ptmt_textbox_background', 'ptmt_tabs_background'].map(key => colors[key]);
            const ui = colors.blur_tint_color;
            const layered = surfaces.map(surface => Object.fromEntries(['r', 'g', 'b'].map(key => [key, Math.round(surface[key] * surface.a + ui[key] * (1 - surface.a))])));
            for (const key of ['main_text_color', 'italics_text_color', 'quote_text_color', 'underline_text_color', 'ptmt_tabs_color']) {
                for (const background of [...surfaces, ...layered]) {
                    assert.ok(contrast(colors[key], background) >= (key === 'main_text_color' ? 7 : 4.5), `${profile} ${sample} ${key} contrast ${contrast(colors[key], background)}`);
                }
            }
            assert.equal(colors.blur_tint_color.a, profile.endsWith('-normal') ? 1 : 0.7);
            assert.equal(colors.chat_tint_color.a, 0.5);
            assert.equal(colors.ptmt_ui_background_2.a, 0.3);
        }
    });
}
test('warm source hues stay warm instead of being replaced with blue surfaces', () => {
    const theme = buildThemeFromColors(['#775533', '#aa7733', '#dd9944']);
    for (const key of ['chat_tint_color', 'ptmt_ui_background_2', 'blur_tint_color']) {
        const color = parse(theme[key]);
        assert.ok(color.r > color.b, `${key} retains warm hue`);
    }
});
test('neutral images stay neutral, empty palettes remain usable, and generation is deterministic', () => {
    for (const color of Object.values(buildThemeFromColors(['#808080']))) {
        const { r, g, b } = parse(color);
        assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1);
    }
    assert.equal(Object.keys(buildThemeFromColors([])).length, 12);
    Object.values(buildThemeFromColors([])).forEach(parse);
    assert.deepEqual(buildThemeFromColors(['#775533', '#dd9944']), buildThemeFromColors(['#775533', '#dd9944']));
});

test('chromatic images produce distinct quote and split-complementary underline roles', () => {
    const theme = buildThemeFromColors(['#aa7733', '#dd9944']);
    const quote = parse(theme.quote_text_color), underline = parse(theme.underline_text_color);
    assert.ok(Math.hypot(quote.r - underline.r, quote.g - underline.g, quote.b - underline.b) > 50);
});

test('black and white source images remain neutral through actual image extraction', () => {
    const original = globalThis.document;
    try {
        for (const channel of [0, 255]) {
            globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([channel, channel, channel, 255]) }) }) }) };
            const theme = buildThemeFromImage({ naturalWidth: 1, naturalHeight: 1 });
            for (const value of Object.values(theme)) {
                const { r, g, b } = parse(value);
                assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, `image channel ${channel}: ${value}`);
            }
        }
    } finally {
        if (original === undefined) delete globalThis.document;
        else globalThis.document = original;
    }
});

test('neutral image pixels do not displace a usable colored cluster', () => {
    const original = globalThis.document;
    try {
        const colors = [[187, 102, 51, 255]];
        const generate = pixels => {
            globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(pixels.flat()) }) }) }) };
            return buildThemeFromImage({ naturalWidth: pixels.length, naturalHeight: 1 });
        };
        const colored = generate(colors);
        assert.deepEqual(generate([[0, 0, 0, 255], [255, 255, 255, 255], ...colors]), colored);
    } finally {
        if (original === undefined) delete globalThis.document;
        else globalThis.document = original;
    }
});
