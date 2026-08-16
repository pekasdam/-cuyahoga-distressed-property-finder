function pdfClean(v=''){return String(v??'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim()}
function pdfMoney(v){return v==null||v===''?'-':'$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:0})}
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
    const {doc,filename,addr}=buildLeadPdf(l),blob=doc.output('blob'),file=new File([blob],filename,{type:'application/pdf'});
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:`Property Report - ${addr}`,text:`Cuyahoga property research report for ${addr}`});return}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);alert('PDF created. Open the downloaded PDF and use Share to send it by Messages or Mail.');
  }catch(e){if(e&&e.name==='AbortError')return;alert('Could not create/share the PDF: '+(e.message||e))}
}
