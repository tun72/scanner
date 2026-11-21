import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { buildServer } from '../src/http/server.ts';
import { createGeminiFoodJudge } from '../src/infrastructure/gemini-food-judge.ts';
import { loadConfig } from '../src/config.ts';
import { FIXED_NOW, fakeProducts, photoScan } from './helpers.ts';

const response = (finishReason = 'STOP') => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify({
    isFood: true, foodName: 'Rice with cream', confidence: 'high',
    features: [{ kind: 'lactose', evidence: 'observed' }, { kind: 'spicy', evidence: 'possible' }],
  }) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30, thoughtsTokenCount: 5 },
});

describe('Gemini food-only mode', () => {
  it('selects Gemini explicitly and requires its own key', () => {
    expect(loadConfig({ FOOD_SCAN_PROVIDER: 'gemini', GEMINI_API_KEY: 'fixture' })).toMatchObject({ geminiApiKey: 'fixture' });
    expect(() => loadConfig({ FOOD_SCAN_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'old-provider' })).toThrow('GEMINI_API_KEY is not set.');
  });

  it('requires confirmation, strips image metadata, and applies profile rules without sending the profile to Google', async () => {
    const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: 'white' } })
      .jpeg().withExif({ IFD0: { Artist: 'Private metadata sample' } }).toBuffer();
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const requireFoodOnlyPhoto = true;
    const assessFood = createAssessFood({
      judge: createGeminiFoodJudge({ apiKey: 'fixture', fetcher }), products: fakeProducts(),
      now: () => FIXED_NOW, requireFoodOnlyPhoto,
    });
    const api = buildServer({ assessFood, requireFoodOnlyPhoto, logLevel: 'silent' });
    const payload = photoScan({
      photo: jpeg.toString('base64'), profile: { conditions: ['lactose-intolerance'], notes: 'Private notes sample' },
    });

    try {
      expect((await api.inject('/v1/photo-sharing')).json()).toEqual({ requireFoodOnlyPhoto: true });
      expect((await api.inject({ method: 'POST', url: '/v1/assessments', payload })).statusCode).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();

      const result = await api.inject({ method: 'POST', url: '/v1/assessments', payload: { ...payload, foodOnly: true } });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({
        foodName: 'Rice with cream', level: 'caution',
        flaggedIngredients: ['Lactose-containing dairy', 'Personal triggers'],
      });
      expect(fetcher).toHaveBeenCalledOnce();
      const [url, options] = fetcher.mock.calls[0]!;
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
      expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'fixture' });
      const body = String(options?.body);
      expect(body).not.toContain('Private notes sample');
      expect(body).not.toContain('lactose-intolerance');
      expect(body).not.toContain('installId');
      const image = Buffer.from(JSON.parse(body).contents[0].parts[0].inlineData.data, 'base64');
      expect((await sharp(image).metadata()).exif).toBeUndefined();
    } finally {
      await api.close();
    }
  });

  it('sends public product facts and handles quota and safety errors without returning a verdict', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 429 })).mockResolvedValueOnce(response('SAFETY'));
    const judge = createGeminiFoodJudge({ apiKey: 'fixture', fetcher });
    const input = { profile: { conditions: ['ibs' as const] }, locale: 'en', product: { barcode: '3017620422003', name: 'Thyme crackers', allergens: [] } };
    await expect(judge.judgeProduct(input)).resolves.toEqual({ ok: false, failure: 'api-error' });
    await expect(judge.judgeProduct(input)).resolves.toEqual({ ok: false, failure: 'refusal' });
    expect(String(fetcher.mock.calls[0]![1]?.body)).toContain('Thyme crackers');
  });
});
