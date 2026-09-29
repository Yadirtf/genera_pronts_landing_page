import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { generateLanding, generateMasterPrompt, type Generated } from '../engine/flow.ts';
import { getHealth, type Health, type ModelChoice } from '../providers/client.ts';
import { ModelPicker, choiceKey, parseChoice } from './ModelPicker.tsx';
import { getLanding, newId, saveLanding, titleFor, type ChatEntry } from '../storage/db.ts';
import { downloadHtml, fileNameFor } from './download.ts';
import { href, navigate } from './route.ts';

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

// El chat sigue montado (oculto) mientras se ve el banco o el editor, para no perder una generación en curso.
export function Chat({ active }: { active: boolean }) {
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
  // Quién generó cada paso, para avisar si respondió un respaldo en vez del modelo elegido.
  const [promptBy, setPromptBy] = useState<Origin | null>(null);
  const [htmlBy, setHtmlBy] = useState<Origin | null>(null);
  // Descarta respuestas que llegan después de "Nueva idea" y cancela la petición en curso.
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  // La landing de esta conversación en el banco, y el prompt tal como lo escribió el modelo (para el historial).
  const [savedId, setSavedId] = useState<string | null>(null);
  const ideaAt = useRef(0);
  const generatedPrompt = useRef<ChatEntry | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setChoice(initialChoice(h));
      })
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  // Al volver del editor, mostrar el código editado.
  useEffect(() => {
    if (!active || !savedId) return;
    let stale = false;
    void getLanding(savedId).then((l) => {
      if (!stale && l) setHtml(l.html);
    });
    return () => {
      stale = true;
    };
  }, [active, savedId]);

  async function run(fn: (signal: AbortSignal) => Promise<Generated>): Promise<Generated | undefined> {
    const id = ++runId.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    try {
      const result = await fn(controller.signal);
      return id === runId.current ? result : undefined;
    } catch (e) {
      if (id === runId.current && !controller.signal.aborted) setError((e as Error).message);
      return undefined;
    }
  }

  async function sendIdea(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setIdea(clean);
    ideaAt.current = Date.now();
    setDraft('');
    setHtml('');
    setPhase('prompting');
    const result = await run((signal) => generateMasterPrompt(clean, choice ?? undefined, signal));
    if (result === undefined) {
      setPhase('idle');
      setDraft(clean);
      return;
    }
    setMasterPrompt(result.value);
    generatedPrompt.current = {
      role: 'assistant',
      kind: 'prompt',
      text: result.value,
      at: Date.now(),
      by: { provider: result.provider, model: result.model },
    };
    setPromptBy({ by: result, asked: choice });
    setPhase('prompt');
  }

  async function build() {
    setPhase('building');
    const result = await run((signal) => generateLanding(masterPrompt, choice ?? undefined, signal));
    if (result === undefined) {
      setPhase(html ? 'done' : 'prompt');
      return;
    }
    setHtml(result.value);
    setHtmlBy({ by: result, asked: choice });
    setPhase('done');
    try {
      await persist(result.value, masterPrompt, { provider: result.provider, model: result.model });
    } catch (e) {
      setError(`La landing se generó pero no se pudo guardar en el banco: ${(e as Error).message}`);
    }
  }

  // Guarda la landing en el banco: la primera construcción crea la entrada y las siguientes la actualizan.
  async function persist(nextHtml: string, usedPrompt: string, by: ModelChoice) {
    const now = Date.now();
    const existing = savedId ? await getLanding(savedId) : undefined;
    const chat: ChatEntry[] = existing
      ? [...existing.chat]
      : [{ role: 'user', kind: 'idea', text: idea, at: ideaAt.current || now }];
    if (!existing && generatedPrompt.current) chat.push(generatedPrompt.current);
    const lastPrompt = chat.filter((e) => e.kind === 'prompt').pop();
    if (lastPrompt?.text !== usedPrompt) chat.push({ role: 'user', kind: 'prompt', text: usedPrompt, at: now });
    chat.push({
      role: 'assistant',
      kind: 'landing',
      text: existing ? 'Reconstruí la landing.' : 'Construí la landing.',
      at: now,
      by,
    });
    const id = existing?.id ?? newId();
    await saveLanding({
      id,
      title: titleFor(nextHtml, idea),
      idea,
      masterPrompt: usedPrompt,
      html: nextHtml,
      chat,
      by,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setSavedId(id);
  }

  function reset() {
    runId.current++;
    abort.current?.abort();
    setPromptBy(null);
    setHtmlBy(null);
    setSavedId(null);
    generatedPrompt.current = null;
    setPhase('idle');
    setIdea('');
    setMasterPrompt('');
    setHtml('');
    setError(null);
    setFullscreen(false);
  }

  function download() {
    downloadHtml(html, fileNameFor(titleFor(html, idea)));
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
    <main className="shell" hidden={!active}>
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
          <a className="btn ghost" href={href({ name: 'bank' })}>
            Mis landings
          </a>
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
            <p className="label">
              Prompt maestro · puedes editarlo antes de construir
              {promptBy && <GeneratedBy {...promptBy} />}
            </p>
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
            {htmlBy && (
              <p className="label">
                Landing
                <GeneratedBy {...htmlBy} />
              </p>
            )}
            <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={html} />
            <div className="actions">
              <button className="btn" onClick={download}>
                Descargar HTML
              </button>
              <button className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
                {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </button>
              {savedId && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setFullscreen(false);
                    navigate({ name: 'editor', id: savedId });
                  }}
                  disabled={busy}
                >
                  Editar
                </button>
              )}
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

// "· con gemini · gemini-flash-latest", y un aviso si respondió un respaldo en vez del modelo elegido.
interface Origin {
  by: ModelChoice;
  asked: ModelChoice | null;
}

function GeneratedBy({ by, asked }: Origin) {
  const fallback = asked && (asked.provider !== by.provider || asked.model !== by.model);
  return (
    <span className={fallback ? 'fallback' : undefined}>
      {' · '}
      {fallback ? 'respondió el respaldo ' : 'con '}
      {by.provider} · {by.model}
    </span>
  );
}
