import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { generateLanding, generateMasterPrompt } from '../engine/flow';
import './chat.css';

type Phase = 'idle' | 'prompting' | 'prompt' | 'building' | 'done';

export function Chat() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [idea, setIdea] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    try {
      return await fn(ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
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
    const result = await run((signal) => generateMasterPrompt(clean, signal));
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
    const result = await run((signal) => generateLanding(masterPrompt, signal));
    if (result === undefined) {
      setPhase(html ? 'done' : 'prompt');
      return;
    }
    setHtml(result);
    setPhase('done');
  }

  function reset() {
    abortRef.current?.abort();
    setPhase('idle');
    setIdea('');
    setMasterPrompt('');
    setHtml('');
    setError('');
    setFullscreen(false);
  }

  function download() {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendIdea(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendIdea(draft);
    }
  }

  const busy = phase === 'prompting' || phase === 'building';

  return (
    <div className="chat">
      <header className="chat-header">
        <span className="chat-logo">Lienzo</span>
        {phase !== 'idle' && (
          <button className="btn-ghost" onClick={reset}>
            Nueva idea
          </button>
        )}
      </header>

      <main className="chat-log">
        {phase === 'idle' && !idea && (
          <div className="chat-empty">
            <h1>¿Qué landing page necesitas?</h1>
            <p>Describe tu idea con tus palabras. Primero escribiré un prompt maestro que podrás revisar, y luego construiré la página.</p>
          </div>
        )}

        {idea && phase !== 'idle' && <div className="msg msg-user">{idea}</div>}

        {phase === 'prompting' && <div className="msg msg-ai msg-loading">Pensando como experto en tu sector…</div>}

        {masterPrompt && phase !== 'prompting' && phase !== 'idle' && (
          <div className="msg msg-ai">
            <p className="msg-label">Prompt maestro · puedes editarlo antes de construir</p>
            <textarea
              className="prompt-editor"
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
              disabled={busy}
              spellCheck={false}
            />
            <div className="msg-actions">
              <button className="btn-primary" onClick={build} disabled={busy || !masterPrompt.trim()}>
                {html ? 'Reconstruir landing' : 'Construir landing'}
              </button>
            </div>
          </div>
        )}

        {phase === 'building' && <div className="msg msg-ai msg-loading">Construyendo la landing… puede tardar un minuto.</div>}

        {html && phase !== 'idle' && (
          <div className={`msg msg-ai msg-preview${fullscreen ? ' is-fullscreen' : ''}`}>
            <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={html} />
            <div className="msg-actions">
              <button className="btn-primary" onClick={download}>
                Descargar HTML
              </button>
              <button className="btn-ghost" onClick={() => setFullscreen((f) => !f)}>
                {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="msg msg-error">{error}</div>}
      </main>

      {phase === 'idle' && (
        <form className="chat-composer" onSubmit={onSubmit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ej.: Una landing para mi estudio de yoga en Medellín, quiero que reserven la primera clase gratis por WhatsApp"
            rows={3}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={!draft.trim()}>
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
