import { ProviderError, type CompleteRequest, type TextProvider } from './types.ts';

// Sirve para OpenAI, Gemini, OpenRouter, Mistral, Ollama, LM Studio y cualquier API con /chat/completions.
export interface OpenAICompatibleConfig {
  id: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
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
        const detail = await res.text();
        throw new ProviderError(`${baseUrl} ${res.status}: ${detail.slice(0, 500)}`, res.status);
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
