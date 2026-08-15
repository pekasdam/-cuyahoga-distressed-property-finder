(()=>{
const LIMIT=25000;
let hideHigh=true;
const dig=v=>String(v||'').replace(/\D/g,'');
const rowsNow=()=>{try{return typeof rows!=='undefined'?rows:[]}catch{return[]}};
function openingFor(r){
  const direct=Number(r?.auction?.openingBid);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const cached=Number(window.fullAuctionByParcel?.[dig(r?.parcel)]?.openingBid);
  if(Number.isFinite(cached)&&cached>0)return cached;
  if(window.parseAuctionInfo){try{const x=Number(window.parseAuctionInfo(r?.raw||'')?.openingBid);if(Number.isFinite(x)&&x>0)return x;}catch{}}
  return 0;
}
function install(){
  if(document.getElementById('bidCapToggle'))return;
  const filters=document.querySelector('#results .filters');
  if(!filters)return;
  const b=document.createElement('button');
  b.id='bidCapToggle';
  b.className='chip active';
  b.type='button';
  b.textContent='Opening Bid < $25k';
  b.title='Hide properties with starting/opening bids of $25,000 or more';
  b.onclick=()=>{hideHigh=!hideHigh;b.classList.toggle('active',hideHigh);b.textContent=hideHigh?'Opening Bid < $25k':'Show All Opening Bids';if(typeof render==='function')render();};
  filters.appendChild(b);
}
function apply(){
  install();
  if(typeof shown==='undefined'||!Array.isArray(shown))return;
  const before=[...shown];
  const hidden=hideHigh?before.filter(r=>openingFor(r)>=LIMIT):[];
  if(hideHigh)shown=before.filter(r=>openingFor(r)<LIMIT||openingFor(r)===0);
  const keep=new Set(shown.map(r=>dig(r.parcel)));
  document.querySelectorAll('.pcard').forEach(card=>{const p=dig(card.querySelector('.copyP')?.dataset.p);if(p&&!keep.has(p))card.remove();});
  document.querySelectorAll('#tbody tr').forEach(tr=>{const p=dig(tr.querySelector('.copyP')?.dataset.p);if(p&&!keep.has(p))tr.remove();});
  const count=document.getElementById('count');
  if(count){
    const total=rowsNow().length;
    const extra=hideHigh&&hidden.length?` • Hidden ${hidden.length} with opening bid ≥ $25,000`:'';
    count.textContent=`Showing ${shown.length} of ${total}${extra}`;
  }
  const empty=document.getElementById('empty');if(empty)empty.hidden=shown.length!==0;
}
function wrapRender(){
  if(typeof render!=='function'||render.__bidCap)return;
  const old=render;
  render=function(){const x=old.apply(this,arguments);setTimeout(apply,0);return x;};
  render.__bidCap=true;
}
install();wrapRender();setTimeout(apply,0);
})();