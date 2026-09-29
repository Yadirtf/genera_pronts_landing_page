import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, type CompleteRequest, type TextProvider } from './types.ts';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function createAnthropicProvider(config: AnthropicConfig): TextProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    id: 'anthropic',
    model: config.model,
    capabilities: { json: true, vision: true, images: false, maxContext: 1_000_000 },

    async complete(req: CompleteRequest) {
      // Los modelos actuales de Claude rechazan `temperature`, por eso no se envía.
      // `fallbacks: "default"` reintenta en otro modelo si el principal rechaza la petición.
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages
          .stream({
            model: config.model,
            max_tokens: 64000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: req.system,
            messages: req.messages,
            ...(req.schema && {
              output_config: { format: { type: 'json_schema', schema: req.schema } },
            }),
          })
          .finalMessage();
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new ProviderError(`Anthropic ${error.status ?? ''}: ${error.message}`, error.status ?? 502);
        }
        throw error;
      }

      if (response.stop_reason === 'refusal') {
        throw new ProviderError('El modelo rechazó la solicitud.', 422);
      }

      return response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    },
  };
}
