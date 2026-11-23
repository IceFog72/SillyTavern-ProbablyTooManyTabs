import type { PTMTAPI, PTMTAppState } from './types.js';
export declare function captureReloadCheckpoint(api: Pick<PTMTAPI, 'generateLayoutSnapshot'>, state: PTMTAppState): void;
export declare function restoreReloadCheckpoint(): boolean;
