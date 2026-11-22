/** Builds an offline page containing only the original Rive file and its player. */
export function createSoboPlayerDocument(runtime: string, wasm: string, animation: string) {
  const script = runtime.replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:">
  <style>
    html, body, canvas { width: 100%; height: 100%; margin: 0; display: block; overflow: hidden; }
    canvas { touch-action: pan-y; }
  </style>
</head>
<body>
  <canvas id="sobo" aria-label="ဆိုဘို လက်ပြနေသည်။"></canvas>
  <script>${script}</script>
  <script>
    const decode = (base64) => Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0)).buffer;
    const send = (message) => window.ReactNativeWebView?.postMessage(message);

    try {
      rive.RuntimeLoader.setWasmBinary(decode(${JSON.stringify(wasm)}));
      rive.RuntimeLoader.setWasmFallbackUrl(null);
      const player = new rive.Rive({
        buffer: decode(${JSON.stringify(animation)}),
        canvas: document.getElementById('sobo'),
        artboard: 'SOBO-Hello',
        stateMachine: 'State Machine',
        layout: new rive.Layout({ fit: rive.Fit.Contain }),
        autoBind: true,
        autoplay: true,
        enableRiveAssetCDN: false,
        isTouchScrollEnabled: true,
        onLoad: () => {
          const resize = () => player.resizeDrawingSurfaceToCanvas();
          resize();
          window.addEventListener('resize', resize);
          send('ready');
        },
        onLoadError: () => send('error'),
      });
    } catch {
      send('error');
    }
  </script>
</body>
</html>`;
}
