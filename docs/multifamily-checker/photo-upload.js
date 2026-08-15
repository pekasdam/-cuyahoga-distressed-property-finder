(()=>{
const input=document.getElementById('input');
const scan=document.getElementById('scan');
if(!input||!scan)return;
const actions=scan.parentElement;
if(!actions||document.getElementById('photoUpload'))return;

const btn=document.createElement('button');
btn.id='photoUpload';
btn.type='button';
btn.className='secondary';
btn.textContent='📷 Upload Photo';
const picker=document.createElement('input');
picker.id='photoFile';
picker.type='file';
picker.accept='image/*';
picker.multiple=true;
picker.hidden=true;
actions.insertBefore(btn,actions.children[1]||null);
actions.appendChild(picker);

const note=document.createElement('div');
note.id='photoStatus';
note.className='status';
note.hidden=true;
actions.insertAdjacentElement('afterend',note);

let busy=false;
function status(text){note.hidden=false;note.textContent=text;}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(window.__photoTesseract)return window.__photoTesseract;
  window.__photoTesseract=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.async=true;
    s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR did not initialize'));
    s.onerror=()=>reject(new Error('Could not load photo reader'));
    document.head.appendChild(s);
  });
  return window.__photoTesseract;
}
function findParcels(text){
  const out=new Set();
  const s=String(text||'').replace(/[–—−]/g,'-');
  for(const m of s.matchAll(/\b(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{3})\b/g))out.add(m[1]+m[2]+m[3]);
  for(const m of s.matchAll(/\b(\d{3})\s+(\d{2})\s+(\d{3})\b/g))out.add(m[1]+m[2]+m[3]);
  for(const m of s.matchAll(/\b\d{8}\b/g))out.add(m[0]);
  return [...out];
}
function existingParcels(){
  const out=new Set();
  const s=String(input.value||'');
  for(const m of s.matchAll(/\b\d{3}\s*-\s*\d{2}\s*-\s*\d{3}\b|\b\d{8}\b/g))out.add(m[0].replace(/\D/g,''));
  return out;
}
async function process(files){
  if(busy||!files.length)return;
  busy=true;btn.disabled=true;scan.disabled=true;
  try{
    const T=await loadTesseract();
    const found=[];
    for(let i=0;i<files.length;i++){
      status(`Reading photo ${i+1} of ${files.length}…`);
      const r=await T.recognize(files[i],'eng',{logger:m=>{
        if(m.status==='recognizing text'&&Number.isFinite(m.progress))status(`Reading photo ${i+1} of ${files.length}… ${Math.round(m.progress*100)}%`);
      }});
      found.push(...findParcels(r?.data?.text||''));
    }
    const current=existingParcels();
    const unique=[...new Set(found)].filter(p=>!current.has(p));
    if(unique.length){
      const lines=unique.map(p=>`Parcel ${p}`).join('\n');
      input.value=[input.value.trim(),lines].filter(Boolean).join('\n');
    }
    const total=existingParcels().size;
    if(!total){
      status('No parcel numbers were found. Try a clearer or closer screenshot.');
      return;
    }
    status(`Photo read successfully. Found ${total} unique parcel${total===1?'':'s'}. Checking properties now…`);
    setTimeout(()=>scan.click(),200);
  }catch(e){
    status(`Could not read the photo: ${e?.message||e}`);
  }finally{
    busy=false;btn.disabled=false;scan.disabled=false;picker.value='';
  }
}
btn.onclick=()=>picker.click();
picker.onchange=()=>process([...picker.files].filter(f=>f.type.startsWith('image/')));
})();
