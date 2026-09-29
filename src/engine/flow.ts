// Flujo mínimo: idea -> prompt maestro (editable) -> landing HTML.
import { complete, type ModelChoice } from '../providers/client.ts';
import { MASTER_PROMPT_SYSTEM } from './prompts/masterPrompt.ts';
import { LANDING_SYSTEM, landingUserMessage } from './prompts/landing.ts';

export async function generateMasterPrompt(idea: string, choice?: ModelChoice): Promise<string> {
  const text = await complete({
    ...choice,
    system: MASTER_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: idea }],
    temperature: 0.7,
  });
  return stripFence(text).trim();
}

export async function generateLanding(masterPrompt: string, choice?: ModelChoice): Promise<string> {
  const text = await complete({
    ...choice,
    system: LANDING_SYSTEM,
    messages: [{ role: 'user', content: landingUserMessage(masterPrompt) }],
    temperature: 0.8,
  });
  return extractHtml(text);
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
