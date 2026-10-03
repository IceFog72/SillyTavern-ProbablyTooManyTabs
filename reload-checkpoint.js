import { extension_settings } from '../../../extensions.js';
import { getCurrentUserHandle } from '../../../user.js';
import { power_user, getThemeObject, applyPowerUserSettings } from '../../../power-user.js';
import { background_settings, loadBackgroundSettings } from '../../../backgrounds.js';
import { settings } from './settings.js';
import { captureThemeAppearance, restoreThemeAppearance } from './theme-colors.js';

const checkpointKey = () => `ptmt:reload:${getCurrentUserHandle()}`;

// Settings saves are asynchronous. Keep the final visible state in this tab
// until its next reload, without relying on a network request during unload.
export function captureReloadCheckpoint(api, state) {
    if (state.isHydrating || state.isPTMTResetting) return;
    try {
        const layout = api.generateLayoutSnapshot();
        if (!layout) return;
        sessionStorage.setItem(checkpointKey(), JSON.stringify({
            version: 1,
            settings: { ...extension_settings.PTMT, [settings.getActiveLayoutKey()]: layout },
            theme: getThemeObject(power_user.theme),
            appearance: captureThemeAppearance(),
            background: background_settings,
        }));
    } catch (error) {
        console.warn('[PTMT] Could not checkpoint state for reload:', error);
    }
}

export function restoreReloadCheckpoint() {
    try {
        const key = checkpointKey();
        const raw = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        if (!raw || performance.getEntriesByType('navigation')[0]?.type !== 'reload') return false;
        const checkpoint = JSON.parse(raw);
        if (checkpoint.version !== 1 || !checkpoint.settings || !checkpoint.theme || !checkpoint.appearance) return false;
        Object.assign(extension_settings.PTMT, checkpoint.settings);
        const { name, ...theme } = checkpoint.theme;
        Object.assign(power_user, theme, { theme: name });
        applyPowerUserSettings();
        restoreThemeAppearance(checkpoint.appearance);
        if (checkpoint.background) loadBackgroundSettings({ background: checkpoint.background });
        settings.save();
        return true;
    } catch (error) {
        console.warn('[PTMT] Could not restore reload checkpoint:', error);
        return false;
    }
}
