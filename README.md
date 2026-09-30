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

## Mis landings, chat de ajustes y editor

Cada landing construida se guarda en disco, en la carpeta `data/landings/` del proyecto (ignorada por git), a través del servidor local: un `<id>.json` con el HTML, el prompt maestro, el historial del chat, las versiones, el modelo y las fechas, y un `<id>.html` con la versión actual para abrirla directo. Así el banco sobrevive a apagar el equipo, cerrar el navegador, borrar sus datos, usar otro navegador o cambiar de puerto. Para guardarlo en otra carpeta, pon `LIENZO_DATA_DIR` en `.env`. Las landings que quedaron guardadas en el navegador con la versión anterior se mueven solas a `data/` la primera vez que abres Mis landings.

**Mis landings** (`#/banco`) las muestra en tarjetas con miniatura. Al abrir una (`#/landing/<id>`) se ve el historial del chat y la versión actual, y abajo un **chat de ajustes** para seguir mejorándola con pedidos concretos ("cambia el botón a verde", "agrega preguntas frecuentes"). Cada ajuste, reconstrucción o visita al editor crea una versión nueva, y cualquier versión anterior se recupera con **Volver a esta versión**.

**Editar** abre el editor (`#/editar/<id>`): código a la izquierda con CodeMirror, vista previa en vivo a la derecha. La barra que los separa se arrastra (o se mueve con las flechas) para cambiar el ancho; arriba de la vista previa se elige Ajustar (la página se adapta al ancho del panel), Móvil (390 px), Tablet (768 px) o Escritorio (1440 px, escalado si no cabe). Los cambios se guardan solos.

## API del servidor local

| Ruta | Descripción |
|---|---|
| `GET /api/health` | Proveedores configurados y el proveedor por defecto |
| `GET/PUT/DELETE /api/landings[/:id]` | Banco de landings en `data/landings/` |
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
