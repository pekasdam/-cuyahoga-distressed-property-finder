(()=>{
const STATUS_PATTERNS=[
  [/\baccepting\s+proxy\b/i,"Accepting Proxy"],
  [/\bproxy\s+bidding\s+open\b/i,"Accepting Proxy"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(sold)\b/i,"Sold"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(cancel(?:led|ed))\b/i,"Canceled"],
  [/\bcancel(?:led|ed)\b/i,"Canceled"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(withdrawn)\b/i,"Withdrawn"],
  [/\bwithdrawn\b/i,"Withdrawn"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(postponed)\b/i,"Postponed"],
  [/\bpostponed\b/i,"Postponed"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(scheduled)\b/i,"Scheduled"],
  [/\bno\s+bid\b/i,"No Bid"]
];

const allRows=()=>{try{return typeof rows!=="undefined"?rows:[]}catch{return[]}};
const dollars=s=>[...String(s||"").matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replace(/,/g,""))).filter(Number.isFinite);
const money=n=>Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}):"—";

function auctionStatus(raw){
  const s=String(raw||"");
  for(const [re,label] of STATUS_PATTERNS) if(re.test(s)) return label;
  const m=s.match(/(?:auction\s+)?status\s*[:\-]?\s*([^\n|]{2,40})/i);
  return m?m[1].trim():"Not found";
}

function auctionOpeningBid(raw){
  const s=String(raw||"");
  const patterns=[
    /(?:opening|starting|start|minimum)\s*(?:bid|amount)?\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:opening|starting|start|minimum)\s*(?:bid|amount)?\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:minimum\s+acceptable\s+bid|bid\s+amount|opening\s+amount|starting\s+amount)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  ];
  for(const re of patterns){
    const m=s.match(re);
    if(m){const n=Number(m[1].replace(/,/g,""));if(Number.isFinite(n)&&n>0)return n;}
  }
  // Cuyahoga Sheriff Sale table rows list three currency fields in order:
  // Deposit Requirement, Opening Bid, Appraised Value. This fallback lets
  // screenshot OCR recover the Opening Bid even when the column heading is
  // only shown once at the top of the table.
  if(/\b(?:accepting\s+proxy|canceled|cancelled|sold|scheduled|postponed|withdrawn)\b/i.test(s)){
    const vals=dollars(s);
    if(vals.length>=2 && vals[1]>0)return vals[1];
  }
  return null;
}

function parseDateFields(raw){
  const dates=[...String(raw||"").matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m=>m[1]);
  return{saleDate:dates[0]||"Not found",addDate:dates[1]||"Not found"};
}
function parseCase(raw){
  const m=String(raw||"").match(/\b(CV\d{6,})\b/i);
  return m?m[1].toUpperCase():"Not found";
}
function parseMoneyFields(raw){
  const vals=dollars(raw);
  return{
    deposit: vals.length>=1?vals[0]:null,
    appraised: vals.length>=3?vals[2]:null
  };
}
function parseAuctionInfo(raw){
  const d=parseDateFields(raw), m=parseMoneyFields(raw);
  return{
    status:auctionStatus(raw),
    openingBid:auctionOpeningBid(raw),
    deposit:m.deposit,
    appraised:m.appraised,
    saleDate:d.saleDate,
    addDate:d.addDate,
    caseNumber:parseCase(raw)
  };
}
window.parseAuctionInfo=parseAuctionInfo;

// Preserve the whole auction listing around each parcel instead of only the parcel line.
// This is especially important for OCR where a sheriff-sale table row may wrap onto
// several text lines before the parcel number appears.
if(typeof window.extract==="function"){
  window.extract=function(text){
    const lines=String(text||"").split(/\r?\n/);
    const hits=[];
    for(let i=0;i<lines.length;i++){
      const found=[];
      for(const x of lines[i].match(/\b\d{3}\s*-\s*\d{2}\s*-\s*\d{3}\b/g)||[])found.push(String(x).replace(/\D/g,""));
      for(const x of lines[i].match(/\b\d{8}\b/g)||[])found.push(x);
      for(const parcel of [...new Set(found)])hits.push({parcel,line:i});
    }
    if(!hits.length)return[];
    const firstByParcel=new Map();
    for(const h of hits)if(!firstByParcel.has(h.parcel))firstByParcel.set(h.parcel,h);
    const uniq=[...firstByParcel.values()].sort((a,b)=>a.line-b.line);
    return uniq.map((h,index)=>{
      const prev=index?uniq[index-1].line:-1;
      const next=index<uniq.length-1?uniq[index+1].line:lines.length;
      const start=index?Math.floor((prev+h.line)/2)+1:0;
      const end=index<uniq.length-1?Math.floor((h.line+next)/2):lines.length-1;
      const raw=lines.slice(Math.max(0,start),Math.min(lines.length,end+1)).join("\n").trim();
      return{parcel:h.parcel,raw,index};
    });
  };
}

function installStyles(){
  if(document.getElementById("auctionSummaryStyles"))return;
  const s=document.createElement("style");s.id="auctionSummaryStyles";
  s.textContent=`
  .auctionHero{margin:10px 0;border:2px solid #0f766e;border-radius:14px;padding:11px;background:#f0fdfa}
  .auctionHeroTitle{font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:#115e59;margin-bottom:8px}
  .auctionHeroGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .auctionHeroItem{background:#fff;border:1px solid #99f6e4;border-radius:10px;padding:9px}
  .auctionHeroItem span{display:block;font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800}
  .auctionHeroItem b{display:block;font-size:19px;line-height:1.15;margin-top:3px;color:#0f172a;overflow-wrap:anywhere}
  .auctionHeroItem.primary b{font-size:24px;color:#115e59}
  .auctionHeroItem.room.positive b{color:#166534}.auctionHeroItem.room.negative b{color:#991b1b}
  .auctionMeta{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
  .auctionMeta .auctionHeroItem b{font-size:14px}
  @media(max-width:480px){.auctionHeroGrid{grid-template-columns:1fr 1fr}.auctionMeta{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s);
}

function addAuctionSummaryUI(){
  installStyles();
  const body=document.querySelector("#modal .mbody");
  if(!body||document.getElementById("auctionHero"))return;
  const decision=document.getElementById("autoDecision");
  const hero=document.createElement("div");hero.id="auctionHero";hero.className="auctionHero";
  hero.innerHTML=`<div class="auctionHeroTitle">Auction & Bid Summary</div>
    <div class="auctionHeroGrid">
      <div class="auctionHeroItem primary"><span>Starting / Opening Bid</span><b id="boldOpeningBid">—</b></div>
      <div class="auctionHeroItem primary"><span>Recommended Max Bid</span><b id="boldMaxBid">—</b></div>
      <div class="auctionHeroItem room"><span>Bidding Room</span><b id="boldBidRoom">—</b></div>
      <div class="auctionHeroItem"><span>Auction Status</span><b id="boldAuctionStatus">—</b></div>
    </div>
    <div class="auctionMeta">
      <div class="auctionHeroItem"><span>Deposit Required</span><b id="boldDeposit">—</b></div>
      <div class="auctionHeroItem"><span>Sale Date</span><b id="boldSaleDate">—</b></div>
      <div class="auctionHeroItem"><span>Case Number</span><b id="boldCase">—</b></div>
      <div class="auctionHeroItem"><span>Parcel</span><b id="boldParcel">—</b></div>
      <div class="auctionHeroItem"><span>Property</span><b id="boldAddress">—</b></div>
      <div class="auctionHeroItem"><span>Appraised Value</span><b id="boldAppraised">—</b></div>
    </div>`;
  if(decision)decision.insertAdjacentElement("afterend",hero);else body.prepend(hero);
}

function addAuctionStatusMetric(){
  const metrics=document.querySelector("#modal .metrics");
  if(!metrics)return;
  let status=document.getElementById("autoAuctionStatus");
  if(!status){const box=document.createElement("div");box.className="metric";box.innerHTML='<span>Auction Status</span><b id="autoAuctionStatus">—</b>';metrics.insertBefore(box,metrics.firstChild);}
  const open=document.getElementById("autoOpen");
  if(open&&open.parentElement){const label=open.parentElement.querySelector("span");if(label)label.textContent="Starting / Opening Bid";}
}

function updateAuctionUI(parcel){
  addAuctionSummaryUI();addAuctionStatusMetric();
  const r=allRows().find(x=>String(x.parcel||"").replace(/\D/g,"")===String(parcel||"").replace(/\D/g,""));
  if(!r)return;
  const info=parseAuctionInfo(r.raw), a=r.record||{};
  const status=document.getElementById("autoAuctionStatus");if(status)status.textContent=info.status||"Not found";
  const open=document.getElementById("autoOpen");if(open)open.textContent=info.openingBid?money(info.openingBid):"Not found";
  const maxText=document.getElementById("autoMaxBid")?.textContent||"—";
  const maxVal=Number(maxText.replace(/[^\d.\-]/g,""))||null;
  const room=info.openingBid&&maxVal!==null?maxVal-info.openingBid:null;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  set("boldOpeningBid",info.openingBid?money(info.openingBid):"Not found");
  set("boldMaxBid",maxText);
  set("boldBidRoom",room===null?"—":`${room>=0?"+":"-"}${money(Math.abs(room))}`);
  const roomBox=document.getElementById("boldBidRoom")?.parentElement;if(roomBox){roomBox.classList.remove("positive","negative");if(room!==null)roomBox.classList.add(room>=0?"positive":"negative");}
  set("boldAuctionStatus",info.status||"Not found");set("boldDeposit",info.deposit!==null?money(info.deposit):"Not found");set("boldSaleDate",info.saleDate||"Not found");set("boldCase",info.caseNumber||"Not found");set("boldParcel",typeof fmt==="function"?fmt(r.parcel):String(r.parcel||"—"));
  set("boldAddress",[a.par_addr_all,a.par_city,typeof zip==="function"?zip(a):a.par_zip].filter(Boolean).join(", ")||"Not found");set("boldAppraised",info.appraised!==null?money(info.appraised):"Not found");
  const source=document.getElementById("autoSource");
  if(source&&info.status==="Accepting Proxy"){
    const note=' <b>Auction:</b> Accepting Proxy is the auction status; the dollar figure above is the actual opening bid.';
    if(!source.innerHTML.includes("Accepting Proxy is the auction status"))source.innerHTML+=note;
  }
  if(["Canceled","Withdrawn","Sold","Postponed"].includes(info.status)){
    const max=document.getElementById("autoMaxBid"),reason=document.getElementById("autoReason"),dec=document.getElementById("autoDecision"),box=document.getElementById("autoMaxBox");
    if(max)max.textContent="DO NOT BID";if(reason)reason.textContent=`Auction status is ${info.status}.`;if(box)box.className="maxbox stop";if(dec){dec.className="decision skip";dec.innerHTML=`DO NOT BID<span class="dsub">Auction status is ${info.status}.</span>`;}set("boldMaxBid","DO NOT BID");set("boldBidRoom","—");
  }
}

function wrapOpen(){
  if(typeof window.openUW!=="function"||window.openUW.__auctionWrapped)return;
  const original=window.openUW;
  const wrapped=async function(parcel){
    const r=allRows().find(x=>String(x.parcel||"").replace(/\D/g,"")===String(parcel||"").replace(/\D/g,""));
    if(r){const info=parseAuctionInfo(r.raw);if(info.openingBid&&!/(?:opening|starting|minimum)\s*(?:bid|amount)?\s*[:\-]?\s*\$?\s*[\d,]+/i.test(String(r.raw||"")))r.raw=String(r.raw||"")+`\nOpening Bid: $${info.openingBid.toLocaleString("en-US")}`;}
    const result=await original(parcel);
    updateAuctionUI(parcel);
    return result;
  };
  wrapped.__auctionWrapped=true;window.openUW=wrapped;
}

addAuctionSummaryUI();addAuctionStatusMetric();wrapOpen();
const originalRender=window.render;
if(typeof originalRender==="function"&&!originalRender.__auctionWrapped){
  const rr=function(){const out=originalRender.apply(this,arguments);setTimeout(wrapOpen,0);return out;};rr.__auctionWrapped=true;window.render=rr;
}
})();