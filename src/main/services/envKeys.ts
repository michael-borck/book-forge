/**
 * Resolve provider API keys from environment variables, as a fallback when the
 * user hasn't pasted one into Settings. Env keys are used for initialization
 * only — they are never written to the encrypted store.
 */

const ENV_VARS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  groq: ['GROQ_API_KEY'],
};

/** The first non-empty env var value for a provider, if any. */
export function getEnvKey(providerId: string): string | undefined {
  for (const name of ENV_VARS[providerId] ?? []) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function hasEnvKey(providerId: string): boolean {
  return Boolean(getEnvKey(providerId));
}
