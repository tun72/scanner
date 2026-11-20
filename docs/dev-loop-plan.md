# Food Scanner plan

- **Status:** design confirmed on 2026-11-16. DLP-01 through DLP-05 are implemented. The DLP-06 evaluation runner and DLP-07 Render release tooling are implemented. The live model evaluation, hosted rollout and device verification are pending.
- **Sources:** the planning request and answers in the chat (2026-11-16); the Claude model table cached 2026-11-03. Decisions and confirmation: [context.md](../.dev-loop/plans/food-scanner/context.md).
- **Interactive report:** [plan-preview.json](../.dev-loop/plans/food-scanner/plan-preview.json), revision 2, SHA-256 `26fcc111d791570e14288d41779a6fa087c238a34a08c9fb112441dcba477bbe`. Open it with `dev-loop plan show .dev-loop/plans/food-scanner/plan-preview.json`.
- **Policy:** dev-loop workflow 0.14.0-preview. GUIDELINES.md SHA-256 `135f1b69ebee8f2eb7ae050c53ed49ce70e44b2e9b8f9f6147973317b5bcc201`.
- **IDs:** the S/A IDs (`FS-S1`… and `FS-A1`…) are provisional until they are published to an issue.

## Outcome and constraints

A person with a stomach problem photographs a meal or package, or scans a product barcode. Within about 10 seconds the app says **Safe, Caution, Avoid or Not sure** for their stomach. It gives reasons tied to their own conditions, lists the ingredients it flagged, and offers a tip. The app is a guide, not medical advice.

**In scope:**
- a stomach profile kept on the phone;
- photo and barcode scans;
- a stateless API that asks Claude for a judgement;
- scan history on the phone, with delete.

**Out of scope for this version:**
- accounts and sync between phones;
- portion or nutrition tracking;
- doctor or dietitian features;
- a web app;
- offline judgements.

| Requirement | Statement |
| --- | --- |
| FS-S1 | The user records their stomach conditions from a fixed list, plus optional notes. The profile is kept only on their phone. |
| FS-S2 | The user scans a food by photo (a meal or a package) or by product barcode. |
| FS-S3 | The backend AI judges the scanned food against the profile. It returns Safe, Caution, Avoid or Not sure, with reasons tied to the user's conditions, the flagged ingredients and a tip. |
| FS-S4 | The app says it is not medical advice and keeps health data off the server. It also protects the AI key and limits abuse. |
| FS-S5 | The phone keeps past verdicts so the user can look back at them and delete them. |

| Criterion | Observable outcome |
| --- | --- |
| FS-A1 | Saving a profile needs the notice accepted and at least one condition or a note. The profile survives an app restart. |
| FS-A2 | A scan cannot start without a profile. The app goes to profile setup instead. |
| FS-A3 | A photo scan sends a shrunk photo with the profile, and the user sees a verdict. |
| FS-A4 | A barcode is looked up and judged by its listed ingredients. An unknown barcode asks the user for a photo. |
| FS-A5 | The verdict is one of the four levels and the worst concern decides it. Each Caution or Avoid reason names one of the user's conditions. Flagged ingredients are listed. |
| FS-A6 | A photo that isn't food, or is unclear, gets Not sure with a hint to retake it. It never gets Safe. |
| FS-A7 | Every verdict, new or from history, shows the not-medical-advice note. |
| FS-A8 | The server never stores or logs photos or profiles. The Claude key never ships in the app. |
| FS-A9 | Scans over the hourly limit are refused with a try-again-later message. |
| FS-A10 | When the AI or the product lookup fails, the app shows a clear error, no verdict, and saves nothing. |
| FS-A11 | Every verdict is saved to history. The user can reopen it, and delete one scan or all of them. |

**Constraints:**
- **Not medical advice:** the onboarding notice and every verdict say so.
- **Privacy:** photos and profiles go to Anthropic for each judgement, and the privacy policy must say so. The API stores nothing about the user, and all traffic uses HTTPS.
- **Secrets:** `ANTHROPIC_API_KEY` exists only in the API host's environment.
- **Speed:** a verdict within about 10 seconds on a normal mobile connection.
- **App stores:** health-app rules may require a privacy policy and a clear disclaimer before release.

## Workflows

### Check a food before eating (business)

**Goal:** the user learns within seconds whether a meal or product suits their stomach, and why.

**Actions**

1. **Save my stomach profile**
   - Context: Stomach profile. Service: app. Requirements: FS-S1, FS-S4, FS-A1.
   - Trigger: first launch, or Settings → Edit profile.
   - Steps:
     1. Show the not-medical-advice notice and ask the user to accept it.
     2. Pick conditions from the list and add optional notes.
     3. Refuse a profile with no condition and no note.
     4. Save the profile on the phone.
   - Business rules:
     - The notice must be accepted before the first scan.
     - A profile needs at least one condition or a note.
     - The profile stays on the phone.
2. **Scan a food**
   - Context: Food assessment. Service: app. Requirements: FS-S2, FS-A2, FS-A3, FS-A4, FS-A8.
   - Trigger: the user taps Scan.
   - Steps:
     1. Check that a profile is saved.
     2. Send the user to profile setup (when there is no profile).
     3. Take a photo, or read a barcode (EAN-13, EAN-8, UPC-A, UPC-E).
     4. Shrink the photo to at most 1024 px on its longest side, as a JPEG at quality 0.7.
     5. Send the scan request with the profile to `POST /v1/assessments`.
3. **Judge the food for this stomach**
   - Context: Food assessment. Service: API. Requirements: FS-S2–FS-S4, FS-A3–FS-A6, FS-A8–FS-A10.
   - Steps:
     1. Check the request: the rate limits, the photo's size and type, the barcode digits and the profile.
     2. Refuse the request with an error, without calling Claude.
     3. Look up the barcode in Open Food Facts.
     4. Report the product as not found and ask for a photo.
     5. Ask Claude for a structured verdict.
     6. Apply the verdict rules.
     7. Return the verdict, storing nothing.
     8. Report the AI as unavailable (on an error, a timeout, a refusal or a reply that breaks the schema).
   - Business rules:
     - The verdict is one of four levels, and the worst concern decides it.
     - A non-food or unclear photo is Not sure, never Safe.
     - Each Caution or Avoid reason names one of the user's conditions.
     - Photos and profiles are never stored or logged.
4. **Show and keep the verdict**
   - Context: Scan history. Service: app. Requirements: FS-A5, FS-A7, FS-A10, FS-A11.
   - Steps:
     1. Receive the response.
     2. Show the error with a Retry or Take a photo button, and save nothing.
     3. Show the verdict card: a green, amber, red or grey level, the food name, the reasons, the flagged ingredients and the tip.
     4. Show the not-medical-advice note.
     5. Save the scan to history with a 256 px thumbnail.
   - Business rules:
     - Every verdict shows the note.
     - Only verdicts are saved, never errors.

**Flow:**
- Scanning *needs* the saved profile, but saving a profile doesn't start a scan.
- Scan a food *then* Judge the food: the scan request crosses from the phone to the API.
- Judge the food *then* Show and keep the verdict: the verdict response or error crosses back.
- Shared records: the saved stomach profile and the scan history.
- Nothing retries automatically; the user retries.

### Look back at past scans (business)

**Goal:** the user sees what they scanned before and what the app said, and removes any of it from the phone. It uses the verdicts that *Check a food before eating* saved.

1. **Look back at a past verdict**
   - Context: Scan history. Service: app. Requirements: FS-A7, FS-A11.
   - Trigger: the user opens History.
   - Steps:
     1. List saved scans, newest first.
     2. Open one scan to show its full verdict with the note.
2. **Delete past scans**
   - Context: Scan history. Service: app. Requirement: FS-A11.
   - Trigger: the user taps Delete.
   - Steps:
     1. Choose one scan, or Delete all.
     2. Confirm the deletion. Cancelling deletes nothing.
     3. Delete the chosen rows.

**Flow:** the two actions start independently and share the scan history record. Nothing here reaches the server.

## Contexts

| Context | Type | Owns | Terms |
| --- | --- | --- | --- |
| Stomach profile | supporting | The conditions, notes and notice acceptance | Condition, Note |
| Food assessment | core | Turning a scan and a profile into a verdict; the API contract | Verdict, Concern, Not sure |
| Scan history | supporting | The past scans saved on the phone | (none specific) |

**Proposed condition list** (still open):
- acid reflux (GERD);
- gastritis;
- stomach or duodenal ulcer;
- IBS;
- lactose intolerance;
- celiac disease or gluten sensitivity;
- gallbladder problems;
- Crohn's disease or ulcerative colitis.

Each condition has a stable `ConditionId` slug, such as `gerd` or `ibs`, plus a display label for each language. The list lives in the contracts package, so the app and the API always agree.

## Technology and physical design

**Repository layout** (one TypeScript repository using npm workspaces):

```text
apps/mobile          Expo app (Expo Router)
apps/api             Fastify API
packages/contracts   Zod schemas: ConditionId list, ScanRequest, VerdictResponse, AssessmentError, verdict schema builder
evals/verdicts       labelled sample photos and the paid quality-check script (DLP-06)
```

**Services**

| Service | Runs where | Holds |
| --- | --- | --- |
| Food Scanner app | The user's iPhone or Android phone, built with Expo EAS | Profile and install ID (SecureStore); history (SQLite). No secrets. |
| Food Scanner API | One stateless Node.js 22 container behind HTTPS on a managed host (the host is still open) | `ANTHROPIC_API_KEY` in the environment; rate-limit counters in memory |

| Action / context | Service | Technology it uses directly | Boundary contract |
| --- | --- | --- | --- |
| Save my stomach profile / Stomach profile | app | React Native + Expo; SecureStore | none |
| Scan a food / Food assessment | app | Expo Camera; Image Manipulator; SecureStore; contracts | sends `ScanRequest` |
| Judge the food / Food assessment | API | Fastify + rate limit; contracts; Anthropic SDK; Open Food Facts | accepts `ScanRequest`; returns `VerdictResponse` or `AssessmentError` |
| Show and keep the verdict / Scan history | app | React Native + Expo; contracts; SQLite | receives `VerdictResponse` or `AssessmentError` |
| Look back at a past verdict / Scan history | app | React Native + Expo; SQLite | none |
| Delete past scans / Scan history | app | React Native + Expo; SQLite | none |

### API contract: `POST /v1/assessments`

- **Request:** `application/json`, at most 2 MB. Fields:
  - `installId` (UUID);
  - `kind`: `photo` or `barcode`;
  - `photo` (base64 JPEG, at most 1024 px and 1.5 MB) or `barcode` (8–14 digits), whichever matches `kind`;
  - `profile` (`conditions: ConditionId[]`, and `notes` of at most 300 characters);
  - `locale`.
- **Responses:**

| HTTP | Body | When |
| --- | --- | --- |
| 200 | `VerdictResponse` | A verdict was reached |
| 400 | `invalid-request` | The schema, size, image type or barcode digits fail |
| 404 | `product-not-found` (with a take-a-photo hint) | The barcode is unknown to Open Food Facts |
| 429 | `rate-limited` (with `retryAfterSeconds` and a `Retry-After` header) | Over 30 scans per install per hour, or 120 per IP per hour |
| 503 | `ai-unavailable` | A Claude error, a timeout or refusal, or a reply that breaks the schema. An Open Food Facts timeout or error also returns 503, with product wording. |

- Error messages are user-facing. They never echo the request or internal details (SEC10).

### Claude call (inside "Judge the food")

- **Client:** `@anthropic-ai/sdk`, model `claude-opus-5-5`, called with `client.messages.parse(...)`.
  - The output format is `zodOutputFormat(verdictSchemaFor(profile.conditions))`. That schema is built for each request, so `conditionId` can only be one of the user's own conditions.
- **Effort:** `low` to start, set explicitly in `output_config`. Thinking cannot be turned off on this model.
- **Fallback:** server-side refusal fallback is on (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`). A final `stop_reason: "refusal"` maps to `ai-unavailable`.
  - Check the SDK docs for using `parse` together with the beta fallback parameter when implementing.
- **Timeouts:** 15 seconds per request with at most 1 retry, so a failure surfaces quickly.
- **Prompt layout:**
  - A fixed system prompt: the role, a not-medical-advice framing, the typical triggers for each condition, how to rate concerns, and when to answer Not sure. It is marked for prompt caching; caching applies once the prompt reaches the model's minimum cacheable length.
  - The user turn: the image block (or the product facts as text), then the profile.
  - Notes and product text are data, never instructions (SEC7).
- **Verdict rules** (in plain code after parsing):
  - The level is the highest concern severity, or `safe` when there are no concerns.
  - `isFood = false` or `confidence = low` gives `unsure` with a retake hint.
  - Condition IDs are mapped to labels in the user's language.
- **Cost estimate:** about 2.5k input tokens and up to 1k output tokens per scan, so roughly 2–4 US cents at $4 / $20 per million tokens. DLP-06 measures the real figure and compares Haiku 5.5.

### Privacy and security

- **Logs:** Fastify's logger redacts the request and response bodies. Logs hold only the request ID, `kind`, latency, the verdict level or error code and token usage (SEC4, SEC11).
- **Disk:** the API writes no files and has no database.
- **App:** the API base URL comes from `EXPO_PUBLIC_API_URL`, which is not a secret. The install ID is a random UUID made with `expo-crypto` on first launch, stored in SecureStore and used only for rate limits.
- **Input checks:** the request is checked against the contracts schema before any provider call (SEC1).

### Selected choices

Each choice was confirmed on 2026-11-16 (see context.md).
- Photo and barcode scanning.
- A condition list plus notes.
- Storage on the phone only, with no login.
- Node.js with Fastify, rather than Express.
- Claude Opus 5.5 at low effort.
- The Expo managed workflow, rather than the bare React Native CLI.
- Open Food Facts, looked up on the server.
- Per-install and per-IP limits. App Attest and Play Integrity come later, if needed.
- Shared Zod contracts.

### Still open

1. The final condition list.
2. The launch languages. Build in English first, with strings ready for translation.
3. Opus 5.5 or Haiku 5.5, decided after DLP-06.
4. The API host (Render, Fly.io or similar).

## Planned verification

**Proposed test tools:**
- `jest-expo` with React Native Testing Library for the app;
- Vitest for the API and contracts;
- Maestro for the E2E flow.

These are safe to change during implementation.

| Workflow / criteria | Behaviour protected | Levels |
| --- | --- | --- |
| Check a food / FS-A1, FS-A2 | The profile rules (notice, at least one condition or note) and the scan gate | Unit: TC1–TC5 |
| Check a food / FS-A3, FS-A4 | The request is built correctly; the API calls Claude and Open Food Facts correctly; bad input is refused; unknown barcodes fall back to a photo | Unit: TC6, TC8, TC10. Integration with stand-ins for Claude and Open Food Facts: TC7, TC9. Manual on a real phone: TC11 |
| Check a food / FS-A5, FS-A6 | The worst concern wins; low confidence gives Not sure; a bad AI reply never becomes a verdict; real model quality | Unit: TC12, TC13, TC15, TC16. Integration with the real model (paid, on demand): TC14 |
| Both workflows / FS-A7 | The note shows on every verdict screen | Unit: TC17 |
| Check a food / FS-A8 | Nothing about the user in logs or on disk; no key in the app | Integration: TC18. Inspection: TC19 |
| Check a food / FS-A9 | Within the limit passes; over the limit gets 429 | Integration: TC20, TC21 |
| Check a food / FS-A10 | Provider failures become a clear error and nothing is saved | Unit: TC22, TC23 |
| Look back / FS-A11 | Saved and listed newest first; delete one or all; cancelling keeps everything | Integration on simulator SQLite: TC24. Unit: TC25, TC26 |
| Main journey / FS-A1, FS-A3, FS-A11 | Onboarding → photo scan → verdict → restart → history | E2E: TC27 |

Limits of this plan:
- TC7 and TC9 use stand-ins for Claude and Open Food Facts. Only TC14 and TC11 touch the real providers.
- TC14 costs money on each run, so it runs only on request and before changing the prompt or model.
- See the [evaluation guide](../evals/verdicts/README.md) and the [release runbook](release.md) for the commands and remaining live checks.

## Task sequence

| Task | Outcome and coverage | Depends on / contracts | Consumer | Readiness |
| --- | --- | --- | --- | --- |
| DLP-01 | **API judges a photo.** Repository skeleton, the contracts package, `POST /v1/assessments` for photos, the Claude adapter, verdict rules, errors and log redaction. Covers FS-A3, FS-A5, FS-A6, FS-A8 and FS-A10 on the API side. Tests: TC7, TC8, TC12, TC13, TC15, TC18, TC22 | None. Defines `ScanRequest`, `VerdictResponse` and `AssessmentError` | DLP-02, DLP-04 | Ready. Uses the proposed condition list (it is data, easy to change) |
| DLP-02 | **API judges a barcode, and rate limits.** Open Food Facts lookup, not-found fallback, per-install and per-IP limits. Covers FS-A4 and FS-A9. Tests: TC9, TC10, TC20, TC21 | DLP-01 | DLP-04 | Ready after DLP-01 |
| DLP-03 | **App: set up the stomach profile.** Expo app skeleton, navigation, notice, condition picker, SecureStore, install ID. Covers FS-A1. Tests: TC1–TC3 | The contracts package from DLP-01 (the condition list) | DLP-04 | Ready. Can start alongside DLP-01 if the contracts package is created first |
| DLP-04 | **App: scan and see the verdict.** Profile gate, camera photo and barcode, resizing, the API call, verdict card, error states, saving to history. Covers FS-A2, FS-A3, FS-A5, FS-A7, FS-A8 (app side), FS-A10 and FS-A11. Tests: TC4–TC6, TC16, TC17, TC19, TC23, TC24 | DLP-01 and DLP-03 (DLP-02 for barcodes) | DLP-05, DLP-07 | Ready after its dependencies |
| DLP-05 | **App: history review and delete.** History list and detail, delete one or all. Covers FS-A7 and FS-A11. Tests: TC17 (history), TC24, TC25, TC26 | DLP-04 | DLP-07 | Ready after DLP-04 |
| DLP-06 | **Verdict quality check.** About 50 labelled photos across 4 profiles, a script that runs them against the real model and records quality, cost and time. Decides Opus 5.5 or Haiku 5.5. Covers FS-A5 and FS-A6. Test: TC14 | DLP-01 | Model selection | Runner implemented. Live evaluation needs labeled photos, a configured API key and spending approval. |
| DLP-07 | **Release readiness.** Deploy the API, run the E2E journey and the manual barcode check, scan the bundle for keys, privacy policy text. Tests: TC11, TC19, TC27 | DLP-01 to DLP-05 | App stores | Render and English selected. Deployment configuration, local bundle checks and policy draft implemented. Hosted deployment, policy publication and device checks are pending. |

## Detail and handoff

- **Confirmed design:** plan revision 2 (SHA-256 above). Confirmed with "Confirm design" on 2026-11-16, against the overview shown in the chat. Revision 2 only relabelled confirmed choices.
- **Decision record:** `.dev-loop/plans/food-scanner/context.md`, with the plan's change journal beside it.
- **Next step:** prepare the labeled photos and connect the project repository to Render for the live verification steps.
- **Optional:** `/dev-loop-spec` creates tracker issues from these tasks, and `dev-loop plan publish` pins this plan to them.
- **Re-plan triggers:** a change to any of these reopens the affected part of the design:
  - adding accounts or sync;
  - moving judgement onto the phone;
  - changing the AI provider;
  - storing anything about the user on the server;
  - a TC14 result showing that the verdict rules or levels need to change.
