import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(directory, predicate) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path, predicate) : predicate(path) ? [path] : [];
    });
}

const strayJs = walk('src', path => path.endsWith('.js'));
if (strayJs.length) {
    console.error(`Unexpected JavaScript files in src/: ${strayJs.join(', ')}`);
    process.exit(1);
}

const tsSources = walk('src', path => path.endsWith('.ts') && !path.endsWith('.d.ts'));
if (!tsSources.length) throw new Error('No extension TypeScript sources found');

for (const tsFile of tsSources) {
    const emitted = join('dist', relative('src', tsFile).replace(/\.ts$/, '.js'));
    if (!existsSync(emitted)) {
        console.error(`Missing compiled output for ${tsFile}: expected ${emitted} (run npm run build)`);
        process.exit(1);
    }
}

const files = walk('dist', path => path.endsWith('.js'));
if (!files.length) throw new Error('No compiled extension JavaScript found in dist/');
for (const file of files) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(file), encoding: 'utf8',
    });
    if (result.status !== 0) {
        console.error(`${file}: ${result.stderr || result.error}`);
        process.exit(1);
    }
}
console.log(`TypeScript/JavaScript checks passed (${tsSources.length} TS sources, ${files.length} dist JS files)`);
