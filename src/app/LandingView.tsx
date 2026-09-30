import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { tweakLanding } from '../engine/flow.ts';
import { deleteLanding, getLanding, saveLanding, withVersion, type ChatEntry, type Landing } from '../storage/bank.ts';
import { downloadHtml, fileNameFor } from './download.ts';
import { formatDate } from './format.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { href, navigate } from './route.ts';
import { useModelChoice } from './useModelChoice.ts';

// Una landing del banco: el historial del chat que la produjo, su versión actual y un chat de ajustes
// para seguir mejorándola con pedidos concretos. Cada ajuste queda como una versión nueva.
export function LandingView({ id }: { id: string }) {
  const { health, choice, pick } = useModelChoice();
  const [landing, setLanding] = useState<Landing | null | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Pedido en curso, que se muestra en el chat mientras el modelo trabaja.
  const [pending, setPending] = useState<ChatEntry | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLanding(id)
      .then((l) => setLanding(l ?? null))
      .catch((e: Error) => setError(e.message));
    return () => abort.current?.abort();
  }, [id]);

  useEffect(() => {
    if (pending) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [pending]);

  const busy = pending !== null;
  const current = landing?.versions.at(-1)?.n;

  async function sendTweak(text: string) {
    const request = text.trim();
    if (!landing || !request || busy) return;
    const asked: ChatEntry = { role: 'user', kind: 'tweak', text: request, at: Date.now() };
    const controller = new AbortController();
    abort.current = controller;
    setPending(asked);
    setDraft('');
    setError(null);
    try {
      const previous = landing.chat.filter((e) => e.kind === 'tweak' && e.role === 'user').map((e) => e.text);
      const result = await tweakLanding(landing.html, request, previous, choice ?? undefined, controller.signal);
      const by = { provider: result.provider, model: result.model };
      const now = Date.now();
      const next = withVersion(landing, result.value, `Ajuste: ${request.slice(0, 80)}`, by, now);
      const n = next.versions.at(-1)!.n;
      next.chat = [
        ...landing.chat,
        asked,
        { role: 'assistant', kind: 'tweak', text: `Apliqué el ajuste. Esta es la versión ${n}.`, at: now, by, version: n },
      ];
      await saveLanding(next);
      setLanding(next);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message);
      // El pedido vuelve al cuadro de texto para reintentarlo o cambiar de modelo.
      setDraft(request);
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function restore(n: number) {
    if (!landing || busy) return;
    const version = landing.versions.find((v) => v.n === n);
    if (!version) return;
    const now = Date.now();
    const next = withVersion(landing, version.html, `Restaurada la versión ${n}`, undefined, now);
    const created = next.versions.at(-1)!.n;
    next.chat = [
      ...landing.chat,
      { role: 'user', kind: 'tweak', text: `Volver a la versión ${n}.`, at: now },
      {
        role: 'assistant',
        kind: 'tweak',
        text: `Listo: la versión ${created} es una copia de la versión ${n}.`,
        at: now,
        version: created,
      },
    ];
    try {
      await saveLanding(next);
      setLanding(next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    if (!landing || !confirm(`¿Eliminar "${landing.title}" del banco? No se puede deshacer.`)) return;
    try {
      await deleteLanding(landing.id);
      navigate({ name: 'bank' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendTweak(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendTweak(draft);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <h1>
          <a href={href({ name: 'chat' })}>Lienzo</a>
        </h1>
        <div className="top-actions">
          {health && choice && <ModelPicker health={health} value={choice} onChange={pick} disabled={busy} />}
          <a className="btn ghost" href={href({ name: 'bank' })}>
            Mis landings
          </a>
        </div>
      </header>

      <section className="chat">
        {landing === undefined && !error && <p className="status">Cargando…</p>}
        {landing === null && (
          <div className="empty">
            <p>Esta landing ya no está en el banco.</p>
          </div>
        )}
        {landing && (
          <>
            <p className="label">
              {landing.title} · creada {formatDate(landing.createdAt)}
              {landing.updatedAt !== landing.createdAt && ` · última modificación ${formatDate(landing.updatedAt)}`}
            </p>
            {landing.chat.map((entry, i) => (
              <Entry
                key={i}
                entry={entry}
                current={current}
                onRestore={entry.version !== undefined && !busy ? () => void restore(entry.version!) : undefined}
              />
            ))}
            {pending && (
              <>
                <Entry entry={pending} current={current} />
                <div className="bubble assistant pending">Aplicando el ajuste… puede tardar un par de minutos.</div>
              </>
            )}
            <div className={`card preview${fullscreen ? ' fullscreen' : ''}`}>
              <p className="label">Versión {current} · actual</p>
              <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={landing.html} />
              <div className="actions">
                <button className="btn" onClick={() => navigate({ name: 'editor', id: landing.id })} disabled={busy}>
                  Editar
                </button>
                <button className="btn ghost" onClick={() => downloadHtml(landing.html, fileNameFor(landing.title))}>
                  Descargar HTML
                </button>
                <button className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
                  {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                </button>
                <button className="btn ghost danger" onClick={remove} disabled={busy}>
                  Eliminar
                </button>
              </div>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div ref={bottom} />
      </section>

      {landing && (
        <form className="composer" onSubmit={onSubmit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pide un ajuste concreto. Ej.: cambia el botón principal a verde oliva y agrega una sección de preguntas frecuentes"
            rows={2}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !draft.trim()}>
            Ajustar
          </button>
        </form>
      )}
    </main>
  );
}

function Entry({ entry, current, onRestore }: { entry: ChatEntry; current?: number; onRestore?: () => void }) {
  const by = entry.by ? `${entry.by.provider} · ${entry.by.model}` : '';
  if (entry.kind === 'prompt') {
    return (
      <details className={`card history-prompt ${entry.role}`}>
        <summary className="label">
          {entry.role === 'assistant' ? 'Prompt maestro' : 'Prompt maestro editado por ti'}
          {by && ` · ${by}`} · {formatDate(entry.at)}
        </summary>
        <pre>{entry.text}</pre>
      </details>
    );
  }
  const old = entry.version !== undefined && entry.version !== current;
  return (
    <div className={`bubble ${entry.role}`} title={formatDate(entry.at)}>
      {entry.text}
      {(by || entry.version !== undefined) && (
        <span className="bubble-meta">
          {entry.version !== undefined && `Versión ${entry.version}${old ? '' : ' · actual'}`}
          {entry.version !== undefined && by && ' · '}
          {by}
          {old && onRestore && (
            <button type="button" className="link-btn" onClick={onRestore}>
              Volver a esta versión
            </button>
          )}
        </span>
      )}
    </div>
  );
}
