# Lienzo — Creador de landing pages con IA

**Documento de proyecto · v1.0 · 28 de septiembre de 2026**
**Responsable:** Ing. Yadir
**Base:** borrador de producto v0.3 y sus decisiones de revisión

---

## 1. Resumen

Lienzo es una herramienta **pequeña, local y minimalista** que convierte una idea descrita en lenguaje natural en una landing page profesional, editable y descargable.

El sistema no es grande. Su potencia no está en tener muchas pantallas, sino en **cómo usa al modelo de IA**: antes de escribir código, le hace preguntas de experto (sector, audiencia, objeciones, cultura, diseño) y usa esas respuestas para decidir la página. El usuario solo ve tres pasos:

> **Describe → Elige → Ajusta y descarga**

**Nombre de trabajo:** "Lienzo" (provisional, se puede cambiar).

---

## 2. Problema

Los generadores de landings usan una mínima parte de lo que sabe el modelo. Le piden "una landing moderna para X" y el modelo responde con su promedio: hero, tres tarjetas, testimonios, precios y FAQ. El resultado:

- Páginas genéricas y parecidas entre sí.
- Textos que no responden a las objeciones reales del cliente.
- Testimonios o cifras inventadas.
- Código atado a la plataforma y difícil de llevar a otro sitio.

## 3. Propuesta de valor

**"De una idea a una landing con criterio de experto, en cualquier sector, idioma y estilo, en menos de 10 minutos y sin saber programar."**

| Para quién | Qué obtiene |
|---|---|
| Persona no técnica | Una landing lista sin aprender nada; solo describe y elige |
| Emprendedor o diseñador | Tres direcciones creativas realmente distintas para escoger |
| Desarrollador | HTML/CSS/JS limpio y portable, con acceso al código y a la especificación |

## 4. Principios

1. **Minimalista y fácil de usar (principio rector).** Tres pasos visibles, una acción principal por pantalla, complejidad oculta tras "Ver detalles". Si hay conflicto con otro principio, gana este.
2. **Exprimir el modelo, no la interfaz.** La calidad viene de preguntar bien al modelo por etapas, no de añadir controles.
3. **Sin catálogo cerrado.** Ningún tipo de landing, sector, idioma o estilo está prohibido por diseño.
4. **Honestidad.** Nada inventado se presenta como real: sin reseñas, cifras, certificaciones ni logos falsos.
5. **Código portable.** La salida es HTML, CSS y JS estándar que funciona sin la aplicación.
6. **Local primero.** Proyectos y archivos se guardan en el dispositivo del usuario.

## 5. Alcance

### 5.1 Incluido en la versión 1

| # | Capacidad | Descripción breve |
|---|---|---|
| 1 | Brief corto | Máximo 3 preguntas; acepta "no lo sé" y completa con valores razonables |
| 2 | Motor de conocimiento | Dossier interno de 5 capas generado por el modelo (oculto por defecto) |
| 3 | Tres direcciones creativas | Divergir de 8 conceptos, elegir los 3 más distintos, mostrarlos como láminas |
| 4 | Landing Spec | Especificación JSON interna que describe toda la página |
| 5 | Generación por secciones | HTML/CSS/JS estándar, una sección por llamada |
| 6 | Revisión automática | Validaciones deterministas + un crítico de IA + reparación silenciosa |
| 7 | Editor sobre la página | Vista previa a pantalla completa, edición en sitio, cambios por lenguaje natural |
| 8 | Imágenes | Subir imágenes propias; ilustración SVG generada; generación con IA si el proveedor la ofrece |
| 9 | Mis páginas | Banco local con versiones, duplicar y eliminar |
| 10 | Exportación | ZIP (`index.html`, `styles.css`, `script.js`, `assets/`) o HTML único |
| 11 | Proveedores | Adaptador compatible con API OpenAI (OpenAI, Ollama, LM Studio, OpenRouter) y adaptador Anthropic |
| 12 | Guardarraíles | Bloqueo de suplantación, marcadores para pruebas pendientes, avisos en sectores regulados |

### 5.2 Fuera de la versión 1

- Exportar a React, Astro o Tailwind.
- Búsqueda web e investigación automática.
- Generación de vídeo.
- Publicación y hosting.
- Cuentas, nube, colaboración y sincronización.
- Analítica y pruebas A/B.
- Lighthouse y capturas con navegador sin interfaz.
- Biblioteca persistente de bloques inventados.
- Enrutamiento de etapas a varios modelos a la vez.

## 6. Flujo de usuario

```
┌────────────┐     ┌─────────────┐     ┌──────────────────────┐
│ 1 DESCRIBE │ ──▶ │  2 ELIGE    │ ──▶ │ 3 AJUSTA Y DESCARGA  │
│ idea + ≤3  │     │ 3 láminas   │     │ vista previa, editar │
│ preguntas  │     │ de dirección│     │ en sitio, ZIP        │
└────────────┘     └─────────────┘     └──────────────────────┘
       │                  ▲                       │
       ▼                  │                       ▼
  (oculto) dossier ─ estrategia ─ Spec ─ generación ─ revisión ─ reparación
```

1. **Describe.** El usuario escribe su idea. El sistema hace como máximo 3 preguntas si falta algo que cambia el resultado (qué acción quiere que haga el visitante, a quién va dirigido, idioma).
2. **Elige.** Aparecen 3 láminas grandes, cada una con una miniatura del hero, un nombre de concepto y una frase de por qué encaja. Un clic para elegir. Acciones secundarias: "otra ronda" y "mezclar".
3. **Ajusta y descarga.** La landing aparece a pantalla completa. Clic en un texto para cambiarlo, clic en una imagen para reemplazarla, o escribir un cambio ("haz el título más corto"). Botón **Descargar**.

## 7. Cómo el sistema exprime el modelo

Esta es la parte central y diferenciadora. Todo ocurre en segundo plano.

### 7.1 Dossier de conocimiento (5 capas)

| Capa | Pregunta al modelo | Salida |
|---|---|---|
| Dominio | ¿Cómo funciona este sector, qué vocabulario usa, qué clichés visuales tiene? | Glosario, convenciones, clichés a evitar |
| Audiencia y decisión | ¿Quién decide, qué quiere resolver, qué objeciones lo frenan, qué pruebas lo convencen? | Perfil, objeciones, pruebas necesarias |
| Contexto | ¿De dónde llega el visitante, en qué dispositivo, qué tan decidido está? | Temperatura del tráfico, nivel de conciencia |
| Cultura | ¿Qué normas de idioma, formato, colores y dirección de lectura aplican? | Reglas de localización |
| Diseño | ¿Qué disciplina, época o material ajeno al sector expresaría esta oferta de forma inesperada pero justificada? | Semillas creativas |

Cada afirmación del dossier lleva una etiqueta: **dato del usuario**, **conocimiento del modelo** o **supuesto**. Solo los datos del usuario pueden aparecer como hechos en la página.

### 7.2 Técnicas de prompting

- **Panel de roles:** cada capa la responde un rol experto distinto (estratega, copywriter, director de arte, experto del sector).
- **Paso atrás:** el modelo enuncia principios generales antes de aplicarlos al caso.
- **Divergir y converger:** generar 8 conceptos, puntuarlos y quedarse con los 3 más distintos.
- **Semilla de diversidad:** cadena aleatoria reproducible por proyecto (inspirada en String Seed of Thought de Sakana AI) para orientar elecciones creativas.
- **Salida estructurada:** cada etapa devuelve JSON validado con esquema.

### 7.3 Adaptación al modelo

Cada modelo configurado tiene un perfil simple:

| Perfil | Cuándo | Estrategia |
|---|---|---|
| Grande | Modelos de frontera | Más variantes, prompts más abiertos |
| Medio | Modelos comerciales estándar | Tubería completa, una sección por llamada |
| Pequeño | Modelos locales de ≤ 14 B aprox. | Tareas muy acotadas, plantillas de salida rígidas, más reparación |

El usuario no elige el perfil: el sistema lo asigna con una prueba corta al configurar el modelo y el usuario puede cambiarlo en Ajustes.

## 8. Pipeline técnico

| # | Etapa | Entrada | Salida | Visible |
|---|---|---|---|---|
| 1 | Brief | Texto del usuario + respuestas | Brief JSON | Sí |
| 2 | Dossier | Brief | Dossier JSON (5 capas) | Ver detalles |
| 3 | Estrategia | Brief + dossier | Genoma + mapa de secciones con función | Ver detalles |
| 4 | Direcciones | Estrategia + semilla | 8 conceptos → 3 elegidos | Sí (3 láminas) |
| 5 | Landing Spec | Dirección elegida | Spec JSON completa | Ver detalles |
| 6 | Generación | Spec, por sección | Fragmentos HTML + CSS | Progreso |
| 7 | Ensamblaje | Fragmentos + tokens | Documento completo | No |
| 8 | Revisión | Documento | Lista de problemas | Solo si requieren decisión |
| 9 | Reparación | Problema + sección | Sección corregida (máx. 2 intentos) | No |

### 8.1 Landing Spec (estructura resumida)

```json
{
  "version": 1,
  "meta": { "lang": "es", "dir": "ltr", "title": "", "description": "" },
  "genome": { "goal": "", "offer": "", "audience": "", "awareness": "", "traffic": "", "tone": "" },
  "tokens": { "colors": {}, "fonts": {}, "spacing": {}, "radius": "", "motion": "reduced|subtle|expressive" },
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "purpose": "Qué objeción resuelve o qué paso de la decisión apoya",
      "content": { "heading": "", "body": "", "cta": { "label": "", "href": "" } },
      "image": { "source": "upload|svg|generated|none", "brief": "", "alt": "" },
      "locked": false
    }
  ],
  "placeholders": ["[Testimonio real pendiente]"]
}
```

`locked: true` marca secciones editadas a mano en código; el sistema no las sobrescribe al regenerar.

## 9. Arquitectura

### 9.1 Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Interfaz | Vite + React + TypeScript | Ligero y rápido de construir; sin necesidad de SSR |
| Estilos de la app | CSS con variables | Interfaz sobria, sin dependencias pesadas |
| Servidor local | Node + Hono (un solo archivo de rutas) | Guarda claves fuera del navegador y hace de proxy a proveedores |
| Validación de esquemas | Zod | Valida toda salida del modelo |
| Almacenamiento | IndexedDB (vía `idb`) | Proyectos, versiones e imágenes en el dispositivo |
| Vista previa | `iframe` con `sandbox` y `srcdoc` | Aísla el código generado de la aplicación |
| Accesibilidad | axe-core dentro del iframe | Validación en el navegador |
| Exportación | JSZip | ZIP en el navegador |

La aplicación se ejecuta con un solo comando (`npm start`) que levanta el servidor local y la interfaz.

### 9.2 Módulos

```
src/
  app/            pantallas: Describe, Elige, Editor, MisPaginas, Ajustes
  engine/
    pipeline.ts   máquina de estados de las 9 etapas
    prompts/      un archivo por etapa y por perfil (grande/medio/pequeño)
    schemas.ts    Zod: Brief, Dossier, Genome, Spec, Section
    seed.ts       semilla de diversidad reproducible
  providers/
    openai-compatible.ts
    anthropic.ts
    types.ts      interfaz común + capacidades
  qa/
    checks.ts     HTML, enlaces, imágenes, responsive, contraste
    critic.ts     crítico de IA (estrategia + texto)
    repair.ts
  render/
    html.ts       Spec → HTML/CSS/JS
    export.ts     ZIP y HTML único
  storage/
    db.ts         IndexedDB
server/
  index.ts        proxy a proveedores, claves en archivo local
```

### 9.3 Interfaz de proveedor

```ts
interface TextProvider {
  id: string;
  capabilities: { json: boolean; vision: boolean; images: boolean; maxContext: number };
  complete(req: { system: string; messages: Msg[]; schema?: JsonSchema; temperature?: number }): Promise<string>;
}
```

## 10. Guardarraíles

1. **Suplantación:** el sistema no genera páginas que imiten marcas, organizaciones o personas reales ajenas al usuario, ni pantallas de inicio de sesión o pago que las imiten. Si el brief nombra una marca conocida, pregunta si el usuario es su titular.
2. **Pruebas inventadas:** sin reseñas, testimonios, cifras, premios ni logos de clientes inventados. Si faltan, se insertan marcadores `[Testimonio real pendiente]` y la exportación avisa hasta que se rellenen o quiten.
3. **Sectores regulados:** en salud, finanzas, legal, alcohol, apuestas y productos para menores, el crítico busca promesas de resultado y avisos ausentes, y recuerda que no sustituye asesoría legal.
4. **Privacidad:** antes del primer envío a un proveedor remoto, la app indica qué datos salen y a quién. Las claves nunca se guardan en el navegador ni en el HTML exportado.
5. **Formularios:** si la landing recoge datos personales, la revisión exige un aviso de privacidad.

## 11. Diversidad medible

Cada Spec se reduce a una **huella**. La distancia entre huellas va de 0 a 1:

| Componente | Peso |
|---|---|
| Orden y tipo de bloques (distancia de edición normalizada) | 40 % |
| Sistema visual (tipografía y temperatura de color) | 20 % |
| Densidad y proporción imagen/texto | 20 % |
| Navegación y ritmo | 20 % |

- Umbral entre las 3 direcciones de una ronda: **≥ 0,35** por par.
- Umbral frente a las últimas 10 landings del usuario: **≥ 0,25**.
- Recalibración: el umbral es correcto si evaluadores humanos juzgan "distintas" al menos el 80 % de los pares que lo superan.

## 12. Calidad

**Validaciones deterministas (bloquean o reparan):** HTML bien formado, enlaces y botones con destino, imágenes presentes con `alt`, sin desborde horizontal a 360 px, contraste AA (axe-core), `lang` y `dir`, `prefers-reduced-motion`.

**Crítico de IA (sugiere):** ¿cada sección cumple su función?, ¿se responden las objeciones del dossier?, clichés, afirmaciones sin procedencia.

**Banco de evaluación:** 20 briefs fijos (sectores variados, 3 idiomas: español, inglés y árabe) para comparar cambios de prompts y modelos.

## 13. Métricas de éxito

| Métrica | Meta v1 |
|---|---|
| Tiempo de idea a ZIP para una persona no técnica | < 10 min, sin tutorial |
| Preferencia a ciegas frente a petición directa al mismo modelo | > 50 % de los briefs del banco |
| Errores críticos de accesibilidad en la exportación | 0 |
| Pares de direcciones con distancia ≥ 0,35 | ≥ 90 % |
| Landings exportadas que abren sin conexión a la app | 100 % |

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Coste y latencia por muchas etapas | Dossier compacto de 5 capas, caché por proyecto, progreso visible |
| Alucinaciones en el dossier | Etiquetas de procedencia; nada del modelo se afirma como hecho |
| Modelos locales pequeños fallan en JSON | Perfil "pequeño", plantillas rígidas, reparación de JSON |
| Complejidad percibida | Principio rector; todo lo técnico tras "Ver detalles" |
| Uso para fraude | Guardarraíles del §10 en brief, Spec y revisión |

## 15. Plan de entrega

| Fase | Contenido | Compuerta para avanzar |
|---|---|---|
| 0. Prototipo | 3 pantallas clicables sin IA real; prueba con 2 personas (una no técnica, una técnica) | Ambas entienden el flujo sin ayuda |
| 1. Núcleo | Proveedores, pipeline, Spec, generación HTML, vista previa | Genera landings válidas en 10 briefs |
| 2. Experiencia | Direcciones, editor en sitio, cambios por lenguaje natural, imágenes, Mis páginas | Persona no técnica llega a ZIP en < 10 min |
| 3. Calidad | Revisión, reparación, guardarraíles, diversidad, banco de evaluación | Metas del §13 cumplidas |

El detalle de épicas e historias de usuario está en `backlog-landing-ia.md`.

## 16. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Modo por defecto | Simple; dossier, genoma y Spec ocultos tras "Ver detalles" |
| Umbral de diversidad | ≥ 0,35 entre direcciones; ≥ 0,25 frente a historial |
| Tamaño del sistema | Pequeño: 5 pantallas, un servidor local de un archivo, sin cuentas |
| Validadores | Solo los que corren en el navegador; Lighthouse queda fuera de v1 |
| Proveedores | Compatible con API OpenAI + Anthropic |

## 17. Pendientes de decidir

- Nombre definitivo del producto.
- Modelo remoto y modelo local de referencia para calibrar los prompts.
- ¿La generación de imágenes con IA entra en v1 o queda solo subir imágenes propias + ilustración SVG?

## Fuentes

- Sakana AI, [String Seed of Thought](https://pub.sakana.ai/ssot/) (consultada en el borrador v0.2).
- Borrador de producto v0.3 y sus decisiones de revisión.
