/**
 * Word Azota importer — OOXML structural parser.
 * Does not guess unknown correct answers. Original inline math/image order preserved.
 * Requires JSZip in browser, accepts existing WMF SVG decoder from App.jsx.
 */
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MATH = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const VML = 'urn:schemas-microsoft-com:vml';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const esc = s => String(s ?? '').replace(/[&<>"']/g, v => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
const local = node => node?.localName || node?.nodeName?.split(':').pop();
const elementKids = node => Array.from(node?.childNodes || []).filter(n => n.nodeType === 1);
const kids = (node, tag) => elementKids(node).filter(n => local(n) === tag);
const first = (node, tag) => kids(node, tag)[0];
const descend = (node, tag) => Array.from(node?.getElementsByTagName('*') || []).filter(n => local(n) === tag);
const attr = (node, key, ns) => (ns && node?.getAttributeNS(ns,key)) || node?.getAttribute(key) || Array.from(node?.attributes||[]).find(x => x.localName === key)?.value || '';
const val = node => attr(node, 'val', WORD);
const txt = node => Array.from(node?.getElementsByTagName('*')||[]).filter(n=>local(n)==='t').map(n=>n.textContent||'').join('');
const compact = s => String(s??'').replace(/\u00a0/g,' ').replace(/[ \t]{2,}/g,' ').trim();
const cleanPath = s => {
  const parts=[];
  for(const part of ('word/'+String(s||'').replace(/^\//,'').replace(/^word\//,'')).split('/')) {
    if (part==='..') parts.pop(); else if (part && part!=='.') parts.push(part);
  }
  return parts.join('/');
};
const docParsed = xml => {
  const x=new DOMParser().parseFromString(xml,'application/xml');
  if (x.getElementsByTagName('parsererror').length) throw new Error('XML Word bị lỗi hoặc không hợp lệ.');
  return x;
};

// MathML for basic OMML. For unhandled constructs, do not silently flatten a formula.
function omml(node, alerts) {
  const name=local(node);
  const nest=child=>elementKids(child||node).filter(n=>n.namespaceURI===MATH && !['rPr','ctrlPr','fPr','sSupPr','sSubPr','radPr','dPr','accPr','naryPr'].includes(local(n))).map(n=>omml(n,alerts)).join('');
  const part=(tag)=>{const n=first(node,tag);return n?nest(n):'<mrow></mrow>';};
  if(name==='oMath'||name==='oMathPara') return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mrow>${nest()}</mrow></math>`;
  if(name==='r') return `<mtext>${esc(txt(node))}</mtext>`;
  if(name==='f') return `<mfrac>${part('num')}${part('den')}</mfrac>`;
  if(name==='sSup') return `<msup>${part('e')}${part('sup')}</msup>`;
  if(name==='sSub') return `<msub>${part('e')}${part('sub')}</msub>`;
  if(name==='sSubSup') return `<msubsup>${part('e')}${part('sub')}${part('sup')}</msubsup>`;
  if(name==='rad') return first(node,'deg') && txt(first(node,'deg')) ? `<mroot>${part('e')}${part('deg')}</mroot>` : `<msqrt>${part('e')}</msqrt>`;
  if(name==='d') return `<mrow><mo>(</mo>${part('e')}<mo>)</mo></mrow>`;
  if(name==='acc') {
    const chr=val(first(first(node,'accPr'),'chr'))||'̂';
    return `<mover>${part('e')}<mo>${esc(chr)}</mo></mover>`;
  }
  if(['e','num','den','sup','sub','deg','box','limLow','limUpp','groupChr'].includes(name))return `<mrow>${nest()}</mrow>`;
  if(name==='t') return `<mtext>${esc(node.textContent||'')}</mtext>`;
  if(name==='nary') {
    const chr=val(first(first(node,'naryPr'),'chr'))||'∑';
    return `<mrow><munderover><mo>${esc(chr)}</mo>${part('sub')}${part('sup')}</munderover>${part('e')}</mrow>`;
  }
  if(name==='func')return `<mrow>${nest()}</mrow>`;
  alerts.push(`Có công thức OMML phức tạp (${name}); cần đối chiếu lại vì chưa hỗ trợ đầy đủ.`);
  return `<mrow>${nest()}</mrow>`;
}

// Match a *sequence* of A/B/C/D labels rather than a random "A." in prose.
const mcqLabels = text => {
  const re=/(^|[^\p{L}\p{N}_])([*]?[A-D][.)])(?=[\s\u27e6\u27e7$<\\]|[^\p{L}]|$)/gu;
  const matches=[];let m;
  while((m=re.exec(text))!==null) {
    const label=m[2].replace('*','')[0];
    const start=m.index+m[1].length;
    matches.push({label,start,end:start+m[2].length,star:m[2][0]==='*'});
  }
  return matches;
};
const tfLabels=text=>{
  const re=/(^|[^\p{L}\p{N}_])([*]?[a-d][)])(?=[\s\u27e6\u27e7$<\\]|[^\p{L}]|$)/gu;
  const matches=[];let m;
  while((m=re.exec(text))!==null){const start=m.index+m[1].length; matches.push({label:m[2].replace('*','')[0],start,end:start+m[2].length,star:m[2][0]==='*'});}
  return matches;
};
const isMarked=(runs,start,end) => runs.some(r=>r.marked && r.start < end && r.end > start);
const htmlFrom=(raw,media) => {
  return String(raw||'').split(/(⟦WIMG\d+⟧|⟦WTABLE\d+⟧|⟦WMATH\d+⟧)/g)
    .map(part=>Object.hasOwn(media,part)?media[part]:esc(part).replace(/\n/g,'<br/>')).join('');
};
function section(s) {
  const v=compact(s).toUpperCase();
  if (/^(PH[ẦA]N\s*(I|1)\b|I[.)]\s*(?:TRẮC|NHIỀU|CHỌN))/.test(v))return 'mcq';
  if (/^(PH[ẦA]N\s*(II|2)\b|II[.)]\s*(?:ĐÚNG|TRẮC))/.test(v))return 'tf';
  if (/^(PH[ẦA]N\s*(III|3)\b|III[.)]\s*(?:TRẢ|NGẮN))/.test(v))return 'short';
  return null;
}
function isSolution(s){return /^(?:Lời\s*giải|Hướng\s*dẫn\s*giải|Giải\s*:|HD\s*:)/i.test(compact(s));}
function isAnswer(s){return /^(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả|Answer)\s*[:：=]/i.test(compact(s));}
const newQuestion=(sectionName,index)=>({id:index,type:sectionName,question:'',options:['','','',''],correct:null,statements:[],shortAnswer:'',solution:'',parseWarning:'',_stem:[],_options:{},_statements:{},_correctLabels:[],_parts:[],_warnings:[],_solution:[],_answerText:[],_format:'',_active:''});

/** @param {ArrayBuffer} buffer @param {*} zipLib window.JSZip @param {Function} decodeWmf Existing WMF→SVG decoder */
export async function parseAzotaWordFile(buffer,zipLib,decodeWmf) {
  if (!buffer || buffer.byteLength>30*1024*1024)throw new Error('File Word quá 30 MB. Hãy giảm dung lượng ảnh trước khi nhập.');
  const zip=await zipLib.loadAsync(buffer);
  const xml=await zip.file('word/document.xml')?.async('string');
  if(!xml)throw new Error('Không tìm thấy word/document.xml; chỉ hỗ trợ file DOCX hợp lệ.');
  if(xml.length>15*1024*1024)throw new Error('Nội dung XML Word quá lớn hoặc bất thường (trên 15 MB).');
  const document=docParsed(xml);
  const relationships=zip.file('word/_rels/document.xml.rels');
  const relDoc=relationships?docParsed(await relationships.async('string')):null;
  const rels=new Map();
  for(const n of relDoc?Array.from(relDoc.getElementsByTagName('*')):[]) {
    if(local(n)==='Relationship') rels.set(attr(n,'Id'),attr(n,'Target'));
  }
  const media={};const notes=[];const hard=[];const resourceCache=new Map();
  const mediaStats={mathTypeWmf:0,emf:0,bitmap:0,omml:0,tables:0,unrendered:0};
  let nextMedia=0;
  const addMedia=async(html,tag='WIMG')=>{const k=`⟦${tag}${++nextMedia}⟧`;media[k]=html;return k;};
  const resolveImage=async rId=>{
    if(!rId)return '';
    if(resourceCache.has(rId))return resourceCache.get(rId);
    const target=rels.get(rId);if(!target)return '';
    const path=cleanPath(target);
    const entry=zip.file(path);
    if(!entry){mediaStats.unrendered++;const k=await addMedia('[CHUA_DOC_HINH]');resourceCache.set(rId,k);return k;}
    const ext=(target.match(/\.([^.?#]+)(?:[?#]|$)/)?.[1]||'').toLowerCase();
    let html='';
    if(['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) {
      mediaStats.bitmap++;
      const mime=ext==='jpg'?'jpeg':ext;
      html=`<img alt="Hình trong đề Word" src="data:image/${mime};base64,${await entry.async('base64')}" style="display:inline-block;max-width:100%;max-height:350px;height:auto;vertical-align:middle"/>`;
    } else if(ext==='wmf') {
      mediaStats.mathTypeWmf++;
      try {const svg=decodeWmf(await entry.async('uint8array'));
        if(svg && /^\s*<svg\b/i.test(svg))html=`<span class="inline-block align-middle max-w-full" title="Công thức WMF chuyển SVG, cần đối chiếu">${svg}</span>`;
      } catch(_){/* Missing glyphs remain blocking */}
      if(!html) {mediaStats.unrendered++;html='[CHUA_DOC_CONG_THUC]';}
    } else if(ext==='emf') {
      mediaStats.emf++;mediaStats.unrendered++;html='[CHUA_DOC_CONG_THUC]';
    } else {
      mediaStats.unrendered++;html='[CHUA_DOC_HINH]';
    }
    const k=await addMedia(html);resourceCache.set(rId,k);return k;
  };
  const metaFor=(r)=>{
    const pr=first(r,'rPr');const u=first(pr,'u');
    const underline=!!u && !['none','0','false'].includes(String(val(u)).toLowerCase());
    const color=val(first(pr,'color')).toUpperCase();
    const red=['FF0000','C00000','EE0000','DC2626','EF4444'].includes(color);
    return underline||red;
  };
  const extractParagraph=async p=>{
    let text='';const runs=[];const localMedia=[];
    const append=(value,marked=false)=>{
      if(!value)return;
      const start=text.length;text+=value;
      runs.push({start,end:text.length,marked});
    };
    const walk=async(node,marked=false)=>{
      const ns=node.namespaceURI;
      const n=local(node);
      if(ns===WORD && n==='r') {
        const mark=marked||metaFor(node);
        for(const child of elementKids(node))await walk(child,mark);
        return;
      }
      if(ns===WORD && n==='t')return append(node.textContent||'',marked);
      if(ns===WORD && n==='tab')return append(' \t ',marked);
      if(ns===WORD && ['br','cr'].includes(n))return append('\n',marked);
      if(ns===MATH && ['oMath','oMathPara'].includes(n)) {
        mediaStats.omml++;const warnings=[];const s=omml(node,warnings);
        notes.push(...warnings);
        append(await addMedia(s,'WMATH'),false);return;
      }
      if(n==='drawing'||n==='pict'||n==='object'){
        // Image may appear under multiple wrappers; collect unique relationship IDs.
        const ids=[];
        for(const child of [node,...descend(node,'blip'),...descend(node,'imagedata')]){
          if(!['blip','imagedata'].includes(local(child)))continue;
          const rid=attr(child,'embed',REL)||attr(child,'id',REL);
          if(rid&&!ids.includes(rid))ids.push(rid);
        }
        for(const id of ids)append(await resolveImage(id),false);
        return;
      }
      if(ns===WORD && ['pPr','rPr','numPr','proofErr','bookmarkStart','bookmarkEnd','lastRenderedPageBreak'].includes(n))return;
      if(ns===WORD && n==='del')return; // Ignore deleted tracked changes.
      for(const child of elementKids(node))await walk(child,marked);
    };
    for(const child of elementKids(p))await walk(child,false);
    const numbered=descend(first(p,'pPr'),'numPr').length>0;
    const removed=(text.match(/^\s*/)||[''])[0].length;
    return {text:text.trim().replace(/\u00a0/g,' '),runs:runs.map(r=>({...r,start:r.start-removed,end:r.end-removed})),numbered};
  };

  const body=descend(document,'body')[0];if(!body)throw new Error('File Word không có phần nội dung chính.');
  const lines=[];
  for(const node of elementKids(body)) {
    if(local(node)==='p') {const p=await extractParagraph(node);if(p.text)lines.push(p);}
    if(local(node)==='tbl') {
      mediaStats.tables++;
      const tableText=txt(node);
      if(/\bCâu\s*\d+\b/i.test(tableText))hard.push('Có câu hỏi nằm bên trong bảng Word; chưa thể tách tự động an toàn. Hãy chuyển câu đó ra các đoạn Word bình thường.');
      let table='<table style="border-collapse:collapse;margin:8px 0;max-width:100%;font-size:0.9em" border="1">';
      for(const row of kids(node,'tr')) {
        table+='<tr>';
        for(const cell of kids(row,'tc')) {
          const c=[];for(const p of kids(cell,'p')){const fragment=await extractParagraph(p);if(fragment.text)c.push(htmlFrom(fragment.text,media));}
          table+=`<td style="border:1px solid #64748b;padding:5px 8px">${c.join('<br/>')}</td>`;
        }
        table+='</tr>';
      }
      table+='</table>';
      const mark=await addMedia(table,'WTABLE');lines.push({text:mark,runs:[],numbered:false});
    }
  }
  if(mediaStats.mathTypeWmf)notes.push(`Có ${mediaStats.mathTypeWmf} ảnh WMF (thường là MathType); SVG được dựng xấp xỉ, phải đối chiếu với Word gốc trước khi giao.`);
  if(mediaStats.emf)notes.push(`Có ${mediaStats.emf} ảnh EMF không hỗ trợ kết xuất an toàn trong trình duyệt.`);
  if(mediaStats.tables)notes.push(`Có ${mediaStats.tables} bảng Word; đã giữ cấu trúc hàng/cột ở HTML, cần kiểm tra độ rộng và công thức trong ô.`);
  if(mediaStats.unrendered)hard.push(`Có ${mediaStats.unrendered} hình/công thức chưa kết xuất được.`);
  const questions=[];let sectionNow='mcq';let current=null;let autoIndex=0;let optionsSeen=false;
  const flush=()=>{if(current){questions.push(current);current=null;}optionsSeen=false;};
  const start=(type)=>{flush();current=newQuestion(type,questions.length+1);};
  const appendChunk=(q,field,s)=>{if(s?.trim())q[field].push(s.trim());};
  for(const line of lines) {
    let s=line.text; let styleRuns=line.runs; if(!s)continue;
    const part=section(s);
    if(part){flush();sectionNow=part;autoIndex=0;continue;}
    // Reject trailing answer-key grids from being parsed as questions.
    if(/^(?:BẢNG\s*ĐÁP\s*ÁN|ĐÁP\s*ÁN\s*TRẮC\s*NGHIỆM|ANSWER\s*KEY)/i.test(s)) {flush();notes.push('Phát hiện bảng đáp án cuối đề: hãy so sánh thủ công với các đáp án đã nhận diện.');break;}
    const explicit=s.match(/^(?:Câu|Question|Q)\s*(\d+)\s*[.\):：-]?\s*(.*)$/i);
    if(explicit){
      start(sectionNow);autoIndex++;
      const remainder=explicit[2].trim();
      const inline=sectionNow==='tf'?tfLabels(remainder):sectionNow==='mcq'?mcqLabels(remainder):[];
      if(inline.length && inline[0].label===(sectionNow==='tf'?'a':'A')){
        const prefix=remainder.slice(0,inline[0].start).trim();
        if(prefix)appendChunk(current,'_stem',prefix);
        s=remainder.slice(inline[0].start);
        const originalOffset=line.text.indexOf(s);
        styleRuns=line.runs.map(r=>({...r,start:r.start-originalOffset,end:r.end-originalOffset}));
      }else {if(remainder)appendChunk(current,'_stem',remainder);continue;}
    }
    const mcq=mcqLabels(s);
    const tfl=tfLabels(s);
    const startsMCQ=mcq.length>0 && (mcq[0].start===0 || s.slice(0,mcq[0].start).trim()==='') && sectionNow==='mcq';
    const startsTF=tfl.length>0 && (tfl[0].start===0 || s.slice(0,tfl[0].start).trim()==='') && sectionNow==='tf';
    // Word autonumbering: the body paragraph carries numPr, options and statements don't.
    if(line.numbered && !startsMCQ && !startsTF){
      const priorHasAnswers=current && (Object.keys(current._options).length>0 || Object.keys(current._statements).length>0 || current.shortAnswer || current._active==='answer' || current._active==='solution');
      if(current && !priorHasAnswers){
        notes.push('Một đoạn đánh số xuất hiện bên trong câu đang đọc; đã giữ cùng câu để tránh tách nhầm. Hãy đối chiếu câu đó.');
        appendChunk(current,'_stem',s);
      } else {start(sectionNow);autoIndex++;appendChunk(current,'_stem',s);}
      continue;
    }
    if(!current) {if(startsMCQ||startsTF){start(sectionNow);}else{notes.push(`Văn bản trước câu đầu chưa đưa vào đề: ${s.slice(0,64)}`);continue;}}
    if(isSolution(s)){current._active='solution';const text=s.replace(/^(?:Lời\s*giải|Hướng\s*dẫn\s*giải|Giải\s*:|HD\s*:)\s*[:：]?/i,'').trim();appendChunk(current,'_solution',text);continue;}
    if(isAnswer(s)){
      const answer=s.replace(/^(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả|Answer)\s*[:：=]\s*/i,'').trim();
      if(current.type==='short')current.shortAnswer=answer.replace(/\s+/g,'');
      if(current.type==='mcq'){
        const a=answer.match(/^([A-D])\b/i);if(a)current._correctLabels.push(a[1].toUpperCase());
        else current._warnings.push('Dòng đáp án ABCD không rõ ký hiệu A/B/C/D.');
      }
      current._active='answer';continue;
    }
    if(current._active==='solution'){appendChunk(current,'_solution',s);continue;}
    if(current.type==='mcq' && startsMCQ){
      for(let i=0;i<mcq.length;i++) {
        const m=mcq[i];const next=mcq[i+1];
        const content=s.slice(m.end,next?next.start:s.length).trim();
        if(current._options[m.label])current._warnings.push(`Lựa chọn ${m.label} bị xuất hiện nhiều lần.`);
        current._options[m.label]=(current._options[m.label]||[]).concat(content);
        if(m.star||isMarked(styleRuns,m.start,m.end))current._correctLabels.push(m.label);
        current._active=`option:${m.label}`;
      }
      continue;
    }
    if(current.type==='tf'&&startsTF){
      for(let i=0;i<tfl.length;i++){
        const m=tfl[i];const next=tfl[i+1];let content=s.slice(m.end,next?next.start:s.length).trim();
        let yes=null;
        if(m.star||isMarked(styleRuns,m.start,m.end))yes=true;
        if(/\[(?:Đ|ĐÚNG|TRUE)\]\s*$/i.test(content)){yes=true;content=content.replace(/\[(?:Đ|ĐÚNG|TRUE)\]\s*$/i,'').trim();}
        if(/\[(?:S|SAI|FALSE)\]\s*$/i.test(content)){yes=false;content=content.replace(/\[(?:S|SAI|FALSE)\]\s*$/i,'').trim();}
        if(current._statements[m.label]) current._warnings.push(`Mệnh đề ${m.label}) xuất hiện nhiều lần.`);
        current._statements[m.label]={segments:[content],marked:yes};
        current._active=`statement:${m.label}`;
      }
      continue;
    }
    // Continuations: text may follow the labelled option or statement on a new Word paragraph.
    const active=current._active;
    if(active?.startsWith('option:'))current._options[active.split(':')[1]]?.push(s);
    else if(active?.startsWith('statement:'))current._statements[active.split(':')[1]]?.segments.push(s);
    else appendChunk(current,'_stem',s);
  }
  flush();
  const summary={mcq:0,tf:0,short:0};
  for(const q of questions){
    summary[q.type]++;
    q.question=htmlFrom(q._stem.join(' '),media);
    q.solution=htmlFrom(q._solution.join(' '),media);
    if(q.type==='mcq'){
      q.options='ABCD'.split('').map(c=>htmlFrom((q._options[c]||[]).join(' '),media));
      const answers=[...new Set(q._correctLabels)];
      if(answers.length===1)q.correct='ABCD'.indexOf(answers[0]);
      else if(answers.length>1)q._warnings.push('Có nhiều hơn một đáp án ABCD được đánh dấu.');
      if(q.options.some(s=>!s.trim()))q._warnings.push('Thiếu phương án hoặc công thức/hình chưa đọc được.');
    } else if(q.type==='tf'){
      const items='abcd'.split('').map(c=>q._statements[c]);
      const anyMarked=items.some(v=>v?.marked===true);
      q.statements=items.map((v,i)=>({label:`${'abcd'[i]})`,text:htmlFrom(v?.segments.join(' ')||'',media),isTrue:v?(v.marked===true?true:v.marked===false?false:anyMarked?false:null):null}));
      if(items.some(v=>!v))q._warnings.push('Thiếu mệnh đề a/b/c/d.');
      if(!anyMarked && items.some(v=>v?.marked===null))q._warnings.push('Không tìm thấy dấu đáp án Đúng/Sai; cần điền bằng tay.');
    } else if(q.type==='short'){
      if(!q.shortAnswer)q._warnings.push('Không tìm thấy dòng Đáp án: cho câu trả lời ngắn.');
    }
    if(/\[CHUA_DOC_(?:HINH|CONG_THUC)\]/.test(JSON.stringify(q)))q._warnings.push('Chứa công thức/hình chưa đọc được.');
    q.parseWarning=[...new Set(q._warnings)].join(' ');
    delete q._stem;delete q._options;delete q._statements;delete q._correctLabels;delete q._parts;
    delete q._warnings;delete q._solution;delete q._answerText;delete q._format;delete q._active;
  }
  if(JSON.stringify(questions).length>12*1024*1024)hard.push('Đề được trích xuất quá lớn để lưu an toàn lên Drive (>12 MB). Hãy nén hình hoặc chia đề.');
  if(!questions.length)hard.push('Không tìm thấy câu hỏi nào.');
  if(!summary.mcq && !summary.tf && !summary.short)hard.push('Không nhận diện được cấu trúc của đề.');
  return {questions,summary,notes:[...new Set(notes)],errors:[...new Set(hard)],mediaStats,paragraphs:lines.length};
}

// Pure helper used in regression tests and for manual text edge-case checks.
export const AZOTA_TEST_HELPERS={mcqLabels,tfLabels,section};
