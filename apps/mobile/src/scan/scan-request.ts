import { ScanRequestSchema, type ScanRequest } from '@food-scanner/contracts';
import type { StomachProfile } from '../profile/stomach-profile.ts';

/** The language the verdict text is written in. English until the launch languages are decided. */
export const SCAN_LOCALE = 'en';

/** Product barcodes the camera reads: EAN-13, EAN-8, UPC-A and UPC-E. */
export const PRODUCT_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** A read barcode worth sending is 8 to 14 digits; anything else is a misread and is ignored. */
export const isProductBarcode = (data: string): boolean => /^\d{8,14}$/.test(data);

/** Who is scanning: the saved profile travels with the scan, and the install ID counts toward the scan limits. */
export interface Scanner {
  profile: StomachProfile;
  installId: string;
}

export type ScanInput = { kind: 'photo'; photo: string } | { kind: 'barcode'; barcode: string };

/**
 * Builds the request the API expects and checks it with the shared schema,
 * so a request the API would refuse is never sent. Returns null when it fails the schema.
 */
export function buildScanRequest(input: ScanInput, scanner: Scanner): ScanRequest | null {
  const { conditions, notes } = scanner.profile;
  const checked = ScanRequestSchema.safeParse({
    ...input,
    installId: scanner.installId,
    profile: { conditions, ...(notes === undefined ? {} : { notes }) },
    locale: SCAN_LOCALE,
  });
  return checked.success ? checked.data : null;
}
