(()=>{
if(typeof render!=='function')return;
const style=document.createElement('style');
style.id='propertyCardViewStyle';
style.textContent=`
.propertyCards{display:none;gap:10px;margin-top:12px}
.propertyCard{background:#fff;border:1px solid #d1d5db;border-radius:15px;padding:13px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.propertyCardTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.propertyCardAddress{font-size:18px;font-weight:900;line-height:1.2;margin-top:7px}
.propertyCardSub{font-size:11px;color:#6b7280;margin-top:3px}
.propertyCardGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}
.propertyCardKV{background:#f9fafb;border-radius:10px;padding:9px;min-width:0}
.propertyCardKV span{display:block;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.02em}
.propertyCardKV b{display:block;font-size:12px;margin-top:3px;overflow-wrap:anywhere}
.propertyCardActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
.propertyCardActions a{border-radius:10px;padding:10px 9px;text-decoration:none;text-align:center;font-weight:800;font-size:12px}
.propertyCardCounty{background:#e5e7eb;color:#111827}
.propertyCardMaps{background:#e8f0fe;color:#174ea6}
@media(max-width:700px){.tablewrap{display:none!important}.propertyCards{display:grid}}
`;
document.head.appendChild(style);
const tableWrap=document.querySelector('.tablewrap');
if(!tableWrap)return;
const cards=document.createElement('div');
cards.id='propertyCards';
cards.className='propertyCards';
tableWrap.insertAdjacentElement('afterend',cards);

const oldRender=render;
function safe(v){return typeof esc==='function'?esc(v):String(v??'');}
function shownRows(){
  try{return results.filter(r=>filter==='multi'?r.c.key==='multi':filter==='notmulti'?r.c.key!=='multi':true)}catch{return[]}
}
function mapsUrl(a){
  const q=[a?.par_addr_all,a?.par_city,a?.par_zip?Math.trunc(Number(a.par_zip)):null].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function cardHTML(r){
  const a=r.record||{},c=r.c||{key:'other',label:'OTHER',reason:''};
  const city=[a.par_city,a.par_zip?Math.trunc(Number(a.par_zip)):null].filter(Boolean).join(' ');
  const u=typeof units==='function'?units(a,c):'—';
  const ar=typeof area==='function'?area(a.total_res_liv_area):'—';
  const saleDate=typeof date==='function'?date(a.transfer_date):'—';
  const saleAmount=typeof money==='function'?money(a.sales_amount):'—';
  const county=typeof myplace==='function'?myplace(r.parcel):'#';
  return `<article class="propertyCard">
    <div class="propertyCardTop"><div><span class="badge ${safe(c.key)}">${safe(c.label)}</span><div class="propertyCardAddress">${safe(a.par_addr_all||'Address not found')}</div><div class="propertyCardSub">${safe(city||'Cuyahoga County')} • ${safe(typeof fmt==='function'?fmt(r.parcel):r.parcel)}</div></div></div>
    <div class="propertyCardGrid">
      <div class="propertyCardKV"><span>Property Type</span><b>${safe(c.label)}</b></div>
      <div class="propertyCardKV"><span>Units</span><b>${safe(u)}</b></div>
      <div class="propertyCardKV"><span>Parcel</span><b>${safe(typeof fmt==='function'?fmt(r.parcel):r.parcel)}</b></div>
      <div class="propertyCardKV"><span>Land Use</span><b>${safe([a.tax_luc,a.tax_luc_description].filter(Boolean).join(' ')||'—')}</b></div>
      <div class="propertyCardKV"><span>Owner</span><b>${safe(a.deeded_owner||'—')}</b></div>
      <div class="propertyCardKV"><span>Living Area</span><b>${safe(ar)}</b></div>
      <div class="propertyCardKV"><span>Last Sale</span><b>${safe(saleDate)}</b></div>
      <div class="propertyCardKV"><span>Sale Amount</span><b>${safe(saleAmount)}</b></div>
    </div>
    <div class="propertyCardSub" style="margin-top:8px">${safe(c.reason||'')}</div>
    <div class="propertyCardActions"><a class="propertyCardCounty" href="${county}" target="_blank" rel="noopener">County Record</a><a class="propertyCardMaps" href="${mapsUrl(a)}" target="_blank" rel="noopener">Google Maps</a></div>
  </article>`;
}
function renderCards(){
  const list=shownRows();
  cards.innerHTML=list.map(cardHTML).join('');
  cards.hidden=!list.length;
}
render=function(){const out=oldRender.apply(this,arguments);renderCards();return out;};
renderCards();
})();
