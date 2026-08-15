(()=>{
const LIMIT=25000;
let screened=true;
const dig=v=>String(v||'').replace(/\D/g,'');
const rowsNow=()=>{try{return typeof rows!=='undefined'?rows:[]}catch{return[]}};
function auctionFor(r){
  const p=dig(r?.parcel);
  const full=window.fullAuctionByParcel?.[p]||{};
  let parsed={};
  try{if(window.parseAuctionInfo)parsed=window.parseAuctionInfo(r?.raw||'')||{}}catch{}
  return {...parsed,...full,...(r?.auction||{})};
}
function openingFor(r){const n=Number(auctionFor(r).openingBid);return Number.isFinite(n)&&n>0?n:0}
function isVacant(r){
  const key=String(r?.c?.key||'').toLowerCase();
  const label=String(r?.c?.label||'').toLowerCase();
  const land=String(r?.record?.tax_luc_description||'')+' '+String(r?.record?.ext_luc_description||'');
  return key==='vacant'||/vacant|land only|\blot\b/i.test(`${label} ${land}`);
}
function isInactive(r){return /cancel(?:led|ed)?|withdrawn|postponed|\bsold\b|closed/i.test(String(auctionFor(r).status||''))}
function excluded(r){return openingFor(r)>=LIMIT||isVacant(r)||isInactive(r)}
function install(){
  if(document.getElementById('quickScreenToggle'))return;
  const filters=document.querySelector('#results .filters');
  if(!filters)return;
  const b=document.createElement('button');
  b.id='quickScreenToggle';b.className='chip active';b.type='button';b.textContent='Qualified Screen';
  b.title='Hide $25k+ opening bids, vacant land, and inactive auctions';
  b.onclick=()=>{screened=!screened;b.classList.toggle('active',screened);b.textContent=screened?'Qualified Screen':'Show All';if(typeof render==='function')render();};
  filters.appendChild(b);
}
function apply(){
  install();
  if(typeof shown==='undefined'||!Array.isArray(shown))return;
  const before=[...shown], hidden=screened?before.filter(excluded):[];
  if(screened)shown=before.filter(r=>!excluded(r));
  const keep=new Set(shown.map(r=>dig(r.parcel)));
  document.querySelectorAll('.pcard').forEach(card=>{const p=dig(card.querySelector('.copyP')?.dataset.p);if(p&&!keep.has(p))card.remove();});
  document.querySelectorAll('#tbody tr').forEach(tr=>{const p=dig(tr.querySelector('.copyP')?.dataset.p);if(p&&!keep.has(p))tr.remove();});
  const count=document.getElementById('count');if(count){const total=rowsNow().length;count.textContent=`Showing ${shown.length} of ${total}${screened&&hidden.length?` • ${hidden.length} screened out`:''}`;}
  const empty=document.getElementById('empty');if(empty)empty.hidden=shown.length!==0;
}
function wrapRender(){if(typeof render!=='function'||render.__quickScreen)return;const old=render;render=function(){const x=old.apply(this,arguments);setTimeout(apply,0);return x;};render.__quickScreen=true;}
install();wrapRender();setTimeout(apply,0);
})();