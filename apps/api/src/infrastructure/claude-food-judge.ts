import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ScanProfile } from '@food-scanner/contracts';
import type { FoodJudge, JudgeFailure, JudgeResult, TokenUsage } from '../assessment/food-judge.ts';
import { SYSTEM_PROMPT, buildProductText, buildProfileText } from '../assessment/prompt.ts';
import { verdictDraftSchemaFor } from '../assessment/verdict.ts';

type ParseParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type FoodContent = Anthropic.Beta.Messages.BetaImageBlockParam | Anthropic.Beta.Messages.BetaTextBlockParam;

/** The parts of a parsed Claude reply this adapter reads. */
export interface ParsedReply {
  stop_reason: string | null;
  parsed_output: unknown;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
}

/** The one SDK call this adapter makes; `client.beta.messages` satisfies it. */
export interface ClaudeMessages {
  parse(params: ParseParams): Promise<ParsedReply>;
}

export interface ClaudeFoodJudgeOptions {
  messages: ClaudeMessages;
  model: string;
  serverFallback?: boolean;
  onApiError?: (details: { status: number | undefined; billing: boolean; fallbackConfig: boolean; schemaConfig: boolean }) => void;
}

/** Thinking cannot be switched off on this model and counts toward the limit, so leave room beyond the small JSON reply. */
const MAX_TOKENS = 8000;

/** Lets the API continue on a fallback model when a safety classifier declines the first one. */
const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function usageOf({ usage }: ParsedReply): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    ...(usage.cache_creation_input_tokens ? { cacheWriteInputTokens: usage.cache_creation_input_tokens } : {}),
    ...(usage.cache_read_input_tokens ? { cacheReadInputTokens: usage.cache_read_input_tokens } : {}),
  };
}

function failureOf(error: unknown): JudgeFailure {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIError) return 'api-error';
  // The SDK raises a plain AnthropicError when the reply text is not the JSON it asked for.
  if (error instanceof Anthropic.AnthropicError) return 'invalid-reply';
  throw error;
}

/**
 * Judges a food with Claude, from a photo or from a product's listed facts.
 *
 * Provider trouble (errors, timeouts, refusals, cut-off or malformed replies) comes back as
 * a failure result, so the caller can never mistake it for a verdict. Anything that is not
 * provider trouble is a bug and is rethrown.
 */
export function createClaudeFoodJudge({ messages, model, serverFallback = model !== 'claude-haiku-5-5', onApiError }: ClaudeFoodJudgeOptions): FoodJudge {
  /** The same question either way; only how the food is shown differs. */
  async function judge(food: FoodContent, profile: ScanProfile, locale: string): Promise<JudgeResult> {
    const isPhoto = food.type === 'image';
    const draftSchema = verdictDraftSchemaFor(profile, isPhoto);

    let reply: ParsedReply;
    try {
      reply = await messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        ...(serverFallback ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [food, { type: 'text', text: buildProfileText(profile, locale) }, ...(isPhoto ? [{
          type: 'text' as const,
          text: 'If the food and pictured portion can reasonably be inferred, fill photoDetails with rounded ranges for kcal and grams of protein, fat and carbs, and an approximate portion in grams. Use null for unknown values. List at most 12 ingredients with seen or possible evidence. Do not infer that an allergen is absent. Use short explanations and practical tips.',
        }] : [])] }],
        output_config: { effort: 'low', format: betaZodOutputFormat(draftSchema) },
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        onApiError?.({
          status: error.status,
          billing: /credit balance|insufficient credits|billing|payment required/i.test(error.message),
          fallbackConfig: /fallback|server-side-fallback/i.test(error.message),
          schemaConfig: /schema|output_config|structured output/i.test(error.message),
        });
      }
      return { ok: false, failure: failureOf(error) };
    }

    const usage = usageOf(reply);
    if (reply.stop_reason === 'refusal') return { ok: false, failure: 'refusal', usage };
    if (reply.stop_reason === 'max_tokens') return { ok: false, failure: 'truncated', usage };

    // Checked again here even though the SDK parses it: this adapter is the last place that
    // can stop a reply naming a condition the user does not have.
    const draft = draftSchema.safeParse(reply.parsed_output);
    if (!draft.success) return { ok: false, failure: 'invalid-reply', usage };
    return { ok: true, draft: draft.data, usage };
  }

  return {
    judgePhoto: ({ photoBase64, profile, locale }) =>
      judge({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } }, profile, locale),
    judgeProduct: ({ product, profile, locale }) => judge({ type: 'text', text: buildProductText(product) }, profile, locale),
  };
}
