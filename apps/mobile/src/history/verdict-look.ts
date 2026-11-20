import type { VerdictLevel } from '@food-scanner/contracts';

export interface VerdictLook {
  badge: string;
  colour: string;
  line: string;
}

/** How each level looks: green, amber, red or grey, always with words so colour is never the only signal. */
export const VERDICT_LOOKS: Readonly<Record<VerdictLevel, VerdictLook>> = {
  safe: { badge: 'Safe', colour: '#1F7A4D', line: 'Looks fine for your stomach' },
  caution: { badge: 'Caution', colour: '#9A5B00', line: 'Eat with care' },
  avoid: { badge: 'Avoid', colour: '#B3261E', line: 'Better to avoid' },
  unsure: { badge: 'Not sure', colour: '#5B6470', line: "We couldn't tell" },
};
