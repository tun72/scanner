# Food Scanner release verification (DLP-07)

The initial release is in English. The API runs as a single stateless Node 22 container on Render. The repository includes a Blueprint for a manually deployed Free service for staging. Free instances can sleep, so measure the approximately 10-second target on the intended production plan separately. Keep one instance while request limits live in process memory. [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Render Web Services](https://render.com/docs/web-services)

## Set up the Render service

1. Connect the repository in Render and create a Blueprint from `render.yaml`. Select the intended region and plan before going public. The service listens on Render's `PORT` and reports process readiness at `/health`.
2. Set `ANTHROPIC_API_KEY` in Render and set `OPEN_FOOD_FACTS_USER_AGENT` to an app identifier and contact address. Leave `CLAUDE_MODEL` at the current default until there is a reviewed [DLP-06 report](../evals/verdicts/README.md).
3. Verify the trusted ingress chain with the deployed service, then set `TRUSTED_PROXIES` to its confirmed proxy IPs or CIDRs. Check that distinct clients get distinct IP rate limits and that client-supplied forwarding headers cannot choose the address used for limiting. Without trusted proxy addresses, limits use the immediate peer, which can group requests behind a shared proxy. Render's public HTTPS endpoint terminates TLS before forwarding to the app. [Render edge and forwarded addresses](https://render.com/articles/how-render-handles-ddos-attacks)
4. Finalize the [privacy policy draft](privacy-policy.md) with the publisher's information and confirmed provider settings. Publish the policy on a public HTTPS HTML page and use that URL in the app and both store listings. Complete Apple App Privacy and Google Play Data safety and health disclosures using the actual production configuration. [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) · [Google Play health app policy](https://support.google.com/googleplay/android-developer/answer/16679511)

Gemini food recognition is opt-in. Check availability where the app will be used, then set `FOOD_SCAN_PROVIDER=gemini` and store `GEMINI_API_KEY` in the Render service environment. The default is `gemini-3.5-flash-lite`. Set `GEMINI_MODEL` to override it with a model that supports image input and structured output. Deploy the updated API and web app together. Mobile clients need the photo confirmation screen before they can send photos in this mode. Gemini receives food-only photos with metadata removed or public product facts. Food Scanner applies condition rules on its server. Users review their free-text notes themselves. [Gemini terms](https://aistudio.google.com/docs/terms) · [Supported regions](https://aistudio.google.com/docs/available-regions)

For PWA test notifications, generate a VAPID pair with `npx web-push generate-vapid-keys`. Set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` (a public HTTPS contact URL or a `mailto:` contact) on the backend. Keep the private key in the deployment environment and reuse the same pair across deploys so existing subscriptions keep working.

## Set up the mobile account and private storage

Use a staging database and Cloudinary account for the first end-to-end test. Neon PostgreSQL is the proposed database. Save its TLS connection string as `DATABASE_URL` and the Cloudinary API environment variable as `CLOUDINARY_URL` on the server. The API applies the cloud schema on startup. Keep those values in the server environment and use only the public API origin in Expo. [Neon connection options](https://neon.com/docs/connect/connect-from-any-app) · [Cloudinary authenticated media](https://cloudinary.com/documentation/control_access_to_media)

Provide `DATABASE_URL`, `SEED_USER_NAME`, `SEED_USER_ROLL_NUMBER` and `SEED_USER_PASSWORD` through the trusted shell or secret runner that will execute the one-time setup. Run:

```sh
npm run seed:mobile --workspace @food-scanner/api
```

The command provisions the specified mobile account with a generated ID and a salted password hash. Rerunning the command preserves the existing account and password. The running API needs only `DATABASE_URL` and `CLOUDINARY_URL` for the account feature.

## Check the bundles and deployed API (TC19)

Use the actual HTTPS API origin and published policy URL in the production build environment. Run the same values through the release check from the repository root:

```sh
EXPO_PUBLIC_API_URL=https://your-service.onrender.com \
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-site.example/privacy \
npm run release:check -- --smoke
```

This checks API health, verifies that assessment and history require a sign-in without calling a verdict provider, checks the policy URL, and exports and scans the iOS and Android bundles for Anthropic keys. Omit `--smoke` for local bundle checks with placeholder HTTPS URLs. Inspect the final store-bound bundle with the same `check-no-keys.mjs` script if it was built separately.

## Verify on a physical phone (TC11, TC27)

Use a fresh install on each release platform with the deployed HTTPS API. Use a synthetic profile and food photos approved for testing. Each successful scan can make a paid request.

1. Sign in with the seeded account. Read the notice and privacy policy, accept the notice, and save a profile.
2. Give the camera permission and take a clear meal photo. Record the verdict time, confirm the photo is saved, and open **Scan info** for the explanation and safety note.
3. Scan a known packaged-product barcode such as `3017620422003` if the package matches. Check that the result names the product from Open Food Facts. Scan a confirmed unknown barcode and verify that it offers **Take a photo** without saving a verdict.
4. Fully close the app, then reopen it. Verify that the profile persists and that **History** shows the barcode and photo verdicts newest first. Open both and verify that the full verdict and disclaimer survive the restart.
5. Sign in to the same account on a second phone and open History. Verify both scans, the photo, and any reported or estimated nutrition. Confirm an unrelated test account has an empty history.
6. Cancel a single deletion and a clear-all deletion. Confirm the single deletion, then refresh the other phone and verify only the other verdict remains. Clear the remaining history, refresh both phones and verify the history stays empty after restart. Verify the deleted photo is gone from Cloudinary after cleanup.

Record build version, operating system and device, deployed commit, test date, scan times and any failures. Keep photos and profile details out of the release notes. Automated route and SQLite tests provide local coverage for this journey. Physical-device results are required to record TC11 and TC27 as complete.
