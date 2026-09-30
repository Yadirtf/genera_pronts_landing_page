import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  value: string;
  onChange(value: string): void;
  onSend(value: string): void;
  placeholder: string;
  sendLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  // Lo que va junto al botón de enviar (el selector de modelo).
  tools?: ReactNode;
}

// Cuadro de mensaje al estilo de un chat de IA: crece con el texto (sin barra de desplazamiento visible),
// Enter envía y Shift+Enter agrega una línea.
export function Composer({ value, onChange, onSend, placeholder, sendLabel, disabled, autoFocus, tools }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSend) onSend(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend(value);
    }
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer-box" onClick={() => input.current?.focus()}>
        <textarea
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={placeholder}
        />
        <div className="composer-bar" onClick={(e) => e.stopPropagation()}>
          <span className="composer-hint">Shift + Enter para una línea nueva</span>
          {tools}
          <button type="submit" className="send" disabled={!canSend} aria-label={sendLabel} title={sendLabel}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
