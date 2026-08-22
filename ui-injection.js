/**
 * ui-injection.js
 * Injects custom UI elements into SillyTavern's interface
 * Currently: Character List Scale slider into Inspector (rm_tag_controls)
 * Can be extended to inject other controls and elements
 */

import { registerBodyObserver, trackListener, el } from './utils.js';
import { settings } from './settings.js';
import { EVENTS } from './constants.js';

let scaleSliderContainer = null;
let scaleSlider = null;
let observerCleanup = null;
let settingsChangedHandler = null;

function injectElementInto(element, targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn(`[PTMT] Target not found: ${targetSelector}`);
        return false;
    }

    if (target.querySelector(`#${element.id}`)) {
        return true;
    }

    target.appendChild(element);
    return true;
}

function createInjectionObserver(element, targetSelector) {
    injectElementInto(element, targetSelector);

    return registerBodyObserver(
        `injection-observer-${element.id}`,
        { childList: true, subtree: true },
        (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches?.(targetSelector) || node.querySelector?.(targetSelector)) {
                        injectElementInto(element, targetSelector);
                        break;
                    }
                }
            }
        }
    );
}

function createScaleSlider() {
    const container = el('div', {
        id: 'ptmt-char-list-scale-control',
        className: 'ptmt-inspector-scale-control',
        style: {
            display: settings.get('enableOverride1') ? 'flex' : 'none'
        }
    });

    const slider = el('input', {
        id: 'ptmt-char-list-scale-slider',
        type: 'range',
        min: '0.4',
        max: '5',
        step: '0.1',
        value: settings.get('charListAvatarScale') || '1'
    });

    const valueDisplay = el('span', {
        className: 'ptmt-scale-value'
    }, `${(parseFloat(slider.value) || 1).toFixed(2)}x`);

    const updateDisplay = () => {
        const val = parseFloat(slider.value) || 1;
        valueDisplay.textContent = `${val.toFixed(2)}x`;
        settings.update({ charListAvatarScale: val.toString() });
        document.documentElement.style.setProperty('--ptmt-char-list-avatar-scale', val.toString());
    };

    slider.addEventListener('input', updateDisplay);
    slider.addEventListener('change', updateDisplay);

    container.append(slider, valueDisplay);
    scaleSlider = slider;
    scaleSliderContainer = container;
    return container;
}

export function initInspectorScaleControl() {
    if (observerCleanup) return;

    if (!scaleSliderContainer) {
        scaleSliderContainer = createScaleSlider();
    }

    const targetSelector = '#charListFixedTop .rm_tag_controls';
    observerCleanup = createInjectionObserver(scaleSliderContainer, targetSelector);

    settingsChangedHandler = (e) => {
        if (e.detail?.changed?.includes('enableOverride1') && scaleSliderContainer) {
            const isEnabled = e.detail.allSettings.enableOverride1;
            scaleSliderContainer.style.display = isEnabled ? 'flex' : 'none';
        }
    };
    window.addEventListener(EVENTS.SETTINGS_CHANGED, settingsChangedHandler);
    trackListener(window, EVENTS.SETTINGS_CHANGED, settingsChangedHandler);
}

export function cleanupInspectorScaleControl() {
    if (observerCleanup) {
        observerCleanup();
        observerCleanup = null;
    }
    if (settingsChangedHandler) {
        window.removeEventListener(EVENTS.SETTINGS_CHANGED, settingsChangedHandler);
        settingsChangedHandler = null;
    }
    if (scaleSliderContainer) {
        scaleSliderContainer.remove();
        scaleSliderContainer = null;
        scaleSlider = null;
    }
}
