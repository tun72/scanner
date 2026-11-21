const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

// Package the installed renderer as an asset so only Sobo downloads it.
const runtime = readFileSync(require.resolve('@rive-app/canvas'));
const expoCache = path.join(__dirname, '.expo');
const runtimeAsset = path.join(expoCache, 'sobo-rive-runtime.txt');
mkdirSync(expoCache, { recursive: true });
if (!existsSync(runtimeAsset) || !runtime.equals(readFileSync(runtimeAsset))) {
  writeFileSync(runtimeAsset, runtime);
}

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('riv', 'wasm', 'txt');

module.exports = config;
