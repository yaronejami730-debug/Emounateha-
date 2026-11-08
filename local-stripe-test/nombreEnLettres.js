const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const DIX_A_SEIZE = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function centainesEnLettres(n) {
  let mots = [];
  const c = Math.floor(n / 100);
  const reste = n % 100;

  if (c > 0) {
    if (c === 1) mots.push('cent');
    else mots.push(UNITES[c] + ' cent' + (reste === 0 ? 's' : ''));
  }

  if (reste > 0) {
    if (reste < 10) {
      mots.push(UNITES[reste]);
    } else if (reste < 17) {
      mots.push(DIX_A_SEIZE[reste - 10]);
    } else if (reste < 20) {
      mots.push('dix-' + UNITES[reste - 10]);
    } else {
      const d = Math.floor(reste / 10);
      const u = reste % 10;
      let base;
      if (d === 7) {
        base = u === 1 ? 'soixante-et-onze' : 'soixante-' + DIX_A_SEIZE[u];
      } else if (d === 9) {
        base = u === 0 ? 'quatre-vingt-dix' : 'quatre-vingt-' + DIX_A_SEIZE[u];
      } else if (u === 0) {
        base = DIZAINES[d] + (d === 8 ? 's' : '');
      } else if (u === 1 && d !== 8) {
        base = DIZAINES[d] + '-et-un';
      } else {
        base = DIZAINES[d] + '-' + UNITES[u];
      }
      mots.push(base);
    }
  }

  return mots.join(' ');
}

function entierEnLettres(n) {
  if (n === 0) return 'zero';
  if (n < 0) return 'moins ' + entierEnLettres(-n);

  const tranches = [
    { valeur: 1000000000, singulier: 'milliard', pluriel: 'milliards' },
    { valeur: 1000000, singulier: 'million', pluriel: 'millions' },
    { valeur: 1000, singulier: 'mille', pluriel: 'mille' },
  ];

  let reste = n;
  let mots = [];

  for (const tranche of tranches) {
    const q = Math.floor(reste / tranche.valeur);
    if (q > 0) {
      if (tranche.valeur === 1000 && q === 1) {
        mots.push('mille');
      } else {
        mots.push(centainesEnLettres(q) + ' ' + (q > 1 ? tranche.pluriel : tranche.singulier));
      }
      reste %= tranche.valeur;
    }
  }

  if (reste > 0 || mots.length === 0) {
    mots.push(centainesEnLettres(reste));
  }

  return mots.join(' ').trim();
}

/** Convertit un montant en centimes vers une chaine en toutes lettres (euros + centimes). */
function montantEnLettres(centimes) {
  const euros = Math.floor(centimes / 100);
  const c = centimes % 100;
  let texte = `${entierEnLettres(euros)} euro${euros > 1 ? 's' : ''}`;
  if (c > 0) {
    texte += ` et ${entierEnLettres(c)} centime${c > 1 ? 's' : ''}`;
  }
  return texte;
}

module.exports = { entierEnLettres, montantEnLettres };
