function pdfClean(v=''){return String(v??'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim()}
function pdfMoney(v){return v==null||v===''?'-':'$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:0})}
function sharePdfFile(doc,filename,title,text){
  const blob=doc.output('blob'),file=new File([blob],filename,{type:'application/pdf'});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){return navigator.share({files:[file],title,text})}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);alert('PDF created. Open the downloaded PDF and use Share to send it by Messages or Mail.');return Promise.resolve()
}
function buildLeadPdf(l){
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF generator is still loading. Try again in a second.');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'pt',format:'letter'}),p=l.parcel||{};
  const margin=48,right=564,width=right-margin;let y=48;
  const ensure=(h=18)=>{if(y+h>744){doc.addPage();y=48}};
  const wrapped=(text,size=10,bold=false,indent=0)=>{const clean=pdfClean(text)||'-';doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(clean,width-indent);for(const line of lines){ensure(size+6);doc.text(line,margin+indent,y);y+=size+5}y+=2};
  const field=(label,value)=>{const clean=pdfClean(value)||'-';doc.setFontSize(10);doc.setFont('helvetica','bold');ensure(18);doc.text(pdfClean(label)+':',margin,y);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(clean,width-145);for(let i=0;i<lines.length;i++){if(i>0){y+=14;ensure(18)}doc.text(lines[i],margin+145,y)}y+=18};
  const section=title=>{y+=5;ensure(28);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(pdfClean(title),margin,y);y+=16;doc.setDrawColor(210);doc.line(margin,y,right,y);y+=12};
  const addr=p.property_address||'Property Lead';
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Cuyahoga Distressed Property Finder',margin,y);y+=22;
  wrapped(addr,14,true);wrapped('Property Research Report',10,false);y+=4;
  field('Generated',new Date().toLocaleString());
  section('Lead Summary');
  field('Property address',addr);
  field('Owner',p.owner||l.owner_or_defendant||'Unknown');
  field('Parcel',p.parcel_pin||'Unknown');
  field('Lead type',typeof typeName==='function'?typeName(l.lead_type):l.lead_type||'-');
  field('Deal score',String(l.score||0)+'/100');
  field('Lead status',l.status||'-');
  field('Scan status',l.scan_status==='new'?'NEW':l.scan_status==='updated'?'UPDATED':'Previously seen');
  field('Best Deals filter',typeof bestDeal==='function'&&bestDeal(l)?'Included':'Not included');
  field('Tax foreclosure',l.tax_foreclosure?'Yes':'No');
  field('Filed / hearing',l.filed_or_hearing_date||'-');
  if(l.case_number)field('Court case',l.case_number);
  if(l.submission_id)field('Submission ID',l.submission_id);
  section('Property Details');
  field('Land use',p.land_use||'-');
  field('Certified tax value',pdfMoney(p.certified_tax_total));
  field('Living area',p.living_area_sqft?Number(p.living_area_sqft).toLocaleString()+' sq ft':'-');
  field('Residential buildings',p.residential_buildings??'-');
  field('Multi-family',p.is_multifamily?'Yes':'No');
  field('Absentee owner',p.absentee?'Yes':'No');
  field('Owner mailing address',[p.mailing_address,p.mailing_city,p.mailing_state,p.mailing_zip].filter(Boolean).join(', ')||'-');
  field('Last recorded sale',pdfMoney(p.last_sale_amount));
  field('Last transfer',p.transfer_date||'-');
  if(l.portfolio_count)field('Owner portfolio match',l.portfolio_count);
  if(l.repeat_eviction_count)field('Eviction / default hits',l.repeat_eviction_count);
  section('Why This Lead Scored This Way');
  const notes=l.notes||[];
  if(notes.length){for(const n of notes)wrapped('- '+n,10,false,8)}else wrapped('No score notes were supplied.',10,false);
  section('Research Links');
  if(p.myplace_url)wrapped('MyPlace: '+p.myplace_url,8,false);
  if(l.source_url)wrapped('Court/source: '+l.source_url,8,false);
  wrapped('Google Maps search: '+addr,8,false);
  wrapped('Zillow / Redfin / Realtor.com: search the property address shown above.',8,false);
  y+=8;ensure(46);doc.setFont('helvetica','italic');wrapped('Research aid only. Verify ownership, taxes, title, liens, occupancy, condition, rent, value, and legal status independently before making an offer or purchasing.',8,false);
  const safe=(addr||p.parcel_pin||'property').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'property';
  return {doc,filename:`Cuyahoga-Property-Report-${safe}.pdf`,addr};
}
async function shareLeadPdf(){
  const l=window.currentPdfLead;if(!l)return;
  try{
    const {doc,filename,addr}=buildLeadPdf(l);
    await sharePdfFile(doc,filename,`Property Report - ${addr}`,`Cuyahoga property research report for ${addr}`)
  }catch(e){if(e&&e.name==='AbortError')return;alert('Could not create/share the PDF: '+(e.message||e))}
}
function buildScanPdf(data,options={}){
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF generator is still loading. Try again in a second.');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'pt',format:'letter'}),stats=data.stats||{},leads=[...(data.leads||[])].sort((a,b)=>(b.score||0)-(a.score||0));
  const margin=38,right=574,width=right-margin;let y=42,pageNo=1;
  const footer=()=>{doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(110);doc.text(`Cuyahoga Distressed Property Finder - page ${pageNo}`,margin,770);doc.setTextColor(0)};
  const newPage=()=>{footer();doc.addPage();pageNo++;y=42};
  const ensure=(h=18)=>{if(y+h>752)newPage()};
  const wrapped=(text,size=9,bold=false,indent=0)=>{const clean=pdfClean(text)||'-';doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(clean,width-indent);for(const line of lines){ensure(size+5);doc.text(line,margin+indent,y);y+=size+4}y+=1};
  const field=(label,value)=>{ensure(16);doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(pdfClean(label)+':',margin,y);doc.setFont('helvetica','normal');doc.text(pdfClean(value)||'-',margin+128,y);y+=15};
  const section=title=>{y+=5;ensure(25);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(pdfClean(title),margin,y);y+=12;doc.setDrawColor(210);doc.line(margin,y,right,y);y+=10};
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Cuyahoga Distressed Property Finder',margin,y);y+=22;
  wrapped(options.title||'Complete Scan Results',14,true);wrapped(`Generated ${new Date().toLocaleString()}`,9,false);if(options.filterSummary)wrapped('Filters: '+options.filterSummary,9,true);y+=4;
  section('Scan Summary');
  field('Scan timestamp',data.generated_at?new Date(data.generated_at).toLocaleString():'Unknown');
  field('All leads',stats.total_leads??leads.length);
  field('Best deals',stats.best_deal_leads??leads.filter(x=>typeof bestDeal==='function'&&bestDeal(x)).length);
  field('New this scan',stats.new_leads??leads.filter(x=>x.scan_status==='new').length);
  field('Updated this scan',stats.updated_leads??leads.filter(x=>x.scan_status==='updated').length);
  field('Hot leads',stats.hot_leads??leads.filter(x=>(x.score||0)>=70).length);
  field('Foreclosures',stats.foreclosure_leads??leads.filter(x=>x.lead_type==='foreclosure').length);
  field('Tired-landlord parcels',stats.tired_landlord_parcel_leads??leads.filter(x=>x.lead_type==='tired_landlord').length);
  const health=stats.source_health||{};
  if(Object.keys(health).length){field('Foreclosure source',String(health.foreclosures||'unknown').toUpperCase());field('Housing Court source',String(health.housing_court||'unknown').toUpperCase())}
  section(`Ranked Leads (${leads.length})`);
  leads.forEach((l,i)=>{
    const p=l.parcel||{},addr=p.property_address||'Needs parcel match',owner=p.owner||l.owner_or_defendant||'Unknown owner';
    ensure(86);
    doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(`#${i+1}  Score ${l.score||0}/100`,margin,y);y+=14;
    wrapped(addr,10,true,8);
    wrapped(`Owner: ${owner}`,8,false,8);
    wrapped(`Parcel: ${p.parcel_pin||'-'} | Type: ${typeof typeName==='function'?typeName(l.lead_type):l.lead_type||'-'} | ${l.tax_foreclosure?'Tax foreclosure | ':''}${p.is_multifamily?'Multi-family | ':''}${p.absentee?'Absentee | ':''}${typeof bestDeal==='function'&&bestDeal(l)?'Best Deal':''}`,8,false,8);
    wrapped(`Tax value: ${pdfMoney(p.certified_tax_total)} | Living area: ${p.living_area_sqft?Number(p.living_area_sqft).toLocaleString()+' sf':'-'} | Last sale: ${pdfMoney(p.last_sale_amount)} | Transfer: ${p.transfer_date||'-'}`,8,false,8);
    if(l.case_number||l.filed_or_hearing_date)wrapped(`Case/date: ${l.case_number||'-'} | ${l.filed_or_hearing_date||'-'}`,8,false,8);
    const flags=[];if(l.scan_status==='new')flags.push('NEW');if(l.scan_status==='updated')flags.push('UPDATED');if(l.repeat_eviction_count)flags.push(`${l.repeat_eviction_count} eviction/default hits`);if(l.portfolio_count)flags.push(`portfolio ${l.portfolio_count}`);if(flags.length)wrapped(`Flags: ${flags.join(' | ')}`,8,false,8);
    const notes=(l.notes||[]).slice(0,3);if(notes.length)wrapped(`Why scored: ${notes.join(' | ')}`,7,false,8);
    y+=5;ensure(6);doc.setDrawColor(225);doc.line(margin,y,right,y);y+=9;
  });
  y+=4;wrapped('Research aid only. Verify ownership, taxes, title, liens, occupancy, condition, rent, value, and legal status independently before making an offer or purchasing.',7,false);
  footer();
  const stamp=(data.generated_at||new Date().toISOString()).slice(0,10);
  return {doc,filename:`${options.filenamePrefix||'Cuyahoga-Scan-Results'}-${stamp}.pdf`,count:leads.length};
}
async function shareScanPdf(){
  try{
    if(typeof payload==='undefined'||!payload||!(payload.leads||[]).length)throw new Error('No scan results are loaded yet.');
    const {doc,filename,count}=buildScanPdf(payload);
    await sharePdfFile(doc,filename,'Cuyahoga Scan Results',`Complete Cuyahoga scan results - ${count} leads`)
  }catch(e){if(e&&e.name==='AbortError')return;alert('Could not create/share the scan PDF: '+(e.message||e))}
}

function filteredLeadsForPdf(){
  if(typeof payload==='undefined'||!payload)return [];
  const q=(document.getElementById('q')?.value||'').toLowerCase(),type=document.getElementById('type')?.value||'',min=+(document.getElementById('score')?.value||0),special=document.getElementById('special')?.value||'';
  return (payload.leads||[]).filter(l=>{const p=l.parcel||{},hay=[p.property_address,p.owner,p.parcel_pin,l.owner_or_defendant,l.title].join(' ').toLowerCase();if(q&&!hay.includes(q))return false;if(type&&l.lead_type!==type)return false;if((l.score||0)<min)return false;if(special==='multi'&&!p.is_multifamily)return false;if(special==='absentee'&&!p.absentee)return false;if(special==='tax'&&!l.tax_foreclosure)return false;if(special==='best'&&!(typeof bestDeal==='function'&&bestDeal(l)))return false;if(special==='new'&&l.scan_status!=='new')return false;if(special==='updated'&&l.scan_status!=='updated')return false;return true}).sort((a,b)=>(b.score||0)-(a.score||0));
}
function filteredPdfSummary(){
  const q=document.getElementById('q'),type=document.getElementById('type'),score=document.getElementById('score'),special=document.getElementById('special'),parts=[];
  if(q&&q.value.trim())parts.push(`Search: ${q.value.trim()}`);
  if(type&&type.value)parts.push(`Type: ${type.options[type.selectedIndex]?.text||type.value}`);
  if(score)parts.push(`Score: ${score.options[score.selectedIndex]?.text||score.value}`);
  if(special&&special.value)parts.push(`Property filter: ${special.options[special.selectedIndex]?.text||special.value}`);
  return parts.join(' | ')||'No active filters';
}
async function shareFilteredPdf(){
  try{
    if(typeof payload==='undefined'||!payload)throw new Error('No scan results are loaded yet.');
    const leads=filteredLeadsForPdf();
    if(!leads.length)throw new Error('No leads match the current filters.');
    const src=(payload.stats||{}).source_health||{},stats={total_leads:leads.length,best_deal_leads:leads.filter(x=>typeof bestDeal==='function'&&bestDeal(x)).length,new_leads:leads.filter(x=>x.scan_status==='new').length,updated_leads:leads.filter(x=>x.scan_status==='updated').length,hot_leads:leads.filter(x=>(x.score||0)>=70).length,foreclosure_leads:leads.filter(x=>x.lead_type==='foreclosure').length,tired_landlord_parcel_leads:leads.filter(x=>x.lead_type==='tired_landlord').length,source_health:src};
    const summary=filteredPdfSummary(),data={generated_at:payload.generated_at,stats,leads};
    const {doc,filename,count}=buildScanPdf(data,{title:'Filtered Scan Results',filterSummary:summary,filenamePrefix:'Cuyahoga-Filtered-Results'});
    await sharePdfFile(doc,filename,'Cuyahoga Filtered Results',`Filtered Cuyahoga scan results - ${count} leads`);
  }catch(e){if(e&&e.name==='AbortError')return;alert('Could not create/share the filtered PDF: '+(e.message||e))}
}
function installFilteredPdfButton(){
  const filters=document.querySelector('.filters');if(!filters||document.getElementById('shareFilteredPdf'))return;
  const row=document.createElement('div');row.style.cssText='display:flex;justify-content:flex-end;margin:-2px 0 12px';
  const b=document.createElement('button');b.id='shareFilteredPdf';b.type='button';b.className='runbtn';b.style.background='#7c3aed';b.textContent='📄 Share Filtered PDF';b.addEventListener('click',shareFilteredPdf);row.appendChild(b);filters.insertAdjacentElement('afterend',row);
}
document.addEventListener('DOMContentLoaded',installFilteredPdfButton);
