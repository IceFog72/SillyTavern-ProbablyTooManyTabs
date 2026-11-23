// signal.ts - Lightweight reactive typed signal for PTMT Dock Engine

export type SignalListener<TArgs extends readonly unknown[] = readonly []> = (...args: TArgs) => void;

export class Signal<TArgs extends readonly unknown[] = readonly []> {
    readonly #listeners = new Set<SignalListener<TArgs>>();

    connect(listener: SignalListener<TArgs>): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    disconnect(listener: SignalListener<TArgs>): boolean {
        return this.#listeners.delete(listener);
    }

    clear(): void {
        this.#listeners.clear();
    }

    get size(): number {
        return this.#listeners.size;
    }

    emit(...args: TArgs): void {
        for (const listener of [...this.#listeners]) {
            listener(...args);
        }
    }
}
