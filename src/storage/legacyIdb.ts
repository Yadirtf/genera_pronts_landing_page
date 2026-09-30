// Banco anterior en IndexedDB del navegador. Solo se lee para mover esas landings al disco
// (el navegador puede borrarlas al cerrarse, y cada puerto u origen tiene las suyas).
import { openDB } from 'idb';
import type { Landing } from './bank.ts';

const DB_NAME = 'lienzo';
const STORE = 'landings';

export async function readLegacyLandings(): Promise<Landing[]> {
  if (typeof indexedDB === 'undefined') return [];
  // Si la base no existe, no crearla solo para leerla.
  const dbs = await indexedDB.databases?.().catch(() => undefined);
  if (dbs && !dbs.some((d) => d.name === DB_NAME)) return [];
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    },
  });
  try {
    return (await db.getAll(STORE)) as Landing[];
  } finally {
    db.close();
  }
}

export async function deleteLegacyLanding(id: string): Promise<void> {
  const db = await openDB(DB_NAME, 1);
  try {
    await db.delete(STORE, id);
  } finally {
    db.close();
  }
}
