import { describe, expect, it } from 'vitest';
import { DEFAULT_RETAKE_HINT, applyVerdictRules, concernTargetsFor, verdictDraftSchemaFor, type Concern } from '../src/assessment/verdict.ts';
import { draft } from './helpers.ts';

const caution: Concern = { about: 'gerd', trigger: 'tomato', severity: 'caution', explanation: 'Tomato is acidic and may bring on reflux.' };
const avoid: Concern = { about: 'gastritis', trigger: 'chilli', severity: 'avoid', explanation: 'Chilli can irritate your stomach lining.' };

describe('verdict rules', () => {
  it('TC12 the worst concern decides the verdict and every reason is kept', () => {
    const verdict = applyVerdictRules(draft({ foodName: 'Spicy tomato pasta', concerns: [caution, avoid] }));

    expect(verdict.level).toBe('avoid');
    expect(verdict.concerns).toEqual([caution, avoid]);
  });

  it('gives caution when the worst concern is a caution', () => {
    expect(applyVerdictRules(draft({ concerns: [caution] })).level).toBe('caution');
  });

  it('gives safe when there are no concerns', () => {
    expect(applyVerdictRules(draft({ concerns: [] })).level).toBe('safe');
  });

  it('TC15 a safe-looking food identified with low confidence becomes Not sure with a retake hint', () => {
    const verdict = applyVerdictRules(draft({ confidence: 'low', concerns: [], retakeHint: 'Move closer to the plate.' }));

    expect(verdict.level).toBe('unsure');
    expect(verdict.retakeHint).toBe('Move closer to the plate.');
  });

  it('TC15 a photo that is not food becomes Not sure with a retake hint, even without one from the AI', () => {
    const verdict = applyVerdictRules(draft({ isFood: false, foodName: 'A shoe', confidence: 'high', retakeHint: null }));

    expect(verdict.level).toBe('unsure');
    expect(verdict.retakeHint).toBe(DEFAULT_RETAKE_HINT);
  });

  it('drops concerns from a Not sure verdict, since the food they describe was a guess', () => {
    const verdict = applyVerdictRules(draft({ confidence: 'low', concerns: [avoid] }));

    expect(verdict).toMatchObject({ level: 'unsure', concerns: [] });
  });

  it('names a food the AI left blank', () => {
    expect(applyVerdictRules(draft({ foodName: '  ' })).foodName).toBe('Unknown food');
  });
});

describe('what a concern may be about', () => {
  it('is the user\'s conditions, plus their notes when they wrote any', () => {
    expect(concernTargetsFor({ conditions: ['gerd', 'ibs'] })).toEqual(['gerd', 'ibs']);
    expect(concernTargetsFor({ conditions: ['gerd'], notes: 'spicy food hurts' })).toEqual(['gerd', 'notes']);
    expect(concernTargetsFor({ conditions: [], notes: 'milk upsets me' })).toEqual(['notes']);
  });

  it('refuses a draft about a condition the user does not have', () => {
    const schema = verdictDraftSchemaFor({ conditions: ['gerd'] });

    expect(schema.safeParse(draft({ concerns: [caution] })).success).toBe(true);
    expect(schema.safeParse(draft({ concerns: [avoid] })).success).toBe(false);
  });

  it('cannot build a schema for a profile with nothing to judge against', () => {
    expect(() => verdictDraftSchemaFor({ conditions: [] })).toThrow(/cannot be judged/);
  });
});
