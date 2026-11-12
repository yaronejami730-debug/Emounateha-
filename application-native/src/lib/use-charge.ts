// [APPLI] Chargement d'une donnée du [SITE] avec état (chargement / erreur) et « tirer pour actualiser ».
// Recharge automatiquement quand une valeur de `deps` change (ex. la ville) ; une réponse ancienne n'écrase jamais la nouvelle.
import { useEffect, useRef, useState } from 'react';

export function useCharge<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [erreur, setErreur] = useState(false);
  const [chargement, setChargement] = useState(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  const tour = useRef(0);
  const cle = JSON.stringify(deps);

  const charger = async () => {
    const n = ++tour.current;
    setChargement(true);
    try { const v = await fnRef.current(); if (n === tour.current) { setData(v); setErreur(false); } }
    catch { if (n === tour.current) setErreur(true); }
    finally { if (n === tour.current) setChargement(false); }
  };
  useEffect(() => { setData(null); charger(); }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, erreur, chargement, recharger: charger };
}
