import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { generateLanding, generateMasterPrompt, recommendTechniques, reviewLanding } from '../engine/flow.ts';
import { TECHNIQUES, type Recommendation, type TechniqueId } from '../engine/techniques.ts';
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

// Idea -> elegir técnicas (3 recomendadas) -> prompt maestro editable -> landing en un iframe aislado.
type Phase = 'idle' | 'recommending' | 'choosing' | 'prompting' | 'prompt' | 'building' | 'reviewing' | 'done';

// El chat sigue montado (oculto) mientras se ve el banco o el editor, para no perder una generación en curso.
export function Chat({ active }: { active: boolean }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [idea, setIdea] = useState('');
  const [recommended, setRecommended] = useState<Recommendation[]>([]);
  const [recommendedBy, setRecommendedBy] = useState<Origin | null>(null);
  const [selected, setSelected] = useState<TechniqueId[]>([]);
  // Técnicas con las que se escribió el prompt maestro actual.
  const [promptTechniques, setPromptTechniques] = useState<TechniqueId[]>([]);
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

  async function run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
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
    setPhase('recommending');
    const result = await run((signal) => recommendTechniques(clean, choice ?? undefined, signal));
    if (result === undefined) {
      setPhase('idle');
      setDraft(clean);
      return;
    }
    setRecommended(result.value);
    setSelected(result.value.map((r) => r.id));
    setRecommendedBy({ by: result, asked: choice });
    if (result.fallback) setError('El modelo no devolvió una recomendación válida: te propongo 3 técnicas por defecto.');
    setPhase('choosing');
  }

  function toggle(id: TechniqueId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function writePrompt() {
    const techniques = TECHNIQUES.map((t) => t.id).filter((id) => selected.includes(id));
    const back = masterPrompt ? (html ? 'done' : 'prompt') : 'choosing';
    setPhase('prompting');
    const result = await run((signal) => generateMasterPrompt(idea, techniques, choice ?? undefined, signal));
    if (result === undefined) {
      setPhase(back);
      return;
    }
    setPromptTechniques(techniques);
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
    const built = await run((signal) => generateLanding(masterPrompt, choice ?? undefined, signal));
    if (built === undefined) {
      setPhase(html ? 'done' : 'prompt');
      return;
    }
    setHtml(built.value);
    setHtmlBy({ by: built, asked: choice });
    let result = built;
    let reviewed = false;
    if (promptTechniques.includes('critic')) {
      setPhase('reviewing');
      const before = runId.current;
      const review = await run((signal) => reviewLanding(masterPrompt, built.value, choice ?? undefined, signal));
      // Si se canceló ("Nueva idea"), no guardar nada; si falló, se queda la versión sin revisar y el error visible.
      if (runId.current !== before + 1) return;
      if (review) {
        result = review;
        reviewed = true;
        setHtml(review.value);
        setHtmlBy({ by: review, asked: choice });
      }
    }
    setPhase('done');
    try {
      await persist(result.value, masterPrompt, { provider: result.provider, model: result.model }, reviewed);
    } catch (e) {
      setError(`La landing se generó pero no se pudo guardar en el banco: ${(e as Error).message}`);
    }
  }

  // Guarda la landing en el banco: la primera construcción crea la entrada y las siguientes la actualizan.
  async function persist(nextHtml: string, usedPrompt: string, by: ModelChoice, reviewed: boolean) {
    const now = Date.now();
    const existing = savedId ? await getLanding(savedId) : undefined;
    const chat: ChatEntry[] = existing
      ? [...existing.chat]
      : [{ role: 'user', kind: 'idea', text: idea, at: ideaAt.current || now }];
    const lastTechniques = chat.filter((e) => e.kind === 'techniques').pop();
    const techniquesText = techniquesSummary(promptTechniques);
    if (promptTechniques.length && lastTechniques?.text !== techniquesText)
      chat.push({ role: 'user', kind: 'techniques', text: techniquesText, at: generatedPrompt.current?.at ?? now });
    if (!existing && generatedPrompt.current) chat.push(generatedPrompt.current);
    const lastPrompt = chat.filter((e) => e.kind === 'prompt').pop();
    if (lastPrompt?.text !== usedPrompt) chat.push({ role: 'user', kind: 'prompt', text: usedPrompt, at: now });
    chat.push({
      role: 'assistant',
      kind: 'landing',
      text: `${existing ? 'Reconstruí la landing' : 'Construí la landing'}${reviewed ? ' y el agente crítico la revisó.' : '.'}`,
      at: now,
      by,
    });
    const id = existing?.id ?? newId();
    await saveLanding({
      id,
      title: titleFor(nextHtml, idea),
      idea,
      masterPrompt: usedPrompt,
      techniques: promptTechniques,
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
    setRecommended([]);
    setRecommendedBy(null);
    setSelected([]);
    setPromptTechniques([]);
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

  const busy = phase === 'recommending' || phase === 'prompting' || phase === 'building' || phase === 'reviewing';
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
              Describe tu idea con tus palabras. Te recomendaré técnicas de diseño para tu caso, escribiré un prompt
              maestro que podrás revisar, y luego construiré la página.
            </p>
          </div>
        )}

        {started && <div className="bubble user">{idea}</div>}

        {phase === 'recommending' && (
          <div className="bubble assistant pending">Eligiendo las técnicas que más le sirven a tu landing…</div>
        )}

        {recommended.length > 0 && started && (
          <div className="card">
            <p className="label">
              Técnicas de diseño · te recomiendo 3 para tu idea; marca las que quieras
              {recommendedBy && <GeneratedBy {...recommendedBy} />}
            </p>
            <ul className="techniques">
              {orderTechniques(recommended).map(({ technique, why }) => {
                const on = selected.includes(technique.id);
                return (
                  <li key={technique.id}>
                    <button
                      type="button"
                      className={`technique${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(technique.id)}
                      disabled={busy}
                    >
                      <span className="technique-head">
                        <span className="technique-check" aria-hidden="true">
                          {on ? '✓' : ''}
                        </span>
                        <strong>{technique.name}</strong>
                        {why !== undefined && <span className="badge">Recomendada</span>}
                      </span>
                      <span className="technique-summary">{technique.summary}</span>
                      {why && <span className="technique-summary technique-why">Para tu idea: {why}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="actions">
              <button className="btn" onClick={writePrompt} disabled={busy || selected.length === 0}>
                {masterPrompt ? 'Reescribir prompt maestro' : 'Escribir prompt maestro'} ({selected.length}{' '}
                {selected.length === 1 ? 'técnica' : 'técnicas'})
              </button>
            </div>
          </div>
        )}

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

        {phase === 'reviewing' && (
          <div className="bubble assistant pending">El agente crítico está revisando y corrigiendo la landing…</div>
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

// Recomendadas primero (en el orden del modelo, con su porqué); luego el resto del catálogo.
function orderTechniques(recommended: Recommendation[]) {
  const first = recommended.flatMap((r) => {
    const technique = TECHNIQUES.find((t) => t.id === r.id);
    return technique ? [{ technique, why: r.why }] : [];
  });
  const rest = TECHNIQUES.filter((t) => !recommended.some((r) => r.id === t.id)).map((technique) => ({
    technique,
    why: undefined as string | undefined,
  }));
  return [...first, ...rest];
}

function techniquesSummary(ids: TechniqueId[]): string {
  return `Técnicas: ${TECHNIQUES.filter((t) => ids.includes(t.id))
    .map((t) => t.name)
    .join(', ')}`;
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
