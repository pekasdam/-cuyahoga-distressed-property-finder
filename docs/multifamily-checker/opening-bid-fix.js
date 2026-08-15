(()=>{
const allRows=()=>{try{return typeof rows!=="undefined"?rows:[]}catch{return[]}};
const digitsOnly=v=>String(v||"").replace(/\D/g,"");
const usd=n=>Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}):"—";

function amountTokens(raw){
  const s=String(raw||"");
  const out=[];
  // Sheriff-sale OCR sometimes drops or misreads the dollar sign. Require either
  // comma-grouped money or cents so dates, ZIP codes, parcel IDs, and case numbers
  // are not mistaken for auction dollars.
  const re=/(?:[$S]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g;
  for(const m of s.matchAll(re)){
    const n=Number(String(m[1]).replace(/,/g,""));
    if(Number.isFinite(n)&&n>=0)out.push(n);
  }
  return out;
}

function robustOpeningBid(raw){
  const s=String(raw||"");
  const explicit=[
    /(?:opening|starting|start|minimum)\s*(?:bid|amount)?\s*[:\-]?\s*[$S]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i,
    /(?:minimum\s+acceptable\s+bid|bid\s+amount|opening\s+amount|starting\s+amount)\s*[:\-]?\s*[$S]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i
  ];
  for(const re of explicit){
    const m=s.match(re);
    if(m){const n=Number(m[1].replace(/,/g,""));if(Number.isFinite(n)&&n>0)return n;}
  }
  if(/\b(?:accepting\s+proxy|accepting\s+pro[xv]y|canceled|cancelled|sold|scheduled|postponed|withdrawn)\b/i.test(s)){
    const vals=amountTokens(s);
    // Cuyahoga sheriff-sale table order: Deposit Requirement, Opening Bid, Appraised Value.
    if(vals.length>=2&&vals[1]>0)return vals[1];
  }
  return null;
}

function robustMoneyFields(raw){
  const vals=amountTokens(raw);
  return{
    deposit:vals.length>=1?vals[0]:null,
    opening:vals.length>=2?vals[1]:null,
    appraised:vals.length>=3?vals[2]:null
  };
}

function findRow(parcel){
  return allRows().find(r=>digitsOnly(r.parcel)===digitsOnly(parcel));
}

function refreshBoldAuction(parcel,bid){
  const r=findRow(parcel);if(!r)return;
  const vals=robustMoneyFields(r.raw);
  const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
  if(bid){
    set("autoOpen",usd(bid));
    set("boldOpeningBid",usd(bid));
    const maxText=document.getElementById("autoMaxBid")?.textContent||"";
    const max=Number(maxText.replace(/[^\d.\-]/g,""));
    if(Number.isFinite(max)&&max>0){
      const room=max-bid;
      set("boldBidRoom",`${room>=0?"+":"-"}${usd(Math.abs(room))}`);
      const box=document.getElementById("boldBidRoom")?.parentElement;
      if(box){box.classList.remove("positive","negative");box.classList.add(room>=0?"positive":"negative");}
    }
  }
  if(vals.deposit!==null)set("boldDeposit",usd(vals.deposit));
  if(vals.appraised!==null)set("boldAppraised",usd(vals.appraised));
}

function install(){
  if(typeof window.openUW!=="function"||window.openUW.__openingBidFix)return;
  const original=window.openUW;
  const wrapped=async function(parcel){
    const r=findRow(parcel);
    const bid=r?robustOpeningBid(r.raw):null;
    if(r&&bid){
      // Canonical labeled value makes the core max-bid calculator and the auction
      // summary use the same actual opening bid, even if OCR omitted "$".
      r.raw=String(r.raw||"").replace(/\n?OCR Opening Bid:\s*[^\n]*/gi,"");
      r.raw+=`\nOCR Opening Bid: $${bid.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    }
    const result=await original(parcel);
    refreshBoldAuction(parcel,bid);
    return result;
  };
  wrapped.__openingBidFix=true;
  window.openUW=wrapped;
}

install();
const oldRender=window.render;
if(typeof oldRender==="function"&&!oldRender.__openingBidFix){
  const rr=function(){const x=oldRender.apply(this,arguments);setTimeout(install,0);return x};
  rr.__openingBidFix=true;window.render=rr;
}
})();
