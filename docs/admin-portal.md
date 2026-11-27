# Scanner Admin

The admin website lives at `/admin/` on the Scanner origin. It has its own React build and admin sign-in. The Scanner phone app uses the same account sessions as before and can read announcements from its home screen.

## Build and configure

Run `npm ci`, `npm run build --workspace @food-scanner/admin` and `npm run build:web --workspace @food-scanner/mobile`. The API image builds and serves both applications. For local integration, use the API build with a test database, a staging identity provider, and an HTTPS origin. Set `ADMIN_WEB_ROOT` to the absolute path to the admin build and `WEB_ROOT` to the mobile web build when running the API outside Docker.

Configure a confidential OpenID Connect client with PKCE, an enforced multifactor authentication policy, a signed ID token with `acr` and `auth_time`, and token endpoint support for `client_secret_post`. Register the exact HTTPS callback `<Scanner origin>/admin/auth/callback`. Set `ADMIN_ORIGIN`, `ADMIN_OIDC_ISSUER`, `ADMIN_OIDC_CLIENT_ID`, `ADMIN_OIDC_CLIENT_SECRET`, `ADMIN_OIDC_MFA_ACR` and the comma-separated stable subject IDs in `ADMIN_OIDC_SUBJECTS` on the API. Confirm the expected MFA assurance claim against the provider's staging configuration. Admin operations are disabled when `ADMIN_OIDC_ISSUER` is empty.

## Run the delivery worker

Deploy the current API image first so the additive PostgreSQL migrations run. Provision a separate Render background worker with the same image and this Docker command.

```sh
node --import tsx apps/api/src/announcements/worker.ts
```

Provide `DATABASE_URL` and the existing `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT`. Reuse the current VAPID key pair. The worker also runs locally with `npm run worker:announcements --workspace @food-scanner/api`. Use a staging database with test subscriptions for the first broadcast. A stopped worker leaves queued work in PostgreSQL. Review any overdue items before restarting it. On recovery, a broadcast older than the 24-hour push window still appears in the app inbox and its push targets show as failed.

## Send and verify

In **Notifications**, save the title and message to preview them. Choose **Send now** or enter a date and time labeled **Myanmar** and choose **Schedule**. A queued notification can be changed or cancelled until publication. Refresh the list to check worker status, the scheduled and published times, and delivery counts. **Push service accepted** records the provider response. Actual alert display depends on the device and browser.

All active users can read published announcements in Scanner. To test phone alerts, install Scanner on an iPhone or Android phone, enable notifications, close the app, and send a staged announcement. Tap the notification and confirm that the Scanner inbox opens.
