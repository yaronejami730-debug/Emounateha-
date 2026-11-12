// [APPLI] Charte graphique : mêmes couleurs que le site emounateha.fr.
export const C = {
  vert: '#1f6a72',
  vertFonce: '#0e3e44',
  vertNuit: '#0a2e34',
  or: '#c4a24a',
  orClair: '#f0d98a',
  orMoyen: '#e2c46c',
  creme: '#f7f3ea',
  carte: '#ffffff',
  encre: '#14272a',
  gris: '#51666a',
  trait: '#e3ecec',
};

export const serif = 'Georgia';

export const ombre = {
  shadowColor: '#08141c',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

// Polices du [SITE] : Cinzel pour le français (EmouFr), Frank Ruhl Libre pour l'hébreu (EmouHe). Chargées dans app/_layout.tsx.
export const F = {
  r: 'Cinzel_400Regular',
  m: 'Cinzel_600SemiBold',
  b: 'Cinzel_700Bold',
  x: 'Cinzel_800ExtraBold',
  he: 'FrankRuhlLibre_700Bold',
  heR: 'FrankRuhlLibre_500Medium',
};
