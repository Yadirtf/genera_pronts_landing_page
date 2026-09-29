import { useEffect, useRef, useState } from 'react';

// Miniatura: la landing se pinta a 1280 px de ancho y se escala al tamaño de la tarjeta.
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 800;

export function Thumb({ html, title }: { html: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PAGE_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="thumb" ref={box} aria-hidden="true">
      <iframe
        title={`Miniatura de ${title}`}
        sandbox="allow-scripts"
        srcDoc={html}
        loading="lazy"
        tabIndex={-1}
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
      />
    </div>
  );
}
