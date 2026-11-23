// signal.ts - Lightweight reactive typed signal for PTMT Dock Engine
export class Signal {
    #listeners = new Set();
    connect(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }
    disconnect(listener) {
        return this.#listeners.delete(listener);
    }
    clear() {
        this.#listeners.clear();
    }
    get size() {
        return this.#listeners.size;
    }
    emit(...args) {
        for (const listener of [...this.#listeners]) {
            listener(...args);
        }
    }
}
//# sourceMappingURL=signal.js.map