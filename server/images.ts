import { Hono } from 'hono';

// Fotos para las landings con la API de Unsplash (https://unsplash.com/developers).
// El modelo marca cada imagen con palabras clave (<img data-unsplash="...">) y este servidor las busca.
// La clave vive solo aquí; el navegador recibe URLs de images.unsplash.com (Unsplash pide enlazarlas
// directamente, sin descargarlas) y los datos del fotógrafo para el crédito.

const API = 'https://api.unsplash.com';
const env = process.env;
const accessKey = env.UNSPLASH_ACCESS_KEY?.trim() || '';
// Nombre de la app registrada en Unsplash, para los enlaces de crédito (?utm_source=...).
const appName = env.UNSPLASH_APP_NAME?.trim() || 'lienzo';

export const imagesEnabled = !!accessKey;

export interface PhotoQuery {
  query: string;
  orientation?: 'landscape' | 'portrait' | 'squarish';
}

export interface Photo {
  query: string;
  id: string;
  url: string;
  alt: string;
  author: string;
  authorUrl: string;
  photoUrl: string;
}

interface UnsplashPhoto {
  id: string;
  alt_description: string | null;
  description: string | null;
  urls: { raw: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

class UnsplashError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function utm(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}utm_source=${encodeURIComponent(appName)}&utm_medium=referral`;
}

async function unsplash<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Client-ID ${accessKey}`, 'accept-version': 'v1' },
    signal,
  });
  if (!res.ok) throw new UnsplashError(`Unsplash ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  return (await res.json()) as T;
}

async function search(q: PhotoQuery, used: Set<string>, signal: AbortSignal): Promise<Photo | null> {
  const params = new URLSearchParams({ query: q.query, per_page: '10', content_filter: 'high' });
  if (q.orientation) params.set('orientation', q.orientation);
  const { results } = await unsplash<{ results: UnsplashPhoto[] }>(`/search/photos?${params}`, signal);
  // Evita repetir la misma foto en la misma página si otra imagen ya la usa.
  const photo = results.find((p) => !used.has(p.id)) ?? results[0];
  if (!photo) return null;
  used.add(photo.id);
  // Unsplash exige avisar cuando una foto se usa (equivale a "descargarla"). No bloquea la respuesta.
  fetch(photo.links.download_location, {
    headers: { authorization: `Client-ID ${accessKey}` },
  }).catch((e) => console.warn('[unsplash] no se pudo registrar la descarga:', e));
  return {
    query: q.query,
    id: photo.id,
    // Tamaño razonable para web; Unsplash recomienda ajustar con parámetros de imgix sobre urls.raw.
    url: `${photo.urls.raw}&w=1600&q=80&auto=format&fit=crop`,
    alt: photo.alt_description || photo.description || '',
    author: photo.user.name,
    authorUrl: utm(photo.user.links.html),
    photoUrl: utm(photo.links.html),
  };
}

export const images = new Hono();

// POST /api/images { queries: [{ query, orientation? }], exclude?: string[] } -> { photos: (Photo | null)[] }
// exclude: ids de fotos que la página ya usa, para no repetirlas.
images.post('/', async (c) => {
  if (!imagesEnabled) {
    return c.json({ error: 'Falta UNSPLASH_ACCESS_KEY en .env.', code: 'no_images' }, 503);
  }
  let body: { queries?: PhotoQuery[]; exclude?: string[] } = {};
  try {
    body = await c.req.json();
  } catch {
    // Cuerpo vacío o no JSON: se responde 400 abajo.
  }
  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q) => typeof q?.query === 'string' && q.query.trim()).slice(0, 30)
    : [];
  if (!queries.length) return c.json({ error: 'Se requiere al menos una búsqueda en "queries".' }, 400);

  const used = new Set(Array.isArray(body.exclude) ? body.exclude.filter((x) => typeof x === 'string') : []);
  const signal = c.req.raw.signal;
  const photos: (Photo | null)[] = [];
  try {
    // En serie, para que cada imagen evite las fotos que ya tomaron las anteriores.
    for (const q of queries) {
      const orientation = ['landscape', 'portrait', 'squarish'].includes(q.orientation ?? '') ? q.orientation : undefined;
      photos.push(await search({ query: q.query.trim().slice(0, 100), orientation }, used, signal));
    }
  } catch (error) {
    const status = error instanceof UnsplashError ? error.status : 502;
    console.error(`[unsplash] ${status}:`, error);
    // 401: clave inválida; 403 suele ser el límite por hora del modo demo (50 peticiones).
    return c.json({ error: error instanceof Error ? error.message : String(error), code: 'images_failed' }, (status >= 400 && status < 600 ? status : 502) as 502);
  }
  return c.json({ photos });
});
