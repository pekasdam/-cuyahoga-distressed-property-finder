(()=>{
const input=document.getElementById('input');
const scanBtn=document.getElementById('scan');
if(!input||!scanBtn)return;

const style=document.createElement('style');
style.textContent=`
.ocrTools{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
.ocrBtn{min-height:48px;font-size:14px;border:1px solid}
.ocrPhoto{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
.ocrPdf{background:#eef2ff;color:#3730a3;border-color:#c7d2fe}
.ocrStatus{margin-top:9px;border:1px solid #d1d5db;background:#f9fafb;border-radius:11px;padding:10px;font-size:12px;line-height:1.4}
.ocrStatus[hidden]{display:none}
.ocrTrack{height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-top:7px}
.ocrTrack div{height:100%;width:0;background:#4f46e5;transition:width .15s ease}
.ocrNote{font-size:10px;color:#6b7280;margin-top:6px}
@media(max-width:500px){.ocrTools{grid-template-columns:1fr}.ocrBtn{width:100%}}
`;
document.head.appendChild(style);

const hint=input.nextElementSibling;
const tools=document.createElement('div');
tools.className='ocrTools';
tools.innerHTML=`
<button type="button" id="ocrPhoto" class="ocrBtn ocrPhoto">📷 Upload Photo / Screenshot</button>
<button type="button" id="ocrPdf" class="ocrBtn ocrPdf">📄 Upload Auction PDF</button>
<input id="ocrPhotoFile" type="file" accept="image/*" multiple hidden>
<input id="ocrPdfFile" type="file" accept="application/pdf,.pdf" multiple hidden>`;
(hint?.parentNode||input.parentNode).insertBefore(tools,hint?.nextSibling||input.nextSibling);

const statusBox=document.createElement('div');
statusBox.id='ocrStatus';
statusBox.className='ocrStatus';
statusBox.hidden=true;
statusBox.innerHTML='<div id="ocrMessage"></div><div class="ocrTrack"><div id="ocrBar"></div></div><div class="ocrNote">Photos, screenshots and PDFs are read in your browser. They are not uploaded to this app.</div>';
tools.insertAdjacentElement('afterend',statusBox);

const photoInput=document.getElementById('ocrPhotoFile');
const pdfInput=document.getElementById('ocrPdfFile');
const photoBtn=document.getElementById('ocrPhoto');
const pdfBtn=document.getElementById('ocrPdf');
const msg=document.getElementById('ocrMessage');
const bar=document.getElementById('ocrBar');
let busy=false;

function setStatus(text,pct=null){statusBox.hidden=false;msg.textContent=text;if(pct!==null)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;}
function normalizeText(text){return String(text||'').replace(/\u00a0/g,' ').replace(/[–—−]/g,'-').replace(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{3})/g,'$1-$2-$3').replace(/\$\s+([\d,]+)/g,'$$$1').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function digits(v){return String(v||'').replace(/\D/g,'');}
function nz(v){const x=digits(v);return x.length===9&&x.endsWith('0000')?x.slice(0,5):x;}
function money(v){const m=String(v||'').match(/(?:[$S]\s*)?([\d,]+(?:\.\d{1,2})?)/i);if(!m)return null;const n=Number(m[1].replace(/,/g,''));return Number.isFinite(n)?n:null;}
function parcelCount(text){const structured=typeof window.parseQuickSearchAuction==='function'?window.parseQuickSearchAuction(text):[];if(structured.length)return structured.length;const m=String(text||'').match(/\b\d{3}\s*-\s*\d{2}\s*-\s*\d{3}\b|\b\d{8}\b/g)||[];return new Set(m.map(x=>x.replace(/\D/g,''))).size;}

function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(window.__tesseractLoading)return window.__tesseractLoading;
  window.__tesseractLoading=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.async=true;
    s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('Photo reader did not initialize.'));
    s.onerror=()=>reject(new Error('Could not load the photo reader. Check your internet connection or content blocker.'));
    document.head.appendChild(s);
  });
  return window.__tesseractLoading;
}
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(window.__pdfJsLoading)return window.__pdfJsLoading;
  window.__pdfJsLoading=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.async=true;
    s.onload=()=>{if(!window.pdfjsLib)return reject(new Error('PDF reader did not initialize.'));window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';resolve(window.pdfjsLib);};
    s.onerror=()=>reject(new Error('Could not load the PDF reader. Check your internet connection or content blocker.'));
    document.head.appendChild(s);
  });
  return window.__pdfJsLoading;
}

const LABELS=[['sale',/\bsale\b/i],['add',/\badd\b/i],['case',/\bcase\b/i],['status',/\bstatus\b/i],['deposit',/\bdeposit\b/i],['opening',/\bopening\b/i],['appraised',/\bappraised\b/i],['holder',/\bcertificate\b/i],['address',/\baddress\b/i],['city',/^city$/i],['zip',/^zip$/i],['parcel',/\bparcel\b/i],['my',/^my\b/i]];
function cleanTokens(tokens){return(tokens||[]).map(t=>({...t,text:String(t.text||'').trim(),x:Number(t.x||0),y:Number(t.y||0),w:Math.max(1,Number(t.w||1))})).filter(t=>t.text);}
function findHeader(tokens){const openings=tokens.filter(t=>/\bopening\b/i.test(t.text));for(const o of openings){const band=tokens.filter(t=>Math.abs(t.y-o.y)<=35),anchors={};for(const[name,re]of LABELS){const cand=band.filter(t=>re.test(t.text)).sort((a,b)=>Math.abs(a.y-o.y)-Math.abs(b.y-o.y)||a.x-b.x)[0];if(cand)anchors[name]=cand.x;}const required=['sale','add','case','status','deposit','opening','appraised','address','city','zip','parcel'];if(required.filter(k=>Number.isFinite(anchors[k])).length>=9)return{y:o.y,anchors};}return null;}
function cellText(tokens){return tokens.sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:a.x-b.x).map(t=>t.text).join(' ').replace(/\s+/g,' ').trim();}
function structuredRows(tokens){
  tokens=cleanTokens(tokens);const head=findHeader(tokens);if(!head)return[];
  const names=LABELS.map(x=>x[0]).filter(n=>Number.isFinite(head.anchors[n])).sort((a,b)=>head.anchors[a]-head.anchors[b]);if(names.length<9)return[];
  const xs=names.map(n=>head.anchors[n]),bounds=[-Infinity];for(let i=0;i<xs.length-1;i++)bounds.push((xs[i]+xs[i+1])/2);bounds.push(Infinity);
  const saleIndex=names.indexOf('sale');if(saleIndex<0)return[];const saleLeft=bounds[saleIndex],saleRight=bounds[saleIndex+1];
  const starts=tokens.filter(t=>t.y>head.y+5&&t.x+t.w/2>=saleLeft&&t.x+t.w/2<saleRight&&/\b\d{2}\/\d{2}\/\d{4}\b/.test(t.text)).sort((a,b)=>a.y-b.y);if(!starts.length)return[];
  const out=[];
  for(let i=0;i<starts.length;i++){
    const y0=starts[i].y-5,y1=i+1<starts.length?(starts[i].y+starts[i+1].y)/2:Infinity,rowTokens=tokens.filter(t=>t.y>=y0&&t.y<y1),cells={};
    for(let c=0;c<names.length;c++){const left=bounds[c],right=bounds[c+1];cells[names[c]]=cellText(rowTokens.filter(t=>t.x+t.w/2>=left&&t.x+t.w/2<right));}
    const parcel=digits(cells.parcel);if(parcel.length!==8)continue;
    const sale=(cells.sale.match(/\d{2}\/\d{2}\/\d{4}/)||[])[0]||'',add=(cells.add?.match(/\d{2}\/\d{2}\/\d{4}/)||[])[0]||'',cv=(cells.case?.match(/CV\d{6,}/i)||[])[0]||'';
    out.push({saleDate:sale,addDate:add,caseNumber:cv.toUpperCase(),status:cells.status||'',deposit:money(cells.deposit),openingBid:money(cells.opening),appraised:money(cells.appraised),certificateHolder:cells.holder||'',address:cells.address||'',city:cells.city||'',zip:nz(cells.zip),parcel,myBid:money(cells.my)});
  }
  return out;
}
function canonical(rows){if(!rows.length)return'';if(typeof window.canonicalQuickSearchRows==='function')return window.canonicalQuickSearchRows(rows);return rows.map(a=>[`### AUCTION ROW`,`Sale Date: ${a.saleDate||''}`,`Add Date: ${a.addDate||''}`,`Case Number: ${a.caseNumber||''}`,`Auction Status: ${a.status||''}`,`Deposit Requirement: ${a.deposit==null?'':`$${a.deposit}`}`,`Opening Bid: ${a.openingBid==null?'':`$${a.openingBid}`}`,`Appraised Value: ${a.appraised==null?'':`$${a.appraised}`}`,`Certificate Holder Name: ${a.certificateHolder||''}`,`Address: ${a.address||''}`,`City: ${a.city||''}`,`Zip: ${a.zip||''}`,`Parcel ID: ${a.parcel||''}`,`My Bid: ${a.myBid==null?'':`$${a.myBid}`}`].join('\n')).join('\n\n');}
function pdfTokens(items){const out=[];for(const i of items||[]){const str=String(i.str||'').trim();if(!str)continue;const x=Number(i.transform?.[4]||0),y=-Number(i.transform?.[5]||0),w=Math.max(1,Number(i.width||str.length*5));const parts=str.split(/\s+/);let consumed=0;for(const p of parts){const idx=str.indexOf(p,consumed),px=x+w*(Math.max(0,idx)/Math.max(1,str.length)),pw=Math.max(1,w*(p.length/Math.max(1,str.length)));out.push({text:p,x:px,y,w:pw});consumed=Math.max(consumed,idx+p.length);}}return out;}
function tsvTokens(tsv){const out=[];const lines=String(tsv||'').split(/\r?\n/);for(let i=1;i<lines.length;i++){const p=lines[i].split('\t');if(p.length<12)continue;const text=p.slice(11).join('\t').trim();if(!text)continue;out.push({text,x:Number(p[6]||0),y:Number(p[7]||0),w:Number(p[8]||1)});}return out;}
function pageLines(items){const arr=items.filter(i=>String(i.str||'').trim()).map(i=>({str:String(i.str).trim(),x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0)})).sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);const lines=[];for(const it of arr){let line=lines.find(l=>Math.abs(l.y-it.y)<=2.5);if(!line){line={y:it.y,items:[]};lines.push(line);}line.items.push(it);}lines.sort((a,b)=>b.y-a.y);return lines.map(l=>l.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ')).join('\n');}

async function recognizeImage(blob,index,total){
  const T=await loadTesseract();
  const result=await T.recognize(blob,'eng',{logger:m=>{const base=((index-1)/total)*100,share=100/total,p=Number.isFinite(m.progress)?m.progress:0,label=String(m.status||'Reading photo').replace(/\b\w/g,c=>c.toUpperCase());setStatus(`${label} (${index} of ${total})`,base+share*p);}});
  const sr=structuredRows(tsvTokens(result?.data?.tsv||''));
  return sr.length?canonical(sr):normalizeText(result?.data?.text||'');
}
async function readPdf(file,index,total){
  const pdfjs=await loadPdfJs();const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjs.getDocument({data}).promise;const pages=[],rows=[];
  for(let p=1;p<=pdf.numPages;p++){
    setStatus(`Reading PDF page ${p} of ${pdf.numPages} (${index} of ${total})`,((index-1)+(p/pdf.numPages))/total*100);
    const page=await pdf.getPage(p);const tc=await page.getTextContent();const sr=structuredRows(pdfTokens(tc.items||[]));if(sr.length)rows.push(...sr);else pages.push(pageLines(tc.items||[]));
  }
  return rows.length?canonical(rows):normalizeText(pages.join('\n'));
}

async function processFiles(files,mode){
  if(busy||!files.length)return;
  busy=true;photoBtn.disabled=true;pdfBtn.disabled=true;bar.style.width='0%';
  try{
    const texts=[];
    for(let i=0;i<files.length;i++){
      const f=files[i];setStatus(`Preparing ${mode==='pdf'?'PDF':'photo'} ${i+1} of ${files.length}…`,i/files.length*100);
      texts.push(mode==='pdf'?await readPdf(f,i+1,files.length):await recognizeImage(f,i+1,files.length));
    }
    const text=normalizeText(texts.filter(Boolean).join('\n\n'));
    if(!text)throw new Error('No readable auction text was found.');
    input.value=[input.value.trim(),text].filter(Boolean).join('\n\n');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const count=parcelCount(text);
    setStatus(count?`${mode==='pdf'?'Auction PDF':'Photo / screenshot'} read successfully. Found ${count} property row${count===1?'':'s'}. Checking properties now…`:'The image was read, but no parcel number was recognized. Try a clearer screenshot or edit the text below.',100);
    if(count)setTimeout(()=>scanBtn.click(),250);else{input.scrollIntoView({behavior:'smooth',block:'center'});input.focus();}
  }catch(e){setStatus(`${mode==='pdf'?'PDF':'Photo / screenshot'} could not be read: ${e?.message||e}`,0);}
  finally{busy=false;photoBtn.disabled=false;pdfBtn.disabled=false;photoInput.value='';pdfInput.value='';}
}

photoBtn.onclick=()=>photoInput.click();
pdfBtn.onclick=()=>pdfInput.click();
photoInput.onchange=()=>processFiles([...photoInput.files].filter(f=>f.type.startsWith('image/')),'photo');
pdfInput.onchange=()=>processFiles([...pdfInput.files].filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name||'')),'pdf');
})();