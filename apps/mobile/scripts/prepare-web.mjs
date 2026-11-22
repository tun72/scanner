import { copyFile, readFile, writeFile } from 'node:fs/promises';

const html = new URL('../dist/index.html', import.meta.url);
const document = await readFile(html, 'utf8');
if (!document.includes('</head>')) throw new Error('Expo did not export a valid web document.');

await copyFile(new URL('../assets/icon.png', import.meta.url), new URL('../dist/app-icon.png', import.meta.url));
await writeFile(html, document.replace(/<html[^>]*>/i, '<html lang="my-MM">').replace(/<title>.*?<\/title>/, '<title>အစားအသောက်စစ်ဆေးရေး</title>').replace('</head>', [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/app-icon.png">',
  '<meta name="theme-color" content="#F4F7F3">',
  '</head>',
].join('\n')));
