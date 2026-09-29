import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { html as htmlLanguage } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { getLanding, saveLanding, titleFor, type Landing } from '../storage/db.ts';
import { downloadHtml, fileNameFor } from './download.ts';
import { href } from './route.ts';

// Editor tipo desarrollador: código a la izquierda, vista previa en vivo a la derecha.
const PREVIEW_DELAY = 400;
const SAVE_DELAY = 800;
const SPLIT_STORAGE_KEY = 'lienzo.editor.split';

type Device = 'fluid' | 'mobile' | 'tablet' | 'desktop';
const DEVICES: { id: Device; label: string; width?: number }[] = [
  { id: 'fluid', label: 'Ajustar' },
  { id: 'mobile', label: 'Móvil', width: 390 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'desktop', label: 'Escritorio', width: 1440 },
];

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

function readSplit(): number {
  try {
    const n = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
    return n >= 20 && n <= 80 ? n : 45;
  } catch {
    return 45;
  }
}

export function Editor({ id }: { id: string }) {
  const [landing, setLanding] = useState<Landing | null | undefined>(undefined);
  const [preview, setPreview] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState(readSplit);
  const [dragging, setDragging] = useState(false);
  const [device, setDevice] = useState<Device>('fluid');
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const editorHost = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const code = useRef('');
  const record = useRef<Landing | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  // Una sola entrada "Editaste el código" en el historial por cada visita al editor.
  const editAt = useRef<number | null>(null);

  useEffect(() => {
    getLanding(id)
      .then((l) => {
        record.current = l ?? null;
        code.current = l?.html ?? '';
        setPreview(code.current);
        setLanding(l ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function save() {
    const current = record.current;
    if (!current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const html = code.current;
    if (html === current.html) {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    const now = Date.now();
    const chat = [...current.chat];
    const last = chat[chat.length - 1];
    if (editAt.current !== null && last?.kind === 'edit' && last.at === editAt.current) {
      chat[chat.length - 1] = { ...last, at: now };
    } else {
      chat.push({ role: 'user', kind: 'edit', text: 'Editaste el código de la landing.', at: now });
    }
    editAt.current = now;
    const next: Landing = { ...current, html, title: titleFor(html, current.idea), chat, updatedAt: now };
    try {
      await saveLanding(next);
      record.current = next;
      // Si se siguió escribiendo mientras se guardaba, queda otro guardado programado.
      setSaveState(saveTimer.current === undefined ? 'saved' : 'pending');
    } catch (e) {
      setSaveState('error');
      setError(`No se pudo guardar: ${(e as Error).message}`);
    }
  }

  // Monta CodeMirror cuando la landing está cargada.
  useEffect(() => {
    if (!landing || !editorHost.current) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const view = new EditorView({
      doc: landing.html,
      parent: editorHost.current,
      extensions: [
        basicSetup,
        htmlLanguage(),
        EditorView.lineWrapping,
        ...(dark ? [oneDark] : []),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          code.current = update.state.doc.toString();
          window.clearTimeout(previewTimer.current);
          previewTimer.current = window.setTimeout(() => setPreview(code.current), PREVIEW_DELAY);
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => void save(), SAVE_DELAY);
          setSaveState('pending');
        }),
      ],
    });
    view.focus();
    return () => {
      window.clearTimeout(previewTimer.current);
      // Guardar lo pendiente al salir del editor.
      if (saveTimer.current !== undefined) void save();
      view.destroy();
    };
    // save lee todo por refs, así que basta con montar una vez por landing.
  }, [landing]);

  // Avisar si se cierra la pestaña con cambios sin guardar.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveTimer.current !== undefined) {
        void save();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Tamaño del área de vista previa, para escalar los dispositivos que no caben.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setStage({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [landing]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !workspace.current) return;
    const box = workspace.current.getBoundingClientRect();
    const pct = ((event.clientX - box.left) / box.width) * 100;
    setSplit(Math.min(80, Math.max(20, Math.round(pct * 10) / 10)));
  }

  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(split));
    } catch {
      // Sin almacenamiento: el tamaño dura solo esta sesión.
    }
  }

  function nudge(delta: number) {
    setSplit((s) => Math.min(80, Math.max(20, s + delta)));
  }

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width;
  const scale = deviceWidth && stage.width ? Math.min(1, stage.width / deviceWidth) : 1;
  const frameStyle = deviceWidth
    ? {
        width: deviceWidth,
        height: stage.height / scale,
        transform: scale < 1 ? `scale(${scale})` : undefined,
      }
    : undefined;

  if (landing === undefined || landing === null) {
    return (
      <main className="shell">
        <header className="top">
          <h1>
            <a href={href({ name: 'chat' })}>Lienzo</a>
          </h1>
          <a className="btn ghost" href={href({ name: 'bank' })}>
            Mis landings
          </a>
        </header>
        <section className="chat">
          {error ? (
            <p className="error">{error}</p>
          ) : landing === null ? (
            <div className="empty">
              <p>Esta landing ya no está en el banco.</p>
            </div>
          ) : (
            <p className="status">Cargando…</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={`ide${dragging ? ' dragging' : ''}`}>
      <header className="ide-top">
        <a className="btn ghost" href={href({ name: 'landing', id })}>
          ← Volver
        </a>
        <strong className="ide-title">{record.current?.title ?? landing.title}</strong>
        <span className={`status save-${saveState}`} role="status">
          {saveState === 'saved' && 'Guardado'}
          {saveState === 'pending' && 'Cambios sin guardar'}
          {saveState === 'saving' && 'Guardando…'}
          {saveState === 'error' && 'Error al guardar'}
        </span>
        <div className="ide-top-actions">
          <button className="btn ghost" onClick={() => void save()} disabled={saveState === 'saved'}>
            Guardar
          </button>
          <button
            className="btn"
            onClick={() => downloadHtml(code.current, fileNameFor(record.current?.title ?? landing.title))}
          >
            Descargar HTML
          </button>
        </div>
      </header>
      {error && <p className="error ide-error">{error}</p>}

      <div className="ide-workspace" ref={workspace} style={{ '--split': `${split}%` } as CSSProperties}>
        <section className="ide-code" aria-label="Código HTML">
          <div className="ide-code-host" ref={editorHost} />
        </section>

        <div
          className="ide-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar el ancho de la vista previa"
          aria-valuenow={Math.round(split)}
          aria-valuemin={20}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') nudge(-2);
            if (e.key === 'ArrowRight') nudge(2);
          }}
        />

        <section className="ide-preview" aria-label="Vista previa">
          <div className="ide-preview-bar">
            <div className="segmented" role="group" aria-label="Tamaño de la vista previa">
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  className={device === d.id ? 'active' : undefined}
                  aria-pressed={device === d.id}
                  onClick={() => setDevice(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="status">
              {deviceWidth ?? stage.width} px{scale < 1 && ` · ${Math.round(scale * 100)} %`}
            </span>
          </div>
          <div className={`ide-stage${deviceWidth ? ' device' : ''}${scale < 1 ? ' scaled' : ''}`} ref={stageRef}>
            {/* Sin allow-same-origin: el código editado no puede tocar la app. */}
            <iframe title="Vista previa de la landing" sandbox="allow-scripts" srcDoc={preview} style={frameStyle} />
          </div>
        </section>
      </div>
    </main>
  );
}
