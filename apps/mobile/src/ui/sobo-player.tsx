import { Asset } from 'expo-asset';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import { createSoboPlayerDocument } from './sobo-player-document.ts';

let preparingPlayer: Promise<string> | undefined;

function loadPlayer() {
  preparingPlayer ??= (async () => {
    const runtimeAsset = Asset.fromModule(require('../../.expo/sobo-rive-runtime.txt'));
    const wasmAsset = Asset.fromModule(require('@rive-app/canvas/rive.wasm'));
    const animationAsset = Asset.fromModule(require('../../assets/sobo.riv'));
    const assets = [runtimeAsset, wasmAsset, animationAsset];
    const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, [
      createSoboPlayerDocument('', '', ''),
      ...assets.map((asset) => asset.hash ?? asset.uri),
    ].join('\n'));
    const page = new File(Paths.cache, `food-scanner-sobo-${key}.html`);
    if (page.exists) return page.uri;

    await Promise.all(assets.map((asset) => asset.downloadAsync()));
    if (!runtimeAsset.localUri || !wasmAsset.localUri || !animationAsset.localUri) {
      throw new Error('Sobo assets are unavailable');
    }
    const [runtime, wasmBytes, animationBytes] = await Promise.all([
      new File(runtimeAsset.localUri).text(),
      new File(wasmAsset.localUri).base64(),
      new File(animationAsset.localUri).base64(),
    ]);
    const temporary = new File(Paths.cache, `food-scanner-sobo-${key}.tmp`);
    await temporary.write(createSoboPlayerDocument(runtime, wasmBytes, animationBytes));
    await temporary.move(page, { overwrite: true });
    return page.uri;
  })().finally(() => {
    preparingPlayer = undefined;
  });

  return preparingPlayer;
}

export function SoboPlayer({ onPlayingChange }: { onPlayingChange: (playing: boolean) => void }) {
  const [uri, setUri] = useState<string>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPlayer().then((url) => {
      if (active) setUri(url);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, []);

  if (!uri || failed) return null;
  const showPoster = () => {
    onPlayingChange(false);
    setFailed(true);
  };

  return (
    <WebView
      source={{ uri }}
      originWhitelist={['file://*']}
      onShouldStartLoadWithRequest={(request) => request.url === uri}
      allowFileAccess
      allowingReadAccessToURL={uri}
      contentInsetAdjustmentBehavior="never"
      scrollEnabled={false}
      accessible={ready}
      accessibilityLabel="ဆိုဘို လက်ပြနေသည်။"
      pointerEvents="none"
      onError={showPoster}
      onContentProcessDidTerminate={showPoster}
      onMessage={({ nativeEvent }) => {
        if (nativeEvent.data === 'ready') {
          setReady(true);
          onPlayingChange(true);
        }
        if (nativeEvent.data === 'error') showPoster();
      }}
      containerStyle={[styles.player, !ready && styles.loading]}
      style={styles.player}
    />
  );
}

const styles = StyleSheet.create({
  player: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  loading: { opacity: 0 },
});
