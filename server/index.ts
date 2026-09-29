import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createAnthropicProvider } from './providers/anthropic.ts';
import { createOpenAICompatibleProvider } from './providers/openai-compatible.ts';
import { ProviderError, type CompleteRequest, type ProviderInfo, type TextProvider } from './providers/types.ts';

// Las claves viven solo aquí (leídas de .env); el navegador nunca las ve.
const env = process.env;
const providers = new Map<string, TextProvider>();

if (env.ANTHROPIC_API_KEY) {
  providers.set(
    'anthropic',
    createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    }),
  );
}

// Proveedores con API compatible con OpenAI: cada uno lee <PREFIJO>_API_KEY, <PREFIJO>_BASE_URL y <PREFIJO>_MODEL.
const openAICompatible = [
  { id: 'openai', prefix: 'OPENAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5' },
  { id: 'gemini', prefix: 'GEMINI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-pro' },
  { id: 'openrouter', prefix: 'OPENROUTER', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  { id: 'mistral', prefix: 'MISTRAL', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
];

for (const p of openAICompatible) {
  const apiKey = env[`${p.prefix}_API_KEY`];
  const baseUrl = env[`${p.prefix}_BASE_URL`];
  // Un servidor local (Ollama, LM Studio en OPENAI_BASE_URL) no necesita clave, solo una URL distinta de la oficial.
  const isLocal = p.id === 'openai' && !!baseUrl && baseUrl !== p.baseUrl;
  if (!apiKey && !isLocal) continue;
  providers.set(
    p.id,
    createOpenAICompatibleProvider({
      id: p.id,
      baseUrl: baseUrl || p.baseUrl,
      apiKey,
      model: env[`${p.prefix}_MODEL`] || p.model,
    }),
  );
}

const defaultProviderId =
  env.DEFAULT_PROVIDER && providers.has(env.DEFAULT_PROVIDER) ? env.DEFAULT_PROVIDER : providers.keys().next().value;

if (env.DEFAULT_PROVIDER && !providers.has(env.DEFAULT_PROVIDER)) {
  console.warn(`DEFAULT_PROVIDER=${env.DEFAULT_PROVIDER} no tiene clave en .env; se usa ${defaultProviderId ?? 'ninguno'}.`);
}

const app = new Hono().basePath('/api');

app.get('/health', (c) => {
  const list: ProviderInfo[] = [...providers.values()].map(({ id, model, capabilities }) => ({
    id,
    model,
    capabilities,
  }));
  return c.json({ ok: true, defaultProvider: defaultProviderId ?? null, providers: list });
});

app.post('/complete', async (c) => {
  const body = await c.req.json<Partial<CompleteRequest> & { provider?: string }>();

  if (typeof body.system !== 'string' || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: 'Se requieren "system" y al menos un mensaje en "messages".' }, 400);
  }

  const providerId = body.provider ?? defaultProviderId;
  const provider = providerId ? providers.get(providerId) : undefined;
  if (!provider) {
    return c.json(
      { error: 'No hay proveedor configurado. Copia .env.example a .env y añade una clave.' },
      503,
    );
  }

  try {
    const text = await provider.complete({
      system: body.system,
      messages: body.messages,
      schema: body.schema,
      temperature: body.temperature,
    });
    return c.json({ provider: provider.id, model: provider.model, text });
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${provider.id}]`, message);
    return c.json({ error: message }, (status >= 400 && status < 600 ? status : 502) as 502);
  }
});

const port = Number(env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  const names = [...providers.keys()].join(', ') || 'ninguno';
  console.log(`Servidor local en http://127.0.0.1:${port} · proveedores: ${names}`);
});
