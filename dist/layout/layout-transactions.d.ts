export interface MoveTabTransactionArgs {
    panel: HTMLElement | null | undefined;
    pane: HTMLElement | null | undefined;
    index?: number;
    reason?: string;
}
/** Move one tab/panel as a single layout transaction and emit one layout event. */
export declare function moveTabTransaction({ panel, pane, index, reason }: MoveTabTransactionArgs): boolean;
