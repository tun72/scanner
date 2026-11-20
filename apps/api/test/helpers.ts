import type { FoodJudge, JudgeResult, PhotoToJudge, ProductToJudge } from '../src/assessment/food-judge.ts';
import type { ProductFacts, ProductLookup, ProductLookupResult } from '../src/assessment/product-lookup.ts';
import type { VerdictDraft } from '../src/assessment/verdict.ts';

/** Bytes that start like a JPEG. Nothing in these tests decodes the picture, only its start and size matter. */
export const jpegBase64 = (extraBytes = 16): string => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extraBytes, 7)]).toString('base64');

export const INSTALL_ID = '7f1c2a3e-6b4d-4c8e-9a1f-2b3c4d5e6f70';

export function photoScan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { installId: INSTALL_ID, kind: 'photo', photo: jpegBase64(), profile: { conditions: ['gastritis'] }, locale: 'en', ...overrides };
}

export function draft(overrides: Partial<VerdictDraft> = {}): VerdictDraft {
  return { isFood: true, foodName: 'Plain rice', confidence: 'high', concerns: [], tip: null, retakeHint: null, ...overrides };
}

export const USAGE = { inputTokens: 1200, outputTokens: 150 };

/** A judge that returns a fixed result and remembers what it was asked. */
export function fakeJudge(result: JudgeResult): FoodJudge & { calls: (PhotoToJudge | ProductToJudge)[] } {
  const calls: (PhotoToJudge | ProductToJudge)[] = [];
  const answer = async (input: PhotoToJudge | ProductToJudge): Promise<JudgeResult> => {
    calls.push(input);
    return result;
  };
  return { calls, judgePhoto: answer, judgeProduct: answer };
}

export const NUTELLA: ProductFacts = {
  barcode: '3017620422003',
  name: 'Nutella',
  brand: 'Ferrero',
  ingredientsText: 'sugar, palm oil, hazelnuts, skimmed milk powder, cocoa',
  allergens: ['milk', 'nuts'],
  nutrientsPer100g: { fat: 30.9, sugars: 56.3 },
};

/** A product database that returns a fixed result and remembers which barcodes it was asked for. */
export function fakeProducts(result: ProductLookupResult = { status: 'found', product: NUTELLA }): ProductLookup & { barcodes: string[] } {
  const barcodes: string[] = [];
  return {
    barcodes,
    async findProduct(barcode) {
      barcodes.push(barcode);
      return result;
    },
  };
}

/** A barcode scan as the app would send it: no photo field at all. */
export function barcodeScan(barcode = '5449000000996'): Record<string, unknown> {
  const { photo: _photo, ...withoutPhoto } = photoScan();
  return { ...withoutPhoto, kind: 'barcode', barcode };
}

export const FIXED_NOW = new Date('2026-11-16T10:00:00.000Z');
