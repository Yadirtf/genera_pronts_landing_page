// Banco de landings en disco: data/landings/<id>.json (todo: chat, versiones) y <id>.html (versión actual,
// para abrirla directo en el navegador). Sobrevive a cerrar el navegador, borrar sus datos o cambiar de puerto.
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = resolve(process.env.LIENZO_DATA_DIR || join(root, 'data'));
const DIR = join(DATA_DIR, 'landings');

// Solo ids simples: nada de "../" que escape de la carpeta.
const ID = /^[A-Za-z0-9_-]{1,80}$/;

interface Stored {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  updatedAt: number;
  versions?: { html: string }[];
  [key: string]: unknown;
}

function isLanding(value: unknown, id: string): value is Stored {
  const v = value as Stored;
  return (
    !!v &&
    typeof v === 'object' &&
    v.id === id &&
    typeof v.title === 'string' &&
    typeof v.html === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

// Escribe en un temporal y renombra, para no dejar un JSON a medias si se apaga el equipo a mitad.
async function writeAtomic(path: string, content: string) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

async function read(id: string): Promise<Stored | null> {
  try {
    return JSON.parse(await readFile(join(DIR, `${id}.json`), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function write(landing: Stored) {
  await mkdir(DIR, { recursive: true });
  await writeAtomic(join(DIR, `${landing.id}.json`), JSON.stringify(landing, null, 2));
  await writeAtomic(join(DIR, `${landing.id}.html`), landing.html);
}

export const landings = new Hono();

// Resumen para el banco: sin chat ni versiones, pero con el HTML actual para la miniatura.
landings.get('/', async (c) => {
  let files: string[] = [];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const list = [];
  for (const f of files) {
    try {
      const l = JSON.parse(await readFile(join(DIR, f), 'utf8')) as Stored;
      const { chat: _chat, versions, ...summary } = l;
      list.push({ ...summary, versionCount: versions?.length ?? 1 });
    } catch (e) {
      console.error(`[banco] No se pudo leer ${f}:`, (e as Error).message);
    }
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return c.json(list);
});

landings.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Id inválido.' }, 400);
  const l = await read(id);
  return l ? c.json(l) : c.json({ error: 'No existe.' }, 404);
});

// Guarda la landing completa. Con ?onlyIfMissing=1 no pisa una existente (migración desde el navegador).
landings.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Id inválido.' }, 400);
  const body = await c.req.json().catch(() => null);
  if (!isLanding(body, id)) return c.json({ error: 'Landing con formato inválido.' }, 400);
  if (c.req.query('onlyIfMissing') && (await read(id))) return c.json({ ok: true, created: false });
  await write(body);
  return c.json({ ok: true, created: true });
});

landings.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!ID.test(id)) return c.json({ error: 'Id inválido.' }, 400);
  await rm(join(DIR, `${id}.json`), { force: true });
  await rm(join(DIR, `${id}.html`), { force: true });
  return c.json({ ok: true });
});
