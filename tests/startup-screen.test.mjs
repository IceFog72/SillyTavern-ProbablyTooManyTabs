import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, scheduler } from './module-harness.mjs';

test('startup screen waits for layout paint and releases on timeout or cleanup', async () => {
    const frames = scheduler();
    const timers = scheduler();
    const children = new Set();
    const document = {
        body: { appendChild(node) { children.add(node); } },
        createElement() {
            return { setAttribute() {}, remove() { children.delete(this); } };
        },
    };
    const api = await loadModule('src/core/startup-screen.js', {}, {
        document, requestAnimationFrame: frames.set, cancelAnimationFrame: frames.clear,
        setTimeout: timers.set, clearTimeout: timers.clear,
    });
    api.showStartupScreen();
    assert.equal(children.size, 1);
    api.finishStartupScreen();
    frames.flush();
    assert.equal(children.size, 1);
    frames.flush();
    assert.equal(children.size, 0);
    assert.equal(timers.pending.size, 0);
    api.showStartupScreen();
    timers.flush();
    assert.equal(children.size, 0);
    api.showStartupScreen();
    api.finishStartupScreen();
    api.cleanupStartupScreen();
    assert.equal(children.size, 0);
    assert.equal(frames.pending.size, 0);
});
