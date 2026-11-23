export type SignalListener<TArgs extends readonly unknown[] = readonly []> = (...args: TArgs) => void;
export declare class Signal<TArgs extends readonly unknown[] = readonly []> {
    #private;
    connect(listener: SignalListener<TArgs>): () => void;
    disconnect(listener: SignalListener<TArgs>): boolean;
    clear(): void;
    get size(): number;
    emit(...args: TArgs): void;
}
