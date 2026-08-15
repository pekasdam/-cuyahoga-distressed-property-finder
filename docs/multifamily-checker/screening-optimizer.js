(()=>{
const LIMIT=25000;
const STORE='cuyahoga-screening-stage-v1';
let screened=true;
const dig=v=>String(v||'').replace(/\D/g,'');
const cash=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}):'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rowsNow=()=>{try{return typeof rows!=='undefined'?rows:[]}catch{return[]}};
const shownNow=()=>{try{return typeof shown!=='undefined'?shown:[]}catch{return[]}};
function loadStages(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{}}catch{return{}}}
function stageFor(p){return loadStages()[dig(p)]||''}
function setStage(p,s){try{const x=loadStages(),k=dig(p);if(s)x[k]=s;else delete x[k];localStorage.setItem(STORE,JSON.stringify(x));}catch{} }
function unitCount(r){try{return typeof unit==='function'?Math.max(1,Number(unit(r.record||{},r.c)||1)):Math.max(1,Number(r.record?.com_living_units||r.record?.res_bldg_count||1))}catch{return 1}}
function zipFor(a){try{return typeof zip==='function'?zip(a):String(a?.par_zip||'')}catch{return String(a?.par_zip||'')}}
function auctionFor(r){
  let a={};
  try{if(window.parseAuctionInfo)a={...window.parseAuctionInfo(r?.raw||'')}}catch{}
  const full=window.fullAuctionByParcel?.[dig(r?.parcel)]||{};
  return {...a,...full,...(r?.auction||{})};
}
function openingFor(r){const n=Number(auctionFor(r).openingBid);return Number.isFinite(n)&&n>0?n:0}
function statusFor(r){return String(auctionFor(r).status||'').trim()}
function inactive(r){return /cancel(?:led|ed)?|withdrawn|postponed|\bsold\b|closed/i.test(statusFor(r))}
function vacant(r){const k=String(r?.c?.key||'').toLowerCase(),l=String(r?.c?.label||'').toLowerCase(),u=String(r?.record?.tax_luc_description||'')+' '+String(r?.record?.ext_luc_description||'');return k==='vacant'||/vacant|land only|\blot\b/i.test(`${l} ${u}`)}
function exclusionReason(r){
  if(stageFor(r.parcel)==='pass')return 'Marked Pass';
  if(vacant(r))return 'Vacant land';
  if(inactive(r))return `Inactive auction${statusFor(r)?`: ${statusFor(r)}`:''}`;
  const o=openingFor(r);if(o>=LIMIT)return `Opening bid ${cash(o)} is $25k+`;
  return '';
}
function warnings(r){
  const a=auctionFor(r),o=Number(a.openingBid||0),d=Number(a.deposit||0),ap=Number(a.appraised||a.appraisedValue||0),out=[];
  if(dig(r.parcel).length!==8)out.push('Parcel number needs verification');
  if(!String(r.record?.par_addr_all||a.address||'').trim())out.push('Address missing');
  if(!String(a.status||'').trim())out.push('Auction status missing');
  if(!o)out.push('Opening bid missing');
  if(o>250000)out.push('Opening bid looks unusually high — verify OCR');
  if(d>15000)out.push('Deposit looks unusually high — verify OCR');
  if(d>0&&![2000,5000,10000].includes(Math.round(d)))out.push('Deposit is unusual — verify auction source');
  if(ap>0&&o>ap*5)out.push('Opening bid is far above appraised value — verify data');
  return out;
}
function propertyQuery(r){const a=r.record||{},x=auctionFor(r);return [a.par_addr_all||x.address||'',a.par_city||x.city||'','OH',zipFor(a)||x.zip||''].filter(Boolean).join(' ')}
function typePriority(r){const k=String(r?.c?.key||''),u=unitCount(r);if(k==='multi'||u>=2)return 0;if(k==='single')return 1;if(k==='condo')return 2;if(k==='vacant')return 9;return 3}
function activePriority(r){return inactive(r)?1:0}
function compareSmart(a,b){
  const s=activePriority(a)-activePriority(b);if(s)return s;
  const ao=openingFor(a)||Infinity,bo=openingFor(b)||Infinity;if(ao!==bo)return ao-bo;
  const t=typePriority(a)-typePriority(b);if(t)return t;
  const u=unitCount(b)-unitCount(a);if(u)return u;
  return String(a.record?.par_addr_all||'').localeCompare(String(b.record?.par_addr_all||''));
}
function installStyles(){if(document.getElementById('screenOptStyles'))return;const s=document.createElement('style');s.id='screenOptStyles';s.textContent=`
.screenOptBar{margin:9px 0;padding:10px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.screenOptBar .screenText{font-size:11px;line-height:1.35;color:#1e3a8a;flex:1 1 220px}.screenOptBar button{background:#fff;border:1px solid #93c5fd;color:#1d4ed8}.screenOptBar button.active{background:#1d4ed8;color:#fff}.quickFacts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.qf{padding:7px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;min-width:0}.qf span{display:block;font-size:8px;text-transform:uppercase;color:#6b7280}.qf b{display:block;font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stageBar{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.stageBar button{padding:8px 6px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db}.stageBar button.sel.watch{background:#fef3c7;color:#92400e;border-color:#f59e0b}.stageBar button.sel.research{background:#dcfce7;color:#166534;border-color:#22c55e}.stageBar button.sel.pass{background:#fee2e2;color:#991b1b;border-color:#ef4444}.optWarn{margin-top:7px;padding:7px 8px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;font-size:10px;line-height:1.35;font-weight:750}.optResearch{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px}.optResearch a,.optResearch button{padding:8px 5px;border-radius:8px;background:#f3f4f6;color:#1d4ed8;border:1px solid #d1d5db;text-decoration:none;text-align:center;font-size:10px;font-weight:800}.stageTag{display:inline-block;border-radius:99px;padding:3px 6px;font-size:9px;font-weight:900;margin-left:5px}.stageTag.watch{background:#fef3c7;color:#92400e}.stageTag.research{background:#dcfce7;color:#166534}.stageTag.pass{background:#fee2e2;color:#991b1b}.underwrite,.uw{opacity:.82}.underwrite{background:#e0f2fe!important;color:#0c4a6e!important}.screenStats{font-weight:800}.optToast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100;background:#111827;color:#fff;padding:9px 12px;border-radius:99px;font-size:11px;box-shadow:0 5px 20px #0003}@media(max-width:500px){.quickFacts{grid-template-columns:1fr 1fr}.optResearch{grid-template-columns:1fr 1fr}.screenOptBar button{flex:1}}
`;document.head.appendChild(s)}
function installToolbar(){
  const results=document.getElementById('results');if(!results||document.getElementById('screenOptBar'))return;
  const bar=document.createElement('div');bar.id='screenOptBar';bar.className='screenOptBar';bar.innerHTML=`<div id="screenOptText" class="screenText">Screening active.</div><button id="screenToggle" type="button" class="active">Screened View</button>`;
  const count=document.getElementById('count');count?count.insertAdjacentElement('afterend',bar):results.prepend(bar);
  document.getElementById('screenToggle').onclick=()=>{screened=!screened;const b=document.getElementById('screenToggle');b.classList.toggle('active',screened);b.textContent=screened?'Screened View':'Showing Excluded';if(typeof render==='function')render();};
}
function toast(t){let x=document.getElementById('optToast');if(!x){x=document.createElement('div');x.id='optToast';x.className='optToast';document.body.appendChild(x)}x.textContent=t;clearTimeout(window.__optToastTimer);window.__optToastTimer=setTimeout(()=>x.remove(),1600)}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{}const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}
function copyDetails(r){const a=auctionFor(r),rec=r.record||{},w=warnings(r);return `PROPERTY SCREEN\nAddress: ${rec.par_addr_all||a.address||'Not available'}, ${rec.par_city||a.city||''} ${zipFor(rec)||a.zip||''}\nParcel: ${r.parcel||''}\nType: ${r.c?.label||r.c?.key||''}\nUnits: ${unitCount(r)}\nAuction status: ${a.status||'Not available'}\nOpening bid: ${openingFor(r)?cash(openingFor(r)):'Not available'}\nDeposit: ${Number(a.deposit)>0?cash(a.deposit):'Not available'}\nSale date: ${a.saleDate||'Not available'}\nCase: ${a.caseNumber||'Not available'}\nCounty land use: ${rec.tax_luc_description||rec.ext_luc_description||rec.tax_luc||'Not available'}\nStage: ${stageFor(r.parcel)||'Unmarked'}${w.length?`\nWarnings: ${w.join('; ')}`:''}`}
function addQuickFacts(card,r){if(card.querySelector('.quickFacts'))return;const a=auctionFor(r),q=document.createElement('div');q.className='quickFacts';q.innerHTML=`<div class="qf"><span>Opening Bid</span><b>${esc(openingFor(r)?cash(openingFor(r)):'—')}</b></div><div class="qf"><span>Auction Status</span><b>${esc(a.status||'—')}</b></div><div class="qf"><span>Units</span><b>${esc(unitCount(r))}</b></div><div class="qf"><span>Parcel</span><b>${esc(r.parcel||'—')}</b></div>`;const sub=card.querySelector('.sub')||card.querySelector('.addr');sub?sub.insertAdjacentElement('afterend',q):card.prepend(q)}
function addStage(card,r){
  let bar=card.querySelector('.stageBar');if(!bar){bar=document.createElement('div');bar.className='stageBar';bar.innerHTML=`<button data-stage="watch">⭐ Watch</button><button data-stage="research">✅ Research</button><button data-stage="pass">❌ Pass</button>`;const actions=card.querySelector('.cardactions');actions?actions.insertAdjacentElement('beforebegin',bar):card.appendChild(bar);bar.querySelectorAll('button').forEach(b=>b.onclick=()=>{const cur=stageFor(r.parcel),next=cur===b.dataset.stage?'':b.dataset.stage;setStage(r.parcel,next);if(typeof render==='function')render();});}
  const st=stageFor(r.parcel);bar.querySelectorAll('button').forEach(b=>{b.classList.toggle('sel',b.dataset.stage===st);b.classList.toggle('watch',b.dataset.stage==='watch');b.classList.toggle('research',b.dataset.stage==='research');b.classList.toggle('pass',b.dataset.stage==='pass')});
}
function addWarning(card,r){const old=card.querySelector('.optWarn'),w=warnings(r);if(!w.length){old?.remove();return}if(old){old.textContent=`⚠️ Verify auction data: ${w.join(' • ')}`;return}const x=document.createElement('div');x.className='optWarn';x.textContent=`⚠️ Verify auction data: ${w.join(' • ')}`;const q=card.querySelector('.quickFacts');q?q.insertAdjacentElement('afterend',x):card.appendChild(x)}
function addResearch(card,r){if(card.querySelector('.optResearch'))return;const box=document.createElement('div');box.className='optResearch';const q=encodeURIComponent(propertyQuery(r));box.innerHTML=`<a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Azillow.com+${q}">Zillow</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Aredfin.com+${q}">Redfin</a><a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Arealtor.com+${q}">Realtor</a><button type="button">Copy Details</button>`;box.querySelector('button').onclick=async()=>{await copyText(copyDetails(r));toast('Property details copied')};const actions=card.querySelector('.cardactions');actions?actions.insertAdjacentElement('afterend',box):card.appendChild(box)}
function decorateCards(list){
  const map=new Map(list.map(r=>[dig(r.parcel),r]));
  document.querySelectorAll('.pcard').forEach(card=>{const p=dig(card.querySelector('.copyP')?.dataset?.p||card.dataset.parcel||'');const r=map.get(p)||rowsNow().find(x=>dig(x.parcel)===p);if(!r)return;card.dataset.parcel=p;addQuickFacts(card,r);addStage(card,r);addWarning(card,r);addResearch(card,r);card.querySelectorAll('.underwrite').forEach(b=>b.textContent='🧮 Max Bid (Optional)')});
  document.querySelectorAll('#tbody tr').forEach(tr=>{const p=dig(tr.querySelector('.copyP')?.dataset?.p||'');const r=rowsNow().find(x=>dig(x.parcel)===p);if(!r)return;const st=stageFor(r.parcel),cell=tr.querySelector('td');if(cell){cell.querySelector('.stageTag')?.remove();if(st){const tag=document.createElement('span');tag.className=`stageTag ${st}`;tag.textContent=st==='watch'?'WATCH':st==='research'?'RESEARCH':'PASS';cell.appendChild(tag)}}tr.querySelectorAll('.uw').forEach(b=>b.textContent='Max Bid')});
}
function reorder(list){const order=new Map(list.map((r,i)=>[dig(r.parcel),i]));const cards=document.getElementById('cards');if(cards){[...cards.querySelectorAll('.pcard')].sort((a,b)=>(order.get(dig(a.querySelector('.copyP')?.dataset?.p))??9999)-(order.get(dig(b.querySelector('.copyP')?.dataset?.p))??9999)).forEach(x=>cards.appendChild(x))}const body=document.getElementById('tbody');if(body){[...body.querySelectorAll('tr')].sort((a,b)=>(order.get(dig(a.querySelector('.copyP')?.dataset?.p))??9999)-(order.get(dig(b.querySelector('.copyP')?.dataset?.p))??9999)).forEach(x=>body.appendChild(x))}}
function apply(){
  installToolbar();
  if(typeof shown==='undefined'||!Array.isArray(shown))return;
  const base=[...shown];
  const excluded=base.filter(r=>exclusionReason(r));
  let next=screened?base.filter(r=>!exclusionReason(r)):base;
  const sortSel=document.getElementById('sort');if(!sortSel||sortSel.value==='input')next=[...next].sort(compareSmart);
  shown=next;
  const keep=new Set(next.map(r=>dig(r.parcel)));
  document.querySelectorAll('.pcard').forEach(card=>{const p=dig(card.querySelector('.copyP')?.dataset?.p);card.hidden=!!(p&&!keep.has(p))});
  document.querySelectorAll('#tbody tr').forEach(tr=>{const p=dig(tr.querySelector('.copyP')?.dataset?.p);tr.hidden=!!(p&&!keep.has(p))});
  reorder(next);decorateCards(base);
  const stages=loadStages(),watch=Object.values(stages).filter(x=>x==='watch').length,research=Object.values(stages).filter(x=>x==='research').length,pass=Object.values(stages).filter(x=>x==='pass').length;
  const t=document.getElementById('screenOptText');if(t)t.innerHTML=`<span class="screenStats">${next.length} candidates</span>${screened?` • ${excluded.length} excluded`:''} • ⭐ ${watch} Watch • ✅ ${research} Research • ❌ ${pass} Pass`;
  const b=document.getElementById('screenToggle');if(b)b.textContent=screened?`Screened View${excluded.length?` • ${excluded.length} hidden`:''}`:'Showing Excluded';
  const count=document.getElementById('count');if(count)count.textContent=`Showing ${next.length} of ${base.length}${screened&&excluded.length?` after screening out ${excluded.length}`:''}`;
  const empty=document.getElementById('empty');if(empty)empty.hidden=next.length!==0;
}
function wrapRender(){if(typeof render!=='function'||render.__screenOpt)return;const old=render;render=function(){const x=old.apply(this,arguments);setTimeout(apply,0);return x};render.__screenOpt=true}
installStyles();installToolbar();wrapRender();setTimeout(apply,0);
})();
