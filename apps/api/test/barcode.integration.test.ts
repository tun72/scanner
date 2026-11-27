import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { VerdictResponseSchema } from '@food-scanner/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { buildServer } from '../src/http/server.ts';
import { createClaudeFoodJudge } from '../src/infrastructure/claude-food-judge.ts';
import { createOpenFoodFactsLookup } from '../src/infrastructure/open-food-facts-lookup.ts';
import { FIXED_NOW, barcodeScan, draft } from './helpers.ts';
import { claudeReply, startStandIn, type StandIn } from './stand-ins.ts';

// A real reply from Open Food Facts for this barcode, recorded on 2026-11-17 with the fields the adapter asks for.
const NUTELLA_BARCODE = '3017620422003';
const recordedReply = JSON.parse(readFileSync(new URL('./fixtures/open-food-facts-3017620422003.json', import.meta.url), 'utf8'));
const TEST_YOGURT_BARCODE = '12345678';
const yogurtReply = { status: 1, product: {
  product_name_my: 'ဒိန်ချဉ်', product_name: 'Plain yogurt', product_quantity_unit: 'g',
  serving_size: '1 cup (150 g)', serving_quantity: 150,
  nutriments: { calcium_100g: 0.1, proteins_serving: 6 },
} };

const claudeDraft = draft({
  foodName: 'Hazelnut chocolate spread',
  concerns: [{ about: 'gallbladder', trigger: 'palm oil', severity: 'caution', explanation: 'This spread is high in fat, which can bring on gallbladder pain.' }],
});

let openFoodFacts: StandIn;
let claude: StandIn;
let api: FastifyInstance;

beforeEach(async () => {
  openFoodFacts = await startStandIn(request => ({ body: request.path.includes(`/${TEST_YOGURT_BARCODE}.json`) ? yogurtReply : recordedReply }));
  claude = await startStandIn(() => ({ body: claudeReply(JSON.stringify(claudeDraft)) }));
  // The real lookup adapter and the real Claude adapter, each pointed at its stand-in.
  const products = createOpenFoodFactsLookup({ baseUrl: openFoodFacts.baseURL, userAgent: 'FoodScannerTests/0.1', timeoutMs: 5000 });
  const client = new Anthropic({ apiKey: 'placeholder-key-for-tests', baseURL: claude.baseURL, maxRetries: 0, timeout: 5000 });
  const judge = createClaudeFoodJudge({ messages: client.beta.messages, model: 'claude-opus-5-5' });
  api = buildServer({ assessFood: createAssessFood({ judge, products, now: () => FIXED_NOW }), logLevel: 'silent' });
});

afterEach(async () => {
  await api.close();
  await claude.close();
  await openFoodFacts.close();
});

describe('barcode scan through the API, Open Food Facts and the Claude SDK', () => {
  it('TC3 uses positive as-sold nutrient data for the exact scanned barcode', async () => {
    const scan = { ...barcodeScan(TEST_YOGURT_BARCODE), locale: 'my-MM', profile: { conditions: ['gallbladder'] } };
    const response = await api.inject({ method: 'POST', url: '/v1/assessments', payload: scan });

    expect(response.statusCode).toBe(200);
    expect(openFoodFacts.requests).toHaveLength(1);
    expect(openFoodFacts.requests[0]?.path).toContain(`/${TEST_YOGURT_BARCODE}.json?`);
    expect(VerdictResponseSchema.parse(response.json())).toMatchObject({
      foodName: 'ဒိန်ချဉ်', source: 'product', nutrientHighlights: [
        { nutrient: 'calcium', source: 'open-food-facts' },
        { nutrient: 'protein', source: 'open-food-facts' },
      ],
    });
  });
  it('TC9 looks a known barcode up and judges the product by its listed ingredients', async () => {
    const scan = { ...barcodeScan(NUTELLA_BARCODE), profile: { conditions: ['gallbladder'] } };

    const response = await api.inject({ method: 'POST', url: '/v1/assessments', payload: scan });

    // What the product database was asked.
    expect(openFoodFacts.requests).toHaveLength(1);
    const lookup = openFoodFacts.requests[0]!;
    expect(lookup.method).toBe('GET');
    expect(lookup.path).toBe(`/api/v2/product/${NUTELLA_BARCODE}.json?fields=code,product_name,brands,ingredients_text,ingredients,allergens_tags,nutriments,serving_size,serving_quantity,product_quantity_unit`);
    expect(lookup.headers['user-agent']).toBe('FoodScannerTests/0.1');

    // What Claude was asked: the product's facts as text, and no image.
    expect(claude.requests).toHaveLength(1);
    const content = claude.requests[0]!.body.messages[0].content;
    expect(content.filter((block: { type: string }) => block.type === 'image')).toEqual([]);
    const [productText, profileText] = content.map((block: { text: string }) => block.text);
    expect(productText).toContain(`Name: ${recordedReply.product.product_name}`);
    expect(productText).toContain(`Ingredients: ${recordedReply.product.ingredients_text}`);
    expect(productText).toContain('Allergens: milk, nuts, soybeans');
    expect(productText).toContain('fat 30.9 g');
    expect(profileText).toContain('gallbladder: Gallbladder problems');

    // What the app gets back: a verdict that names the product as its label does.
    expect(response.statusCode).toBe(200);
    expect(VerdictResponseSchema.parse(response.json())).toMatchObject({
      level: 'caution',
      foodName: 'Nutella',
      source: 'product',
      reasons: [{ condition: 'Gallbladder problems', severity: 'caution' }],
      flaggedIngredients: ['palm oil'],
    });
  });
});
