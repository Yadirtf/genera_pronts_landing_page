# Lienzo

Creador minimalista de landing pages con IA. La especificación completa está en [`proyecto-landing-ia.md`](proyecto-landing-ia.md).

## Arranque

```bash
npm install
cp .env.example .env   # pega la API key de al menos un proveedor (o una URL local: Ollama, LM Studio)
npm start
```

`npm start` levanta dos procesos:

- **Servidor local** (`server/index.ts`, Hono) en `http://127.0.0.1:8787`. Guarda las claves y hace de proxy a los proveedores.
- **Interfaz** (Vite + React) en `http://localhost:5173`. Redirige `/api` al servidor local.

## API del servidor local

| Ruta | Descripción |
|---|---|
| `GET /api/health` | Proveedores configurados y el proveedor por defecto |
| `POST /api/complete` | `{ provider?, system, messages, schema?, temperature? }` → `{ provider, model, text }` |

Prueba rápida:

```bash
curl -s localhost:5173/api/complete -H 'content-type: application/json' \
  -d '{"system":"Responde en una frase.","messages":[{"role":"user","content":"hola"}]}'
```

## Proveedores

Proveedores disponibles: `anthropic`, `openai`, `gemini`, `openrouter` y `mistral`. `.env.example` ya trae las URLs y modelos por defecto de cada uno; basta con pegar la clave. Si configuras varios, `DEFAULT_PROVIDER` decide cuál se usa y los demás sirven de respaldo si ese falla.

En el chat, el selector de la cabecera permite elegir proveedor y modelo para cada generación. Solo aparecen los proveedores con clave en `.env`, agrupados en gratis y de pago según `server/providers/catalog.ts` (orientativo: cada proveedor cambia sus planes). Para ofrecer otro modelo, añádelo a ese archivo o ponlo en `<PROVEEDOR>_MODEL`.

Ante un 429 o 5xx el servidor reintenta hasta 3 veces (2 s, 5 s, 10 s, o lo que indique `retry-after`). Si el modelo sigue fallando, prueba `<PROVEEDOR>_FALLBACK_MODEL` (un reintento) y, después, los otros proveedores con clave con su modelo de `.env`, aunque hayas elegido otro en el selector. La interfaz avisa cuando respondió un respaldo. Por eso conviene tener al menos dos proveedores con clave.

Ambos adaptadores implementan la interfaz `TextProvider` de `server/providers/types.ts`:

- `anthropic.ts`: SDK oficial de Anthropic. Modelo por defecto `claude-opus-5-5`, con respaldo automático en el servidor si el modelo rechaza la petición.
- `openai-compatible.ts`: cualquier API con `/chat/completions` (OpenAI, Gemini, OpenRouter, Mistral, Ollama, LM Studio). Para sumar otro proveedor compatible basta con añadir una línea a la lista `openAICompatible` de `server/index.ts`.
