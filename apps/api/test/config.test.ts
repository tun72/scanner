import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('configuration', () => {
  it('reads the Claude key from ANTHROPIC_API_KEY and fills in defaults', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'placeholder-key' })).toEqual({
      host: '0.0.0.0',
      port: 3000,
      anthropicApiKey: 'placeholder-key',
      model: 'claude-opus-5-5',
      claudeTimeoutMs: 15_000,
      claudeMaxRetries: 1,
      openFoodFactsUrl: 'https://world.openfoodfacts.org',
      openFoodFactsUserAgent: 'FoodScanner/0.1',
      productLookupTimeoutMs: 5000,
      trustedProxies: [],
      logLevel: 'info',
    });
  });

  it.each([{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: '   ' }])('refuses to start without the key (%j)', (env) => {
    expect(() => loadConfig(env)).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('reads the trusted proxy addresses as a list', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'placeholder-key', TRUSTED_PROXIES: ' 10.0.0.0/8, 172.16.0.5 ,' }).trustedProxies).toEqual(['10.0.0.0/8', '172.16.0.5']);
  });

  it('refuses a port that is not a port', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'placeholder-key', PORT: 'eighty' })).toThrow(/PORT/);
  });
});
