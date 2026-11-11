// Calcul de la commission : essais sur des mouvements inventés (aucun appel à Stripe).
const C=require('/Users/yarone/Emounateha/local-stripe-test/commission.js');let pass=0,fail=0;const ok=(c,m,x)=>{c?pass++:fail++;console.log(c?'  ok  ':'  ECHEC',m,c?'':JSON.stringify(x===undefined?null:x).slice(0,300))};
const t=(j,h)=>Math.floor(Date.parse(j+'T'+h+':00+01:00')/1000);let i=0;const M=(type,amount,fee,o={})=>({id:'txn_'+(++i),type,amount,fee,net:amount-fee,currency:'eur',created:t('2026-11-10','12:00'),description:'essai',...o});
// ton exemple : don de 100 €, frais 1,75 € → net 98,25 € → 7 % = 6,88 €
let r=C.calculer([M('charge',10000,175)]);ok(r.net===9825&&r.commission===688&&r.resteAssociation===9137&&r.controle,'don de 100 € : net 98,25 €, commission 6,88 €, il reste 91,37 € à l\'association',r);
// semaine réaliste
r=C.calculer([M('charge',5200,103),M('charge',12600,214),M('payment',2600,64),M('charge',100000,1525),M('refund',-5200,0),M('payout',-100000,0),M('stripe_fee',-200,0),M('adjustment',-2600,2000,{net:-4600})]);
ok(r.nbDons===4&&r.brut===120400&&r.frais===3906&&r.rembourse===-5200&&r.litiges===-2600,'4 dons, frais, 1 remboursement, 1 litige : totaux exacts',[r.nbDons,r.brut,r.frais,r.rembourse,r.litiges]);
ok(r.net===120400-5200-2600-3906&&r.controle,'net = dons − remboursements − litiges − frais, contrôle au centime',[r.net,r.controle]);
ok(r.commission===Math.round(r.net*0.07)&&r.commission===7609,'commission = 7 % du net (76,09 €)',r.commission);
ok(r.ignores.payout===1&&r.ignores.stripe_fee===1&&r.nbLignes===6,'virement vers la banque et frais divers Stripe : hors calcul',r.ignores);
r=C.calculer([M('charge',5200,103),M('refund',-5200,0)]);ok(r.net===-103&&r.commission===0,'semaine négative (don remboursé) : commission 0, jamais négative',r);
r=C.calculer([]);ok(r.commission===0&&r.net===0&&r.controle,'semaine sans don : 0');
r=C.calculer([M('charge',5200,103),M('charge',900,30,{currency:'usd'}),M('truc_nouveau',100,0)]);ok(r.nbDons===1&&r.inconnus['devise usd']===1&&r.inconnus.truc_nouveau===1,'devise étrangère ou type inconnu : signalé, pas compté en silence',r.inconnus);
r=C.calculer([M('charge',3333,77)]);ok(r.commission===Math.round(3256*0.07)&&r.commission===228,'arrondi au centime le plus proche (227,92 → 2,28 €)',r.commission);
// semaines : lundi → dimanche
const S=C.semaine;ok(JSON.stringify(S('2026-11-11'))===JSON.stringify({du:'2026-11-09',au:'2026-11-15'}),'mercredi 11 nov. → semaine du lundi 9 au dimanche 15',S('2026-11-11'));
ok(S('2026-11-09').du==='2026-11-09'&&S('2026-11-15').du==='2026-11-09'&&S('2026-11-16').du==='2026-11-16','lundi et dimanche dans la même semaine, le lundi suivant ouvre la suivante');
ok(JSON.stringify(C.semainePrecedente(S('2026-11-11')))===JSON.stringify({du:'2026-11-02',au:'2026-11-08'}),'semaine précédente : 2 au 8 novembre');
ok(JSON.stringify(S('2027-01-01'))===JSON.stringify({du:'2026-12-28',au:'2027-01-03'}),'changement d\'année : semaine du 28 déc. au 3 janv.',S('2027-01-01'));
// bornes en heure de Paris, été comme hiver
const h=x=>new Date(C.minuitParis(x)).toISOString();ok(h('2026-11-09')==='2026-11-08T23:00:00.000Z'&&h('2026-07-06')==='2026-07-05T22:00:00.000Z','minuit de Paris : 23 h UTC l\'hiver, 22 h UTC l\'été',[h('2026-11-09'),h('2026-07-06')]);
console.log(pass+' ok, '+fail+' échec')
