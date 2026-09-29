// Flujo: idea -> técnicas (3 recomendadas) -> prompt maestro (editable) -> landing HTML (-> crítico).
import { complete, type ModelChoice } from '../providers/client.ts';

export interface Generated extends ModelChoice {
  value: string;
}
import { MASTER_PROMPT_SYSTEM } from './prompts/masterPrompt.ts';
import { LANDING_SYSTEM, landingUserMessage } from './prompts/landing.ts';
import { CRITIC_SYSTEM, criticUserMessage } from './prompts/critic.ts';
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
      system: LANDING_SYSTEM,
      messages: [{ role: 'user', content: landingUserMessage(masterPrompt) }],
      temperature: 0.8,
    },
    signal,
  );
  return { value: extractHtml(text), provider, model };
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
      system: CRITIC_SYSTEM,
      messages: [{ role: 'user', content: criticUserMessage(masterPrompt, html) }],
      temperature: 0.4,
    },
    signal,
  );
  return { value: extractHtml(text), provider, model };
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
    throw new Error('El modelo no devolvió un documento HTML. Intenta de nuevo.');
  }
  return html;
}
