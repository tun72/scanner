# Food Scanner privacy policy draft

**Before publication:** Fill in the operator, contact and effective date. Confirm the hosting and Anthropic account settings, including provider data retention, before publishing this text on a public HTTPS page. Remove this paragraph from the published version.

- **Operator** [Publisher name]
- **Privacy contact** [Email address]
- **Effective date** [Date]

## Information on your device

Food Scanner works without an account. It stores the digestive conditions you select, optional profile notes, and your acceptance of the onboarding notice on your device. Successful scans are saved locally with their verdict and time. Photo scans include a small thumbnail. The app asks for camera permission to take food photos and read product barcodes.

## Information used to assess a scan

When you scan, the app sends a reduced-size photo or barcode, your selected conditions and optional notes, an app installation ID, and a language setting to the Food Scanner API hosted on Render. The API forwards the photo and relevant profile information to Anthropic to generate a verdict. For a barcode scan, the API sends the barcode to Open Food Facts to look up the product, then sends the available product facts and profile information to Anthropic. Open Food Facts receives the barcode for lookup. Anthropic receives the information needed to assess the food.

The production app connects to the Food Scanner API over HTTPS. The API does not save scan photos, profile notes, or verdicts in a server database or include those contents in its application logs. It uses the installation ID and network address to limit requests in memory. Application logs record operational details such as request identifiers, outcomes, response times and token counts. Render and Anthropic process information as service providers, including under their applicable terms and data retention settings. [Render Privacy Policy](https://render.com/privacy) · [Anthropic Privacy Center](https://privacy.claude.com/)

## Your controls

Use **Edit profile** to change your saved conditions and notes. In **History**, you can delete one scan or clear all saved scans from this device. You can revoke camera access in your phone's settings. For questions about information submitted for processing or to make a privacy request, contact [Email address].
