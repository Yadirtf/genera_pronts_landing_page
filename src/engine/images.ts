// Fotos de Unsplash dentro de la landing. El modelo escribe <img data-unsplash="palabras clave en inglés">
// y aquí se cambian por fotos reales a través del servidor local (que guarda la clave).
// Cada foto resuelta guarda en el propio <img> su búsqueda, su id y su autor, así que sobrevive a ajustes,
// versiones y al editor; solo se buscan las imágenes nuevas o cuyas palabras clave cambiaron.
import { ApiError, fetchJson } from '../app/errors.ts';
import { getHealth } from '../providers/client.ts';

interface Photo {
  query: string;
  id: string;
  url: string;
  alt: string;
  author: string;
  authorUrl: string;
  photoUrl: string;
}

export interface WithImages {
  html: string;
  // Aviso para el usuario si alguna foto no se pudo poner (el detalle técnico va a la consola).
  notice?: string;
}

const MARK = 'data-unsplash';
const CREDITS = 'data-unsplash-credits';

// Rectángulo gris con el texto alternativo, mientras no haya foto.
function placeholder(alt: string): string {
  const label = alt.replace(/[<>&"]/g, '').slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#d9d9de"/><text x="800" y="510" font-family="system-ui,sans-serif" font-size="40" fill="#6b6b75" text-anchor="middle">${label || 'Imagen'}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function orientationOf(img: Element): string | undefined {
  const o = img.getAttribute('data-orientation');
  return o === 'landscape' || o === 'portrait' || o === 'squarish' ? o : undefined;
}

// ¿Usa el documento fotos de Unsplash (resueltas o pendientes)?
export function hasPhotoSlots(html: string): boolean {
  return html.includes(MARK);
}

export async function photosEnabled(): Promise<boolean> {
  try {
    return (await getHealth()).images === true;
  } catch {
    return false;
  }
}

export async function resolveImages(html: string, signal?: AbortSignal): Promise<WithImages> {
  if (!hasPhotoSlots(html)) return { html };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const slots = [...doc.querySelectorAll(`img[${MARK}]`)];
  const pending = slots.filter((img) => {
    const query = img.getAttribute(MARK)?.trim();
    return query && img.getAttribute('data-unsplash-for') !== query;
  });

  let notice: string | undefined;
  if (pending.length) {
    const exclude = slots.flatMap((img) => (pending.includes(img) ? [] : [img.getAttribute('data-unsplash-id') ?? '']));
    let photos: (Photo | null)[] = [];
    try {
      const res = await fetchJson<{ photos: (Photo | null)[] }>('/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          queries: pending.map((img) => ({ query: img.getAttribute(MARK)!.trim(), orientation: orientationOf(img) })),
          exclude: exclude.filter(Boolean),
        }),
        signal,
      });
      photos = res.photos;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      notice = imagesNotice(e);
    }
    pending.forEach((img, i) => {
      const photo = photos[i];
      if (photo) {
        img.setAttribute('src', photo.url);
        img.setAttribute('data-unsplash-for', photo.query);
        img.setAttribute('data-unsplash-id', photo.id);
        img.setAttribute('data-credit-name', photo.author);
        img.setAttribute('data-credit-url', photo.authorUrl);
        img.setAttribute('data-photo-url', photo.photoUrl);
        if (!img.getAttribute('alt')?.trim() && photo.alt) img.setAttribute('alt', photo.alt);
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      } else {
        // Sin foto: un marcador gris. Si la búsqueda no dio resultados se marca como hecha (repetirla daría lo mismo);
        // si falló la conexión o el límite, queda pendiente para reintentar en el próximo ajuste.
        img.setAttribute('src', placeholder(img.getAttribute('alt') ?? ''));
        for (const a of ['data-unsplash-for', 'data-unsplash-id', 'data-credit-name', 'data-credit-url', 'data-photo-url'])
          img.removeAttribute(a);
        if (photo === null) {
          img.setAttribute('data-unsplash-for', img.getAttribute(MARK)!.trim());
          notice ??= 'Algunas imágenes no tienen foto en Unsplash; dejé un marcador gris. Pide en el chat de ajustes otra imagen para ese espacio.';
        }
      }
    });
  }

  const before = creditsOf(doc);
  updateCredits(doc);
  // Sin cambios, se devuelve el HTML tal cual para no reformatear el código del usuario.
  if (!pending.length && creditsOf(doc) === before) return { html };
  return { html: serialize(doc, html), notice };
}

function creditsOf(doc: Document): string {
  return [...doc.querySelectorAll(`[${CREDITS}]`)].map((el) => el.outerHTML).join('');
}

// Unsplash pide dar crédito al fotógrafo con enlace. Se regenera siempre a partir de las fotos presentes.
function updateCredits(doc: Document) {
  doc.querySelectorAll(`[${CREDITS}]`).forEach((el) => el.remove());
  const authors = new Map<string, string>();
  let referral = '';
  doc.querySelectorAll(`img[data-unsplash-id][data-credit-name]`).forEach((img) => {
    const url = img.getAttribute('data-credit-url') ?? '';
    authors.set(img.getAttribute('data-credit-name')!, url);
    // Los enlaces del servidor ya traen ?utm_source=<app>&utm_medium=referral; se reutiliza para el de Unsplash.
    referral ||= url.match(/\?utm_source=[^#]*/)?.[0] ?? '';
  });
  if (!authors.size) return;
  const es = (doc.documentElement.lang || 'es').toLowerCase().startsWith('es');
  const p = doc.createElement('p');
  p.setAttribute(CREDITS, '');
  p.setAttribute('style', 'margin:16px auto;padding:0 16px;font-size:12px;line-height:1.5;text-align:center;opacity:.75');
  p.append(es ? 'Fotos de ' : 'Photos by ');
  [...authors].forEach(([name, url], i) => {
    if (i > 0) p.append(i === authors.size - 1 ? (es ? ' y ' : ' and ') : ', ');
    const a = doc.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.color = 'inherit';
    a.textContent = name;
    p.append(a);
  });
  p.append(es ? ' en ' : ' on ');
  const u = doc.createElement('a');
  u.href = `https://unsplash.com/${referral || '?utm_source=lienzo&utm_medium=referral'}`;
  u.target = '_blank';
  u.rel = 'noopener';
  u.style.color = 'inherit';
  u.textContent = 'Unsplash';
  p.append(u, '.');
  const footer = [...doc.querySelectorAll('footer')].pop();
  (footer ?? doc.body).append(p);
}

function serialize(doc: Document, original: string): string {
  const doctype = original.match(/^\s*<!doctype[^>]*>/i)?.[0].trim() ?? '<!DOCTYPE html>';
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

function imagesNotice(e: unknown): string {
  console.error('[Lienzo] No se pudieron traer las fotos de Unsplash', e);
  const tail = 'dejé marcadores grises en su lugar.';
  if (e instanceof ApiError) {
    if (e.code === 'no_images') return `Falta la clave de Unsplash (UNSPLASH_ACCESS_KEY en .env), así que ${tail}`;
    if (e.status === 401) return `Unsplash no aceptó la clave de .env; revisa que sea la Access Key. Por ahora ${tail}`;
    if (e.status === 403 || e.status === 429)
      return `Se alcanzó el límite de búsquedas de Unsplash por esta hora, así que ${tail} Pide un ajuste más tarde para cambiarlas por fotos.`;
    if (e.status === 0) return `No hay conexión con el servidor local para buscar fotos; ${tail}`;
  }
  return `No pude traer las fotos de Unsplash ahora mismo; ${tail}`;
}
