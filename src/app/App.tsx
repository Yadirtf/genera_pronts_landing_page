import { useEffect, useState, type FormEvent } from 'react';
import type { Msg } from '../../server/providers/types.ts';
import { complete, getHealth, type Health } from '../providers/client.ts';

// Pantalla provisional: comprueba la conexión con el proveedor mediante un chat simple.
// Las pantallas del flujo (Describe, Elige, Editor) llegarán en las siguientes fases.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const reply = await complete({
        system: 'Eres el asistente de Lienzo. Responde de forma breve y clara.',
        messages: next,
      });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const provider = health?.providers.find((p) => p.id === health.defaultProvider);

  return (
    <main className="shell">
      <header className="top">
        <h1>Lienzo</h1>
        <span className="status">
          {healthError
            ? 'Servidor local sin conexión'
            : !health
              ? 'Conectando…'
              : provider
                ? `${provider.id} · ${provider.model}`
                : 'Sin proveedor: configura .env'}
        </span>
      </header>

      <section className="chat">
        {messages.length === 0 && (
          <p className="empty">Describe la landing page que quieres crear.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble assistant pending">Pensando…</div>}
        {error && <p className="error">{error}</p>}
      </section>

      <form className="composer" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej.: una landing para mi estudio de yoga en Medellín"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
    </main>
  );
}
