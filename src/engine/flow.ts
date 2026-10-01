// Flujo: idea -> técnicas (3 recomendadas) -> prompt maestro (editable) -> landing HTML (-> crítico).
import { complete, type ModelChoice } from '../providers/client.ts';
import { UserError } from '../app/errors.ts';

export interface Generated extends ModelChoice {
  value: string;
  // Aviso amigable si algo secundario falló (p. ej. no se pudieron traer las fotos).
  notice?: string;
}
import { MASTER_PROMPT_SYSTEM } from './prompts/masterPrompt.ts';
import { PHOTO_RULES, landingSystem, landingUserMessage } from './prompts/landing.ts';
import { hasPhotoSlots, photosEnabled, resolveImages } from './images.ts';
import { CRITIC_SYSTEM, criticUserMessage } from './prompts/critic.ts';
import { TWEAK_SYSTEM, tweakUserMessage } from './prompts/tweak.ts';
import {
  DEFAULT_RECOMMENDATION,
  RECOMMEND_SYSTEM,
  parseRecommendation,
  techniquesBlock,
  type Recommendation,
  type TechniqueId,
} from './techniques.ts';

export interface Recommended extends ModelChoice {
  value: Recommendation[];
  // true si el modelo no devolvió 3 técnicas válidas y se completó con la recomendación por defecto.
  fallback: boolean;
}

export async function recommendTechniques(idea: string, choice?: ModelChoice, signal?: AbortSignal): Promise<Recommended> {
  const { text, provider, model } = await complete(
    {
      ...choice,
      system: RECOMMEND_SYSTEM,
      messages: [{ role: 'user', content: idea }],
      temperature: 0.3,
    },
    signal,
  );
  const value = parseRecommendation(text);
  const fallback = value.length < 3;
  for (const id of DEFAULT_RECOMMENDATION) {
    if (value.length >= 3) break;
    if (!value.some((r) => r.id === id)) value.push({ id, why: '' });
  }
  return { value, fallback, provider, model };
}

export async function generateMasterPrompt(
  idea: string,
  techniques: TechniqueId[],
  choice?: ModelChoice,
  signal?: AbortSignal,
): Promise<Generated> {
  const block = techniquesBlock(techniques);
  const { text, provider, model } = await complete(
    {
      ...choice,
      system: MASTER_PROMPT_SYSTEM,
      messages: [{ role: 'user', content: block ? `${idea}\n\n---\n\n${block}` : idea }],
      temperature: 0.7,
    },
    signal,
  );
  return { value: stripFence(text).trim(), provider, model };
}

export async function generateLanding(masterPrompt: string, choice?: ModelChoice, signal?: AbortSignal): Promise<Generated> {
  const { text, provider, model } = await complete(
    {
      ...choice,
      system: landingSystem(await photosEnabled()),
      messages: [{ role: 'user', content: landingUserMessage(masterPrompt) }],
      temperature: 0.8,
    },
    signal,
  );
  return withPhotos(extractHtml(text), { provider, model }, signal);
}

// Técnica "Agente crítico": audita la landing contra el prompt maestro y devuelve el HTML corregido.
export async function reviewLanding(
  masterPrompt: string,
  html: string,
  choice?: ModelChoice,
  signal?: AbortSignal,
): Promise<Generated> {
  const { text, provider, model } = await complete(
    {
      ...choice,
      system: withPhotoRules(CRITIC_SYSTEM, await photosEnabled()),
      messages: [{ role: 'user', content: criticUserMessage(masterPrompt, html) }],
      temperature: 0.4,
    },
    signal,
  );
  return withPhotos(extractHtml(text), { provider, model }, signal);
}

// Chat de ajustes: aplica un pedido concreto sobre el HTML actual y devuelve el documento completo.
export async function tweakLanding(
  html: string,
  request: string,
  previous: string[],
  choice?: ModelChoice,
  signal?: AbortSignal,
): Promise<Generated> {
  const { text, provider, model } = await complete(
    {
      ...choice,
      // Las reglas de fotos van si el servidor tiene clave o si la landing ya usa fotos de Unsplash.
      system: withPhotoRules(TWEAK_SYSTEM, hasPhotoSlots(html) || (await photosEnabled())),
      messages: [{ role: 'user', content: tweakUserMessage(html, request, previous.slice(-5)) }],
      temperature: 0.4,
    },
    signal,
  );
  const value = extractHtml(text);
  // Una respuesta sin </html> suele venir cortada por el límite de salida del modelo.
  if (!/<\/html>\s*$/i.test(value)) {
    throw new UserError('La respuesta del modelo llegó cortada, así que no la apliqué. Prueba otra vez o elige otro modelo.');
  }
  return withPhotos(value, { provider, model }, signal);
}

function withPhotoRules(system: string, photos: boolean): string {
  return photos ? `${system}\n\n${PHOTO_RULES}` : system;
}

// Cambia los <img data-unsplash> nuevos por fotos reales. Si falla, la landing sigue con marcadores y un aviso.
async function withPhotos(html: string, by: ModelChoice, signal?: AbortSignal): Promise<Generated> {
  const { html: value, notice } = await resolveImages(html, signal);
  return { value, notice, ...by };
}

// Quita un bloque ```markdown ... ``` que envuelva toda la respuesta.
function stripFence(text: string): string {
  const m = text.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return m ? m[1] : text;
}

// Los modelos a veces envuelven el HTML en ``` o añaden texto alrededor.
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  let html = fenced ? fenced[1] : text;
  const start = html.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) html = html.slice(start);
  const end = html.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) html = html.slice(0, end + '</html>'.length);
  html = html.trim();
  if (!/<html[\s>]/i.test(html)) {
    throw new UserError('El modelo no devolvió una página web válida. Intenta de nuevo o elige otro modelo.');
  }
  return html;
}
