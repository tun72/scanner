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

When you scan, the app sends a reduced-size photo or barcode, your selected conditions and optional notes, an app installation ID, and a language setting to the Food Scanner API hosted on Render. The API forwards the photo and relevant profile information to Anthropic to generate a verdict. For a barcode scan, the API sends the barcode to Open Food Facts to look up the product, then sends the available product facts and profile information to Anthropic. Open Food Facts receives the barcode for lookup. Anthropic receives the information needed to assess the food.

The production app connects to the Food Scanner API over HTTPS. The API uses profile settings and notes to assess each scan. The saved verdict can contain details derived from that assessment. The API uses the installation ID and network address to limit scan requests and the roll number and network address to limit sign-in attempts. Operational logs include request identifiers, outcomes, response times and token counts. Service providers process information under their applicable terms and retention settings. [Render](https://render.com/privacy) · [Anthropic](https://privacy.claude.com/) · [Cloudinary](https://cloudinary.com/privacy) · [Neon](https://neon.com/privacy-policy)

## Your controls

Use **Edit profile** to change the conditions and notes on this phone. In **History**, you can delete one scan or clear your account history. A confirmed deletion removes access to the scan and schedules removal of its stored photo. Another phone reflects the deletion when it next syncs. You can sign out of each phone and revoke camera access in your phone's settings. To request removal of your account or ask about your data, contact [Email address].
