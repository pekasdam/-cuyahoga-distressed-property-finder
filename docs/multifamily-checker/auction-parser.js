(()=>{
const STATUS_PATTERNS=[
  [/\baccepting\s+proxy\b/i,"Accepting Proxy"],
  [/\bproxy\s+bidding\s+open\b/i,"Accepting Proxy"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(sold)\b/i,"Sold"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(cancel(?:led|ed))\b/i,"Cancelled"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(withdrawn)\b/i,"Withdrawn"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(postponed)\b/i,"Postponed"],
  [/\b(?:auction\s+)?status\s*[:\-]?\s*(scheduled)\b/i,"Scheduled"],
  [/\bno\s+bid\b/i,"No Bid"]
];

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
    if(m){
      const n=Number(m[1].replace(/,/g,""));
      if(Number.isFinite(n)&&n>0)return n;
    }
  }
  return null;
}

window.parseAuctionInfo=raw=>({status:auctionStatus(raw),openingBid:auctionOpeningBid(raw)});

// Preserve the whole auction listing around each parcel instead of only the parcel line.
// That lets the underwriting engine see status and starting-bid fields that are on nearby lines.
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

function addAuctionStatusUI(){
  const metrics=document.querySelector("#modal .metrics");
  if(!metrics)return;
  let status=document.getElementById("autoAuctionStatus");
  if(!status){
    const box=document.createElement("div");
    box.className="metric";
    box.innerHTML='<span>Auction Status</span><b id="autoAuctionStatus">—</b>';
    metrics.insertBefore(box,metrics.firstChild);
    status=document.getElementById("autoAuctionStatus");
  }
  const open=document.getElementById("autoOpen");
  if(open&&open.parentElement){const label=open.parentElement.querySelector("span");if(label)label.textContent="Starting / Opening Bid";}
}

function updateAuctionUI(parcel){
  addAuctionStatusUI();
  const r=(window.rows||[]).find(x=>String(x.parcel||"").replace(/\D/g,"")===String(parcel||"").replace(/\D/g,""));
  if(!r)return;
  const info=window.parseAuctionInfo(r.raw);
  const status=document.getElementById("autoAuctionStatus");
  if(status)status.textContent=info.status||"Not found";
  const open=document.getElementById("autoOpen");
  if(open&&info.openingBid)open.textContent=info.openingBid.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});
  const source=document.getElementById("autoSource");
  if(source&&info.status==="Accepting Proxy"){
    const note=' <b>Auction:</b> Accepting Proxy is the auction status, not the opening-bid amount.';
    if(!source.innerHTML.includes("Accepting Proxy is the auction status"))source.innerHTML+=note;
  }
}

function wrapOpen(){
  if(typeof window.openUW!=="function"||window.openUW.__auctionWrapped)return;
  const original=window.openUW;
  const wrapped=async function(parcel){
    const r=(window.rows||[]).find(x=>String(x.parcel||"").replace(/\D/g,"")===String(parcel||"").replace(/\D/g,""));
    if(r){
      const info=window.parseAuctionInfo(r.raw);
      if(info.openingBid&&!/(?:opening|starting|minimum)\s*(?:bid|amount)?\s*[:\-]?\s*\$?\s*[\d,]+/i.test(String(r.raw||""))){
        r.raw=String(r.raw||"")+`\nOpening Bid: $${info.openingBid.toLocaleString("en-US")}`;
      }
    }
    const result=await original(parcel);
    updateAuctionUI(parcel);
    return result;
  };
  wrapped.__auctionWrapped=true;
  window.openUW=wrapped;
}

addAuctionStatusUI();
wrapOpen();
const originalRender=window.render;
if(typeof originalRender==="function"&&!originalRender.__auctionWrapped){
  const r=function(){const out=originalRender.apply(this,arguments);setTimeout(wrapOpen,0);return out;};
  r.__auctionWrapped=true;
  window.render=r;
}
})();