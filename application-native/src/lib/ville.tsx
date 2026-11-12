// [APPLI] Ville des horaires : celle de la personne (position approximative, comme le site), Paris par défaut.
// La personne peut la changer ; son choix passe alors avant la position.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { PARIS, positionApprox, type Ville } from '@/lib/api';

const Ctx = createContext<{ ville: Ville; setVille: (v: Ville) => void }>({ ville: PARIS, setVille: () => {} });

export function VilleProvider({ children }: { children: ReactNode }) {
  const [ville, setV] = useState<Ville>(PARIS);
  const choisie = useRef(false);
  useEffect(() => { positionApprox().then(v => { if (!choisie.current) setV(v); }).catch(() => {}); }, []);
  const setVille = (v: Ville) => { choisie.current = true; setV(v); };
  return <Ctx.Provider value={{ ville, setVille }}>{children}</Ctx.Provider>;
}
export const useVille = () => useContext(Ctx);
