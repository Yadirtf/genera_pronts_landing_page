import type { CompleteRequest, ProviderInfo } from '../../server/providers/types.ts';
import { fetchJson } from '../app/errors.ts';

// Cliente del servidor local. El navegador nunca habla directo con el proveedor.

export interface Health {
  ok: boolean;
  defaultProvider: string | null;
  providers: ProviderInfo[];
  // true si el servidor tiene UNSPLASH_ACCESS_KEY y puede poner fotos reales.
  images?: boolean;
}

export function getHealth(): Promise<Health> {
  return fetchJson<Health>('/api/health');
}

// Proveedor y modelo elegidos en el selector del chat.
export interface ModelChoice {
  provider: string;
  model: string;
}

// Qué proveedor y modelo respondieron de verdad (puede ser un respaldo distinto del elegido).
export interface Completion extends ModelChoice {
  text: string;
}

export function complete(req: CompleteRequest & { provider?: string }, signal?: AbortSignal): Promise<Completion> {
  return fetchJson<Completion>('/api/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
}
