import Anthropic from '@anthropic-ai/sdk';
import { VerdictResponseSchema } from '@food-scanner/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssessFood } from '../src/assessment/assess-food.ts';
import { buildServer } from '../src/http/server.ts';
import { createClaudeFoodJudge } from '../src/infrastructure/claude-food-judge.ts';
import { FIXED_NOW, draft, fakeProducts, photoScan } from './helpers.ts';
import { claudeReply, startStandIn, type StandIn } from './stand-ins.ts';

const claudeDraft = draft({
  foodName: 'Spicy noodle soup',
  concerns: [{ about: 'gastritis', trigger: 'chilli', severity: 'avoid', explanation: 'Chilli can irritate your stomach lining.' }],
  tip: 'Ask for a mild broth instead.',
});

let claude: StandIn;
let api: FastifyInstance;

beforeEach(async () => {
  claude = await startStandIn(() => ({ body: claudeReply(JSON.stringify(claudeDraft)) }));
  // The real SDK client and adapter, pointed at the stand-in. The key is a placeholder, not a secret.
  const client = new Anthropic({ apiKey: 'placeholder-key-for-tests', baseURL: claude.baseURL, maxRetries: 0, timeout: 5000 });
  const judge = createClaudeFoodJudge({ messages: client.beta.messages, model: 'claude-opus-5-5' });
  api = buildServer({ assessFood: createAssessFood({ judge, products: fakeProducts(), now: () => FIXED_NOW }), logLevel: 'silent' });
});

afterEach(async () => {
  await api.close();
  await claude.close();
});

describe('photo scan through the API and the Claude SDK', () => {
  it('TC7 sends the photo and profile to Claude and returns a verdict', async () => {
    const scan = photoScan({ profile: { conditions: ['gastritis'], notes: 'spicy food hurts' }, locale: 'en' });

    const response = await api.inject({ method: 'POST', url: '/v1/assessments', payload: scan });

    // What Claude was asked.
    expect(claude.requests).toHaveLength(1);
    const { path, headers, body } = claude.requests[0]!;
    expect(path).toMatch(/^\/v1\/messages/);
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');

    const content = body.messages[0].content;
    const images = content.filter((block: { type: string }) => block.type === 'image');
    expect(images).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: scan.photo } }]);
    const profileText = content.find((block: { type: string }) => block.type === 'text').text;
    expect(profileText).toContain('gastritis: Gastritis');
    expect(profileText).toContain('spicy food hurts');
    expect(profileText).toContain('Reply language: en');

    // The answer format only lets a concern be about this user's condition or their notes.
    expect(JSON.stringify(body.output_config.format.schema)).toContain('"enum":["gastritis","notes"]');

    // What the app gets back.
    expect(response.statusCode).toBe(200);
    expect(VerdictResponseSchema.parse(response.json())).toMatchObject({
      level: 'avoid',
      foodName: 'Spicy noodle soup',
      source: 'photo',
      reasons: [{ condition: 'Gastritis', severity: 'avoid', explanation: 'Chilli can irritate your stomach lining.' }],
      flaggedIngredients: ['chilli'],
      tip: 'Ask for a mild broth instead.',
      assessedAt: '2026-11-16T10:00:00.000Z',
    });
  });
});
