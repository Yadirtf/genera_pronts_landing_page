import type { ModelOption, ModelTier } from './types.ts';

// Modelos que se ofrecen en el selector de la interfaz, por proveedor.
// "free" indica que suele entrar en el plan gratuito; cada proveedor cambia sus planes, así que es orientativo.
// Para ofrecer otro modelo basta con añadirlo aquí.
const CATALOG: Record<string, ModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-5-5', tier: 'pro' },
    { id: 'claude-sonnet-5-5', tier: 'pro' },
    { id: 'claude-haiku-4-5', tier: 'pro' },
  ],
  openai: [
    { id: 'gpt-5', tier: 'pro' },
    { id: 'gpt-5-mini', tier: 'pro' },
  ],
  gemini: [
    { id: 'gemini-flash-latest', tier: 'free' },
    { id: 'gemini-3.5-flash', tier: 'free' },
    { id: 'gemini-3.7-flash', tier: 'free' },
    { id: 'gemini-3.1-pro-preview', tier: 'pro' },
  ],
  openrouter: [{ id: 'openrouter/auto', tier: 'pro' }],
  mistral: [
    { id: 'mistral-small-latest', tier: 'free' },
    { id: 'mistral-medium-latest', tier: 'pro' },
    { id: 'mistral-large-latest', tier: 'pro' },
  ],
};

// El modelo de .env (y el de respaldo) van primero aunque no estén en el catálogo.
export function modelsFor(providerId: string, ...configured: (string | undefined)[]): ModelOption[] {
  const catalog = CATALOG[providerId] ?? [];
  const tierOf = (id: string): ModelTier => catalog.find((m) => m.id === id)?.tier ?? 'env';
  const seen = new Set<string>();
  const result: ModelOption[] = [];
  for (const id of configured) {
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push({ id, tier: tierOf(id) });
    }
  }
  for (const m of catalog) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push(m);
    }
  }
  return result;
}
