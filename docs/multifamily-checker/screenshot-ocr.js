(()=>{
const input=document.getElementById('input');
const scanBtn=document.getElementById('scan');
if(!input||!scanBtn)return;

const style=document.createElement('style');
style.textContent=`
.ocrTools{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ocrBtn{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe}.ocrPaste{background:#f0fdfa;color:#115e59;border:1px solid #99f6e4}.ocrStatus{margin-top:9px;border:1px solid #d1d5db;background:#f9fafb;border-radius:11px;padding:10px;font-size:12px;line-height:1.4}.ocrStatus[hidden]{display:none}.ocrTrack{height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-top:7px}.ocrTrack div{height:100%;width:0;background:#4f46e5;transition:width .15s ease}.ocrNote{font-size:10px;color:#6b7280;margin-top:6px}@media(max-width:500px){.ocrTools button{flex:1 1 46%}}
`;
document.head.appendChild(style);

const hint=input.nextElementSibling;
const tools=document.createElement('div');
tools.className='ocrTools';
tools.innerHTML=`<button type="button" id="ocrUpload" class="ocrBtn">📷 Upload Screenshot</button><button type="button" id="ocrPaste" class="ocrPaste">📋 Paste Screenshot</button><input id="ocrFile" type="file" accept="image/*" multiple hidden>`;
(hint?.parentNode||input.parentNode).insertBefore(tools,hint?.nextSibling||input.nextSibling);

const status=document.createElement('div');
status.id='ocrStatus';
status.className='ocrStatus';
status.hidden=true;
status.innerHTML='<div id="ocrMessage"></div><div class="ocrTrack"><div id="ocrBar"></div></div><div class="ocrNote">Screenshot text is read in your browser. The image is not uploaded to this app.</div>';
tools.insertAdjacentElement('afterend',status);

const fileInput=document.getElementById('ocrFile');
const uploadBtn=document.getElementById('ocrUpload');
const pasteBtn=document.getElementById('ocrPaste');
const msg=document.getElementById('ocrMessage');
const bar=document.getElementById('ocrBar');
let busy=false;

function setStatus(text,pct=null){
  status.hidden=false;
  msg.textContent=text;
  if(pct!==null)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;
}
function normalizeOCR(text){
  return String(text||'')
    .replace(/[–—−]/g,'-')
    .replace(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{3})/g,'$1-$2-$3')
    .replace(/\$\s+([\d,]+)/g,'$$$1')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function parcelCount(text){
  const m=String(text||'').match(/\b\d{3}\s*-\s*\d{2}\s*-\s*\d{3}\b|\b\d{8}\b/g)||[];
  return new Set(m.map(x=>x.replace(/\D/g,''))).size;
}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(window.__tesseractLoading)return window.__tesseractLoading;
  window.__tesseractLoading=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.async=true;
    s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR library did not initialize.'));
    s.onerror=()=>reject(new Error('Could not load the OCR library. Check your internet connection or content blocker.'));
    document.head.appendChild(s);
  });
  return window.__tesseractLoading;
}
async function recognize(blob,index,total){
  const T=await loadTesseract();
  const result=await T.recognize(blob,'eng',{
    logger:m=>{
      const base=((index-1)/total)*100;
      const share=100/total;
      const p=Number.isFinite(m.progress)?m.progress:0;
      const label=String(m.status||'Reading screenshot').replace(/\b\w/g,c=>c.toUpperCase());
      setStatus(`${label} (${index} of ${total})`,base+share*p);
    }
  });
  return normalizeOCR(result?.data?.text||'');
}
async function processImages(blobs){
  if(busy||!blobs.length)return;
  busy=true; uploadBtn.disabled=true; pasteBtn.disabled=true; bar.style.width='0%';
  try{
    const texts=[];
    for(let i=0;i<blobs.length;i++){
      setStatus(`Preparing screenshot ${i+1} of ${blobs.length}…`,(i/blobs.length)*100);
      texts.push(await recognize(blobs[i],i+1,blobs.length));
    }
    const text=normalizeOCR(texts.filter(Boolean).join('\n\n'));
    if(!text)throw new Error('No readable text was found in the screenshot.');
    input.value=[input.value.trim(),text].filter(Boolean).join('\n\n');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const count=parcelCount(input.value);
    setStatus(count?`Screenshot read successfully. Found ${count} parcel${count===1?'':'s'}. Checking properties now…`:'Screenshot text was added, but no parcel number was recognized. You can correct the text below and tap Check Properties.',100);
    if(count){
      setTimeout(()=>scanBtn.click(),250);
    }else{
      input.scrollIntoView({behavior:'smooth',block:'center'});
      input.focus();
    }
  }catch(e){
    setStatus(`Screenshot could not be read: ${e?.message||e}`,0);
  }finally{
    busy=false; uploadBtn.disabled=false; pasteBtn.disabled=false; fileInput.value='';
  }
}

uploadBtn.onclick=()=>fileInput.click();
fileInput.onchange=()=>processImages([...fileInput.files].filter(f=>f.type.startsWith('image/')));

pasteBtn.onclick=async()=>{
  if(!navigator.clipboard?.read){
    setStatus('Image paste is not available in this Safari view. Tap Upload Screenshot and choose the image from Photos.',0);
    return;
  }
  try{
    const items=await navigator.clipboard.read();
    const blobs=[];
    for(const item of items){
      const type=item.types.find(t=>t.startsWith('image/'));
      if(type)blobs.push(await item.getType(type));
    }
    if(!blobs.length)throw new Error('There is no image on the clipboard.');
    await processImages(blobs);
  }catch(e){
    setStatus(`Could not paste the screenshot: ${e?.message||e}. You can use Upload Screenshot instead.`,0);
  }
};

document.addEventListener('paste',e=>{
  if(busy)return;
  const blobs=[...(e.clipboardData?.items||[])].filter(x=>x.type?.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);
  if(blobs.length){
    e.preventDefault();
    processImages(blobs);
  }
});
})();
