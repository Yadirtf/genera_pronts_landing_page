import { modelsFor } from './catalog.ts';
import { ProviderError, type CompleteRequest, type TextProvider } from './types.ts';

// Sirve para OpenAI, Gemini, OpenRouter, Mistral, Ollama, LM Studio y cualquier API con /chat/completions.
export interface OpenAICompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  // Modelo que se prueba si el principal sigue fallando tras los reintentos (saturado, sin cuota, retirado).
  fallbackModel?: string;
  // Prefijo de las variables de .env, para decirle al usuario qué cambiar si el modelo falla.
  envPrefix?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

// 429 (límite por minuto) y 5xx (saturación) suelen pasar solos; se reintenta con espera creciente.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const MAX_RETRY_AFTER_MS = 30_000;

// Cambiar de modelo tiene sentido si este está saturado, sin cuota o no disponible para la cuenta.
const FALLBACK_STATUSES = new Set([403, 404, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): TextProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const modelVar = config.envPrefix && `${config.envPrefix}_MODEL`;

  function hintFor(status: number, model: string, detail: string): string {
    if (status === 401) return `Revisa la API key de ${config.id} en .env.`;
    // Gemini responde "limit: 0" cuando el modelo no tiene cuota gratuita (p. ej. los Pro).
    if (status === 429 && /limit:\s*0\b/.test(detail)) {
      return `El modelo "${model}" no tiene cuota en tu plan de ${config.id}. Usa un modelo gratuito en ${modelVar ?? 'el modelo'} (p. ej. gemini-flash-latest) o activa la facturación.`;
    }
    if (status === 429) return `${config.id} limitó las peticiones de "${model}". Espera un minuto y vuelve a intentarlo.`;
    if (status >= 500) return `${config.id} está saturado con "${model}". Suele pasar en minutos; vuelve a intentarlo o cambia de modelo.`;
    if ((status === 403 || status === 404) && modelVar) {
      return `El modelo "${model}" no está disponible para tu cuenta de ${config.id}: cambia ${modelVar} en .env y reinicia npm start.`;
    }
    return '';
  }

  async function call(model: string, req: CompleteRequest): Promise<string> {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.temperature !== undefined && { temperature: req.temperature }),
      ...(req.schema && {
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'output', schema: req.schema },
        },
      }),
    });

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey && { authorization: `Bearer ${config.apiKey}` }),
        },
        body,
      });

      if (res.ok) {
        const data = (await res.json()) as ChatCompletionResponse;
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
          throw new ProviderError('Respuesta sin contenido del proveedor.');
        }
        return content;
      }

      const detail = (await res.text()).slice(0, 500);
      const noQuota = res.status === 429 && /limit:\s*0\b/.test(detail);
      if (RETRYABLE.has(res.status) && !noQuota && attempt < RETRY_DELAYS_MS.length) {
        const wait = Math.min(retryAfterMs(res) ?? RETRY_DELAYS_MS[attempt], MAX_RETRY_AFTER_MS);
        console.warn(`[${config.id}] ${model} respondió ${res.status}; reintento ${attempt + 1} en ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }

      const hint = hintFor(res.status, model, detail);
      throw new ProviderError(`${hint ? `${hint}\n\n` : ''}${baseUrl} ${res.status}: ${detail}`, res.status);
    }
  }

  return {
    id: config.id,
    model: config.model,
    capabilities: { json: true, vision: false, images: false, maxContext: 128_000 },
    models: modelsFor(config.id, config.model, config.fallbackModel),

    async complete(req: CompleteRequest) {
      const model = req.model || config.model;
      try {
        return { text: await call(model, req), model };
      } catch (error) {
        const fallback = config.fallbackModel;
        if (!fallback || fallback === model) throw error;
        if (!(error instanceof ProviderError) || !FALLBACK_STATUSES.has(error.status)) throw error;
        console.warn(`[${config.id}] ${model} falló (${error.status}); probando ${fallback}`);
        try {
          return { text: await call(fallback, req), model: fallback };
        } catch (fallbackError) {
          const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new ProviderError(
            `${error.message}\n\nTambién falló el modelo de respaldo "${fallback}":\n${message}`,
            fallbackError instanceof ProviderError ? fallbackError.status : error.status,
          );
        }
      }
    },
  };
}
