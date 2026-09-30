// Banco de landings: se guarda en disco a través del servidor local (server/landings.ts), en data/landings/.
import type { ModelChoice } from '../providers/client.ts';
import type { TechniqueId } from '../engine/techniques.ts';
import { deleteLegacyLanding, readLegacyLandings } from './legacyIdb.ts';
import { ApiError, fetchJson } from '../app/errors.ts';

export interface ChatEntry {
  role: 'user' | 'assistant';
  kind: 'idea' | 'techniques' | 'prompt' | 'landing' | 'edit' | 'tweak';
  text: string;
  at: number;
  // Proveedor y modelo que respondió (solo en mensajes del asistente generados por IA).
  by?: ModelChoice;
  // Versión de la landing que produjo este paso.
  version?: number;
}

export interface Version {
  n: number;
  html: string;
  at: number;
  note: string;
  by?: ModelChoice;
}

export interface Landing {
  id: string;
  title: string;
  idea: string;
  masterPrompt: string;
  // Técnicas de diseño elegidas antes del prompt maestro (landings anteriores no las tienen).
  techniques?: TechniqueId[];
  // Versión actual (la misma que la última de versions).
  html: string;
  chat: ChatEntry[];
  versions: Version[];
  by?: ModelChoice;
  createdAt: number;
  updatedAt: number;
}

export type LandingSummary = Omit<Landing, 'chat' | 'versions'> & { versionCount: number };

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// El título de la tarjeta sale del <title> de la landing; si no tiene, de la idea.
export function titleFor(html: string, idea: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 80);
  const i = idea.replace(/\s+/g, ' ').trim();
  return i.length > 60 ? `${i.slice(0, 57)}…` : i || 'Landing sin título';
}

// Añade una versión y la deja como actual.
export function withVersion(landing: Landing, html: string, note: string, by?: ModelChoice, at = Date.now()): Landing {
  const n = (landing.versions.at(-1)?.n ?? 0) + 1;
  return {
    ...landing,
    html,
    title: titleFor(html, landing.idea),
    versions: [...landing.versions, { n, html, at, note, ...(by && { by }) }],
    updatedAt: at,
  };
}

// Landings guardadas antes de que existieran las versiones: su HTML pasa a ser la versión 1.
function normalize(l: Landing): Landing {
  if (l.versions?.length) return l;
  return { ...l, chat: l.chat ?? [], versions: [{ n: 1, html: l.html, at: l.updatedAt, note: 'Versión guardada' }] };
}

function api<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(`/api/landings${path}`, init);
}

function put(landing: Landing, onlyIfMissing = false) {
  return api<{ created: boolean }>(`/${encodeURIComponent(landing.id)}${onlyIfMissing ? '?onlyIfMissing=1' : ''}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(landing),
  });
}

// Mueve al disco lo que quedó en el navegador con la versión anterior del banco. Se hace una sola vez por carga
// y cada landing se borra del navegador solo después de que el servidor la guardó.
let migration: Promise<number> | null = null;

export function migrateFromBrowser(): Promise<number> {
  migration ??= (async () => {
    let moved = 0;
    try {
      for (const l of await readLegacyLandings()) {
        await put(normalize(l), true);
        await deleteLegacyLanding(l.id);
        moved++;
      }
    } catch (e) {
      console.warn('No se pudieron mover las landings del navegador al disco:', e);
      migration = null; // reintentar en la próxima visita al banco
    }
    return moved;
  })();
  return migration;
}

// Más recientes primero.
export async function listLandings(): Promise<LandingSummary[]> {
  await migrateFromBrowser();
  return api<LandingSummary[]>('');
}

export async function getLanding(id: string): Promise<Landing | undefined> {
  await migrateFromBrowser();
  try {
    return normalize(await api<Landing>(`/${encodeURIComponent(id)}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function saveLanding(landing: Landing): Promise<void> {
  await put(landing);
}

export async function deleteLanding(id: string): Promise<void> {
  await api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
