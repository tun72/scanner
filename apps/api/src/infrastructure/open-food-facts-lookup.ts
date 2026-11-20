import { z } from 'zod';
import type { Nutrients, ProductFacts, ProductLookup, ProductLookupResult } from '../assessment/product-lookup.ts';

export interface OpenFoodFactsOptions {
  /** For example https://world.openfoodfacts.org. Tests point this at a local stand-in. */
  baseUrl: string;
  /** Open Food Facts asks every client to identify itself. */
  userAgent: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

const FIELDS = 'code,product_name,brands,ingredients_text,allergens_tags,nutriments';

// The database is edited by volunteers, so a product's texts are bounded before they travel on.
const MAX_NAME_LENGTH = 200;
const MAX_INGREDIENTS_LENGTH = 4000;
const MAX_ALLERGENS = 30;

// A field with the wrong type is treated as missing rather than failing the whole product.
const optionalText = z.string().optional().catch(undefined);
const optionalAmount = z.number().nonnegative().optional().catch(undefined);

const ReplySchema = z.object({
  status: z.number().optional().catch(undefined),
  product: z
    .object({
      product_name: optionalText,
      brands: optionalText,
      ingredients_text: optionalText,
      allergens_tags: z.array(z.string()).optional().catch(undefined),
      nutriments: z
        .object({
          fat_100g: optionalAmount,
          'saturated-fat_100g': optionalAmount,
          sugars_100g: optionalAmount,
          fiber_100g: optionalAmount,
          salt_100g: optionalAmount,
        })
        .optional()
        .catch(undefined),
    })
    .optional(),
});
type ReplyProduct = NonNullable<z.infer<typeof ReplySchema>['product']>;

const textOrUndefined = (text: string | undefined, maxLength: number): string | undefined => text?.trim().slice(0, maxLength) || undefined;

type Defined<T> = { [Key in keyof T]?: Exclude<T[Key], undefined> };

/** Removes entries whose value is undefined, so optional fields are simply absent. */
function withoutUndefined<T extends object>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Defined<T>;
}

/** Allergen tags look like "en:milk"; the user only needs "milk". */
const allergenName = (tag: string): string => tag.replace(/^[a-z]{2,3}:/, '').replaceAll('-', ' ').trim();

function toProductFacts(barcode: string, product: ReplyProduct): ProductFacts {
  const nutriments = product.nutriments;
  const nutrients: Nutrients = withoutUndefined({
    fat: nutriments?.fat_100g,
    saturatedFat: nutriments?.['saturated-fat_100g'],
    sugars: nutriments?.sugars_100g,
    fibre: nutriments?.fiber_100g,
    salt: nutriments?.salt_100g,
  });
  return {
    barcode,
    ...withoutUndefined({
      name: textOrUndefined(product.product_name, MAX_NAME_LENGTH),
      brand: textOrUndefined(product.brands, MAX_NAME_LENGTH),
      ingredientsText: textOrUndefined(product.ingredients_text, MAX_INGREDIENTS_LENGTH),
    }),
    allergens: (product.allergens_tags ?? []).map(allergenName).filter(Boolean).slice(0, MAX_ALLERGENS),
    ...(Object.keys(nutrients).length > 0 ? { nutrientsPer100g: nutrients } : {}),
  };
}

const isTimeout = (error: unknown): boolean => error instanceof Error && error.name === 'TimeoutError';

/**
 * Looks products up in Open Food Facts.
 *
 * An unknown barcode is "not found"; a database that cannot be reached or read is "unavailable".
 * The two are kept apart because the user is told different things.
 */
export function createOpenFoodFactsLookup({ baseUrl, userAgent, timeoutMs, fetch: fetchProduct = fetch }: OpenFoodFactsOptions): ProductLookup {
  return {
    async findProduct(barcode): Promise<ProductLookupResult> {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
      try {
        const response = await fetchProduct(url, {
          headers: { 'user-agent': userAgent, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        // The database answers 404 for a barcode it does not know.
        if (response.status === 404) return { status: 'not-found' };
        if (!response.ok) return { status: 'unavailable', failure: 'lookup-error' };

        const reply = ReplySchema.safeParse(await response.json());
        if (!reply.success) return { status: 'unavailable', failure: 'lookup-error' };
        if (reply.data.status === 0 || reply.data.product === undefined) return { status: 'not-found' };

        const product = toProductFacts(barcode, reply.data.product);
        // With neither a name nor ingredients there is nothing to judge, so the user is asked for a photo.
        if (product.name === undefined && product.ingredientsText === undefined) return { status: 'not-found' };
        return { status: 'found', product };
      } catch (error) {
        // fetch rejects for network trouble and timeouts, and json() for a body that is not JSON.
        return { status: 'unavailable', failure: isTimeout(error) ? 'lookup-timeout' : 'lookup-error' };
      }
    },
  };
}
