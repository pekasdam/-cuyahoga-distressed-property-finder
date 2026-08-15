(()=>{
const dig=v=>String(v||'').replace(/\D/g,'');
const rowsNow=()=>{try{return typeof rows!=='undefined'?rows:[]}catch{return[]}};

function currentRowForCard(card){
  const p=card.querySelector('.copyP')?.dataset?.p||card.dataset?.parcel||'';
  return rowsNow().find(r=>dig(r.parcel)===dig(p))||null;
}
function propertyQuery(r){
  const a=r?.record||{};
  const addr=a.par_addr_all||r?.auction?.address||'';
  const city=a.par_city||r?.auction?.city||'';
  const z=a.par_zip?String(Math.trunc(Number(a.par_zip))).padStart(5,'0'):(r?.auction?.zip||'');
  return [addr,city,'OH',z].filter(Boolean).join(' ');
}
function addResearchLinks(card){
  if(card.querySelector('.simpleResearch'))return;
  const r=currentRowForCard(card);if(!r)return;
  const q=propertyQuery(r);if(!q)return;
  const box=document.createElement('div');box.className='simpleResearch';
  const enc=encodeURIComponent(q);
  box.innerHTML=`<a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Azillow.com+${enc}">Zillow</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Aredfin.com+${enc}">Redfin</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Arealtor.com+${enc}">Realtor</a>`;
  const actions=card.querySelector('.cardactions');actions?actions.insertAdjacentElement('afterend',box):card.appendChild(box);
}
function simplify(){
  document.querySelectorAll('.underwrite,.uw,#aiUW,#chatHandoff').forEach(e=>e.remove());
  const modal=document.getElementById('modal');if(modal)modal.remove();
  document.querySelectorAll('.pcard').forEach(card=>{card.querySelectorAll('.underwrite,.uw').forEach(e=>e.remove());addResearchLinks(card);});
  const hero=document.querySelector('.hero p');if(hero)hero.textContent='Upload a Cuyahoga auction list, filter out weak candidates, and inspect the properties worth researching.';
  const footer=document.querySelector('footer');if(footer)footer.textContent='Screening tool only. Verify auction status, title/liens, occupancy, condition, taxes, insurance, rent and value before bidding.';
  const results=document.getElementById('results');
  if(results&&!document.getElementById('simpleModeNote')){
    const note=document.createElement('div');note.id='simpleModeNote';note.className='simpleModeNote';note.textContent='Simple screening mode: properties with opening bids of $25,000 or more are hidden by default. Use the filters and research links to narrow the list.';
    const count=document.getElementById('count');count?count.insertAdjacentElement('afterend',note):results.prepend(note);
  }
}
function styles(){if(document.getElementById('simpleModeStyles'))return;const s=document.createElement('style');s.id='simpleModeStyles';s.textContent=`
.simpleModeNote{margin:9px 0;padding:9px 10px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;font-size:11px;line-height:1.35;color:#1e3a8a}.simpleResearch{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:7px}.simpleResearch a{padding:9px 8px;border-radius:9px;background:#f3f4f6;color:#1d4ed8;text-decoration:none;text-align:center;font-size:12px;font-weight:800;border:1px solid #d1d5db}.pcard .cardactions{grid-template-columns:repeat(2,1fr)}@media(max-width:420px){.simpleResearch{grid-template-columns:repeat(3,1fr)}}
`;document.head.appendChild(s)}
styles();
const oldRender=typeof render==='function'?render:null;
if(oldRender&&!oldRender.__simpleMode){render=function(){const x=oldRender.apply(this,arguments);setTimeout(simplify,0);return x};render.__simpleMode=true;}
simplify();
new MutationObserver(()=>simplify()).observe(document.body,{childList:true,subtree:true});
})();
