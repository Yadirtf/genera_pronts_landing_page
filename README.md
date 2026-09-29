# Lienzo

Creador minimalista de landing pages con IA. La especificación completa está en [`proyecto-landing-ia.md`](proyecto-landing-ia.md).

## Arranque

```bash
npm install
cp .env.example .env   # añade al menos una clave o una URL local (Ollama, LM Studio)
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

Ambos implementan la interfaz `TextProvider` de `server/providers/types.ts`:

- `anthropic.ts`: SDK oficial de Anthropic. Modelo por defecto `claude-opus-5-5`, con respaldo automático en el servidor si el modelo rechaza la petición.
- `openai-compatible.ts`: cualquier API con `/chat/completions` (OpenAI, OpenRouter, Ollama, LM Studio).
