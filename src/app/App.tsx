import { Suspense, lazy } from 'react';
import { Bank } from './Bank.tsx';
import { Chat } from './Chat.tsx';
import { LandingView } from './LandingView.tsx';
import { useRoute } from './route.ts';

// CodeMirror pesa; se carga solo al abrir el editor.
const Editor = lazy(() => import('./Editor.tsx').then((m) => ({ default: m.Editor })));

export function App() {
  const route = useRoute();
  return (
    <>
      <Chat active={route.name === 'chat'} />
      {route.name === 'bank' && <Bank />}
      {route.name === 'landing' && <LandingView key={route.id} id={route.id} />}
      {route.name === 'editor' && (
        <Suspense fallback={<p className="status">Cargando editor…</p>}>
          <Editor key={route.id} id={route.id} />
        </Suspense>
      )}
    </>
  );
}
