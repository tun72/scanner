import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { VerdictCard } from '../../src/history/verdict-card.tsx';
import { NOTICE, verdict } from '../helpers.ts';

const badgeColour = () => StyleSheet.flatten(screen.getByTestId('verdict-badge').props.style).color;

describe('the verdict card', () => {
  it('labels a calorie range as estimated and distinguishes what is visible from possible ingredients', async () => {
    await render(<VerdictCard verdict={verdict({
      details: { kind: 'photo', confidence: 'medium', photo: {
        portionGrams: 350, calories: { min: 450, max: 600 }, protein: { min: 32, max: 40 },
        ingredients: [{ name: 'Tuna', evidence: 'seen' }, { name: 'Dressing', evidence: 'possible' }],
      } },
    })} />);

    expect(screen.getByText('ပုံတွင် မြင်ရ')).toBeTruthy();
    expect(screen.getByText('ပါဝင်နိုင်')).toBeTruthy();
    expect(screen.getByText('၃၂–၄၀ ဂရမ်')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'ခန့်မှန်း ၄၅၀–၆၀၀ ကီလိုကယ်လိုရီ · အသေးစိတ်' }));
    expect(screen.getByText('ဓာတ်ပုံထဲရှိ ပမာဏအတွက် ၄၅၀–၆၀၀ ကီလိုကယ်လိုရီ ခန့် ရှိသည်။')).toBeTruthy();
  });

  it('shows reported nutrition with its quantity and keeps older verdicts readable', async () => {
    const app = await render(<VerdictCard verdict={verdict({
      flaggedIngredients: ['fat', 'lime', 'chilli'],
      details: { kind: 'product', product: { nutrition: { quantity: 'per 100 mL', calories: 0 }, allergens: ['chilli'] } },
    })} />);
    expect(screen.getByText('ဓာတ်မတည့်မှု သတိပြုရန်')).toBeTruthy();
    expect(screen.getByText('chilli')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '၀ ကီလိုကယ်လိုရီ · အသေးစိတ်' }));
    expect(screen.getByText('၀ ကီလိုကယ်လိုရီ ၁၀၀ မီလီလီတာလျှင် · Open Food Facts')).toBeTruthy();
    await app.unmount();
    await render(<VerdictCard verdict={verdict()} />);
    expect(screen.getByText('ကယ်လိုရီ မသိရသေးပါ')).toBeTruthy();
  });

  it('TC16 the verdict screen shows level, food, reasons, flagged ingredients and tip', async () => {
    await render(<VerdictCard verdict={verdict()} />);

    expect(screen.getByTestId('verdict-badge').props.children).toBe('ရှောင်ရန်');
    expect(badgeColour()).toBe('#B3261E');
    expect(screen.getByText('Spicy noodle soup')).toBeTruthy();
    expect(screen.getByText('chilli')).toBeTruthy();
    expect(screen.getByText('Ask for a mild broth without chilli.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'စစ်ဆေးချက် အသေးစိတ်' }));
    expect(screen.getByText('Chilli and a hot, acidic broth often bring on reflux.')).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('shows food-specific evidence with a distinct action and cleans up older repeated copy', async () => {
    await render(<VerdictCard verdict={verdict({
      tip: 'ငရုတ်ဆီကို သပ်သပ်ထည့်ပေးဖို့ ပြောပါ။',
      reasons: [
        { condition: 'Gastritis', severity: 'caution', explanation: 'အစပ်ပါဝင်ပစ္စည်းများ ပါဝင်ပုံ ရသည်။ ပါဝင်ပစ္စည်းများကို စစ်ပြီး သင်စားနေကျ ခံနိုင်သည့်ပမာဏကို ထည့်သွင်းစဉ်းစားပါ။' },
        { condition: 'Gastritis', severity: 'caution', explanation: 'ဟင်းရည်ပေါ်မှာ ဆီလွှာတွေ့ရပါတယ်။', foodEvidence: { item: 'ဆီများတဲ့ ဟင်းရည်', certainty: 'observed' } },
        { condition: 'Gastritis', severity: 'caution', explanation: 'အရောင်အရ သံပရာရည် ပါနိုင်ပါတယ်။', foodEvidence: { item: 'သံပရာရည်', certainty: 'possible' } },
      ],
    })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'စစ်ဆေးချက် အသေးစိတ်' }));
    expect(screen.getByText('ဘယ်လို စားရင် ပိုအဆင်ပြေမလဲ')).toBeTruthy();
    expect(screen.getByText('ပုံထဲမှာ တွေ့ရတယ်')).toBeTruthy();
    expect(screen.getByText('ပါနိုင်တယ်')).toBeTruthy();
    expect(screen.getByText('သံပရာရည်')).toBeTruthy();
    expect(screen.getByText('တွေ့ရတာက အစပ်ပါဝင်ပစ္စည်းများ ပါ။')).toBeTruthy();
    expect(screen.queryByText(/သင်စားနေကျ ခံနိုင်သည့်ပမာဏ/)).toBeNull();
  });

  it.each([
    ['safe', 'သင့်လျော်နိုင်', '#1F7A4D'],
    ['caution', 'သတိပြုရန်', '#9A5B00'],
    ['unsure', 'မသေချာပါ', '#5B6470'],
  ] as const)('shows %s as a %s badge in its colour', async (level, badge, colour) => {
    await render(<VerdictCard verdict={verdict({ level, reasons: [], flaggedIngredients: [] })} />);

    expect(screen.getByTestId('verdict-badge').props.children).toBe(badge);
    expect(badgeColour()).toBe(colour);
  });

  it('shows the retake hint, not a tip, when it is not sure', async () => {
    await render(
      <VerdictCard verdict={verdict({ level: 'unsure', reasons: [], flaggedIngredients: [], tip: 'Unused tip', retakeHint: 'Take the photo closer, in good light.' })} />,
    );

    expect(screen.getByText('Take the photo closer, in good light.')).toBeTruthy();
    expect(screen.queryByText('Unused tip')).toBeNull();
    expect(screen.queryByText('Why')).toBeNull();
  });
});
