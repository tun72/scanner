import type { NutrientId, ProductDetails } from '@food-scanner/contracts';

/** What a product database knows about a packaged product, reduced to what the judgement needs. */
export interface ProductFacts {
  barcode: string;
  name?: string;
  brand?: string;
  ingredientsText?: string;
  allergens: string[];
  nutrientsPer100g?: Nutrients;
  details?: ProductDetails;
  /** Nutrients with positive reported amounts on a known basis for the product as sold. */
  reportedNutrients?: NutrientId[];
}

/** Grams per 100 g of product. */
export interface Nutrients {
  fat?: number;
  saturatedFat?: number;
  sugars?: number;
  fibre?: number;
  salt?: number;
}

/** Why a lookup gave no answer. Used for logs only. */
export type LookupFailure = 'lookup-timeout' | 'lookup-error';

export type ProductLookupResult =
  | { status: 'found'; product: ProductFacts }
  | { status: 'not-found' }
  | { status: 'unavailable'; failure: LookupFailure };

/** The product database. Declared here so the use case does not depend on any provider. */
export interface ProductLookup {
  /** Never throws for provider trouble: an unreachable database is a normal result. */
  findProduct(barcode: string, locale?: string): Promise<ProductLookupResult>;
}
