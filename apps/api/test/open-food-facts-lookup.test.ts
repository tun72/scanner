import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenFoodFactsLookup } from '../src/infrastructure/open-food-facts-lookup.ts';

const recordedReply = JSON.parse(readFileSync(new URL('./fixtures/open-food-facts-3017620422003.json', import.meta.url), 'utf8'));

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch double that answers with one prepared response, or fails with one prepared error. */
function fetchAnswering(answer: Response | Error): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const lookupWith = (fetchDouble: typeof fetch) =>
  createOpenFoodFactsLookup({ baseUrl: 'https://products.example/', userAgent: 'FoodScannerTests/0.1', timeoutMs: 5000, fetch: fetchDouble });
const find = (answer: Response | Error) => lookupWith(fetchAnswering(answer).fetch).findProduct('3017620422003');

describe('Open Food Facts lookup', () => {
  it('asks for one product by barcode, naming itself', async () => {
    const double = fetchAnswering(json(recordedReply));

    await lookupWith(double.fetch).findProduct('3017620422003');

    expect(double.calls).toHaveLength(1);
    expect(double.calls[0]!.url).toBe('https://products.example/api/v2/product/3017620422003.json?fields=code,product_name,brands,ingredients_text,allergens_tags,nutriments');
    expect(new Headers(double.calls[0]!.init?.headers).get('user-agent')).toBe('FoodScannerTests/0.1');
    expect(double.calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns a recorded reply into product facts', async () => {
    expect(await find(json(recordedReply))).toEqual({
      status: 'found',
      product: {
        barcode: '3017620422003',
        name: 'Nutella',
        brand: 'Ferrero, Nutella',
        ingredientsText: recordedReply.product.ingredients_text,
        allergens: ['milk', 'nuts', 'soybeans'],
        nutrientsPer100g: { fat: 30.9, saturatedFat: 10.6, sugars: 56.3, fibre: 0, salt: 0.107 },
      },
    });
  });

  it.each([
    ['HTTP 404', json({ code: '2999999999995', status: 0, status_verbose: 'product not found' }, 404)],
    ['status 0 with HTTP 200', json({ code: '00000017', status: 0, status_verbose: 'no code or invalid code' })],
    ['a reply with no product', json({ code: '3017620422003', status: 1 })],
    ['a product with neither a name nor ingredients', json({ status: 1, product: { brands: 'Somebrand', allergens_tags: ['en:milk'] } })],
  ])('reports %s as not found', async (_name, response) => {
    expect(await find(response)).toEqual({ status: 'not-found' });
  });

  it.each([
    ['HTTP 500', json({ error: 'down' }, 500), 'lookup-error'],
    ['HTTP 429', json({ error: 'slow down' }, 429), 'lookup-error'],
    ['a body that is not JSON', new Response('<html>maintenance</html>', { status: 200 }), 'lookup-error'],
    ['a reply that is not an object', json('nope'), 'lookup-error'],
    ['a network failure', new TypeError('fetch failed'), 'lookup-error'],
    ['a timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'lookup-timeout'],
  ])('reports %s as unavailable', async (_name, answer, failure) => {
    expect(await find(answer)).toEqual({ status: 'unavailable', failure });
  });

  it('keeps a product when some of its fields are missing or of the wrong type', async () => {
    const reply = { status: 1, product: { product_name: '  Oat drink ', brands: 42, ingredients_text: null, allergens_tags: 'en:oats', nutriments: { fat_100g: 'low', sugars_100g: 4 } } };

    expect(await find(json(reply))).toEqual({ status: 'found', product: { barcode: '3017620422003', name: 'Oat drink', allergens: [], nutrientsPer100g: { sugars: 4 } } });
  });

  it('bounds the length of texts and the number of allergens', async () => {
    const reply = {
      status: 1,
      product: { product_name: 'n'.repeat(500), ingredients_text: 'i'.repeat(9000), allergens_tags: Array.from({ length: 80 }, (_unused, index) => `en:allergen-${index}`) },
    };

    const result = await find(json(reply));

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.product.name).toHaveLength(200);
    expect(result.product.ingredientsText).toHaveLength(4000);
    expect(result.product.allergens).toHaveLength(30);
    expect(result.product.allergens[0]).toBe('allergen 0');
  });
});
