(()=>{
const dig=v=>String(v||'').replace(/\D/g,'');
const rowsNow=()=>{try{return typeof rows!=='undefined'?rows:[]}catch{return[]}};
function currentRowForCard(card){const p=card.querySelector('.copyP')?.dataset?.p||card.dataset?.parcel||'';return rowsNow().find(r=>dig(r.parcel)===dig(p))||null}
function propertyQuery(r){const a=r?.record||{},x=r?.auction||{};const addr=a.par_addr_all||x.address||'',city=a.par_city||x.city||'',z=a.par_zip?String(Math.trunc(Number(a.par_zip))).padStart(5,'0'):(x.zip||'');return [addr,city,'OH',z].filter(Boolean).join(' ')}
function addResearchLinks(card){
  if(card.querySelector('.simpleResearch'))return;
  const r=currentRowForCard(card);if(!r)return;const q=propertyQuery(r);if(!q)return;
  const box=document.createElement('div');box.className='simpleResearch';const enc=encodeURIComponent(q);
  box.innerHTML=`<a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Azillow.com+${enc}">Zillow</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Aredfin.com+${enc}">Redfin</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Arealtor.com+${enc}">Realtor</a>`;
  const actions=card.querySelector('.cardactions');actions?actions.insertAdjacentElement('afterend',box):card.appendChild(box);
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function simplify(){
  document.querySelectorAll('.underwrite,.uw,#aiUW,#chatHandoff,.screenOptBar,.arvGate').forEach(e=>e.remove());
  const modal=document.getElementById('modal');if(modal)modal.remove();
  document.querySelectorAll('.pcard').forEach(card=>{card.querySelectorAll('.underwrite,.uw').forEach(e=>e.remove());addResearchLinks(card)});
  setText(document.querySelector('.hero p'),'Upload an auction photo or PDF, screen the list, and open the properties worth researching.');
  setText(document.querySelector('footer'),'Screening tool only. Verify auction status, title/liens, occupancy and property condition before bidding.');
  const demo=document.getElementById('demo');if(demo&&demo.style.display!=='none')demo.style.display='none';
}
function styles(){if(document.getElementById('simpleModeStyles'))return;const s=document.createElement('style');s.id='simpleModeStyles';s.textContent=`
.hero{padding:16px}.hero h1{font-size:22px}.panel{padding:12px}.simpleResearch{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.simpleResearch a{padding:9px 6px;border-radius:9px;background:#f8fafc;color:#1d4ed8;text-decoration:none;text-align:center;font-size:12px;font-weight:800;border:1px solid #d1d5db}.pcard{padding:11px}.pcard .cardactions{grid-template-columns:repeat(2,1fr)}@media(max-width:420px){.simpleResearch{grid-template-columns:repeat(3,1fr)}.actions button{min-height:44px}}
`;document.head.appendChild(s)}
styles();
const oldRender=typeof render==='function'?render:null;
if(oldRender&&!oldRender.__simpleMode){render=function(){const x=oldRender.apply(this,arguments);setTimeout(simplify,0);return x};render.__simpleMode=true;}
simplify();
})();
