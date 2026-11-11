// TOUS LES TYPES DE DONS — serveur de dons neuf (port 3197, données jetables, Stripe TEST, mails simulés), faux site principal (port 3190).
// Aucun vrai paiement, aucun vrai mail. Les paiements de test sont confirmés avec les cartes de test de Stripe.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),crypto=require('crypto'),{spawn}=require('child_process');
const ROOT='/Users/yarone/Emounateha/local-stripe-test';
const env=Object.fromEntries(fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n').filter(l=>/^[A-Z0-9_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
if(!/^sk_test_/.test(env.STRIPE_SECRET_KEY)){console.log('clé non test : arrêt');process.exit(1)}
const stripe=require(path.join(ROOT,'node_modules','stripe'))(env.STRIPE_SECRET_KEY);
const B='http://127.0.0.1:3197',wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0,titre='';const ok=(c,m,x)=>{c?pass++:fail++;console.log(c?'  ok  ':'  ECHEC',m,c?'':JSON.stringify(x===undefined?null:x).slice(0,420))};const T=t=>console.log('\n— '+t);
const site=http.createServer((q,r)=>{r.writeHead(404,{'content-type':'application/json'});r.end('{}')}).listen(3190,'127.0.0.1');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dons-'));const SECRET='essai-'+Date.now();
const srv=spawn('node',['server.js'],{cwd:ROOT,env:{...process.env,PORT:'3197',SITE_URL:'http://127.0.0.1:3190',DATA_DIR:dir,MAIL_SIMULATE:'1',CERFA_SECRET:SECRET,COMMISSION_EMAIL:'prestataire@exemple.com'},stdio:['ignore','pipe','pipe']});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
const fin=async()=>{srv.kill();site.close();try{fs.rmSync(dir,{recursive:true,force:true})}catch(e){}console.log('\n'+pass+' ok, '+fail+' échec');process.exit(fail?1:0)};
async function call(m,u,b,h={}){const r=await fetch(B+u,{method:m,redirect:'manual',headers:{'content-type':'application/json',origin:B,...h},body:b?JSON.stringify(b):undefined});const ct=r.headers.get('content-type')||'';return {st:r.status,j:ct.includes('json')?await r.json():null}}
const sig=(m,p)=>{const ts=Date.now(),k=crypto.createHash('sha256').update('emounateha-cerfa|'+SECRET).digest();return {'x-cerfa-ts':String(ts),'x-cerfa-sig':crypto.createHmac('sha256',k).update(ts+'|'+m+'|'+p).digest('hex')}};
const admin=()=>call('GET','/api/admin/recus',null,sig('GET','/api/admin/recus'));
const P={type:'particulier',prenom:'Sarah',nom:'Lévy',adresse:'8 avenue Félix Faure',cp:'69003',ville:'Lyon',email:'sarah.levy@exemple.com',tel:'0612345678',montant:'52',frequence:'ponctuel',duree:'infini',repartition:'mois',affectation:'Colis de Chabbat',envoyerEmail:true};
const E={...P,type:'entreprise',raisonSociale:'Boulangerie Benhamou SAS',siren:'732829320',prenom:'',nom:'',email:'compta@benhamou.exemple.com'};
// un don complet : intention → paiement de test → reçu
async function don(body,carte='pm_card_visa'){const i=await call('POST','/api/intent',body);if(i.st!==200)return {i,pi:{metadata:{}},f:null};let err=null;try{await stripe.paymentIntents.confirm(i.j.id,{payment_method:carte,return_url:B+'/'})}catch(e){err=e}const f=err?null:await call('POST','/api/finalize',{id:i.j.id});return {i,f,err,pi:await stripe.paymentIntents.retrieve(i.j.id,{expand:['invoice.subscription','latest_charge.balance_transaction']})}}
(async()=>{for(let k=0;k<50;k++){try{await fetch(B+'/api/config');break}catch(e){await wait(300)}}
 const cfg=(await call('GET','/api/config')).j;const affs=cfg.affectations||[];
 T('1. Don ponctuel d\'un particulier, pour chaque action proposée ('+affs.length+')');
 const numeros=[];let PDF1='';const trouve0=(d0,n)=>{for(const e of fs.readdirSync(d0,{withFileTypes:true})){const q=path.join(d0,e.name);if(e.isDirectory()){const x=trouve0(q,n);if(x)return x}else if(e.name===n)return q}return null};
 for(const a of affs){const corps={...P,affectation:a.label};if(Array.isArray(a.actions)&&a.actions.length){corps.lignes=[{id:a.actions[0].id,montant:a.actions[0].montant||80}];if(a.actions[1])corps.lignes.push({id:a.actions[1].id,montant:26});corps.libre='10'}
  const d=await don(corps);const r=d.f&&d.f.j;ok(d.i.st===200&&r&&r.numero&&r.affectation&&d.pi.status==='succeeded'&&d.pi.metadata.affectation===r.affectation&&(!corps.lignes||d.pi.amount===corps.lignes.reduce((s,l)=>s+Math.round(l.montant*100),0)+1000),'« '+a.label+' » : payé, reçu '+(r&&r.numero)+', '+((d.pi.amount||0)/100)+' €'+(corps.lignes?' ('+corps.lignes.length+' choix + 10 € de don libre, total recalculé par le serveur)':'')+', action inscrite dans Stripe',[d.i,r,d.err&&d.err.message]);if(r&&r.numero){numeros.push(r.numero);if(!PDF1)PDF1=r.pdf}}
 ok(new Set(numeros).size===numeros.length&&numeros.every((n,k)=>k===0||Number(n.match(/(\d+)$/)[1])===Number(numeros[k-1].match(/(\d+)$/)[1])+1),'les numéros de reçus se suivent, sans trou ni doublon ('+numeros[0]+' → '+numeros[numeros.length-1]+')',numeros);
 T('2. Reçu fiscal d\'un particulier');
 let L=(await admin()).j.recus;let r0=L.find(x=>x.numero===numeros[0]);
 ok(r0&&/^Sarah L[ÉE]VY$/i.test(r0.nom)&&r0.type==='particulier'&&r0.montant===5200&&/8 avenue Félix Faure, 69003 Lyon/.test(r0.adresse)&&r0.source==='en ligne'&&r0.email==='sarah.levy@exemple.com','fiche du reçu : nom, adresse complète, montant, origine « en ligne »',r0);
 ok(r0.mail&&r0.mail.to==='sarah.levy@exemple.com'&&r0.mail.at&&r0.creeLe&&!r0.mail.error,'l\'e-mail du reçu est préparé pour le donateur (ici enregistré en fichier, aucun vrai envoi), heure notée',r0&&r0.mail);
 const sur=trouve0(dir,path.basename(r0.file||''));const tel=await fetch(B+PDF1);const oct=Buffer.from(await tel.arrayBuffer());
 ok(tel.status===200&&/pdf/.test(tel.headers.get('content-type')||'')&&oct.slice(0,5).toString()==='%PDF-'&&oct.length>8000,'le PDF du reçu se télécharge par son lien signé ('+Math.round(oct.length/1024)+' Ko, vrai fichier PDF)',[tel.status,oct.length]);
 ok(!!sur&&fs.readFileSync(sur).slice(0,5).toString()!=='%PDF-','sur le disque, le PDF est stocké chiffré (illisible sans le serveur)',sur);
 const sans=await fetch(B+PDF1.split('?')[0]);ok(sans.status===401||sans.status===403||sans.status===404,'le même PDF sans sa signature : refusé ('+sans.status+')',sans.status);
 T('3. Don d\'un professionnel');
 let d=await don(E);let r=d.f&&d.f.j;L=(await admin()).j.recus;let rr=L.find(x=>x.numero===(r&&r.numero));
 ok(rr&&rr.type==='entreprise'&&rr.nom==='Boulangerie Benhamou SAS'&&rr.siren==='732829320'&&/Lyon/.test(rr.adresse),'société : reçu au nom de la raison sociale, SIREN et adresse transmis au CRM',rr);
 d=await don({...E,siren:'123456789'});ok(d.i.st===400&&/SIREN/.test(d.i.j.error),'SIREN faux : refusé avant tout paiement',d.i);
 T('4. Don mensuel');
 d=await don({...P,frequence:'mensuel',montant:'26'});r=d.f&&d.f.j;const sub=d.pi.invoice&&d.pi.invoice.subscription;
 ok(d.i.st===200&&sub&&sub.status==='active'&&sub.items.data[0].price.unit_amount===2600&&sub.items.data[0].price.recurring.interval==='month','mensuel sans limite : abonnement Stripe actif, 26 € par mois',[d.i,sub&&sub.status]);
 ok(r&&r.numero&&r.mensuel,'premier prélèvement payé, reçu '+(r&&r.numero)+' marqué « mensuel »',r);
 d=await don({...P,frequence:'mensuel',montant:'30',duree:'12'});const s12=d.pi.invoice&&d.pi.invoice.subscription;ok(s12&&(s12.cancel_at||s12.metadata.mois==='12'||s12.schedule),'mensuel sur 12 mois : la fin est programmée dans Stripe',s12&&{cancel_at:s12.cancel_at,meta:s12.metadata,schedule:s12.schedule});
 if(s12&&s12.cancel_at){const mois=Math.round((s12.cancel_at-s12.start_date)/86400/30.4);ok(mois>=11&&mois<=12,'… arrêt automatique au bout de '+mois+' mois',mois)}
 d=await don({...P,frequence:'mensuel',montant:'120',duree:'12',repartition:'total'});const st=d.pi.invoice&&d.pi.invoice.subscription;ok(st&&st.items.data[0].price.unit_amount===1000,'120 € répartis sur 12 mois : 10 € par mois',st&&st.items.data[0].price.unit_amount);
 for(const s of [sub,s12,st])if(s)await stripe.subscriptions.cancel(s.id).catch(()=>{});
 T('5. Montants');
 d=await don({...P,montant:'1'});ok(d.f&&d.f.j.numero&&d.pi.amount===100,'minimum 1 € : accepté');
 d=await don({...P,montant:'37,50'});ok(d.f&&d.f.j.numero&&d.pi.amount===3750,'montant libre avec centimes (37,50 €) : accepté tel quel',d.pi&&d.pi.amount);
 d=await don({...P,montant:'999999'});ok(d.i.st===200&&d.pi.amount===99999900,'maximum 999 999 € : l\'intention de paiement est créée',[d.i.st,d.pi&&d.pi.amount]);
 for(const [m,q] of [['0,50','sous 1 €'],['1000000','au-dessus du maximum'],['-5','négatif'],['abc','pas un nombre'],['','vide']]){const x=await call('POST','/api/intent',{...P,montant:m});ok(x.st===400&&/Montant/.test(x.j.error),'montant '+q+' (« '+m+' ») : refusé',x)}
 T('6. Coordonnées invalides');
 for(const [ch,v,q] of [['email','pas-une-adresse','e-mail invalide'],['cp','6900','code postal à 4 chiffres'],['adresse','','adresse vide'],['ville','','ville vide'],['nom','','nom vide']]){const x=await call('POST','/api/intent',{...P,[ch]:v});ok(x.st===400,q+' : refusé avant paiement',x)}
 T('7. Paiement refusé');
 const avant=(await admin()).j.recus.length;
 d=await don(P,'pm_card_chargeDeclined');ok(d.err&&/declin|refus/i.test(d.err.message)&&!d.f,'carte refusée par la banque : le paiement échoue',d.err&&d.err.message);
 d=await don(P,'pm_card_chargeDeclinedInsufficientFunds');ok(d.err&&!d.f,'fonds insuffisants : le paiement échoue',d.err&&d.err.message);
 ok((await admin()).j.recus.length===avant,'aucun reçu fiscal n\'est créé pour un paiement refusé');
 const x=await call('POST','/api/finalize',{id:d.i.j.id});ok(x.st===400,'demander le reçu d\'un paiement non abouti : refusé',x);
 T('8. Sécurité du reçu');
 d=await don(P);const n1=d.f.j.numero;const again=await call('POST','/api/finalize',{id:d.i.j.id});ok(again.j.numero===n1&&(await admin()).j.recus.filter(q=>q.numero===n1).length===1,'valider deux fois le même paiement : un seul reçu, même numéro',[n1,again.j.numero]);
 ok(!d.f.j.file&&!d.f.j.form&&!d.f.j.donorEmail&&/[?&]s=[0-9a-f]{16,}/.test(d.f.j.pdf||''),'la réponse au navigateur ne donne ni le fichier ni les coordonnées ; le lien du PDF est signé et expire',d.f.j);
 let y=await call('POST','/api/finalize',{id:'pi_inexistant123'});ok(y.st===400,'identifiant de paiement inventé : refusé',y);
 y=await call('GET','/api/admin/recus');ok(y.st===401,'liste des reçus sans autorisation : fermée (401)',y.st);
 T('9. Frais Stripe et net (base de la commission)');
 const bt=d.pi.latest_charge&&d.pi.latest_charge.balance_transaction;ok(bt&&bt.amount===5200&&bt.fee>0&&bt.net===bt.amount-bt.fee,'don de 52 € : frais '+(bt?(bt.fee/100).toFixed(2):'?')+' €, net '+(bt?(bt.net/100).toFixed(2):'?')+' € lus chez Stripe',bt&&{a:bt.amount,f:bt.fee,n:bt.net});
 const C=require(ROOT+'/commission.js');const c1=C.calculer([bt]);ok(c1.controle&&c1.commission===Math.round(bt.net*0.07),'commission calculée sur ce net : '+(c1.commission/100).toFixed(2)+' €, contrôle au centime',c1);
 T('10. Reçus manuels (virement, chèque, espèces)');
 const jour=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
 for(const mode of ['Virement bancaire','Chèque','Espèces']){const m=await call('POST','/api/admin/recu',{...P,mode,dateDon:jour,montant:'180',envoyerEmail:false},sig('POST','/api/admin/recu'));ok(m.st===200&&m.j.numero,mode+' : reçu '+(m.j&&m.j.numero)+' créé',m)}
 L=(await admin()).j.recus;const man=L.filter(q=>q.source==='manuel');ok(man.length===3&&man.every(q=>!q.mail),'3 reçus manuels, sans e-mail quand ce n\'est pas demandé',man.map(q=>[q.numero,q.mode,!!q.mail]));
 const tousNum=L.map(q=>q.numero).filter(n=>!/^TEST-?$/.test(n));const seq=tousNum.map(n=>Number(n.match(/(\d+)$/)[1])).sort((a,b)=>a-b);ok(new Set(seq).size===seq.length&&seq[seq.length-1]-seq[0]===seq.length-1,'en ligne et manuels partagent la même numérotation, sans trou ('+seq.length+' reçus, n° '+seq[0]+' à '+seq[seq.length-1]+')',seq);
 let z=await call('POST','/api/admin/recu',{...P,mode:'Bitcoin',dateDon:jour},sig('POST','/api/admin/recu'));ok(z.st===400,'mode de versement inconnu : refusé',z);
 z=await call('POST','/api/admin/recu',{...P,mode:'Chèque',dateDon:'2099-01-01'},sig('POST','/api/admin/recu'));ok(z.st===400,'date dans le futur : refusée',z);
 z=await call('POST','/api/admin/recu',{...P,mode:'Chèque',dateDon:jour});ok(z.st===401,'créer un reçu manuel sans autorisation : refusé (401)',z.st);
 T('11. Provenance du don');
 d=await don({...P,amb:'yaron'});L=(await admin()).j.recus;rr=L.find(q=>q.numero===d.f.j.numero);ok(rr&&(rr.ambassadeur==='yaron'||d.pi.metadata.ambassadeur==='yaron'||d.pi.metadata.amb==='yaron'),'lien d\'ambassadeur : le don lui est rattaché',[rr&&rr.ambassadeur,d.pi.metadata]);
 d=await don({...P,attr:{c:'camp1',t:'t1',s:'contact9'}});L=(await admin()).j.recus;rr=L.find(q=>q.numero===d.f.j.numero);ok(rr&&rr.attr&&rr.attr.c==='camp1','don venu d\'un e-mail de campagne : la campagne est notée sur le reçu',rr&&rr.attr);
 T('12. Relevé de commission automatique (à blanc)');
 let cm=await call('POST','/api/admin/commission/envoyer',{});ok(cm.st===401,'sans autorisation : refusé (401)',cm.st);
 cm=await call('POST','/api/admin/commission/envoyer',{},sig('POST','/api/admin/commission/envoyer'));ok(cm.st===200&&cm.j.envoye===true&&cm.j.controle===true&&cm.j.commission===Math.round(cm.j.net*0.07)&&cm.j.periode.du<cm.j.periode.au,'relevé de la semaine écoulée ('+(cm.j.periode?cm.j.periode.du+' → '+cm.j.periode.au:'?')+') : net '+((cm.j.net||0)/100).toFixed(2)+' €, commission '+((cm.j.commission||0)/100).toFixed(2)+' €, contrôle OK, mail préparé',cm);
 const Cm=require(ROOT+'/commission.js');const ps=Cm.semainePrecedente(Cm.semaine(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'})));ok(cm.j.periode&&cm.j.periode.du===ps.du&&new Date(ps.du+'T12:00:00Z').getUTCDay()===1&&new Date(ps.au+'T12:00:00Z').getUTCDay()===0,'la période va bien du lundi au dimanche de la semaine d\'avant',cm.j.periode);
 {const Cm2=require(ROOT+'/commission.js');const bt2=[{id:'txn_a',type:'charge',amount:5200,fee:103,net:5097,currency:'eur',created:Math.floor(Date.now()/1000)-86400*8,description:'Don Émounatéha — Colis de Chabbat'},{id:'txn_b',type:'refund',amount:-2600,fee:0,net:-2600,currency:'eur',created:Math.floor(Date.now()/1000)-86400*8,description:'Remboursement'}];const m=Cm2.releveMail({du:'2026-11-02',au:'2026-11-08'},Cm2.calculer(bt2),true);
  ok(/Commission — semaine du 2 novembre 2026 au 8 novembre 2026 : 1,75/.test(m.subject)&&/Mode à blanc/.test(m.text)&&/Aucune facture/.test(m.html)&&m.fichier==='commission_2026-11-02_2026-11-08.csv','contenu du mail : objet avec la semaine et le montant, mention « mode à blanc »',m.subject);
  const lignes=m.csv.split('\r\n');ok(lignes[0].includes('Date;Heure;Mouvement;Libellé;Montant;Frais;Net')&&lignes.length===6&&/52,00;1,03;50,97;txn_a/.test(lignes[1])&&/1,75$/.test(lignes[5]),'pièce jointe : une ligne par mouvement, puis le net et la commission',lignes);
  ok(!/@/.test(m.text+m.html+m.csv),'ni le mail ni la pièce jointe ne contiennent d\'adresse e-mail de donateur')}
 cm=await call('POST','/api/admin/commission/envoyer',{},sig('POST','/api/admin/commission/envoyer'));ok(cm.st===200&&cm.j.envoye===false&&/déjà envoyé/.test(cm.j.raison),'deuxième appel la même semaine : rien n\'est renvoyé',cm.j);
 console.log('\n   journal du serveur : '+((log.match(/error|Error/g)||[]).length)+' ligne(s) d\'erreur');
 await fin()})().catch(async e=>{console.log('ERREUR',e.stack,'\n',log.slice(-600));await fin()});
