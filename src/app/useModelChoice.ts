import { useEffect, useState } from 'react';
import { getHealth, type Health, type ModelChoice } from '../providers/client.ts';
import { choiceKey, parseChoice } from './ModelPicker.tsx';

const CHOICE_STORAGE_KEY = 'lienzo.model';

function readStoredChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeChoice(choice: ModelChoice) {
  try {
    localStorage.setItem(CHOICE_STORAGE_KEY, choiceKey(choice));
  } catch {
    // Sin almacenamiento (modo privado): la elección dura solo esta sesión.
  }
}

// Recupera la última elección si sigue disponible; si no, el proveedor y modelo por defecto de .env.
function initialChoice(health: Health): ModelChoice | null {
  const stored = readStoredChoice();
  if (stored) {
    const c = parseChoice(stored);
    if (health.providers.some((p) => p.id === c.provider && p.models.some((m) => m.id === c.model))) return c;
  }
  const p = health.providers.find((p) => p.id === health.defaultProvider) ?? health.providers[0];
  return p ? { provider: p.id, model: p.model } : null;
}

// Proveedores disponibles y el modelo elegido en el selector, compartido entre el chat y el chat de ajustes.
export function useModelChoice() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ModelChoice | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setChoice(initialChoice(h));
      })
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  function pick(next: ModelChoice) {
    setChoice(next);
    storeChoice(next);
  }

  return { health, healthError, choice, pick };
}
