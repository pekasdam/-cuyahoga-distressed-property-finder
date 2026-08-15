(()=>{
const STORE='cuyahoga-three-source-arv-v1';
const MIN_ARV=80000;
const $=s=>document.querySelector(s);
const money=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}):'—';
const dig=v=>String(v||'').replace(/\D/g,'');
function readStore(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{}}catch{return{}}}
function saveStore(x){try{localStorage.setItem(STORE,JSON.stringify(x))}catch{}}
function parcel(){try{return dig(current?.parcel||'')}catch{return''}}
function row(){try{return current||null}catch{return null}}
function propertyQuery(){const r=row(),a=r?.record||{};const address=a.par_addr_all||'',city=a.par_city||'Cleveland',z=typeof zip==='function'?zip(a):(a.par_zip||'');return [address,city,'OH',z].filter(Boolean).join(' ')}
function values(p=parcel()){const x=readStore()[p]||{};return{zillow:Number(x.zillow||0),realtor:Number(x.realtor||0),redfin:Number(x.redfin||0),updated:x.updated||null}}
function average(v){return v.zillow>0&&v.realtor>0&&v.redfin>0?(v.zillow+v.realtor+v.redfin)/3:0}
window.threeSourceArvFor=function(p){const v=values(dig(p));const avg=average(v);return{...v,average:avg,qualified:avg>=MIN_ARV,complete:!!avg,min:MIN_ARV}}
function searchUrl(site){return `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${propertyQuery()}`)}`}
function install(){
  const body=$('#autoStatus')?.parentElement;if(!body||$('#threeArvBox'))return false;
  const box=document.createElement('section');box.id='threeArvBox';box.innerHTML=`
  <style>
  #threeArvBox{margin:10px 0;border:2px solid #bfdbfe;background:#eff6ff;border-radius:13px;padding:11px}.threeArvHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.threeArvHead b{font-size:13px}.threeArvRule{font-size:10px;color:#475569;line-height:1.4;margin-top:3px}.threeArvInputs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.threeArvInputs label{font-size:10px;margin-bottom:4px}.threeArvInputs input{padding:8px;font-size:14px}.threeArvLinks{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:7px}.threeArvLinks a{padding:7px;border:1px solid #93c5fd;background:#fff;border-radius:8px;text-align:center;font-size:10px;font-weight:800;color:#1d4ed8;text-decoration:none}.threeArvResult{margin-top:9px;border-radius:10px;padding:9px;background:#fff;border:1px solid #d1d5db}.threeArvResult strong{font-size:19px}.threeArvResult.ok{background:#ecfdf5;border-color:#86efac;color:#166534}.threeArvResult.stop{background:#fef2f2;border-color:#fca5a5;color:#991b1b}.threeArvResult.need{background:#fffbeb;border-color:#fcd34d;color:#92400e}.threeArvUpdated{font-size:9px;color:#6b7280;margin-top:4px}@media(max-width:520px){.threeArvInputs,.threeArvLinks{grid-template-columns:1fr}}
  </style>
  <div class="threeArvHead"><div><b>Official ARV — 3-source average</b><div class="threeArvRule">ARV = (Zillow + Realtor.com + Redfin) ÷ 3. All three current estimates are required. Minimum qualifying ARV: <b>$80,000</b>.</div></div></div>
  <div class="threeArvInputs"><div><label>Zillow estimate</label><input id="arvZillow" type="number" min="0" step="1000" placeholder="$"></div><div><label>Realtor.com estimate</label><input id="arvRealtor" type="number" min="0" step="1000" placeholder="$"></div><div><label>Redfin estimate</label><input id="arvRedfin" type="number" min="0" step="1000" placeholder="$"></div></div>
  <div class="threeArvLinks"><a id="arvZillowLink" target="_blank" rel="noopener">Open Zillow</a><a id="arvRealtorLink" target="_blank" rel="noopener">Open Realtor</a><a id="arvRedfinLink" target="_blank" rel="noopener">Open Redfin</a></div>
  <div id="threeArvResult" class="threeArvResult need"><div id="threeArvLabel">Enter all 3 current estimates</div><strong id="threeArvAvg">—</strong><div id="threeArvUpdated" class="threeArvUpdated"></div></div>`;
  const status=$('#autoStatus');status.insertAdjacentElement('beforebegin',box);
  $('#arvZillowLink').href=searchUrl('zillow.com');$('#arvRealtorLink').href=searchUrl('realtor.com');$('#arvRedfinLink').href=searchUrl('redfin.com');
  ['#arvZillow','#arvRealtor','#arvRedfin'].forEach(sel=>$(sel).addEventListener('input',()=>sync(true)));
  load();return true;
}
function load(){const v=values();const z=$('#arvZillow'),r=$('#arvRealtor'),f=$('#arvRedfin');if(!z||!r||!f)return;z.value=v.zillow||'';r.value=v.realtor||'';f.value=v.redfin||'';sync(false)}
function overrideDecision(avg,complete){
  const box=$('#autoMaxBox'),bid=$('#autoMaxBid'),reason=$('#autoReason'),dec=$('#autoDecision');if(!box||!bid||!reason||!dec)return;
  if(!complete){box.className='maxbox need';bid.textContent='NOT QUALIFIED';reason.textContent='Enter current Zillow, Realtor.com, and Redfin estimates to calculate the official ARV.';dec.className='decision watch';dec.innerHTML='ARV NOT VERIFIED<span class="dsub">All three source estimates are required before this property can qualify.</span>';return;}
  if(avg<MIN_ARV){box.className='maxbox stop';bid.textContent='DO NOT BID';reason.textContent=`3-source average ARV ${money(avg)} is below the $80,000 minimum.`;dec.className='decision skip';dec.innerHTML=`DO NOT BID<span class="dsub">Official 3-source average ARV ${money(avg)} is below $80,000.</span>`;}
}
function sync(userChange){
  const p=parcel();if(!p)return;const z=Number($('#arvZillow')?.value||0),r=Number($('#arvRealtor')?.value||0),f=Number($('#arvRedfin')?.value||0);const complete=z>0&&r>0&&f>0;const avg=complete?(z+r+f)/3:0;
  if(userChange){const s=readStore();s[p]={zillow:z,realtor:r,redfin:f,updated:new Date().toISOString()};saveStore(s)}
  const v=values(p),res=$('#threeArvResult'),label=$('#threeArvLabel'),avgEl=$('#threeArvAvg'),upd=$('#threeArvUpdated');if(!res)return;
  avgEl.textContent=complete?money(avg):'—';
  if(!complete){res.className='threeArvResult need';label.textContent='Enter all 3 current estimates';}
  else if(avg>=MIN_ARV){res.className='threeArvResult ok';label.textContent='QUALIFIES — 3-source average ARV';}
  else{res.className='threeArvResult stop';label.textContent='DOES NOT QUALIFY — ARV below $80,000';}
  upd.textContent=v.updated?`Last updated on this device: ${new Date(v.updated).toLocaleString()}`:'';
  const arvInput=$('#autoArvInput');if(arvInput){const target=complete?Math.round(avg):0;if(Number(arvInput.value)!==target){arvInput.value=target;arvInput.dispatchEvent(new Event('input',{bubbles:true}));}}
  const arvDisplay=$('#autoArv');if(arvDisplay)arvDisplay.textContent=complete?money(avg):'Not verified';
  const source=$('#autoSource');if(source){const suffix=complete?`Official ARV ${money(avg)} = Zillow ${money(z)} + Realtor.com ${money(r)} + Redfin ${money(f)} ÷ 3.`:'Official ARV requires current Zillow, Realtor.com, and Redfin estimates.';source.textContent=suffix+' County sales comps, if shown elsewhere, are secondary checks only.'}
  setTimeout(()=>overrideDecision(avg,complete),0);
  window.dispatchEvent(new CustomEvent('threeSourceArvUpdated',{detail:{parcel:p,average:avg,complete,qualified:avg>=MIN_ARV}}));
}
function keepAuthoritative(){if(!$('#threeArvBox'))return;const v=values(),avg=average(v),complete=!!avg;const input=$('#autoArvInput');if(input){const target=complete?Math.round(avg):0;if(Number(input.value)!==target){input.value=target;input.dispatchEvent(new Event('input',{bubbles:true}));}}overrideDecision(avg,complete)}
function wrapRender(){try{if(typeof render!=='function'||render.__threeArv)return;const old=render;render=function(){const out=old.apply(this,arguments);setTimeout(filterKnownUnder80,0);return out};render.__threeArv=true}catch{}}
function filterKnownUnder80(){try{if(typeof shown==='undefined'||!Array.isArray(shown))return;const reject=new Set(shown.filter(r=>{const x=window.threeSourceArvFor?.(r.parcel);return x?.complete&&!x.qualified}).map(r=>dig(r.parcel)));if(!reject.size)return;shown=shown.filter(r=>!reject.has(dig(r.parcel)));document.querySelectorAll('.pcard').forEach(c=>{const p=dig(c.querySelector('.copyP')?.dataset?.p||c.dataset.parcel||'');if(reject.has(p))c.hidden=true});document.querySelectorAll('#tbody tr').forEach(tr=>{const p=dig(tr.querySelector('.copyP')?.dataset?.p||'');if(reject.has(p))tr.hidden=true});const count=$('#count');if(count&&!/ARV under \$80k/.test(count.textContent))count.textContent+=` • Hidden ${reject.size} with verified ARV under $80k`; }catch{}}
const obs=new MutationObserver(()=>{if(install())setTimeout(sync,0)});obs.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(e.target.closest('.underwrite,.uw'))setTimeout(()=>{install();load()},50)});
window.addEventListener('threeSourceArvUpdated',()=>setTimeout(()=>{try{if(typeof render==='function')render()}catch{}},20));
setInterval(keepAuthoritative,350);
wrapRender();
})();