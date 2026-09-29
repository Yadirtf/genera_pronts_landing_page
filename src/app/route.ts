// Rutas por hash (#/banco, #/landing/<id>, #/editar/<id>) para que atrás/adelante del navegador funcionen sin router.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'chat' }
  | { name: 'bank' }
  | { name: 'landing'; id: string }
  | { name: 'editor'; id: string };

function parse(hash: string): Route {
  const [, section, id] = hash.replace(/^#/, '').split('/');
  if (section === 'banco') return { name: 'bank' };
  if (section === 'landing' && id) return { name: 'landing', id: decodeURIComponent(id) };
  if (section === 'editar' && id) return { name: 'editor', id: decodeURIComponent(id) };
  return { name: 'chat' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'chat':
      return '#/';
    case 'bank':
      return '#/banco';
    case 'landing':
      return `#/landing/${encodeURIComponent(route.id)}`;
    case 'editor':
      return `#/editar/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route) {
  location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
