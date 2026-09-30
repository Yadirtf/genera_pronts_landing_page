// Errores para personas: la interfaz muestra una explicación corta en español y la consola guarda el detalle
// técnico completo (código, respuesta del proveedor, stack) para depurar.

// Error de una llamada al servidor local. `status` es 0 cuando ni siquiera hubo respuesta.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Error cuyo mensaje ya está escrito para el usuario (por ejemplo, "la respuesta llegó cortada").
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

const TRY_AGAIN = 'Vuelve a intentarlo en unos minutos o elige otro modelo en el selector.';

function reasonFor(e: unknown): string {
  if (e instanceof UserError) return e.message;
  // fetch lanza TypeError cuando no hay conexión con el servidor.
  if (e instanceof TypeError || (e instanceof ApiError && e.status === 0)) {
    return 'No hay conexión con el servidor local. Asegúrate de que esté encendido (npm start) y vuelve a intentarlo.';
  }
  if (!(e instanceof ApiError)) return 'Ocurrió un problema inesperado. Vuelve a intentarlo.';
  if (e.code === 'no_provider') {
    return 'Todavía no hay ningún modelo configurado. Añade una clave de API en el archivo .env y reinicia el servidor.';
  }
  switch (e.status) {
    case 400:
      return 'No se pudo procesar la solicitud. Prueba a reformular o acortar el texto.';
    case 401:
      return 'El proveedor no aceptó la clave de API. Revisa que esté bien copiada en .env o elige otro modelo.';
    case 402:
      return 'La cuenta del proveedor no tiene saldo o créditos para este modelo. Elige otro modelo.';
    case 403:
      return 'Tu cuenta no tiene acceso a este modelo. Elige otro modelo en el selector.';
    case 404:
      return 'Este modelo ya no está disponible. Elige otro modelo en el selector.';
    case 408:
    case 504:
      return `El modelo tardó demasiado en responder. ${TRY_AGAIN}`;
    case 413:
      return 'El texto es demasiado largo para este modelo. Acórtalo o elige un modelo con más capacidad.';
    case 422:
      return 'El modelo prefirió no responder esta solicitud. Prueba a reformularla.';
    case 429:
      return 'Se alcanzó el límite de uso del modelo por ahora. Espera un minuto o elige otro modelo en el selector.';
  }
  if (e.status >= 500) return `El modelo está saturado o no disponible en este momento. ${TRY_AGAIN}`;
  return 'Ocurrió un problema inesperado. Vuelve a intentarlo.';
}

// Registra el error completo en la consola y devuelve el texto para mostrar. `context` dice qué se intentaba
// ("No pude escribir el prompt maestro."), y la razón explica por qué y qué hacer.
export function friendlyError(e: unknown, context?: string): string {
  if (e instanceof ApiError) {
    console.error(`[Lienzo] ${context ?? 'Error'} · HTTP ${e.status}${e.code ? ` (${e.code})` : ''}\n${e.message}`, e.detail ?? '', e);
  } else {
    console.error(`[Lienzo] ${context ?? 'Error'}`, e);
  }
  const reason = reasonFor(e);
  return context ? `${context} ${reason}` : reason;
}

// fetch + JSON con errores tipados. Nunca lanza el texto técnico del servidor como mensaje visible.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(`No se pudo conectar con ${url}: ${(e as Error).message}`, 0, undefined, e);
  }
  const raw = await res.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = undefined;
  }
  if (!res.ok || data === undefined) {
    const body = (data ?? {}) as { error?: string; code?: string };
    const message = body.error ?? `${url} respondió ${res.status}: ${raw.slice(0, 500)}`;
    // Nuestro servidor siempre responde { error }; un 5xx sin eso es el proxy de Vite sin servidor detrás.
    const serverDown = !res.ok && res.status >= 500 && body.error === undefined;
    throw new ApiError(message, serverDown ? 0 : res.ok ? 502 : res.status, body.code, data ?? raw);
  }
  return data as T;
}
