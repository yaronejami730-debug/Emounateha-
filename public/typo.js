/* marque chaque suite de caractères hébreux : lang="he" dir="rtl" (la police Frank Ruhl Libre suit via le CSS) */
(function(){
var HE=/[֐-׿יִ-ﭏ][֐-׿יִ-ﭏ\s"'״׳,.\-–:()]*/g;
function skip(n){var p=n.parentNode;return !p||/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|TITLE|OPTION)$/.test(p.nodeName)||(p.closest&&p.closest('[lang="he"]'))}
function wrap(t){
  if(skip(t)||!/[֐-׿]/.test(t.nodeValue))return;
  var p=t.parentNode,txt=t.nodeValue;
  if(txt.replace(HE,'').trim()===''&&p.childNodes.length===1&&p.nodeName!=='BODY'){p.setAttribute('lang','he');p.setAttribute('dir','rtl');return}
  var f=document.createDocumentFragment(),i=0,m;HE.lastIndex=0;
  while((m=HE.exec(txt))){
    if(m.index>i)f.appendChild(document.createTextNode(txt.slice(i,m.index)));
    var s=document.createElement('span');s.setAttribute('lang','he');s.setAttribute('dir','rtl');s.textContent=m[0];f.appendChild(s);i=m.index+m[0].length}
  if(i<txt.length)f.appendChild(document.createTextNode(txt.slice(i)));
  p.replaceChild(f,t)}
function scan(root){
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),a=[],n;
  while((n=w.nextNode()))if(/[֐-׿]/.test(n.nodeValue))a.push(n);
  a.forEach(wrap)}
function go(){scan(document.body);
  var busy=false;new MutationObserver(function(){if(busy)return;busy=true;setTimeout(function(){scan(document.body);busy=false},60)}).observe(document.body,{childList:true,subtree:true,characterData:true})}
if(document.body)go();else document.addEventListener('DOMContentLoaded',go)})();
