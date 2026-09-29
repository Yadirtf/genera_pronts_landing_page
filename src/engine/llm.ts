// Cliente del servidor local. Las claves viven en el servidor, nunca en el navegador.
export type Msg = { role: 'user' | 'assistant'; content: string };

export type CompleteRequest = {
  system: string;
  messages: Msg[];
  temperature?: number;
  maxTokens?: number;
};

export async function complete(req: CompleteRequest, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`El proveedor respondió ${res.status}. ${detail}`.trim());
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}
