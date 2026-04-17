/**
 * ui-injection.js
 * Injects custom UI elements into SillyTavern's interface
 * Currently: Character List Scale slider into Inspector (rm_tag_controls)
 * Can be extended to inject other controls and elements
 * 
 * Usage for new injections:
 * 1. Create your element with el()
 * 2. Call createInjectionObserver(element, '.target-selector')
 * 3. Track cleanup with a let variable at module scope
 * 4. Export init and cleanup functions
 */

import { registerBodyObserver, trackListener } from './utils.js';
import { el } from './utils.js';
import { settings } from './settings.js';
import { EVENTS } from './constants.js';

let scaleSliderContainer = null;
let scaleSlider = null;
let observerCleanup = null;

/**
 * Generic element injection helper
 * Injects an element into a target selector if it exists and doesn't already contain the element
 * @param {Element} element - Element to inject
 * @param {string} targetSelector - CSS selector for target container
 * @returns {boolean} Success status
 */
function injectElementInto(element, targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn(`[PTMT] Target not found: ${targetSelector}`);
        return false;
    }

    if (target.querySelector(`#${element.id}`)) {
        console.log(`[PTMT] Element already exists: ${element.id}`);
        return true;
    }

    target.appendChild(element);
    console.log(`[PTMT] Injected ${element.id} into ${targetSelector}`);
    return true;
}

/**
 * Generic observer for injecting elements when targets appear
 * @param {Element} element - Element to inject
 * @param {string} targetSelector - CSS selector for target container
 * @returns {Function} Cleanup function
 */
function createInjectionObserver(element, targetSelector) {
    // Try immediate injection
    injectElementInto(element, targetSelector);

    // Set up observer to inject when target appears
    const cleanup = registerBodyObserver(
        `injection-observer-${element.id}`,
        { childList: true, subtree: true },
        (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element node
                            if (node.matches?.(targetSelector) || node.querySelector?.(targetSelector)) {
                                injectElementInto(element, targetSelector);
                                break;
                            }
                        }
                    }
                }
            }
        }
    );

    return cleanup;
}

/**
 * Creates the Character List Scale slider control
 */
function createScaleSlider() {
    const container = el('div', { 
        id: 'ptmt-char-list-scale-control',
        className: 'ptmt-inspector-scale-control',
        style: { 
            display: settings.get('enableOverride1') ? 'flex' : 'none'
        }
    });

    const label = el('label', { 
        className: 'ptmt-scale-label'
    }, 'Char Scale:');

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

    // Update display value as slider moves
    const updateDisplay = () => {
        const val = parseFloat(slider.value) || 1;
        valueDisplay.textContent = `${val.toFixed(2)}x`;
        
        console.log(`[PTMT] Character List Scale slider changed to: ${val}`);
        
        // Update settings - this should trigger SETTINGS_CHANGED event
        try {
            settings.update({ charListAvatarScale: val.toString() });
            console.log(`[PTMT] Settings updated, CSS variable should be set now`);
        } catch (e) {
            console.error(`[PTMT] Error updating settings:`, e);
        }
        
        // Also update CSS variable directly for immediate effect
        try {
            document.documentElement.style.setProperty('--ptmt-char-list-avatar-scale', val.toString());
            console.log(`[PTMT] Direct CSS variable set: --ptmt-char-list-avatar-scale = ${val}`);
        } catch (e) {
            console.error(`[PTMT] Error setting CSS variable:`, e);
        }
    };

    // Use addEventListener directly with console logging
    slider.addEventListener('input', (e) => {
        console.log(`[PTMT] Slider input event: value = ${e.target.value}`);
        updateDisplay();
    });
    
    slider.addEventListener('change', (e) => {
        console.log(`[PTMT] Slider change event: value = ${e.target.value}`);
        updateDisplay();
    });

    container.append(label, slider, valueDisplay);
    scaleSlider = slider;
    scaleSliderContainer = container;

    console.log(`[PTMT] Scale slider created, initial value: ${slider.value}, enabled: ${settings.get('enableOverride1')}`);
    return container;
}

/**
 * Initializes the Inspector scale control observer
 * Watches for rm_tag_controls to appear and injects the Character List Scale slider
 * Only visible when Extension CSS Overrides is enabled
 */
export function initInspectorScaleControl() {
    if (observerCleanup) return;

    if (!scaleSliderContainer) {
        scaleSliderContainer = createScaleSlider();
    }

    // Use generic injection observer with the correct selector
    const targetSelector = '#charListFixedTop .rm_tag_controls';
    console.log(`[PTMT] Setting up injection for: ${targetSelector}`);
    
    observerCleanup = createInjectionObserver(scaleSliderContainer, targetSelector);

    // Listen to Extension CSS Overrides setting changes
    window.addEventListener(EVENTS.SETTINGS_CHANGED, (e) => {
        if (e.detail?.changed?.includes('enableOverride1') && scaleSliderContainer) {
            const isEnabled = e.detail.allSettings.enableOverride1;
            scaleSliderContainer.style.display = isEnabled ? 'flex' : 'none';
            console.log(`[PTMT] Character List Scale slider ${isEnabled ? 'shown' : 'hidden'}`);
        }
    });

    console.log('[PTMT] UI injection system initialized');
}

/**
 * Cleans up the scale control
 */
export function cleanupInspectorScaleControl() {
    if (observerCleanup) {
        observerCleanup();
        observerCleanup = null;
    }
    if (scaleSliderContainer) {
        scaleSliderContainer.remove();
        scaleSliderContainer = null;
        scaleSlider = null;
    }
    console.log('[PTMT] Inspector scale control cleaned up');
}
