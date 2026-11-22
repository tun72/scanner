import type { Rive } from '@rive-app/canvas';
import { Asset } from 'expo-asset';
import { useEffect, useRef, useState } from 'react';

export function SoboPlayer({ onPlayingChange }: { onPlayingChange: (playing: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let player: Rive | undefined;
    let observer: ResizeObserver | undefined;
    const showPoster = () => {
      if (!active) return;
      setReady(false);
      onPlayingChange(false);
    };

    void import('@rive-app/canvas').then(({ Rive, RuntimeLoader, Layout, Fit }) => {
      if (!active) return;
      RuntimeLoader.setWasmUrl(Asset.fromModule(require('@rive-app/canvas/rive.wasm')).uri);
      RuntimeLoader.setWasmFallbackUrl(Asset.fromModule(require('@rive-app/canvas/rive_fallback.wasm')).uri);
      player = new Rive({
        canvas,
        src: Asset.fromModule(require('../../assets/sobo.riv')).uri,
        artboard: 'SOBO-Hello',
        stateMachine: 'State Machine',
        layout: new Layout({ fit: Fit.Contain }),
        autoBind: true,
        autoplay: true,
        enableRiveAssetCDN: false,
        shouldDisableRiveListeners: true,
        onLoad: () => {
          if (!active) return;
          const resize = () => player?.resizeDrawingSurfaceToCanvas();
          resize();
          observer = new ResizeObserver(resize);
          observer.observe(canvas);
          setReady(true);
          onPlayingChange(true);
        },
        onLoadError: showPoster,
      });
    }).catch(showPoster);

    return () => {
      active = false;
      observer?.disconnect();
      player?.cleanup();
    };
  }, [onPlayingChange]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: ready ? 1 : 0 }}
    />
  );
}
