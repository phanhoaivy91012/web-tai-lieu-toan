import React, { useMemo, useState } from 'react';

// Editor for mixed Word text + MathType raster images. The original image remains
// intact until the teacher explicitly confirms a LaTeX replacement.
function piecesOf(html) {
  const source = String(html || '');
  const re = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const pieces=[];
  let prev=0, match;
  while ((match=re.exec(source))) {
    if (match.index>prev) pieces.push({kind:'text',start:prev,end:match.index,raw:source.slice(prev,match.index)});
    const tag=match[0];
    const attr=(key)=>{
      const m=new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i').exec(tag);
      return m?(m[1]??m[2]??''):'';
    };
    const src=attr('src');
    const alt=attr('alt');
    const isFormula=attr('data-vy-word-kind')==='formula' || /Công thức|MathType|WMF\/EMF/i.test(alt);
    pieces.push({kind:'image',start:match.index,end:re.lastIndex,raw:tag,src,alt,isFormula});
    prev=re.lastIndex;
  }
  if (prev<source.length || !pieces.length) pieces.push({kind:'text',start:prev,end:source.length,raw:source.slice(prev)});
  return pieces;
}

function cleanAI(input) {
  let text=String(input||'').trim().replace(/^```(?:latex|tex)?\s*/i,'').replace(/\s*```$/,'').trim();
  for (const [a,b] of [['\\(','\\)'],['\\[','\\]'],['$$','$$'],['$','$']]) {
    if(text.startsWith(a) && text.endsWith(b)) { text=text.slice(a.length,-b.length).trim();break; }
  }
  return text;
}

function ImageToLatex({part,onReplace,geminiApiKey,PreviewComponent}) {
  const [tex,setTex]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const src=/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(part.src)?part.src:'';
  const usable=src && part.isFormula;
  const testTex=()=>{
    const normalized=cleanAI(tex);
    if (!normalized) {setMessage('Hãy nhập LaTeX trước khi thay ảnh.');return null;}
    try {
      if (!window.katex?.renderToString) {
        setMessage('Chưa tải được KaTeX để kiểm tra công thức. Hãy tải lại trang rồi thử lại.');
        return null;
      }
      window.katex.renderToString(normalized,{throwOnError:true});
    } catch(e) {setMessage('LaTeX chưa hợp lệ: '+e.message);return null;}
    return normalized;
  };
  const suggest=async()=>{
    if(!src) return setMessage('Ảnh không ở dạng PNG/JPEG Base64 được hỗ trợ.');
    if(!geminiApiKey?.trim()) return setMessage('Chưa có Gemini API Key; có thể nhập LaTeX thủ công.');
    if(!window.confirm('Chỉ gửi ẢNH CÔNG THỨC này tới Gemini để đề xuất LaTeX? Không tự ghi đè nội dung đề.'))return;
    setBusy(true);setMessage('');
    try {
      const found=/^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(src);
      if(!found)throw new Error('Định dạng ảnh không hợp lệ.');
      const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey.trim())}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[
          {text:'Đây là một ảnh công thức toán học lấy từ Word. Hãy phiên chính xác riêng công thức trong ảnh thành LaTeX dùng được với KaTeX. Chỉ trả về mã LaTeX KHÔNG kèm dấu $, markdown, văn bản giải thích. Giữ đủ dấu mũ, căn, vectơ, phân số, dấu âm, dấu ngoặc, chỉ số. Nếu không đủ rõ để xác định thì trả về CHUA_RO.'},
          {inline_data:{mime_type:found[1],data:found[2]}}
        ]}],generationConfig:{temperature:0}})
      });
      const obj=await res.json();
      if(!res.ok)throw new Error(obj.error?.message||`HTTP ${res.status}`);
      const generated=cleanAI((obj.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n'));
      if(!generated||generated.includes('CHUA_RO'))throw new Error('AI không đủ chắc chắn để nhận diện ảnh.');
      setTex(generated);
      setMessage('Đã nhận mã đề xuất. Bắt buộc đối chiếu ảnh gốc và bấm “Thay ảnh bằng LaTeX” nếu đúng.');
    }catch(e){setMessage('Không đề xuất được LaTeX: '+e.message);}
    finally{setBusy(false);}
  };
  return <section className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
    <div className="text-xs font-semibold text-amber-900">{part.isFormula?'Công thức MathType dạng ảnh — chưa phải LaTeX':'Hình minh họa — giữ ảnh gốc / SVG khi có'}</div>
    <div className="overflow-x-auto rounded bg-white p-2">
      {src?<img src={src} alt={part.alt||'Ảnh gốc của đề'} style={{maxWidth:'100%',maxHeight:part.isFormula?110:270,width:'auto',height:'auto'}}/>
      : <PreviewComponent content={part.raw}/>}
    </div>
    {part.isFormula && <>
      <p className="text-xs text-slate-600">Có thể nhập LaTeX thủ công hoặc nhấn AI đề xuất. Không xóa ảnh nếu công thức chưa đối chiếu đúng Word.</p>
      <textarea rows={2} spellCheck={false} className="w-full rounded border bg-white p-2 font-mono text-xs" placeholder={String.raw`VD: \vec{u}=(1;2;3) hoặc \frac{3}{\sqrt{5}}`} value={tex} onChange={e=>{setTex(e.target.value);setMessage('');}}/>
      {tex.trim() && <div className="rounded border bg-white p-2"><div className="mb-1 text-xs text-slate-500">Xem trước LaTeX:</div><PreviewComponent content={`\\(${cleanAI(tex)}\\)`}/></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy||!src} onClick={suggest} className="rounded border bg-white px-2 py-1.5 text-xs font-bold disabled:opacity-50">{busy?'Đang nhận dạng…':'AI đề xuất LaTeX'}</button>
        <button type="button" onClick={()=>{const valid=testTex();if(valid && window.confirm('Đã so sánh công thức LaTeX với ảnh Word gốc và xác nhận chính xác?')){onReplace(`\\(${valid}\\)`);}}} className="rounded bg-indigo-600 px-2 py-1.5 text-xs font-bold text-white">Thay ảnh bằng LaTeX đã duyệt</button>
      </div>
      {message && <p className="text-xs text-amber-900">{message}</p>}
    </>}
  </section>;
}

export default function WordFormulaEditor({value,onChange,geminiApiKey,PreviewComponent}) {
  const parts=useMemo(()=>piecesOf(value),[value]);
  const replace=(part,replacement)=>onChange(String(value||'').slice(0,part.start)+replacement+String(value||'').slice(part.end));
  return <div className="mt-2 space-y-2">
    <p className="text-xs text-slate-600">Chỉnh từng đoạn chữ hoặc công thức. Ảnh gốc được giữ nguyên tới khi bạn xác nhận thay bằng LaTeX.</p>
    {parts.map((part,i)=>part.kind==='image'
      ? <ImageToLatex key={`img-${i}-${part.start}`} part={part} geminiApiKey={geminiApiKey} PreviewComponent={PreviewComponent} onReplace={latex=>replace(part,latex)}/>
      : <div className="rounded border p-2 space-y-1" key={`text-${i}-${part.start}`}>
          <div className="text-xs font-bold text-slate-600">{parts.length===1?'Sửa chữ / LaTeX':'Đoạn văn bản '+(i+1)}</div>
          <textarea rows={Math.max(2,Math.min(5,Math.ceil(part.raw.length/65)))} spellCheck={false} className="w-full rounded border p-2 text-sm font-mono" value={part.raw} onChange={e=>replace(part,e.target.value)}/>
          {part.raw.trim() && <PreviewComponent content={part.raw}/>}
        </div>)}
    <details className="rounded border bg-slate-50 p-2">
      <summary className="cursor-pointer text-xs font-bold">Nâng cao: xem/sửa HTML gốc (có thể chứa Base64 rất dài)</summary>
      <textarea className="mt-2 w-full rounded border p-2 font-mono text-xs" rows={3} spellCheck={false} value={value} onChange={e=>onChange(e.target.value)}/>
    </details>
  </div>;
}

export const WORD_MATH_EDITOR_TESTS={piecesOf,cleanAI};
