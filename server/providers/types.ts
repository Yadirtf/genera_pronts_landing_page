// Interfaz común de proveedores de texto (ver proyecto-landing-ia.md §9.3).
// Estos tipos también los importa el frontend, así que no deben depender de Node.

export type Role = 'user' | 'assistant';

export interface Msg {
  role: Role;
  content: string;
}

export type JsonSchema = Record<string, unknown>;

export interface CompleteRequest {
  system: string;
  messages: Msg[];
  schema?: JsonSchema;
  temperature?: number;
  // Modelo elegido en la interfaz; si falta, se usa el de .env.
  model?: string;
}

// free: suele entrar en el plan gratuito del proveedor. pro: requiere plan de pago. env: el de .env, sin catalogar.
export type ModelTier = 'free' | 'pro' | 'env';

export interface ModelOption {
  id: string;
  tier: ModelTier;
}

export interface CompleteResult {
  text: string;
  // Modelo que respondió de verdad (puede ser el de respaldo).
  model: string;
}

export interface ProviderCapabilities {
  json: boolean;
  vision: boolean;
  images: boolean;
  maxContext: number;
}

export interface TextProvider {
  id: string;
  model: string;
  capabilities: ProviderCapabilities;
  models: ModelOption[];
  complete(req: CompleteRequest): Promise<CompleteResult>;
}

export interface ProviderInfo {
  id: string;
  model: string;
  capabilities: ProviderCapabilities;
  models: ModelOption[];
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
