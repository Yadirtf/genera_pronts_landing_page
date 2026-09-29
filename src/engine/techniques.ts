// Las 8 técnicas de diseño de landings con IA (documento "8 técnicas avanzadas").
// Antes del prompt maestro, el modelo recomienda 3 según la idea y el usuario elige las que quiera.
// Cada técnica aporta una directiva que el prompt maestro debe volcar en sus secciones.

export type TechniqueId =
  | 'seed'
  | 'ambitious'
  | 'critic'
  | 'images'
  | 'video'
  | 'subtractive'
  | 'negative'
  | 'human';

export interface Technique {
  id: TechniqueId;
  name: string;
  // Qué consigue, en una línea, para la tarjeta del chat.
  summary: string;
  // Instrucción para quien escribe el prompt maestro.
  directive: string;
}

export const TECHNIQUES: Technique[] = [
  {
    id: 'seed',
    name: 'Cadenas semilla',
    summary: 'Ancla el diseño a un estilo ajeno al sector (Bauhaus, editorial de los 70, brutalismo…) para no parecer una plantilla.',
    directive:
      'Cadena semilla: en "Diseño" elige una cadena semilla explícita que mezcle dos referencias ajenas al sector (una disciplina, época o movimiento artístico). Nómbrala tal cual y deriva de ella la retícula, la paleta, la tipografía y la composición del hero. Prohíbe expresamente el layout genérico (texto a la izquierda e imagen a la derecha, bento grids, degradados morados).',
  },
  {
    id: 'ambitious',
    name: 'Prompt ambicioso',
    summary: 'Define la psicología del visitante, la sofisticación del mercado y el objetivo de cada bloque del scroll.',
    directive:
      'Prompt ambicioso: indica el nivel de sofisticación del mercado y los sesgos cognitivos a usar (con ética). En "Estructura de la página", detalla para cada sección: objetivo psicológico, emoción buscada, fricción que elimina, titular, copy principal, elemento visual de apoyo y la micro-conversión o CTA concreto.',
  },
  {
    id: 'critic',
    name: 'Agente crítico',
    summary: 'Tras construir la landing, un segundo agente la audita (UX, accesibilidad, persuasión) y la corrige.',
    directive:
      'Agente crítico: añade al final de "Reglas" una lista de verificación de 6 a 8 criterios comprobables (UX, accesibilidad, persuasión, claridad del beneficio en menos de 3 segundos) que un revisor usará para auditar la landing construida.',
  },
  {
    id: 'images',
    name: 'Imágenes generadas',
    summary: 'Sustituye las fotos de stock por ilustraciones SVG propias y deja listos los prompts para Midjourney o DALL·E.',
    directive:
      'Imágenes generadas: define un estilo de ilustración coherente con la paleta y la tipografía. Para cada imagen que necesite la página, describe la ilustración SVG o la textura CSS que la sustituye y escribe también un prompt en inglés para un generador de imágenes (sujeto, material, luz, paleta, lente, relación de aspecto) que la página dejará en un comentario HTML junto al marcador.',
  },
  {
    id: 'video',
    name: 'Vídeo y movimiento',
    summary: 'Añade una capa de motion design que guía la mirada hacia la conversión, y el prompt para generar un vídeo de fondo.',
    directive:
      'Vídeo y movimiento: diseña una capa de motion con CSS (entradas, parallax suave o un fondo animado en el hero) que dirija la mirada hacia el CTA, siempre respetando prefers-reduced-motion. Escribe además un prompt en inglés para un generador de vídeo (Runway, Luma) para el fondo del hero: plano, movimiento de cámara, luz, sin texto ni personas; la página lo dejará en un comentario HTML.',
  },
  {
    id: 'subtractive',
    name: 'Diseño sustractivo',
    summary: 'Quita todo lo que no ayuda a convertir: menos secciones, menos campos, un solo camino hacia la acción.',
    directive:
      'Diseño sustractivo: limita la estructura a las secciones imprescindibles (justifica cada una por su aporte a la conversión), un único CTA principal repetido, navegación mínima o inexistente y formularios con el menor número de campos posible. Añade a "Reglas" que todo elemento decorativo que no ayude a entender la oferta se elimina.',
  },
  {
    id: 'negative',
    name: 'Restricciones negativas',
    summary: 'Prohíbe los tics que delatan a la IA: palabras gastadas, sonrisas de stock, texturas plásticas.',
    directive:
      'Restricciones negativas: añade a "Reglas" una lista de palabras y fórmulas prohibidas en el idioma de la página (p. ej. revolucionario, potenciar, ecosistema, innovador, soluciones integrales, desbloquea, lleva al siguiente nivel, sumérgete) y de clichés visuales prohibidos (degradados morados, glassmorphism gratuito, iconos genéricos en tarjetas de tres, personas sonriendo a cámara).',
  },
  {
    id: 'human',
    name: 'Redacción humana',
    summary: 'Voz de marca con ritmo y matices locales: storytelling del problema y micro-copy que promete un beneficio.',
    directive:
      'Redacción humana: define en el Brief la voz de marca (cómo habla, qué nunca diría) con dos frases de ejemplo. Pide que el copy cuente primero la frustración del visitante y el alivio antes de las características, con ritmo variado y giros propios de la cultura local, y que cada botón use micro-copy que prometa un beneficio inmediato en lugar de "Enviar" o "Saber más".',
  },
];

export const DEFAULT_RECOMMENDATION: TechniqueId[] = ['seed', 'ambitious', 'negative'];

export function techniqueById(id: string): Technique | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}

export interface Recommendation {
  id: TechniqueId;
  // Por qué encaja con la idea del usuario, en una frase.
  why: string;
}

export const RECOMMEND_SYSTEM = `Eres un director creativo que prepara el encargo de una landing page. Recibes la idea del usuario y eliges, de este catálogo de técnicas, las 3 que más van a mejorar SU landing concreta:

${TECHNIQUES.map((t) => `- ${t.id}: ${t.name}. ${t.summary}`).join('\n')}

Ten en cuenta el tipo de negocio, el público, la acción que busca y lo que el usuario pidió explícitamente (estilo, tono, vídeo, sencillez, etc.).

Responde SOLO con JSON válido, sin Markdown, con esta forma exacta:
{"recommended":[{"id":"<id>","why":"<una frase en el idioma del usuario que explique por qué encaja con su idea>"}]}
Exactamente 3 elementos, ids distintos y tomados del catálogo, del más útil al menos útil.`;

// Acepta JSON envuelto en ``` o con texto alrededor; descarta ids desconocidos o repetidos.
export function parseRecommendation(text: string): Recommendation[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { recommended?: unknown }).recommended;
  if (!Array.isArray(list)) return [];
  const out: Recommendation[] = [];
  for (const item of list) {
    const id = (item as { id?: unknown })?.id;
    const why = (item as { why?: unknown })?.why;
    if (typeof id !== 'string' || !techniqueById(id) || out.some((r) => r.id === id)) continue;
    out.push({ id: id as TechniqueId, why: typeof why === 'string' ? why.trim() : '' });
  }
  return out.slice(0, 3);
}

// Bloque que se añade a la idea para que el prompt maestro aplique las técnicas elegidas.
export function techniquesBlock(ids: TechniqueId[]): string {
  const chosen = TECHNIQUES.filter((t) => ids.includes(t.id));
  if (!chosen.length) return '';
  return `Técnicas elegidas por el usuario. Aplícalas todas dentro de las secciones del prompt maestro y nómbralas en la sección 5:\n${chosen
    .map((t) => `- ${t.directive}`)
    .join('\n')}`;
}
