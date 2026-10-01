import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { images, imagesEnabled } from './images.ts';
import { DATA_DIR, landings } from './landings.ts';
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

// Proveedores con API compatible con OpenAI: cada uno lee <PREFIJO>_API_KEY, <PREFIJO>_BASE_URL,
// <PREFIJO>_MODEL y <PREFIJO>_FALLBACK_MODEL (opcional, se usa si el principal falla).
const openAICompatible = [
  { id: 'openai', prefix: 'OPENAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5' },
  { id: 'gemini', prefix: 'GEMINI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest' },
  { id: 'openrouter', prefix: 'OPENROUTER', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  { id: 'mistral', prefix: 'MISTRAL', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
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
      fallbackModel: env[`${p.prefix}_FALLBACK_MODEL`] || undefined,
      envPrefix: p.prefix,
    }),
  );
}

const defaultProviderId =
  env.DEFAULT_PROVIDER && providers.has(env.DEFAULT_PROVIDER) ? env.DEFAULT_PROVIDER : providers.keys().next().value;

if (env.DEFAULT_PROVIDER && !providers.has(env.DEFAULT_PROVIDER)) {
  console.warn(`DEFAULT_PROVIDER=${env.DEFAULT_PROVIDER} no tiene clave en .env; se usa ${defaultProviderId ?? 'ninguno'}.`);
}

const app = new Hono().basePath('/api');

app.route('/landings', landings);
app.route('/images', images);

app.get('/health', (c) => {
  const list: ProviderInfo[] = [...providers.values()].map(({ id, model, capabilities, models }) => ({
    id,
    model,
    capabilities,
    models,
  }));
  // images: si hay clave de Unsplash, las landings usan fotos reales en vez de ilustraciones SVG.
  return c.json({ ok: true, defaultProvider: defaultProviderId ?? null, providers: list, images: imagesEnabled });
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
      { error: 'No hay proveedor configurado. Copia .env.example a .env y añade una clave.', code: 'no_provider' },
      503,
    );
  }

  const req: CompleteRequest = {
    system: body.system,
    messages: body.messages,
    schema: body.schema,
    temperature: body.temperature,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined,
  };
  // Si el proveedor elegido está saturado o sin cuota, se prueban los demás que tengan clave (con su modelo de .env).
  const candidates = [provider, ...[...providers.values()].filter((p) => p !== provider)];
  // Se aborta si el navegador cancela ("Nueva idea") o se cierra, para no dejar reintentos colgados.
  const signal = c.req.raw.signal;
  const errors: string[] = [];
  let lastStatus = 502;

  for (const candidate of candidates) {
    try {
      // El modelo elegido solo aplica a su proveedor; los demás usan el suyo de .env.
      const result = await candidate.complete(candidate === provider ? req : { ...req, model: undefined }, signal);
      return c.json({ provider: candidate.id, model: result.model, text: result.text });
    } catch (error) {
      lastStatus = error instanceof ProviderError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${candidate.id}] ${lastStatus}:`, error);
      errors.push(candidates.length > 1 ? `[${candidate.id}] ${message}` : message);
      if (signal.aborted) return c.json({ error: 'Cancelado.' }, 499 as 400);
      // Una petición mal formada falla igual en cualquier proveedor.
      if (lastStatus === 400) break;
    }
  }

  const status = lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502;
  console.error(`[complete] fallaron todos los proveedores (${candidates.map((p) => p.id).join(', ')}); se responde ${status}.`);
  // El detalle técnico va en la respuesta para la consola del navegador; la interfaz muestra un texto amigable según el estado.
  return c.json({ error: errors.join('\n\n') }, status as 502);
});

const port = Number(env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  const names = [...providers.keys()].join(', ') || 'ninguno';
  console.log(`Servidor local en http://127.0.0.1:${port} · proveedores: ${names}`);
  console.log(`Banco de landings en ${DATA_DIR}`);
  console.log(imagesEnabled ? 'Fotos: Unsplash' : 'Fotos: sin UNSPLASH_ACCESS_KEY, las landings usan ilustraciones SVG');
});
