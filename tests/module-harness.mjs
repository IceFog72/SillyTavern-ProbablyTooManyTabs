import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

export async function loadModule(file, imports, globals = {}) {
    const context = createContext({ console, ...globals });
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const module = new SourceTextModule(source, { context, identifier: file });
    await module.link(specifier => {
        const values = imports[specifier];
        if (!values) throw new Error(`Missing test dependency: ${specifier}`);
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

export function scheduler() {
    let nextId = 1;
    const pending = new Map();
    return {
        pending,
        set(callback) { const id = nextId++; pending.set(id, callback); return id; },
        clear(id) { pending.delete(id); },
        flush() {
            const callbacks = [...pending.values()];
            pending.clear();
            callbacks.forEach(callback => callback());
        },
    };
}
