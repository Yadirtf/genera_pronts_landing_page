import type { ModelTier } from '../../server/providers/types.ts';
import type { Health, ModelChoice } from '../providers/client.ts';

const TIER_LABEL: Record<ModelTier, string> = {
  free: 'gratis',
  pro: 'de pago',
  env: 'de tu .env',
};

const TIERS: ModelTier[] = ['env', 'free', 'pro'];

export const choiceKey = (c: ModelChoice) => `${c.provider}::${c.model}`;

export function parseChoice(key: string): ModelChoice {
  const i = key.indexOf('::');
  return { provider: key.slice(0, i), model: key.slice(i + 2) };
}

interface Props {
  health: Health;
  value: ModelChoice;
  onChange(choice: ModelChoice): void;
  disabled?: boolean;
}

// Solo muestra proveedores con clave en .env, agrupados en gratis / de pago.
export function ModelPicker({ health, value, onChange, disabled }: Props) {
  return (
    <select
      className="model-picker"
      aria-label="Modelo"
      value={choiceKey(value)}
      onChange={(e) => onChange(parseChoice(e.target.value))}
      disabled={disabled}
    >
      {health.providers.flatMap((p) =>
        TIERS.map((tier) => {
          const models = p.models.filter((m) => m.tier === tier);
          if (models.length === 0) return null;
          return (
            <optgroup key={`${p.id}-${tier}`} label={`${p.id} · ${TIER_LABEL[tier]}`}>
              {models.map((m) => (
                <option key={m.id} value={choiceKey({ provider: p.id, model: m.id })}>
                  {m.id}
                </option>
              ))}
            </optgroup>
          );
        }),
      )}
    </select>
  );
}
