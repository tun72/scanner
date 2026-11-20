import { MAX_PHOTO_BYTES } from '@food-scanner/contracts';
import { describe, expect, it } from 'vitest';
import { NOT_MEDICAL_ADVICE_NOTICE, createAssessFood } from '../src/assessment/assess-food.ts';
import { FIXED_NOW, NUTELLA, USAGE, barcodeScan, draft, fakeJudge, fakeProducts, jpegBase64, photoScan } from './helpers.ts';

const judgeReturning = (overrides = {}) => fakeJudge({ ok: true, draft: draft(overrides), usage: USAGE });
const assessWith = (judge: ReturnType<typeof fakeJudge>, products = fakeProducts()) => createAssessFood({ judge, products, now: () => FIXED_NOW });

describe('checking the scan request', () => {
  it.each([
    ['TC8 a photo over 1.5 MB', photoScan({ photo: jpegBase64(MAX_PHOTO_BYTES) })],
    ['TC8 data that is not a JPEG', photoScan({ photo: Buffer.from('GIF89a not a jpeg at all').toString('base64') })],
    ['TC8 a request that does not match the schema', photoScan({ profile: { conditions: ['headache'] } })],
    ['TC8 a body that is not an object', 'photo please'],
  ])('%s is refused as invalid-request and Claude is not called', async (_name, body) => {
    const judge = judgeReturning();

    const outcome = await assessWith(judge)(body);

    expect(outcome).toMatchObject({ kind: 'refused', error: { code: 'invalid-request' } });
    expect(judge.calls).toHaveLength(0);
  });

  it('refuses a barcode that is not 8 to 14 digits without looking it up', async () => {
    const judge = judgeReturning();
    const products = fakeProducts();

    const outcome = await assessWith(judge, products)(barcodeScan('12AB'));

    expect(outcome).toMatchObject({ kind: 'refused', error: { code: 'invalid-request' } });
    expect(products.barcodes).toHaveLength(0);
    expect(judge.calls).toHaveLength(0);
  });
});

describe('judging a photo', () => {
  it('hands the photo, profile and language to the judge', async () => {
    const judge = judgeReturning();
    const body = photoScan({ profile: { conditions: ['gerd'], notes: 'spicy food hurts' }, locale: 'fr' });

    await assessWith(judge)(body);

    expect(judge.calls).toEqual([{ photoBase64: body.photo, profile: { conditions: ['gerd'], notes: 'spicy food hurts' }, locale: 'fr' }]);
  });

  it('returns a verdict with condition labels, each flagged ingredient once, the notice and the time', async () => {
    const judge = judgeReturning({
      foodName: 'Creamy chilli pasta',
      concerns: [
        { about: 'gerd', trigger: 'chilli', severity: 'avoid', explanation: 'Chilli often brings on reflux.' },
        { about: 'notes', trigger: 'chilli', severity: 'caution', explanation: 'You said spicy food hurts.' },
        { about: 'gerd', trigger: 'cream', severity: 'caution', explanation: 'Fatty sauces can relax the valve above your stomach.' },
      ],
      tip: 'Ask for a tomato-free, mild version.',
    });

    const outcome = await assessWith(judge)(photoScan({ profile: { conditions: ['gerd'], notes: 'spicy food hurts' } }));

    expect(outcome).toEqual({
      kind: 'verdict',
      scanKind: 'photo',
      usage: USAGE,
      response: {
        level: 'avoid',
        foodName: 'Creamy chilli pasta',
        source: 'photo',
        reasons: [
          { condition: 'Acid reflux (GERD)', severity: 'avoid', explanation: 'Chilli often brings on reflux.' },
          { condition: 'Your notes', severity: 'caution', explanation: 'You said spicy food hurts.' },
          { condition: 'Acid reflux (GERD)', severity: 'caution', explanation: 'Fatty sauces can relax the valve above your stomach.' },
        ],
        flaggedIngredients: ['chilli', 'cream'],
        tip: 'Ask for a tomato-free, mild version.',
        notice: NOT_MEDICAL_ADVICE_NOTICE,
        assessedAt: '2026-11-16T10:00:00.000Z',
      },
    });
  });

  it('reports the AI as unavailable when the judge fails, and returns no verdict', async () => {
    const judge = fakeJudge({ ok: false, failure: 'timeout' });

    const outcome = await assessWith(judge)(photoScan());

    expect(outcome).toEqual({ kind: 'unavailable', scanKind: 'photo', failure: 'timeout', error: { code: 'ai-unavailable', message: expect.any(String) } });
  });

  it('treats a reason with no explanation as a bad reply rather than showing it', async () => {
    const judge = judgeReturning({ concerns: [{ about: 'gastritis', trigger: 'chilli', severity: 'avoid', explanation: '  ' }] });

    const outcome = await assessWith(judge)(photoScan());

    expect(outcome).toMatchObject({ kind: 'unavailable', failure: 'invalid-reply', error: { code: 'ai-unavailable' } });
  });
});

describe('judging a barcode', () => {
  it('TC10 an unknown barcode asks for a photo instead and Claude is not called', async () => {
    const judge = judgeReturning();
    const products = fakeProducts({ status: 'not-found' });

    const outcome = await assessWith(judge, products)(barcodeScan('2999999999995'));

    expect(outcome).toEqual({ kind: 'not-found', scanKind: 'barcode', error: { code: 'product-not-found', message: expect.stringContaining('take a photo') } });
    expect(products.barcodes).toEqual(['2999999999995']);
    expect(judge.calls).toHaveLength(0);
  });

  it('hands the product facts, profile and language to the judge, and no photo', async () => {
    const judge = judgeReturning();

    await assessWith(judge)({ ...barcodeScan(NUTELLA.barcode), profile: { conditions: ['ibs'] }, locale: 'de' });

    expect(judge.calls).toEqual([{ product: NUTELLA, profile: { conditions: ['ibs'] }, locale: 'de' }]);
  });

  it('returns a product verdict named as the label names it, not as the AI rephrases it', async () => {
    const judge = judgeReturning({
      foodName: 'Hazelnut chocolate spread',
      concerns: [{ about: 'gastritis', trigger: 'high fat', severity: 'caution', explanation: 'Rich spreads can sit heavily on an irritated stomach.' }],
    });

    const outcome = await assessWith(judge)(barcodeScan(NUTELLA.barcode));

    expect(outcome).toMatchObject({ kind: 'verdict', scanKind: 'barcode', response: { level: 'caution', foodName: 'Nutella', source: 'product', flaggedIngredients: ['high fat'] } });
  });

  it("uses the AI's name for a product the database has no name for", async () => {
    const judge = judgeReturning({ foodName: 'Rice crackers' });
    const products = fakeProducts({ status: 'found', product: { barcode: '12345678', ingredientsText: 'rice, salt', allergens: [] } });

    const outcome = await assessWith(judge, products)(barcodeScan('12345678'));

    expect(outcome).toMatchObject({ kind: 'verdict', response: { foodName: 'Rice crackers', source: 'product' } });
  });

  it('reports a product database outage as unavailable, with product wording, and Claude is not called', async () => {
    const judge = judgeReturning();
    const products = fakeProducts({ status: 'unavailable', failure: 'lookup-timeout' });

    const outcome = await assessWith(judge, products)(barcodeScan());

    expect(outcome).toEqual({
      kind: 'unavailable',
      scanKind: 'barcode',
      failure: 'lookup-timeout',
      error: { code: 'ai-unavailable', message: expect.stringContaining('this product') },
    });
    expect(judge.calls).toHaveLength(0);
  });

  it('reports the AI as unavailable when it cannot judge the product', async () => {
    const outcome = await assessWith(fakeJudge({ ok: false, failure: 'refusal' }))(barcodeScan());

    expect(outcome).toMatchObject({ kind: 'unavailable', scanKind: 'barcode', failure: 'refusal', error: { code: 'ai-unavailable' } });
  });
});
