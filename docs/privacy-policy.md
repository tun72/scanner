# Food Scanner privacy policy draft

**Before publication:** Fill in the operator, contact and effective date. Confirm the settings and data retention for all providers and backups before publishing on a public HTTPS page. Remove this paragraph from the published version.

- **Operator** [Publisher name]
- **Privacy contact** [Email address]
- **Effective date** [Date]

## Information on your device

Food Scanner requires a mobile account. Your phone stores your sign-in session in the system's secure storage. Your settings, including selected digestive conditions, optional profile notes and acceptance of the onboarding notice, stay on the device. Your phone may cache your saved verdicts so you can read them offline while signed in. A resized photo may also stay on the originating phone while a failed upload is pending. The app asks for camera permission to photograph food and read barcodes.

## Your account and scan history

The Food Scanner API on Render uses PostgreSQL to store your account ID, name, roll number, password hash, session records, verdicts, scan times and photo status. It keeps the resized photos from successful verdicts in Cloudinary with authenticated access. Signed-in users can reopen their own verdicts and photos on another phone. If you choose to import earlier scans, the app uploads their verdicts and any saved thumbnails.

## Information used to assess a scan

When you scan, the app sends a reduced-size photo or barcode, the default stomach-check topics and any optional notes, an app installation ID, and a language setting to the Food Scanner API hosted on Render. For a barcode scan, the API looks up the product in Open Food Facts. In Anthropic mode, Anthropic receives the food information and the relevant profile information. In Gemini mode, Google receives the same general stomach-check checklist for every scan, plus the public product facts or the food photo you confirm, with image metadata removed. Under Google's free-tier terms, Google may use those inputs to improve its products.

The production app connects to the Food Scanner API over HTTPS. In Gemini mode, Food Scanner uses the scan’s stomach-check topics to assess the identified food on the server. The app shows your optional note in the result details for you to review. Google does not receive your note. The saved verdict can contain details derived from the assessment. The API uses the installation ID and network address to limit scan requests and the roll number and network address to limit sign-in attempts. Operational logs include request identifiers, outcomes, response times and token counts. Service providers process information under their applicable terms and retention settings. [Render](https://render.com/privacy) · [Anthropic](https://privacy.claude.com/) · [Gemini](https://aistudio.google.com/docs/terms) · [Cloudinary](https://cloudinary.com/privacy) · [Neon](https://neon.com/privacy-policy)

## Your controls

If you turn on daily notifications, the browser shares a push subscription with the API. The database stores it with your account ID so Scanner can send a generic message through the browser's push service while the app is closed. Turning off daily notifications in Scanner removes the subscription from the database. Scanner also removes subscriptions that the push service reports as expired.

Use **Edit profile** to change the conditions and notes on this phone. In **History**, you can delete one scan or clear your account history. Deleting one scan removes access to it and schedules removal of its stored photo. Clearing your history removes access to all cleared scans and photos in the app. Uploaded photos stay in private Cloudinary storage. The database logs your account ID, the time of the clear, the number of scans cleared, and how many had a fully uploaded photo. Another phone reflects the deletion when it next syncs. You can sign out of each phone and revoke camera access in your phone's settings. To request removal of your account or retained photos, or to ask about your data, contact [Email address].
