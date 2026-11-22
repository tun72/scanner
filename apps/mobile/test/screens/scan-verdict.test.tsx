import type { AssessmentError, VerdictLevel } from '@food-scanner/contracts';
import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { ScanResult } from '../../src/scan/scan-outcome.ts';
import { NOTICE, NOW, THUMBNAIL_BASE64, savedProfile, verdict } from '../helpers.ts';
import { readBarcode } from './fake-camera.tsx';
import { fake, resetFake, sent } from './fake-services.ts';
import { routes } from './routes.ts';

jest.mock('../../src/services.ts', () => jest.requireActual<typeof import('./fake-services.ts')>('./fake-services.ts').services);
jest.mock('expo-camera', () => jest.requireActual('./fake-camera.tsx'));

const BARCODE = '3017620422003';
const refused = (error: AssessmentError): ScanResult => ({ kind: 'failed', failure: { reason: 'refused', error } });
const AI_UNAVAILABLE = refused({ code: 'ai-unavailable', message: "လောလောဆယ် စစ်ဆေး၍ မရပါ။ ခဏနေ ပြန်ကြိုးစားပါ။" });
const NOT_FOUND = refused({ code: 'product-not-found', message: "ဤပစ္စည်းကို ရှာမတွေ့ပါ။ ဓာတ်ပုံရိုက်ပြီး စစ်ပါ။" });

/** Opens the scan screen with a saved profile and the API answers queued. */
async function openScan(...replies: ScanResult[]) {
  resetFake(savedProfile(), replies);
  await renderRouter(routes, { initialUrl: '/scan' });
  await screen.findByTestId('camera');
}

const scanBarcode = (barcode = BARCODE) => act(async () => readBarcode(barcode));
const takePhoto = async () => fireEvent.press(screen.getByText('ဓာတ်ပုံ ရိုက်ရန်'));

const VERDICTS: Record<VerdictLevel, ScanResult> = {
  safe: { kind: 'verdict', verdict: verdict({ level: 'safe', foodName: 'Plain rice', reasons: [], flaggedIngredients: [], tip: 'A gentle choice.' }) },
  caution: { kind: 'verdict', verdict: verdict({ level: 'caution', reasons: [{ condition: 'အစာအိမ်ရောင်ခြင်း', severity: 'caution', explanation: 'Spice can irritate.' }] }) },
  avoid: { kind: 'verdict', verdict: verdict() },
  unsure: { kind: 'verdict', verdict: verdict({ level: 'unsure', foodName: 'Unclear photo', reasons: [], flaggedIngredients: [], retakeHint: 'Take it closer.' }) },
};

describe('the scan screen', () => {
  it('TC27 route rehearsal saves a photo verdict during onboarding and reopens it after remounting', async () => {
    resetFake(null, [VERDICTS.avoid]);
    const app = await renderRouter(routes);

    await fireEvent.press(await screen.findByText('နားလည်ပါပြီ'));
    await fireEvent.press(await screen.findByText('အစာအိမ်ရောင်ခြင်း'));
    await fireEvent.press(screen.getByText('အချက်အလက် သိမ်းရန်'));
    await fireEvent.press(await screen.findByText('အစားအစာ စစ်ရန်'));
    await screen.findByTestId('camera');
    await takePhoto();
    await screen.findByText('မှတ်တမ်းတွင် သိမ်းပြီးပါပြီ။');
    await app.unmount();

    await renderRouter(routes);
    await fireEvent.press(await screen.findByRole('button', { name: 'မှတ်တမ်း' }));
    await fireEvent.press(await screen.findByText('Spicy noodle soup'));
    await fireEvent.press(await screen.findByRole('button', { name: 'စစ်ဆေးချက် အသေးစိတ်' }));
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(sent()).toHaveLength(1);
  });

  it.each(['safe', 'caution', 'avoid', 'unsure'] as const)('TC17 every verdict screen shows the not-medical-advice note (%s)', async (level) => {
    await openScan(VERDICTS[level]);

    await scanBarcode();

    expect(screen.getByTestId('verdict-badge')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'စစ်ဆေးချက် အသေးစိတ်' }));
    expect(await screen.findByText(NOTICE)).toBeTruthy();
  });

  it('TC23 an error response is shown and nothing is saved to history (ai-unavailable)', async () => {
    await openScan(AI_UNAVAILABLE);

    await takePhoto();

    expect(await screen.findByText("လောလောဆယ် စစ်ဆေး၍ မရပါ။ ခဏနေ ပြန်ကြိုးစားပါ။")).toBeTruthy();
    expect(screen.getByText('ပြန်ကြိုးစားရန်')).toBeTruthy();
    expect(screen.queryByTestId('verdict-badge')).toBeNull();
    expect(fake.history.saved).toEqual([]);
  });

  it('TC23 an error response is shown and nothing is saved to history (product-not-found)', async () => {
    await openScan(NOT_FOUND);

    await scanBarcode();

    expect(await screen.findByText("ဤပစ္စည်းကို ရှာမတွေ့ပါ။ ဓာတ်ပုံရိုက်ပြီး စစ်ပါ။")).toBeTruthy();
    expect(screen.queryByTestId('verdict-badge')).toBeNull();
    expect(fake.history.saved).toEqual([]);
    await fireEvent.press(screen.getByText('ဓာတ်ပုံဖြင့် စစ်ရန်'));
    expect(await screen.findByTestId('camera')).toBeTruthy();
  });

  it('resends the same request on Try again, then shows and saves the verdict with its thumbnail', async () => {
    await openScan({ kind: 'failed', failure: { reason: 'unreachable' } }, VERDICTS.avoid);

    await takePhoto();
    await fireEvent.press(await screen.findByText('ပြန်ကြိုးစားရန်'));

    expect(await screen.findByText('မှတ်တမ်းတွင် သိမ်းပြီးပါပြီ။')).toBeTruthy();
    expect(sent()).toHaveLength(2);
    expect(sent()[1]).toEqual(sent()[0]);
    expect(sent()[0]?.kind).toBe('photo');
    expect(fake.history.saved).toEqual([{ id: expect.any(String), scannedAt: NOW.toISOString(), verdict: verdict(), thumbnail: THUMBNAIL_BASE64 }]);
  });

  it('saves a barcode verdict without a thumbnail', async () => {
    await openScan(VERDICTS.safe);

    await scanBarcode();

    expect(await screen.findByText('မှတ်တမ်းတွင် သိမ်းပြီးပါပြီ။')).toBeTruthy();
    expect(sent()[0]).toMatchObject({ kind: 'barcode', barcode: BARCODE });
    expect(fake.history.saved[0]?.thumbnail).toBeNull();
  });

  it('says how long to wait over the scan limit and offers no retry', async () => {
    await openScan(refused({ code: 'rate-limited', message: "ယခုနာရီအတွက် စစ်ဆေးနိုင်သည့် အကြိမ်ရေ ပြည့်သွားပါပြီ။", retryAfterSeconds: 1200 }));

    await scanBarcode();

    expect(await screen.findByText("ယခုနာရီအတွက် စစ်ဆေးနိုင်သည့် အကြိမ်ရေ ပြည့်သွားပါပြီ။ ၂၀ မိနစ်ခန့်အကြာ ပြန်စစ်ပါ။")).toBeTruthy();
    expect(screen.getByText('ပင်မစာမျက်နှာသို့')).toBeTruthy();
    expect(screen.queryByText('ပြန်ကြိုးစားရန်')).toBeNull();
  });

  it('ignores a code that is not a product barcode and keeps looking', async () => {
    await openScan(VERDICTS.safe);

    await scanBarcode('https://example.com');

    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(sent()).toEqual([]);
  });
});
