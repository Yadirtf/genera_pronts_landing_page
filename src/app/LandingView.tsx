import { useEffect, useState } from 'react';
import { deleteLanding, getLanding, type ChatEntry, type Landing } from '../storage/db.ts';
import { downloadHtml, fileNameFor } from './download.ts';
import { formatDate } from './format.ts';
import { href, navigate } from './route.ts';

// Una landing del banco: el historial del chat que la produjo y su versión actual.
export function LandingView({ id }: { id: string }) {
  const [landing, setLanding] = useState<Landing | null | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLanding(id)
      .then((l) => setLanding(l ?? null))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function remove() {
    if (!landing || !confirm(`¿Eliminar "${landing.title}" del banco? No se puede deshacer.`)) return;
    try {
      await deleteLanding(landing.id);
      navigate({ name: 'bank' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <h1>
          <a href={href({ name: 'chat' })}>Lienzo</a>
        </h1>
        <div className="top-actions">
          <a className="btn ghost" href={href({ name: 'bank' })}>
            Mis landings
          </a>
        </div>
      </header>

      <section className="chat">
        {error && <p className="error">{error}</p>}
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
              <Entry key={i} entry={entry} />
            ))}
            <div className={`card preview${fullscreen ? ' fullscreen' : ''}`}>
              <p className="label">Versión actual</p>
              <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={landing.html} />
              <div className="actions">
                <button className="btn" onClick={() => navigate({ name: 'editor', id: landing.id })}>
                  Editar
                </button>
                <button className="btn ghost" onClick={() => downloadHtml(landing.html, fileNameFor(landing.title))}>
                  Descargar HTML
                </button>
                <button className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
                  {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                </button>
                <button className="btn ghost danger" onClick={remove}>
                  Eliminar
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Entry({ entry }: { entry: ChatEntry }) {
  const by = entry.by ? ` · ${entry.by.provider} · ${entry.by.model}` : '';
  if (entry.kind === 'prompt') {
    return (
      <details className={`card history-prompt ${entry.role}`}>
        <summary className="label">
          {entry.role === 'assistant' ? 'Prompt maestro' : 'Prompt maestro editado por ti'}
          {by} · {formatDate(entry.at)}
        </summary>
        <pre>{entry.text}</pre>
      </details>
    );
  }
  return (
    <div className={`bubble ${entry.role}`} title={formatDate(entry.at)}>
      {entry.text}
      {entry.role === 'assistant' && by && <span className="bubble-meta">{by.slice(3)}</span>}
    </div>
  );
}
