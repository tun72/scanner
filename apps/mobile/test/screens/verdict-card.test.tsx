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

    expect(screen.getByText('Food ID confidence')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Seen')).toBeTruthy();
    expect(screen.getByText('Possible')).toBeTruthy();
    expect(screen.getByText('32–40 g')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Estimated 450–600 kcal. Show details' }));
    expect(screen.getByText('Estimated 450–600 kcal for the portion in the photo.')).toBeTruthy();
  });

  it('shows reported nutrition with its quantity and keeps older verdicts readable', async () => {
    const app = await render(<VerdictCard verdict={verdict({
      details: { kind: 'product', product: { nutrition: { quantity: 'per 100 mL', calories: 0 }, allergens: ['chilli'] } },
    })} />);
    expect(screen.getByText('Allergen Caution')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '0 kcal. Show details' }));
    expect(screen.getByText('0 kcal per 100 mL · Open Food Facts')).toBeTruthy();
    await app.unmount();
    await render(<VerdictCard verdict={verdict()} />);
    expect(screen.getByText('Calories unavailable')).toBeTruthy();
  });

  it('TC16 the verdict screen shows level, food, reasons, flagged ingredients and tip', async () => {
    await render(<VerdictCard verdict={verdict()} />);

    expect(screen.getByTestId('verdict-badge').props.children).toBe('Avoid');
    expect(badgeColour()).toBe('#B3261E');
    expect(screen.getByText('Spicy noodle soup')).toBeTruthy();
    expect(screen.getByText('chilli')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Scan info' }));
    expect(screen.getByText('Acid reflux (GERD) · Avoid')).toBeTruthy();
    expect(screen.getByText('Chilli and a hot, acidic broth often bring on reflux.')).toBeTruthy();
    expect(screen.getByText('Ask for a mild broth without chilli.')).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it.each([
    ['safe', 'Safe', '#1F7A4D'],
    ['caution', 'Caution', '#9A5B00'],
    ['unsure', 'Not sure', '#5B6470'],
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
