// Banco local de landings en IndexedDB: cada landing guarda su HTML, el prompt maestro y el chat que la produjo.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ModelChoice } from '../providers/client.ts';
import type { TechniqueId } from '../engine/techniques.ts';

export interface ChatEntry {
  role: 'user' | 'assistant';
  kind: 'idea' | 'techniques' | 'prompt' | 'landing' | 'edit';
  text: string;
  at: number;
  // Proveedor y modelo que respondió (solo en mensajes del asistente generados por IA).
  by?: ModelChoice;
}

export interface Landing {
  id: string;
  title: string;
  idea: string;
  masterPrompt: string;
  // Técnicas de diseño elegidas antes del prompt maestro (landings anteriores no las tienen).
  techniques?: TechniqueId[];
  html: string;
  chat: ChatEntry[];
  by?: ModelChoice;
  createdAt: number;
  updatedAt: number;
}

interface LienzoDB extends DBSchema {
  landings: { key: string; value: Landing; indexes: { updatedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<LienzoDB>> | null = null;

function db() {
  dbPromise ??= openDB<LienzoDB>('lienzo', 1, {
    upgrade(db) {
      const store = db.createObjectStore('landings', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    },
  });
  return dbPromise;
}

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

// Más recientes primero.
export async function listLandings(): Promise<Landing[]> {
  const all = await (await db()).getAllFromIndex('landings', 'updatedAt');
  return all.reverse();
}

export async function getLanding(id: string): Promise<Landing | undefined> {
  return (await db()).get('landings', id);
}

export async function saveLanding(landing: Landing): Promise<void> {
  await (await db()).put('landings', landing);
}

export async function deleteLanding(id: string): Promise<void> {
  await (await db()).delete('landings', id);
}
