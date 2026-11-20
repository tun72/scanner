# Food Scanner release verification (DLP-07)

The initial release is in English. The API runs as a single stateless Node 22 container on Render. The repository includes a Blueprint for a manually deployed Free service for staging. Free instances can sleep, so measure the approximately 10-second target on the intended production plan separately. Keep one instance while request limits live in process memory. [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Render Web Services](https://render.com/docs/web-services)

## Set up the Render service

1. Connect the repository in Render and create a Blueprint from `render.yaml`. Select the intended region and plan before going public. The service listens on Render's `PORT` and reports process readiness at `/health`.
2. Set `ANTHROPIC_API_KEY` in Render and set `OPEN_FOOD_FACTS_USER_AGENT` to an app identifier and contact address. Leave `CLAUDE_MODEL` at the current default until there is a reviewed [DLP-06 report](../evals/verdicts/README.md).
3. Verify the trusted ingress chain with the deployed service, then set `TRUSTED_PROXIES` to its confirmed proxy IPs or CIDRs. Check that distinct clients get distinct IP rate limits and that client-supplied forwarding headers cannot choose the address used for limiting. Without trusted proxy addresses, limits use the immediate peer, which can group requests behind a shared proxy. Render's public HTTPS endpoint terminates TLS before forwarding to the app. [Render edge and forwarded addresses](https://render.com/articles/how-render-handles-ddos-attacks)
4. Finalize the [privacy policy draft](privacy-policy.md) with the publisher's information and confirmed provider settings. Publish the policy on a public HTTPS HTML page and use that URL in the app and both store listings. Complete Apple App Privacy and Google Play Data safety and health disclosures using the actual production configuration. [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) · [Google Play health app policy](https://support.google.com/googleplay/android-developer/answer/16679511)

## Check the bundles and deployed API (TC19)

Use the actual HTTPS API origin and published policy URL in the production build environment. Run the same values through the release check from the repository root:

```sh
EXPO_PUBLIC_API_URL=https://your-service.onrender.com \
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-site.example/privacy \
npm run release:check -- --smoke
```

This checks API health, rejects an invalid assessment without calling a provider, checks the policy URL, and exports and scans the iOS and Android bundles for Anthropic keys. Omit `--smoke` for local bundle checks with placeholder HTTPS URLs. Inspect the final store-bound bundle with the same `check-no-keys.mjs` script if it was built separately.

## Verify on a physical phone (TC11, TC27)

Use a fresh install on each release platform with the deployed HTTPS API. Use a synthetic profile and food photos approved for testing. Each successful scan can make a paid request.

1. Open the app, read the notice and the privacy policy, accept the notice, and save a profile.
2. Give the camera permission and take a clear meal photo. Record how long the verdict takes and check the explanation, disclaimer and saved confirmation.
3. Scan a known packaged-product barcode such as `3017620422003` if the package matches. Check that the result names the product from Open Food Facts. Scan a confirmed unknown barcode and verify that it offers **Take a photo** without saving a verdict.
4. Fully close the app, then reopen it. Verify that the profile persists and that **History** shows the barcode and photo verdicts newest first. Open both and verify that the full verdict and disclaimer survive the restart.
5. Cancel a single deletion and a clear-all deletion. Verify the history is intact, then confirm a single deletion and check the other verdict remains. Clear the rest and restart again to verify that history stays empty.

Record build version, operating system and device, deployed commit, test date, scan times and any failures. Keep photos and profile details out of the release notes. Automated route and SQLite tests provide local coverage for this journey. Physical-device results are required to record TC11 and TC27 as complete.
