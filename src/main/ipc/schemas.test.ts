/**
 * Smoke tests for the IPC validation schemas. These guard the trust boundary
 * between the renderer and the main process, so they must reject malformed or
 * unexpected input rather than passing it through to provider clients.
 */

import {
  providerIdSchema,
  providerConfigSchema,
  generationParamsSchema,
  appConfigKeySchema,
} from './schemas';

describe('providerIdSchema', () => {
  it('accepts a well-formed id', () => {
    expect(providerIdSchema.parse('openai')).toBe('openai');
  });

  it('rejects ids with illegal characters', () => {
    expect(() => providerIdSchema.parse('Open AI!')).toThrow();
  });
});

describe('providerConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    expect(providerConfigSchema.parse({ apiKey: 'sk-test' })).toEqual({ apiKey: 'sk-test' });
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => providerConfigSchema.parse({ apiKey: 'sk-test', evil: true })).toThrow();
  });

  it('rejects a malformed endpoint URL', () => {
    expect(() => providerConfigSchema.parse({ endpoint: 'not-a-url' })).toThrow();
  });

  it('rejects an out-of-range timeout', () => {
    expect(() => providerConfigSchema.parse({ timeout: 10 })).toThrow();
  });
});

describe('generationParamsSchema', () => {
  const valid = {
    model: 'gpt-4o',
    messages: [{ role: 'user' as const, content: 'Hello' }],
  };

  it('accepts valid generation params', () => {
    expect(generationParamsSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects an empty messages array', () => {
    expect(() => generationParamsSchema.parse({ ...valid, messages: [] })).toThrow();
  });

  it('rejects a temperature above the allowed range', () => {
    expect(() => generationParamsSchema.parse({ ...valid, temperature: 5 })).toThrow();
  });

  it('rejects an unknown message role', () => {
    expect(() =>
      generationParamsSchema.parse({ ...valid, messages: [{ role: 'root', content: 'x' }] })
    ).toThrow();
  });
});

describe('appConfigKeySchema', () => {
  it('accepts a dotted key', () => {
    expect(appConfigKeySchema.parse('ui.theme')).toBe('ui.theme');
  });

  it('rejects keys with path separators', () => {
    expect(() => appConfigKeySchema.parse('../etc/passwd')).toThrow();
  });
});
