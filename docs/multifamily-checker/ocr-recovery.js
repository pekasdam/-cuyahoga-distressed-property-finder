(()=>{
const input=document.getElementById('input');
if(!input)return;
let pending=[];
const parcelSet=text=>{
  const out=new Set();
  const s=String(text||'');
  for(const m of s.matchAll(/\b(\d{3})\s*[-–—]?\s*(\d{2})\s*[-–—]?\s*(\d{3})\b/g))out.add(m[1]+m[2]+m[3]);
  for(const m of s.matchAll(/\b\d{8}\b/g))out.add(m[0]);
  return out;
};
const normalize=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[–—−]/g,'-').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function captureResult(result){
  const raw=normalize(result?.data?.text||'');
  if(raw)pending.push(raw);
  return result;
}
function wrapTesseract(T){
  if(!T||T.__cuyahogaRecoveryWrapped||typeof T.recognize!=='function')return T;
  const original=T.recognize.bind(T);
  T.recognize=async function(){return captureResult(await original(...arguments));};
  try{Object.defineProperty(T,'__cuyahogaRecoveryWrapped',{value:true});}catch{T.__cuyahogaRecoveryWrapped=true;}
  return T;
}
let stored=window.Tesseract;
if(stored)stored=wrapTesseract(stored);
try{
  const d=Object.getOwnPropertyDescriptor(window,'Tesseract');
  if(!d||d.configurable){
    Object.defineProperty(window,'Tesseract',{
      configurable:true,
      get(){return stored;},
      set(v){stored=wrapTesseract(v);}
    });
  }
}catch{}
const poll=setInterval(()=>{if(window.Tesseract){wrapTesseract(window.Tesseract);clearInterval(poll);}},50);
setTimeout(()=>clearInterval(poll),15000);
input.addEventListener('input',()=>{
  if(!pending.length)return;
  const raws=pending.splice(0);
  const current=parcelSet(input.value);
  const recovery=raws.filter(raw=>[...parcelSet(raw)].some(p=>!current.has(p)));
  if(!recovery.length)return;
  input.value=[input.value.trim(),'### OCR RECOVERY FALLBACK',...recovery].filter(Boolean).join('\n\n');
  const total=parcelSet(input.value).size;
  setTimeout(()=>{
    const msg=document.getElementById('ocrMessage');
    if(msg)msg.textContent=`Auction photo read. Recovered ${total} unique parcel${total===1?'':'s'} using structured rows plus OCR fallback. Checking all properties now…`;
  },300);
});
})();
