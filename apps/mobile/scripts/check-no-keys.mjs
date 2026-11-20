#!/usr/bin/env node
// TC19: the app must never carry the Claude API key. Run it on an `expo export` folder and the app config:
//   node scripts/check-no-keys.mjs <export dir> app.json
// It exits with 1 and names the file when it finds an Anthropic key or the server's key variable name.
// It never prints what it found, in case that is a real key.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  { name: 'an Anthropic API key (sk-ant-…)', pattern: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { name: 'the ANTHROPIC_API_KEY variable', pattern: /ANTHROPIC_API_KEY/ },
];

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/check-no-keys.mjs <export dir or file>...');
  process.exit(2);
}

function* filesIn(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) yield* filesIn(join(path, entry));
  } else {
    yield path;
  }
}

let checked = 0;
let found = 0;
for (const target of targets) {
  for (const file of filesIn(target)) {
    checked += 1;
    // latin1 keeps every byte, so text inside Hermes bytecode is searched too.
    const text = readFileSync(file).toString('latin1');
    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(text)) {
        console.error(`Found ${name} in ${file}`);
        found += 1;
      }
    }
  }
}

console.log(`Checked ${checked} files: ${found === 0 ? 'no Claude API key found.' : `${found} problem(s).`}`);
process.exit(found === 0 ? 0 : 1);
