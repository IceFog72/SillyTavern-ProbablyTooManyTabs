let screen = null;
let timeout = null;
let frame = null;

export function showStartupScreen() {
    cleanupStartupScreen();
    screen = document.createElement('div');
    screen.id = 'ptmt-startup-screen';
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.textContent = 'Loading layout…';
    document.body.appendChild(screen);
    // A failed app startup must not leave the interface permanently covered.
    timeout = setTimeout(cleanupStartupScreen, 30000);
}

export function finishStartupScreen() {
    if (!screen || frame !== null) return;
    frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(cleanupStartupScreen);
    });
}

export function cleanupStartupScreen() {
    if (frame !== null) cancelAnimationFrame(frame);
    if (timeout !== null) clearTimeout(timeout);
    frame = null;
    timeout = null;
    screen?.remove();
    screen = null;
}
