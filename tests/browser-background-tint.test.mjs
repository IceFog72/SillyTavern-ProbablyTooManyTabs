import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './module-harness.mjs';

async function fixture(images) {
    const observers = [];
    const meta = {
        content: '#333333',
        getAttribute() { return this.content; },
        setAttribute(_name, value) { this.content = value; },
    };
    const bg = {};
    let currentUrl = 'first';
    let bodyColor = '';
    let drawn;
    const decoded = [];
    const ctx = {
        drawImage(img) { drawn = img.src; },
        getImageData() { return { data: images[drawn].pixels }; },
    };
    const root = { style: { setProperty() {} } };
    const { ThemeEngine } = await loadModule('src/theme/theme-engine.js', {
        '../core/utils.js': { trackObserver: value => value },
    }, {
        console: { log() {}, warn() {} },
        document: {
            createElement() { return { getContext: () => ctx }; },
            querySelector: () => meta,
            getElementById: id => id === 'bg1' ? bg : null,
            body: {}, documentElement: root,
        },
        window: { getComputedStyle: () => ({ backgroundImage: currentUrl ? `url("${currentUrl}")` : 'none', backgroundColor: 'rgba(0, 0, 0, 0)' }) },
        getComputedStyle: () => ({ getPropertyValue: key => key === '--ptmt-body-bg-color' ? bodyColor : 'rgba(0, 0, 0, 0)' }),
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target) { this.target = target; }
        },
        Image: class {
            async decode() {
                decoded.push(this.src);
                if (images[this.src].pending) await images[this.src].pending;
                if (images[this.src].error) throw new Error('Image decode failed');
            }
        },
    });
    return {
        engine: new ThemeEngine(), meta, decoded,
        setUrl(url) { currentUrl = url; },
        setBodyColor(color) {
            bodyColor = color;
            observers.find(obs => obs.target === root)?.callback();
        },
        flush: () => new Promise(setImmediate),
        themeWrite(color) { meta.content = color; observers.find(obs => obs.target === meta).callback(); },
    };
}

test('startup averages RGB without transparent black and survives late ST tint writes', async () => {
    const f = await fixture({ first: { pixels: [255, 0, 0, 255, 0, 0, 255, 0] } });
    f.engine.init();
    await f.flush();
    assert.equal(f.meta.content, '#ff0000');
    f.themeWrite('rgba(24, 28, 32, 0.7)');
    assert.equal(f.meta.content, '#ff0000');
    f.engine.cleanup();
    assert.equal(f.meta.content, 'rgba(24, 28, 32, 0.7)');
});

test('background changes update browser tint and reuse cached analysis', async () => {
    const f = await fixture({ first: { pixels: [100, 20, 40, 255] }, next: { pixels: [10, 30, 50, 255] } });
    f.engine.init();
    await f.flush();
    assert.equal(f.meta.content, '#641428');
    f.setUrl('next'); f.engine.refresh(); await f.flush();
    assert.equal(f.meta.content, '#0a1e32');
    f.setUrl('first'); f.engine.refresh(); await f.flush();
    assert.equal(f.meta.content, '#641428');
    assert.deepEqual(f.decoded, ['first', 'next']);
});

test('old and disabled image decodes cannot replace the current browser tint', async () => {
    let finishFirst;
    const pending = new Promise(resolve => { finishFirst = resolve; });
    const f = await fixture({ first: { pixels: [255, 0, 0, 255], pending }, next: { pixels: [0, 255, 0, 255] } });
    f.engine.init();
    f.setUrl('next'); f.engine.refresh(); await f.flush();
    assert.equal(f.meta.content, '#00ff00');
    finishFirst(); await f.flush();
    assert.equal(f.meta.content, '#00ff00');
    f.engine.cleanup();
    f.setUrl('first');
    f.engine.init();
    f.engine.cleanup();
    await f.flush();
    assert.equal(f.meta.content, '#333333');
});

test('missing, transparent and failed images preserve ST browser tint', async () => {
    const f = await fixture({ first: { pixels: [0, 0, 0, 0] }, failed: { error: true } });
    f.engine.init(); await f.flush();
    assert.equal(f.meta.content, '#333333');
    f.setUrl('failed'); f.engine.refresh(); await f.flush();
    assert.equal(f.meta.content, '#333333');
    f.setUrl(null); f.engine.refresh();
    assert.equal(f.meta.content, '#333333');
});


test('off follows body CSS color, on follows wallpaper, cleanup restores latest ST tint', async () => {
    const f = await fixture({ first: { pixels: [255, 0, 0, 255] }, next: { pixels: [0, 255, 0, 255] } });
    f.setBodyColor('rgb(29, 29, 29)');
    f.engine.init(false); await f.flush();
    assert.equal(f.meta.content, 'rgb(29, 29, 29)');
    f.engine.setBrowserTintEnabled(true);
    assert.equal(f.meta.content, '#ff0000');
    f.engine.setBrowserTintEnabled(false);
    assert.equal(f.meta.content, 'rgb(29, 29, 29)');
    f.themeWrite('#123456');
    assert.equal(f.meta.content, 'rgb(29, 29, 29)');
    f.setBodyColor('#405060');
    assert.equal(f.meta.content, '#405060');
    f.setUrl('next'); f.engine.refresh(); await f.flush();
    assert.equal(f.meta.content, '#405060');
    f.engine.setBrowserTintEnabled(true);
    assert.equal(f.meta.content, '#00ff00');
    f.setBodyColor('#778899');
    assert.equal(f.meta.content, '#00ff00');
    f.engine.setBrowserTintEnabled(false);
    assert.equal(f.meta.content, '#778899');
    f.themeWrite('#abcdef');
    assert.equal(f.meta.content, '#778899');
    f.engine.cleanup();
    assert.equal(f.meta.content, '#abcdef');
});
