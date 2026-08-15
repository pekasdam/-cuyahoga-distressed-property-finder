(()=>{
const AUTO_STORE="cuyahoga-auto-underwriting-v3";
const FMR={
  "44105":[780,890,1070,1380,1470],"44112":[790,890,1080,1390,1490],"44120":[880,1000,1210,1560,1660],
  "44128":[910,1030,1250,1610,1720],"44106":[1060,1200,1450,1870,2000],"44114":[1300,1470,1780,2290,2450],
  "44118":[1090,1230,1490,1920,2050],"44121":[1040,1180,1420,1830,1950],"44124":[1080,1220,1480,1900,2040]
};
const COUNTY=[990,1120,1350,1740,1860];
const modalEl=document.getElementById("modal");
if(!modalEl || typeof rows==="undefined") return;

const style=document.createElement("style");
style.textContent=`
.autoStatus{border:1px solid #bfdbfe;background:#eff6ff;border-radius:11px;padding:10px;margin:10px 0;font-size:12px;line-height:1.45}.autoStatus.loading{background:#f9fafb;border-color:#d1d5db;color:#6b7280}.sourceLine{font-size:11px;color:#6b7280;line-height:1.4;margin-top:9px}.adjust{margin-top:12px;border:1px solid #d1d5db;border-radius:11px;background:#fff}.adjust summary{cursor:pointer;font-weight:800;padding:11px}.adjust .inputs{padding:0 11px 11px}.amount.auto{font-size:38px}.researchGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.researchItem{border:1px solid #d1d5db;border-radius:9px;padding:8px;background:#f9fafb}.researchItem span{display:block;font-size:9px;color:#6b7280;text-transform:uppercase}.researchItem b{display:block;font-size:14px;margin-top:3px}@media(max-width:420px){.researchGrid{grid-template-columns:1fr 1fr}}
`;
document.head.appendChild(style);

modalEl.innerHTML=`<section class="sheet"><div class="mhead"><div><h2>Auto Underwrite & Max Bid</h2><div id="autoProp" class="small"></div></div><button id="autoClose" class="close">×</button></div><div class="mbody"><div class="rule"><b>Automatic buy-box:</b> ARV must be at least $80,000 • 1% rent rule • max $65,000 all-in • preferred $40,000 all-in • 70% ARV acquisition ceiling • vacant land = no bid.</div><div id="autoStatus" class="autoStatus loading"><b>Analyzing this property…</b><br>Estimating rent, rehab, other costs, ARV from county sales comps, and your maximum bid.</div><div id="autoMaxBox" class="maxbox need"><div class="eyebrow">Recommended Maximum Bid</div><div id="autoMaxBid" class="amount auto">—</div><div id="autoReason" class="caption">Running automatic underwriting…</div></div><div id="autoDecision" class="decision watch">ANALYZING<span class="dsub">The app is researching this deal automatically.</span></div><div class="researchGrid"><div class="researchItem"><span>Estimated Rent</span><b id="autoRent">—</b></div><div class="researchItem"><span>Estimated ARV</span><b id="autoArv">—</b></div><div class="researchItem"><span>Rehab Allowance</span><b id="autoRehab">—</b></div><div class="researchItem"><span>Other Costs</span><b id="autoOther">—</b></div></div><div class="metrics"><div class="metric"><span>Opening Bid</span><b id="autoOpen">—</b></div><div class="metric"><span>Preferred Bid</span><b id="autoPref">—</b></div><div class="metric"><span>1% Max All-In</span><b id="autoRentCap">—</b></div><div class="metric"><span>70% ARV All-In</span><b id="autoArvCap">—</b></div><div class="metric"><span>Max All-In Used</span><b id="autoAllIn">—</b></div><div class="metric"><span>75% Refi Ceiling</span><b id="autoRefi75">—</b></div></div><div id="autoRefi" class="refi"><b>Refi check:</b> Calculating from the estimated ARV.</div><div id="autoSource" class="sourceLine"></div><ul id="autoNotes" class="notes"></ul><details class="adjust"><summary>Adjust assumptions manually (optional)</summary><div class="inputs"><div><label>Monthly Rent</label><input id="autoRentInput" type="number" min="0" step="25"></div><div><label>ARV</label><input id="autoArvInput" type="number" min="0" step="1000"></div><div><label>Rehab Allowance</label><input id="autoRehabInput" type="number" min="0" step="500"></div><div><label>Other Costs</label><input id="autoOtherInput" type="number" min="0" step="100"></div></div></details><div class="save">Automatic estimates are screening assumptions, not an appraisal or contractor bid. Any manual changes are saved on this device for this parcel.</div></div></section>`;

const q=s=>document.querySelector(s);
const moneyAuto=n=>Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}):"—";
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const loadStore=()=>{try{return JSON.parse(localStorage.getItem(AUTO_STORE)||"{}")||{}}catch{return{}}};
const loadSaved=p=>loadStore()[digits(p)]||{};
const saveAuto=(p,d)=>{try{const s=loadStore();s[digits(p)]={...d,t:Date.now()};localStorage.setItem(AUTO_STORE,JSON.stringify(s))}catch{}};
const inputNum=id=>{const n=Number(q(id)?.value);return Number.isFinite(n)&&n>=0?n:0};

function openingBid(raw){
  for(const re of [
    /(?:opening|starting|start|minimum)\s*(?:bid)?\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:bid\s*amount|opening\s*amount)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  ]){
    const m=String(raw||"").match(re); if(m){const n=Number(m[1].replace(/,/g,"")); if(n>0)return n}
  }
  return null;
}

function bedroomEstimate(r){
  const a=r.record||{}, u=Math.max(1,unit(a,r.c)||1), sf=Number(a.total_res_liv_area||0)/u;
  if(r.c.key==="multi") return sf>=1250?3:2;
  if(sf>1600)return 4; if(sf>=900)return 3; return 2;
}
function rentEstimate(r){
  const z=zip(r.record), b=bedroomEstimate(r), table=FMR[z]||COUNTY, u=Math.max(1,unit(r.record,r.c)||1);
  const perUnit=table[Math.min(4,Math.max(0,b))]||table[2];
  const rent=Math.round((perUnit*u)/25)*25;
  return {rent,b,u,perUnit,source:FMR[z]?`HUD-style ZIP benchmark for ${z}`:"Cuyahoga County rent benchmark fallback"};
}
function rehabEstimate(r){
  const a=r.record||{}, sf=Number(a.total_res_liv_area||0), u=Math.max(1,unit(a,r.c)||1); let x;
  if(r.c.key==="condo") x=Math.max(10000,Math.min(25000,sf?sf*12:15000));
  else if(r.c.key==="multi") x=Math.max(25000,Math.min(45000,Math.max(u*14000,sf?sf*18:30000)));
  else x=Math.max(18000,Math.min(35000,sf?sf*18:25000));
  return Math.round(x/1000)*1000;
}
function otherEstimate(r){return Math.max(1,unit(r.record,r.c)||1)>=3?6000:5000}

async function compQuery(layer,r,mode){
  const a=r.record||{}, c=center(a), luc=String(a.tax_luc||"").trim();
  const params={outFields:"parcelpin,parcel_id,par_addr_all,par_city,par_zip,tax_luc,total_res_liv_area,sales_amount,transfer_date",returnGeometry:"false",f:"json",resultRecordCount:"250"};
  if(mode==="near"&&c){
    Object.assign(params,{where:luc?`tax_luc='${luc}' AND sales_amount >= 30000`:"sales_amount >= 30000",geometry:`${c.lng},${c.lat}`,geometryType:"esriGeometryPoint",inSR:"4326",spatialRel:"esriSpatialRelIntersects",distance:"1.5",units:"esriSRUnit_StatuteMile"});
  }else{
    const z=zip(a); params.where=[z?`par_zip=${Number(z)}`:"1=1",luc?`tax_luc='${luc}'`:null,"sales_amount >= 30000"].filter(Boolean).join(" AND ");
  }
  const res=await fetch(`${layer}?${new URLSearchParams(params)}`); if(!res.ok)throw Error(`County comps ${res.status}`);
  const j=await res.json(); if(j.error)throw Error(j.error.message||"County comps query error");
  return (j.features||[]).map(f=>f.attributes||{});
}

async function estimateArv(r){
  const cutoff=Date.now()-1000*60*60*24*365*3.5, sf=Number(r.record?.total_res_liv_area||0), subject=digits(r.parcel); let comps=[];
  for(const mode of ["near","zip"]){
    const settled=await Promise.allSettled(LAYERS.map(l=>compQuery(l,r,mode)));
    comps=settled.flatMap(x=>x.status==="fulfilled"?x.value:[]).filter(x=>{
      const p=digits(x.parcelpin||x.parcel_id), sale=Number(x.sales_amount||0), dt=Number(x.transfer_date||0), ar=Number(x.total_res_liv_area||0);
      return p&&p!==subject&&sale>=30000&&sale<=500000&&(!dt||dt>=cutoff)&&(!sf||!ar||(ar>=sf*.55&&ar<=sf*1.8));
    });
    if(comps.length>=3)break;
  }
  if(!comps.length){
    const last=Number(r.record?.sales_amount||0);
    if(last>=50000)return{arv:Math.round(last/5000)*5000,count:0,source:"Fallback to county last-sale amount because nearby comparable sales were unavailable"};
    return{arv:0,count:0,source:"No reliable comparable county sales returned"};
  }
  const ppsf=sf?comps.map(x=>{const ar=Number(x.total_res_liv_area||0),s=Number(x.sales_amount||0);return ar>0?s/ar:null}).filter(x=>x>15&&x<300):[];
  let arv=sf&&ppsf.length>=3?median(ppsf)*sf:median(comps.map(x=>Number(x.sales_amount||0)));
  arv=Math.max(40000,Math.min(300000,arv||0));
  return{arv:Math.round(arv/5000)*5000,count:comps.length,source:`Median of ${comps.length} recent county comparable sale${comps.length===1?"":"s"}${sf&&ppsf.length>=3?" adjusted for living area":""}`};
}

function autoCalc(r,d){
  const opening=openingBid(r.raw), rentCap=d.rent*100, arvCap=d.arv*.70;
  const maxAll=Math.min(rentCap||Infinity,arvCap||Infinity,65000), prefAll=Math.min(rentCap||Infinity,arvCap||Infinity,40000);
  const maxBid=Math.max(0,maxAll-d.rehab-d.other), prefBid=Math.max(0,prefAll-d.rehab-d.other), refi75=d.arv*.75;
  const notes=[]; let key="buy", label="BID UP TO", reason=maxBid>0?`Do not exceed ${moneyAuto(maxBid)} using the automatic assumptions below.`:"No positive bid remains after rehab and other costs.";
  if(r.c.key==="vacant"){key="skip";label="DO NOT BID";reason="Vacant land does not fit this rental strategy."}
  else if(!d.arv){key="watch";label="REVIEW";reason="A reliable ARV estimate was not available automatically."}
  else if(d.arv<80000){key="skip";label="DO NOT BID";reason=`Estimated ARV ${moneyAuto(d.arv)} is below the $80,000 refinance threshold.`}
  else if(maxBid<=0){key="skip";label="DO NOT BID";reason="Estimated rehab and other costs consume the allowable all-in budget."}
  else if(opening&&opening>maxBid){key="skip";label="DO NOT BID";reason=`Opening bid ${moneyAuto(opening)} is above the calculated maximum ${moneyAuto(maxBid)}.`}
  if(opening&&opening<=maxBid)notes.push(`Opening bid ${moneyAuto(opening)} is ${moneyAuto(maxBid-opening)} below the calculated ceiling.`);
  notes.push(`1% rule allows ${moneyAuto(rentCap)} all-in from estimated rent ${moneyAuto(d.rent)}/month.`);
  if(d.arv)notes.push(`70% of ARV allows ${moneyAuto(arvCap)} all-in from estimated ARV ${moneyAuto(d.arv)}.`);
  notes.push("Strategy cap is $65,000 all-in; $40,000 is the preferred zone.");
  notes.push(`Automatic rehab allowance ${moneyAuto(d.rehab)} plus other-cost allowance ${moneyAuto(d.other)}.`);
  if(r.c.key==="multi")notes.push("Multifamily rent uses total estimated rent across detected units.");
  if(r.c.key==="condo")notes.push("Verify HOA dues, special assessments, insurance, and rental restrictions before bidding.");
  return{opening,rentCap,arvCap,maxAll,maxBid,prefBid,refi75,notes,key,label,reason};
}

function readInputs(){return{rent:inputNum("#autoRentInput"),arv:inputNum("#autoArvInput"),rehab:inputNum("#autoRehabInput"),other:inputNum("#autoOtherInput")}}
function drawAuto(){
  if(!current)return; const d=readInputs(), x=autoCalc(current,d); saveAuto(current.parcel,d);
  const box=q("#autoMaxBox"),dec=q("#autoDecision");
  box.className=`maxbox ${x.key==="skip"?"stop":x.key==="watch"?"need":""}`.trim();
  q("#autoMaxBid").textContent=x.key==="skip"?"DO NOT BID":x.maxBid?moneyAuto(x.maxBid):"—"; q("#autoReason").textContent=x.reason;
  dec.className=`decision ${x.key==="buy"?"buy":x.key==="skip"?"skip":"watch"}`; dec.innerHTML=`${esc(x.label)}<span class="dsub">${esc(x.reason)}</span>`;
  q("#autoRent").textContent=d.rent?moneyAuto(d.rent)+"/mo":"—"; q("#autoArv").textContent=d.arv?moneyAuto(d.arv):"—"; q("#autoRehab").textContent=d.rehab?moneyAuto(d.rehab):"—"; q("#autoOther").textContent=d.other?moneyAuto(d.other):"—";
  q("#autoOpen").textContent=x.opening?moneyAuto(x.opening):"Not found"; q("#autoPref").textContent=x.prefBid?moneyAuto(x.prefBid):"—"; q("#autoRentCap").textContent=x.rentCap?moneyAuto(x.rentCap):"—"; q("#autoArvCap").textContent=x.arvCap?moneyAuto(x.arvCap):"—"; q("#autoAllIn").textContent=Number.isFinite(x.maxAll)?moneyAuto(x.maxAll):"—"; q("#autoRefi75").textContent=x.refi75?moneyAuto(x.refi75):"—";
  q("#autoRefi").innerHTML=d.arv?`<b>Refi check:</b> Estimated ARV ${moneyAuto(d.arv)} • 70% safety ceiling ${moneyAuto(x.arvCap)} • illustrative 75% ceiling ${moneyAuto(x.refi75)}. The bid formula uses 70% for cushion.`:"<b>Refi check:</b> A reliable ARV estimate was not available.";
  q("#autoNotes").innerHTML=x.notes.map(n=>`<li>${esc(n)}</li>`).join("");
}

openUW=async function(p){
  current=rows.find(r=>digits(r.parcel)===digits(p)); if(!current)return;
  const a=current.record||{}, saved=loadSaved(current.parcel), re=rentEstimate(current);
  q("#autoProp").textContent=`${fmt(current.parcel)} • ${[a.par_addr_all,a.par_city,zip(a)].filter(Boolean).join(", ")} • ${current.c.label}`;
  q("#autoRentInput").value=saved.rent||re.rent; q("#autoRehabInput").value=saved.rehab||rehabEstimate(current); q("#autoOtherInput").value=saved.other||otherEstimate(current); q("#autoArvInput").value=saved.arv||"";
  modalEl.hidden=false; document.body.style.overflow="hidden";
  q("#autoStatus").className="autoStatus loading"; q("#autoStatus").innerHTML="<b>Analyzing this property…</b><br>Estimating rent, rehab, ARV, and your maximum bid.";
  drawAuto();
  let ai={arv:Number(saved.arv||0),source:saved.arv?"Saved ARV assumption":""};
  if(!saved.arv){try{ai=await estimateArv(current); if(ai.arv)q("#autoArvInput").value=ai.arv}catch(e){ai={arv:0,source:`ARV comp lookup failed: ${e?.message||e}`}}}
  drawAuto();
  q("#autoStatus").className="autoStatus"; q("#autoStatus").innerHTML="<b>Automatic underwriting complete.</b><br>Rent, rehab, ARV, and maximum bid were estimated automatically. Manual adjustment is optional.";
  q("#autoSource").innerHTML=`<b>Auto research:</b> Rent ${moneyAuto(Number(q("#autoRentInput").value))}/mo from ${esc(re.source)} (${re.b}-BR estimate × ${re.u} unit${re.u===1?"":"s"}). ARV ${Number(q("#autoArvInput").value)?moneyAuto(Number(q("#autoArvInput").value)):"unavailable"} — ${esc(ai.source||"saved assumption")}.`;
};
closeUW=function(){modalEl.hidden=true;document.body.style.overflow="";current=null};
function rebind(){document.querySelectorAll(".openUW").forEach(btn=>{btn.onclick=()=>openUW(btn.dataset.p);btn.textContent=btn.classList.contains("underwrite")?"🤖 Auto Underwrite & Max Bid":"Auto Underwrite"})}
q("#autoClose").onclick=closeUW;
modalEl.onclick=e=>{if(e.target===modalEl)closeUW()};
["#autoRentInput","#autoArvInput","#autoRehabInput","#autoOtherInput"].forEach(id=>q(id).addEventListener("input",drawAuto));
const originalRender=render;
render=function(){originalRender();rebind()};
rebind();
})();