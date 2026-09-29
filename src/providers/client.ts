import type { CompleteRequest, ProviderInfo } from '../../server/providers/types.ts';

// Cliente del servidor local. El navegador nunca habla directo con el proveedor.

export interface Health {
  ok: boolean;
  defaultProvider: string | null;
  providers: ProviderInfo[];
}

export async function getHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Servidor local no disponible (${res.status})`);
  return res.json();
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

export async function complete(
  req: CompleteRequest & { provider?: string },
  signal?: AbortSignal,
): Promise<Completion> {
  const res = await fetch('/api/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}
