(()=>{
if(typeof classify!=='function'||typeof render!=='function')return;
const oldClassify=classify;
classify=function(a){
  if(a){
    const luc=String(a.tax_luc||'').trim();
    const desc=(String(a.tax_luc_description||'')+' '+String(a.ext_luc_description||'')).toUpperCase();
    if(luc==='5500'||/\bCONDO(MINIUM)?\b/.test(desc)){
      return{key:'condo',label:'CONDO',reason:luc==='5500'?'County land-use code 5500':'County land-use description'};
    }
  }
  return oldClassify(a);
};
const style=document.createElement('style');
style.textContent='.condo{background:#ede9fe!important;color:#5b21b6!important}';
document.head.appendChild(style);
const filters=document.querySelector('.filters');
if(!filters||filters.querySelector('[data-filter="condo"]'))return;
const btn=document.createElement('button');
btn.className='chip';
btn.dataset.filter='condo';
btn.textContent='Condos';
const multi=filters.querySelector('[data-filter="multi"]');
if(multi)multi.insertAdjacentElement('afterend',btn);else filters.appendChild(btn);
btn.onclick=()=>{
  filter='condo';
  document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===btn));
  render();
};
})();
