import OpenAI from 'openai';

export function getOpenAiApiKey(): string {
  const apiKey =
    process.env.NEXT_PUBLIC_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured (set NEXT_PUBLIC_OPENAI_API_KEY)');
  }
  return apiKey;
}

export function createOpenAiClient(timeoutMs = 120_000): OpenAI {
  return new OpenAI({
    apiKey: getOpenAiApiKey(),
    timeout: timeoutMs,
  });
}
