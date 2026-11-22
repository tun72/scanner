import { readFile, writeFile } from 'node:fs/promises';

const html = new URL('../dist/index.html', import.meta.url);
const document = await readFile(html, 'utf8');
if (!document.includes('</head>')) throw new Error('Expo did not export a valid web document.');

await writeFile(html, document.replace(/<html[^>]*>/i, '<html lang="my-MM">').replace(/<title>.*?<\/title>/, '<title>Scanner</title>').replace('</head>', [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/app-icon-192.png">',
  '<meta name="theme-color" content="#F4F7F3">',
  '</head>',
].join('\n')));
