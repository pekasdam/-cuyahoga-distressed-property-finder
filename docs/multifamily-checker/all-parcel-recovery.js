(()=>{
const dig=v=>String(v||'').replace(/\D/g,'');
const uniqueParcels=text=>{
  const src=String(text||''),hits=[];
  const add=(parcel,index)=>{parcel=dig(parcel);if(parcel.length===8)hits.push({parcel,index:Number(index)||0});};
  for(const m of src.matchAll(/\b(\d{3})\s*[-–—]?\s*(\d{2})\s*[-–—]?\s*(\d{3})\b/g))add(m[1]+m[2]+m[3],m.index);
  for(const m of src.matchAll(/\b(\d{8})\b/g))add(m[1],m.index);
  for(const m of src.matchAll(/\b44\d{3}(?:0000)?(\d{8})\b/g))add(m[1],m.index);
  const seen=new Set();return hits.sort((a,b)=>a.index-b.index).filter(x=>!seen.has(x.parcel)&&seen.add(x.parcel));
};
function segmentFor(text,index,nextIndex){
  const src=String(text||'');
  let start=Math.max(0,index-900),end=Math.min(src.length,nextIndex==null?index+500:nextIndex);
  const before=src.slice(start,index);
  const starts=[...before.matchAll(/\d{2}\/\d{2}\/\d{4}\s*\d{2}\/\d{2}\/\d{4}\s*CV\d{6,}/gi)];
  if(starts.length)start=start+(starts.at(-1).index||0);
  return src.slice(start,end).trim();
}
function auctionFrom(raw,parcel){
  let a={parcel};
  try{if(window.parseAuctionInfo)a={...a,...(window.parseAuctionInfo(raw)||{})};}catch{}
  a.parcel=parcel;return a;
}
function install(){
  if(typeof window.extract!=='function'||window.extract.__allParcelRecovery)return;
  const prior=window.extract;
  window.extract=function(text){
    let base=[];try{base=prior(text)||[];}catch{}
    const src=String(text||''),all=uniqueParcels(src);
    if(!all.length)return base;
    const by=new Map();
    for(const r of base){const p=dig(r?.parcel);if(p.length===8&&!by.has(p))by.set(p,r);}
    for(let i=0;i<all.length;i++){
      const {parcel,index}=all[i];if(by.has(parcel))continue;
      const raw=segmentFor(src,index,all[i+1]?.index);
      const auction=auctionFrom(raw,parcel);
      by.set(parcel,{parcel,index:i,raw,auction});
      window.fullAuctionByParcel=window.fullAuctionByParcel||{};
      window.fullAuctionByParcel[parcel]={...(window.fullAuctionByParcel[parcel]||{}),...auction,original:raw};
    }
    const ordered=[];const used=new Set();
    for(const h of all){const r=by.get(h.parcel);if(r&&!used.has(h.parcel)){used.add(h.parcel);ordered.push(r);}}
    for(const r of base){const p=dig(r?.parcel);if(p.length===8&&!used.has(p)){used.add(p);ordered.push(r);}}
    window.__detectedAuctionParcels=all.length;
    return ordered.map((r,i)=>({...r,index:i}));
  };
  window.extract.__allParcelRecovery=true;
}
install();
const oldRender=window.render;
if(typeof oldRender==='function'&&!oldRender.__parcelCountNote){
  window.render=function(){const out=oldRender.apply(this,arguments);setTimeout(()=>{
    const count=document.getElementById('count');
    if(count&&window.__detectedAuctionParcels&&typeof rows!=='undefined'){
      const loaded=Array.isArray(rows)?rows.length:0;
      const suffix=` • Loaded ${loaded} of ${window.__detectedAuctionParcels} detected parcels`;
      if(!count.textContent.includes('detected parcels'))count.textContent+=suffix;
    }
  },0);return out;};
  window.render.__parcelCountNote=true;
}
})();
