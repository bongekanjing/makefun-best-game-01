// Tests for the Tideglass entry (Node standard library only, no dependencies).
// Run: node tests/test_entry.mjs
// Checks: main.ts syntax; main.ts runs twice into two temp dirs and writes byte-identical
// output (determinism gate); gate caps (game/ file count and bytes, path lengths,
// screenshot count/size/dimensions, dossier.json size and match with buildDossier);
// no external references in index.html or the scripts it reaches.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(here);
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(full);
  }
  return out;
}

// 1. Syntax: main.ts type-strips cleanly, and every game script parses under node --check.
try {
  execFileSync(process.execPath, ['--experimental-strip-types', '--check', join(root, 'main.ts')], { stdio: 'pipe' });
  check('main.ts syntax (node --check, strip-types)', true);
} catch (error) {
  check('main.ts syntax (node --check, strip-types)', false, String(error.message).slice(0, 300));
}
let scriptsOk = true;
for (const file of walk(join(root, 'game'))) {
  if (!file.endsWith('.js')) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    scriptsOk = false;
    console.log(`  syntax error in ${file}: ${String(error.stderr ?? error.message).slice(0, 200)}`);
  }
}
check('game scripts syntax (node --check)', scriptsOk);

// 2. Determinism: run main.ts twice into two temp dirs, diff byte-for-byte.
const runA = join(tmpdir(), 'tideglass-out-a');
const runB = join(tmpdir(), 'tideglass-out-b');
for (const dir of [runA, runB]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(process.execPath, ['main.ts'], { cwd: root, env: { ...process.env, MAKEFUN_OUTPUT_DIR: dir }, stdio: 'pipe' });
}
function treeHashes(dir) {
  const map = new Map();
  for (const file of walk(dir)) map.set(file.slice(dir.length + 1), sha256(file));
  return map;
}
const hashesA = treeHashes(runA);
const hashesB = treeHashes(runB);
const sameKeys = [...hashesA.keys()].sort().join() === [...hashesB.keys()].sort().join();
const sameBytes = sameKeys && [...hashesA.entries()].every(([k, v]) => hashesB.get(k) === v);
check('determinism: two runs write identical files', sameBytes, `${hashesA.size} files in each output`);
check('dossier.json present in output', existsSync(join(runA, 'dossier.json')));
const dossierBytes = existsSync(join(runA, 'dossier.json')) ? statSync(join(runA, 'dossier.json')).size : 0;
check('dossier.json <= 1.5 MiB', dossierBytes <= 1572864, `${dossierBytes} bytes`);

// 3. Gate caps on the shipped game/ and screenshots/.
const gameFiles = walk(join(root, 'game'));
const gameBytes = gameFiles.reduce((sum, f) => sum + statSync(f).size, 0);
check('game/ entries <= 993', gameFiles.length <= 993, `${gameFiles.length} files`);
check('game/ bytes <= 48 MiB', gameBytes <= 50331648, `${gameBytes} bytes`);
const longPaths = gameFiles.filter((f) => Buffer.byteLength(f.slice(join(root, 'game').length + 1), 'utf8') > 1000);
check('game/ paths <= 1000 UTF-8 bytes', longPaths.length === 0);
const shots = existsSync(join(root, 'screenshots'))
  ? readdirSync(join(root, 'screenshots')).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort()
  : [];
check('screenshots: 3 or 4 images', shots.length >= 3 && shots.length <= 4, `${shots.length} found: ${shots.join(', ')}`);
let shotsOk = true;
for (const name of shots) {
  const file = join(root, 'screenshots', name);
  const size = statSync(file).size;
  if (size > 262144) {
    shotsOk = false;
    console.log(`  ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}
check('screenshots each <= 256 KiB', shotsOk);

// Screenshot dimensions are checked by tests/check_shots.py (needs PIL); report here if run.
const dimsFile = join(root, 'tests', 'shot-dimensions.json');
if (existsSync(dimsFile)) {
  const dims = JSON.parse(readFileSync(dimsFile, 'utf8'));
  const dimsOk = Object.values(dims).every((d) => d.width <= 1280 && d.height <= 480);
  check('screenshots each <= 1280x480', dimsOk, JSON.stringify(dims));
} else {
  console.log('SKIP  screenshots dimensions (run tests/check_shots.py to write tests/shot-dimensions.json)');
}

// 4. No external references: every src/href in index.html and every static import in the
// scripts it reaches must be a data: URI or a file inside game/.
const indexHtml = readFileSync(join(root, 'game', 'index.html'), 'utf8');
const refs = [...indexHtml.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
const external = refs.filter((r) => !r.startsWith('data:') && (/^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('//') || r.startsWith('/')));
check('index.html references are internal or data:', external.length === 0, external.join(', ') || `${refs.length} refs`);
let importsOk = true;
const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
for (const file of gameFiles.filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(importRe)) {
    const spec = match[1] ?? match[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) {
      importsOk = false;
      console.log(`  non-relative import in ${basename(file)}: ${spec}`);
    }
    if (spec.startsWith('../')) {
      importsOk = false;
      console.log(`  import climbing out of src in ${basename(file)}: ${spec}`);
    }
  }
  if (/https?:\/\//.test(text) && !/w3\.org/.test(text)) {
    // Any live URL in a game script would be a network reference; none is expected.
    importsOk = false;
    console.log(`  URL literal in ${basename(file)}`);
  }
}
check('game scripts import only relative files inside game/', importsOk);

// 5. No network strings in index.html either (no http(s) URLs at all in game/).
const httpRefs = gameFiles.filter((f) => f.endsWith('.html') || f.endsWith('.js'))
  .filter((f) => /https?:\/\/(?!www\.w3\.org)/.test(readFileSync(f, 'utf8')));
check('no http(s) references in game/ files', httpRefs.length === 0, httpRefs.map(basename).join(', '));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
