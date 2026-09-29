import { ProviderError, type CompleteRequest, type TextProvider } from './types.ts';

// Sirve para OpenAI, Gemini, OpenRouter, Mistral, Ollama, LM Studio y cualquier API con /chat/completions.
export interface OpenAICompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  // Variable de .env que fija el modelo, para decirle al usuario qué cambiar si el modelo falla.
  modelVar?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): TextProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    id: config.id,
    model: config.model,
    capabilities: { json: true, vision: false, images: false, maxContext: 128_000 },

    async complete(req: CompleteRequest) {
      const body = {
        model: config.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.schema && {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'output', schema: req.schema },
          },
        }),
      };

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey && { authorization: `Bearer ${config.apiKey}` }),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        // 403/404 suelen ser un modelo retirado o fuera de tu plan; 401 es la clave.
        const hint =
          res.status === 401
            ? `Revisa la API key de ${config.id} en .env.`
            : (res.status === 403 || res.status === 404) && config.modelVar
              ? `El modelo "${config.model}" no está disponible para tu cuenta de ${config.id}: cambia ${config.modelVar} en .env y reinicia npm start.`
              : '';
        throw new ProviderError(`${hint ? `${hint}\n\n` : ''}${baseUrl} ${res.status}: ${detail}`, res.status);
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new ProviderError('Respuesta sin contenido del proveedor.');
      }
      return content;
    },
  };
}
