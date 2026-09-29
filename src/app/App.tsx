import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { generateLanding, generateMasterPrompt } from '../engine/flow.ts';
import { getHealth, type Health, type ModelChoice } from '../providers/client.ts';
import { ModelPicker, choiceKey, parseChoice } from './ModelPicker.tsx';

const CHOICE_STORAGE_KEY = 'lienzo.model';

function readStoredChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeChoice(choice: ModelChoice) {
  try {
    localStorage.setItem(CHOICE_STORAGE_KEY, choiceKey(choice));
  } catch {
    // Sin almacenamiento (modo privado): la elección dura solo esta sesión.
  }
}

// Recupera la última elección si sigue disponible; si no, el proveedor y modelo por defecto de .env.
function initialChoice(health: Health): ModelChoice | null {
  const stored = readStoredChoice();
  if (stored) {
    const c = parseChoice(stored);
    if (health.providers.some((p) => p.id === c.provider && p.models.some((m) => m.id === c.model))) return c;
  }
  const p = health.providers.find((p) => p.id === health.defaultProvider) ?? health.providers[0];
  return p ? { provider: p.id, model: p.model } : null;
}

// Versión mínima: idea -> prompt maestro editable -> landing en un iframe aislado.
type Phase = 'idle' | 'prompting' | 'prompt' | 'building' | 'done';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [idea, setIdea] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  // Descarta respuestas que llegan después de "Nueva idea".
  const runId = useRef(0);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setChoice(initialChoice(h));
      })
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const id = ++runId.current;
    setError(null);
    try {
      const result = await fn();
      return id === runId.current ? result : undefined;
    } catch (e) {
      if (id === runId.current) setError((e as Error).message);
      return undefined;
    }
  }

  async function sendIdea(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setIdea(clean);
    setDraft('');
    setHtml('');
    setPhase('prompting');
    const result = await run(() => generateMasterPrompt(clean, choice ?? undefined));
    if (result === undefined) {
      setPhase('idle');
      setDraft(clean);
      return;
    }
    setMasterPrompt(result);
    setPhase('prompt');
  }

  async function build() {
    setPhase('building');
    const result = await run(() => generateLanding(masterPrompt, choice ?? undefined));
    if (result === undefined) {
      setPhase(html ? 'done' : 'prompt');
      return;
    }
    setHtml(result);
    setPhase('done');
  }

  function reset() {
    runId.current++;
    setPhase('idle');
    setIdea('');
    setMasterPrompt('');
    setHtml('');
    setError(null);
    setFullscreen(false);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendIdea(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendIdea(draft);
    }
  }

  const busy = phase === 'prompting' || phase === 'building';
  const started = phase !== 'idle';
  function pick(next: ModelChoice) {
    setChoice(next);
    storeChoice(next);
  }

  return (
    <main className="shell">
      <header className="top">
        <h1>Lienzo</h1>
        <div className="top-actions">
          {health && choice ? (
            <ModelPicker health={health} value={choice} onChange={pick} disabled={busy} />
          ) : (
            <span className="status">
              {healthError ? 'Servidor local sin conexión' : !health ? 'Conectando…' : 'Sin proveedor: configura .env'}
            </span>
          )}
          {started && (
            <button className="btn ghost" onClick={reset}>
              Nueva idea
            </button>
          )}
        </div>
      </header>

      <section className="chat">
        {!started && (
          <div className="empty">
            <h2>¿Qué landing page necesitas?</h2>
            <p>
              Describe tu idea con tus palabras. Primero escribiré un prompt maestro que podrás revisar, y luego
              construiré la página.
            </p>
          </div>
        )}

        {started && <div className="bubble user">{idea}</div>}

        {phase === 'prompting' && <div className="bubble assistant pending">Pensando como experto en tu sector…</div>}

        {masterPrompt && started && phase !== 'prompting' && (
          <div className="card">
            <p className="label">Prompt maestro · puedes editarlo antes de construir</p>
            <textarea
              className="prompt-editor"
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
              disabled={busy}
              spellCheck={false}
            />
            <div className="actions">
              <button className="btn" onClick={build} disabled={busy || !masterPrompt.trim()}>
                {html ? 'Reconstruir landing' : 'Construir landing'}
              </button>
            </div>
          </div>
        )}

        {phase === 'building' && (
          <div className="bubble assistant pending">Construyendo la landing… puede tardar un par de minutos.</div>
        )}

        {html && started && (
          <div className={`card preview${fullscreen ? ' fullscreen' : ''}`}>
            {/* Sin allow-same-origin: el código generado no puede tocar la app. */}
            <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={html} />
            <div className="actions">
              <button className="btn" onClick={download}>
                Descargar HTML
              </button>
              <button className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
                {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </section>

      {!started && (
        <form className="composer" onSubmit={onSubmit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ej.: una landing para mi estudio de yoga en Medellín; quiero que reserven la primera clase gratis por WhatsApp"
            rows={3}
            autoFocus
          />
          <button type="submit" disabled={!draft.trim()}>
            Enviar
          </button>
        </form>
      )}
    </main>
  );
}
