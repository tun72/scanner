import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { PhotoToJudge } from '../src/assessment/food-judge.ts';
import { createClaudeFoodJudge, type ClaudeMessages, type ParsedReply } from '../src/infrastructure/claude-food-judge.ts';
import { NUTELLA, draft, jpegBase64 } from './helpers.ts';

const photo: PhotoToJudge = { photoBase64: jpegBase64(), profile: { conditions: ['gastritis'] }, locale: 'en' };
const usage = { input_tokens: 1200, output_tokens: 150 };

const replying = (reply: Partial<ParsedReply>): ClaudeMessages => ({
  parse: async () => ({ stop_reason: 'end_turn', parsed_output: draft(), usage, ...reply }),
});
const failingWith = (error: unknown): ClaudeMessages => ({
  parse: async () => {
    throw error;
  },
});
const judgeWith = (messages: ClaudeMessages) => createClaudeFoodJudge({ messages, model: 'claude-opus-5-5' });

describe('Claude food judge', () => {
  it('returns the draft and token usage for a valid reply', async () => {
    const concern = { about: 'gastritis', trigger: 'chilli', severity: 'avoid', explanation: 'Chilli can irritate your stomach lining.' };

    const result = await judgeWith(replying({ parsed_output: draft({ concerns: [concern as never] }) })).judgePhoto(photo);

    expect(result).toEqual({ ok: true, draft: draft({ concerns: [concern as never] }), usage: { inputTokens: 1200, outputTokens: 150 } });
  });

  it.each([
    [
      'TC13 a reply naming a condition the user does not have',
      draft({ concerns: [{ about: 'ibs', trigger: 'onion', severity: 'avoid', explanation: 'Onion is high in FODMAPs.' }] }),
    ],
    ['TC13 a reply missing a required field', { isFood: true, foodName: 'Soup', confidence: 'high', tip: null, retakeHint: null }],
    ['TC13 a reply the SDK could not parse', null],
  ])('%s is never returned as a draft', async (_name, parsedOutput) => {
    const result = await judgeWith(replying({ parsed_output: parsedOutput })).judgePhoto(photo);

    expect(result).toMatchObject({ ok: false, failure: 'invalid-reply' });
  });

  it.each([
    ['TC22 a timeout', new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    ['TC22 a connection error', new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'api-error'],
    ['TC22 an API error', Anthropic.APIError.generate(500, { type: 'error' }, 'Internal server error', new Headers()), 'api-error'],
    ['TC22 an overloaded API', Anthropic.APIError.generate(529, { type: 'error' }, 'Overloaded', new Headers()), 'api-error'],
    ['TC22 reply text that is not the requested JSON', new Anthropic.AnthropicError('Failed to parse structured output'), 'invalid-reply'],
  ])('%s is reported as unavailable', async (_name, error, failure) => {
    const result = await judgeWith(failingWith(error)).judgePhoto(photo);

    expect(result).toEqual({ ok: false, failure });
  });

  it('TC22 a final refusal is reported as unavailable even when the reply carries content', async () => {
    const result = await judgeWith(replying({ stop_reason: 'refusal' })).judgePhoto(photo);

    expect(result).toMatchObject({ ok: false, failure: 'refusal' });
  });

  it('reports a reply cut off by the token limit as unavailable', async () => {
    const result = await judgeWith(replying({ stop_reason: 'max_tokens' })).judgePhoto(photo);

    expect(result).toMatchObject({ ok: false, failure: 'truncated' });
  });

  it('judges a product from its facts as text, with the same question and no image', async () => {
    const asked: Parameters<ClaudeMessages['parse']>[0][] = [];
    const messages: ClaudeMessages = {
      parse: async (params) => {
        asked.push(params);
        return { stop_reason: 'end_turn', parsed_output: draft(), usage };
      },
    };

    const result = await judgeWith(messages).judgeProduct({ product: NUTELLA, profile: photo.profile, locale: 'en' });

    expect(result.ok).toBe(true);
    const content = asked[0]!.messages[0]!.content;
    expect(content).toEqual([
      { type: 'text', text: expect.stringContaining('Name: Nutella') },
      { type: 'text', text: expect.stringContaining('gastritis: Gastritis') },
    ]);
    expect(asked[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low' } });
  });

  it.each([
    { model: 'claude-haiku-5-5' },
    { model: 'claude-opus-5-5', serverFallback: false },
  ])('supports a single-model comparison with $model and records cached token usage', async (options) => {
    const messages: ClaudeMessages = {
      parse: async (params) => {
        expect(params.model).toBe(options.model);
        expect(params).not.toHaveProperty('fallbacks');
        expect(params).not.toHaveProperty('betas');
        return { stop_reason: 'end_turn', parsed_output: draft(), usage: { ...usage, cache_creation_input_tokens: 200, cache_read_input_tokens: 300 } };
      },
    };
    const result = await createClaudeFoodJudge({ ...options, messages }).judgePhoto(photo);
    expect(result).toMatchObject({ ok: true, usage: { inputTokens: 1200, outputTokens: 150, cacheWriteInputTokens: 200, cacheReadInputTokens: 300 } });
  });

  it('lets a programming error through instead of hiding it as an outage', async () => {
    await expect(judgeWith(failingWith(new TypeError('bug'))).judgePhoto(photo)).rejects.toThrow(TypeError);
  });
});
