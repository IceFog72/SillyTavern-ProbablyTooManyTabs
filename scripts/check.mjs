import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function sources(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? sources(path) : path.endsWith('.js') ? [path] : [];
    });
}
const files = sources('src');
if (!files.length) throw new Error('No extension JavaScript found');
for (const file of files) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(file), encoding: 'utf8',
    });
    if (result.status !== 0) {
        console.error(`${file}: ${result.stderr || result.error}`);
        process.exit(1);
    }
}
console.log(`JavaScript checks passed (${files.length} files)`);
