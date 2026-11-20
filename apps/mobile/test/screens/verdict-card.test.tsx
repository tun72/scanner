import { describe, expect, it } from '@jest/globals';
import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { VerdictCard } from '../../src/history/verdict-card.tsx';
import { NOTICE, verdict } from '../helpers.ts';

const badgeColour = () => StyleSheet.flatten(screen.getByTestId('verdict-badge').props.style).backgroundColor;

describe('the verdict card', () => {
  it('TC16 the verdict screen shows level, food, reasons, flagged ingredients and tip', async () => {
    await render(<VerdictCard verdict={verdict()} />);

    expect(within(screen.getByTestId('verdict-badge')).getByText('Avoid')).toBeTruthy();
    expect(badgeColour()).toBe('#B3261E');
    expect(screen.getByText('Spicy noodle soup')).toBeTruthy();
    expect(screen.getByText('Acid reflux (GERD) · Avoid')).toBeTruthy();
    expect(screen.getByText('Chilli and a hot, acidic broth often bring on reflux.')).toBeTruthy();
    expect(screen.getByText('chilli')).toBeTruthy();
    expect(screen.getByText('Ask for a mild broth without chilli.')).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it.each([
    ['safe', 'Safe', '#1F7A4D'],
    ['caution', 'Caution', '#9A5B00'],
    ['unsure', 'Not sure', '#5B6470'],
  ] as const)('shows %s as a %s badge in its colour', async (level, badge, colour) => {
    await render(<VerdictCard verdict={verdict({ level, reasons: [], flaggedIngredients: [] })} />);

    expect(within(screen.getByTestId('verdict-badge')).getByText(badge)).toBeTruthy();
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
