import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

const API=(import.meta.env.VITE_VZOTA_API_URL||'https://vzota-api.onrender.com').replace(/\/$/,'');
const SAVED='vzota_mrvy_session';
const MRVY_MODE='vzota_mrvy_student_mode';
const BTN='rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50';
function sha32(t){let h=2166136261;for(const c of String(t||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function shuffle(arr,seed){const a=[...arr];let s=seed>>>0;for(let i=a.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function arrangement(qs,settings,code){
  return ['mcq','tf','short'].flatMap(type=>{
    const group=qs.filter(q=>(q.type||'mcq')===type);
    const ordered=settings?.mix?shuffle(group,sha32(`${settings.seed}:${code}:${type}:order`)):group;
    return ordered.map(q=>{
      if(type!=='mcq'||!settings?.mix||!settings?.shuffleOptions)return {...q};
      const positions=shuffle(q.options.map((_,i)=>i),sha32(`${settings.seed}:${code}:${q.id}:${q.question}:abcd`));
      return {...q,options:positions.map(i=>q.options[i])};
    });
  });
}
const b64 = value => Uint8Array.from(atob(String(value||'')),c=>c.charCodeAt(0));
async function decryptExam(content,keyText,examCode){
  const envelope=JSON.parse(content);
  if(envelope?.format!=='vy-secure-aesgcm-2026'||envelope.version!==4)throw Error('Định dạng đề Drive không phù hợp.');
  const key=await crypto.subtle.importKey('raw',b64(keyText),'AES-GCM',false,['decrypt']);
  let bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(envelope.iv)},key,b64(envelope.ciphertext)));
  if(envelope.compression==='gzip'){
    if(!window.DecompressionStream)throw Error('Hãy dùng trình duyệt Chrome mới để đọc đề nén.');
    bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  } else if(envelope.compression!=='none')throw Error('Định dạng nén không được hỗ trợ.');
  const bank=JSON.parse(new TextDecoder().decode(bytes));
  if(Array.isArray(bank.variants)){
    const v=bank.variants.find(v=>String(v.code)===String(examCode));
    if(!v)throw Error('Không tìm thấy đúng mã đề đã giao.');
    return v.questions;
  }
  if(!Array.isArray(bank.questions))throw Error('File Drive không có câu hỏi.');
  return arrangement(bank.questions,bank.settings,examCode);
}
function Rich({html,className=''}){
  const ref=useRef(null);
  const sanitized=useMemo(()=>DOMPurify.sanitize(String(html||''),{
    USE_PROFILES:{html:true,svg:true,mathMl:true},ADD_ATTR:['viewBox','class']
  }),[html]);
  useEffect(()=>{
    try{
      if(ref.current&&window.renderMathInElement)window.renderMathInElement(ref.current,{
        delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],throwOnError:false
      });
    }catch(e){console.warn('Không dựng được công thức:',e);}
  },[sanitized]);
  return <div ref={ref} className={'vy-math-content '+className} dangerouslySetInnerHTML={{__html:sanitized}}/>;
}
async function request(token,path,options={}){
  if(!API)throw Error('Thiếu VITE_VZOTA_API_URL trên Vercel.');
  const res=await fetch(API+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.detail||'Máy chủ không xử lý được yêu cầu.');
  return data;
}
function HomeStudentPortal({auth,onExit}){
  const {token,student}=auth;
  const [data,setData]=useState({lessons:[],documents:[],exams:[]});
  const [scores,setScores]=useState([]);
  const [reviews,setReviews]=useState({});
  const [tab,setTab]=useState('lessons');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [lesson,setLesson]=useState(null);
  const [lessonHtml,setLessonHtml]=useState('');
  const [lessonShowAnswers,setLessonShowAnswers]=useState(false);
  const [iframeUrl,setIframeUrl]=useState('');
  const [previewDoc,setPreviewDoc]=useState(null);
  const [exam,setExam]=useState(null);
  const [questions,setQuestions]=useState([]);
  const [answers,setAnswers]=useState({});
  const [deadline,setDeadline]=useState('');
  const [remaining,setRemaining]=useState(0);
  const [score,setScore]=useState(null);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState('');
  const answerRef=useRef(answers);
  answerRef.current=answers;

  async function refresh(){
    setError('');setLoading(true);
    // Resource errors must NOT prevent checking exam scores, and vice versa.
    const [r1,r2]=await Promise.allSettled([
      request(token,'/api/mrvy/home/resources'),
      request(token,'/api/mrvy/home/scores')
    ]);
    if(r1.status==='fulfilled'){
      setData(r1.value);
      setLesson(old => old && (r1.value.lessons||[]).some(x=>String(x.id)===String(old.id)) ? old : (r1.value.lessons||[])[0]||null);
    }
    if(r2.status==='fulfilled')setScores(r2.value.scores||[]);
    if(r1.status==='rejected')setError('Không tải được học liệu: '+r1.reason.message);
    if(r2.status==='rejected')setNotice('Điểm chưa cập nhật được: '+r2.reason.message);
    setLoading(false);
  }
  useEffect(()=>{refresh();},[token]);
  useEffect(()=>{
    if(tab!=='lessons'||!lesson){setLessonHtml('');return;}
    let live=true;
    setLessonHtml('');
    request(token,`/api/mrvy/home/lesson/${encodeURIComponent(lesson.id)}/html`)
      .then(d=>{if(live){setLessonHtml(d.html);setLessonShowAnswers(d.showAnswers);}})
      .catch(e=>{if(live)setError('Bài giảng chưa tải được: '+e.message);});
    return()=>{live=false;};
  },[lesson?.id,tab,token]);
  useEffect(()=>{
    if(!lessonHtml){setIframeUrl('');return;}
    const answerLock=lessonShowAnswers?'':`<style>
      #solution-container,#reveal-btn-badge,.dap-an,.loi-giai,.answer,.solution{display:none!important}
      #question-btn{pointer-events:none!important}
    </style>`;
    const scriptRole='<script>window.IS_TEACHER_VIEW=false;</script>';
    const html=lessonHtml.includes('</body>')?lessonHtml.replace('</body>',answerLock+scriptRole+'</body>'):lessonHtml+answerLock+scriptRole;
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    setIframeUrl(url);
    return()=>URL.revokeObjectURL(url);
  },[lessonHtml,lessonShowAnswers]);
  useEffect(()=>{
    if(!exam||score!==null||!deadline)return;
    const update=()=>setRemaining(Math.max(0,Math.floor((new Date(deadline).getTime()-Date.now())/1000)));
    update();const id=setInterval(update,1000);return()=>clearInterval(id);
  },[exam,deadline,score]);
  useEffect(()=>{
    if(!exam||score!==null)return;
    const log=(type,detail={})=>request(token,`/api/mrvy/home/exam/${encodeURIComponent(exam.id)}/event`,{
      method:'POST',body:JSON.stringify({attemptToken:exam.attemptToken,eventType:type,detail})
    }).catch(()=>{});
    const visibility=()=>{if(document.hidden)log('TAB_HIDDEN');};
    const blur=()=>log('WINDOW_BLUR');
    const offline=()=>log('OFFLINE');
    const fullscreen=()=>{if(!document.fullscreenElement)log('EXIT_FULLSCREEN');};
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('fullscreenchange',fullscreen);
    window.addEventListener('blur',blur);window.addEventListener('offline',offline);
    return()=>{document.removeEventListener('visibilitychange',visibility);
      document.removeEventListener('fullscreenchange',fullscreen);
      window.removeEventListener('blur',blur);window.removeEventListener('offline',offline);};
  },[exam,score,token]);
  useEffect(()=>{
    if(!exam||score!==null)return;
    const id=setTimeout(()=>{
      request(token,`/api/mrvy/home/exam/${encodeURIComponent(exam.id)}/save`,{
        method:'POST',body:JSON.stringify({attemptToken:exam.attemptToken,answers})
      }).catch(e=>setNotice('Chưa lưu được câu trả lời mới nhất: '+e.message));
    },750);
    return()=>clearTimeout(id);
  },[answers,exam,score,token]);
  async function viewAnswers(s){
    if(!s.showAnswers||!s.reviewToken)return;
    try{
      const result=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(s.exercise_id)}/review`,{
        method:'POST',body:JSON.stringify({attemptToken:s.reviewToken,answers:{}})
      });
      const lines=(result.answers||[]).map((q,i)=>{
        if(q.type==='tf')return `Câu ${i+1}: ${(q.statements||[]).map(st=>st.isTrue?'Đ':'S').join(' · ')}`;
        if(q.type==='short')return `Câu ${i+1}: ${q.shortAnswer??'—'}`;
        return `Câu ${i+1}: ${'ABCD'[Number(q.correct)]||'—'}`;
      });
      setReviews(prev=>({...prev,[s.id]:lines.join('\n')||'Chưa có đáp án.'}));
    }catch(e){setError('Chưa xem được đáp án: '+e.message);}
  }
  async function openExam(item){
    if(sending)return;
    const past=scores.filter(s=>String(s.exercise_id)===String(item.exercise_id));
    const limit=Number(item.max_attempts||1);
    let retake=false;
    if(past.length>=limit){
      setError(`Em đã sử dụng ${past.length}/${limit} lượt. Không thể làm thêm.`);return;
    }
    if(past.length){
      if(!window.confirm(`Em đã thi ${past.length} lần. Bắt đầu lượt ${past.length+1}/${limit}? Lượt này vẫn tính thời gian mới.`))return;
      retake=true;
    }
    const pw=item.passwordRequired?window.prompt(`Mật khẩu bài kiểm tra dành riêng cho lớp ${student.className}:`):'';
    if(item.passwordRequired&&pw===null)return;
    if(item.passwordRequired&&(!pw||pw.length<4)){setError('Mật khẩu riêng của lớp phải có ít nhất 4 ký tự.');return;}
    setLoading(true);setError('');setNotice('');
    try{
      const result=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(item.exercise_id)}/begin`,{
        method:'POST',body:JSON.stringify({classPassword:pw||'',retake})});
      let content=result.questions||[];
      if(result.driveFileId){
        const payload=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(item.exercise_id)}/content`);
        content=await decryptExam(payload.content,result.driveKey,result.examCode);
      }
      if(!Array.isArray(content)||!content.length)throw Error('Không tải được câu hỏi đã giao.');
      setQuestions(content);
      setAnswers(result.answers||{});
      setDeadline(result.deadlineAt);
      setScore(result.submitted?(result.score??0):null);
      setExam({id:item.exercise_id,title:item.title,code:result.examCode,attemptToken:result.attemptToken,attemptNo:result.attemptNo||1});
      setTab('exams');
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  async function submit(){
    if(!exam||sending||score!==null)return;
    if(remaining>0&&!window.confirm('Nộp bài kiểm tra ngay?'))return;
    setSending(true);setNotice('');
    try{
      const response=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(exam.id)}/submit`,{
        method:'POST',body:JSON.stringify({attemptToken:exam.attemptToken,answers:answerRef.current})});
      setScore(response.score);
      setNotice(response.mrvySynced?'Điểm đã ghi vào MRVY.':'Điểm đã chấm tại Vzota; đang chờ đồng bộ MRVY.');
      refresh();
    }catch(e){setError(e.message);}finally{setSending(false);}
  }
  useEffect(()=>{if(exam&&score===null&&remaining===0&&deadline&&new Date(deadline).getTime()<=Date.now())submit();},[remaining,exam,score,deadline]);
  const setAnswer=(i,value)=>setAnswers(a=>({...a,[String(i)]:value}));
  const NAV=[['lessons','Bài học Slide'],['documents','Tài liệu'],['exams','Bài tập'],['scores','Điểm số']];
  const navButton=([id,name])=><button key={id} onClick={()=>{setTab(id);setError('');if(id!=='exams')setExam(null);}}
    className={'rounded-xl px-3 py-2 text-xs font-extrabold '+(tab===id?'bg-blue-600 text-white':'bg-slate-50 text-slate-700 hover:bg-blue-50')}>{name}</button>;
  const actualGrade=Number(student.grade)||Number(String(student.sourceGrade||'').match(/\d+/)?.[0])||12;
  return <div className="min-h-screen bg-slate-100 pb-20 text-slate-900">
    <header className="sticky top-0 z-20 border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2">
        <b className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white">Ⅱ TOÁN THẦY VY</b>
        <div className="hidden flex-1 items-center justify-center gap-1 lg:flex">{NAV.map(navButton)}</div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold">
          🏠 Lớp Nhà • K{actualGrade} • {student.className} • {student.name}
        </span>
        <button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={refresh}>Làm mới</button>
        <button className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700" onClick={onExit}>Về MRVY</button>
      </div>
    </header>
    <main className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-5">
      {error&&<p className="rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-700">{error}</p>}
      {notice&&<p className="rounded-xl border bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {tab==='lessons'&&<div className="grid gap-3 lg:grid-cols-12">
        <aside className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-3">
          <h3 className="font-black text-blue-900">🏠 BÀI GIẢNG NHÀ • K{actualGrade}</h3>
          {!(data.lessons||[]).length&&<p className="text-sm text-slate-500">Chưa có bài giảng đang mở.</p>}
          {(data.lessons||[]).map(x=><button key={x.id} onClick={()=>setLesson(x)}
            className={'block w-full rounded-xl border p-3 text-left text-sm font-extrabold '+(String(lesson?.id)===String(x.id)?'border-blue-500 bg-blue-50':'bg-slate-50')}>
            {x.title}<span className="mt-2 block text-xs text-emerald-700">👁 Hiện</span>
          </button>)}
        </aside>
        <div className="lg:col-span-9">
          {lesson&&iframeUrl?<iframe key={iframeUrl} src={iframeUrl} title={lesson.title}
            sandbox="allow-scripts allow-modals allow-downloads allow-popups"
            referrerPolicy="no-referrer"
            className="h-[calc(100vh-140px)] min-h-[530px] w-full rounded-xl border bg-white shadow-sm"/>:
            <div className="flex min-h-[400px] items-center justify-center rounded-2xl border bg-white p-6 text-center text-slate-500">
              {lesson?'Đang tải bài học HTML và công thức Toán...':'Chọn bài giảng để xem.'}
            </div>}
        </div>
      </div>}
      {tab==='documents'&&<div className="grid gap-4 lg:grid-cols-12">
        <section className="space-y-2 rounded-2xl border bg-white p-4 lg:col-span-3">
          <h3 className="font-black text-blue-900">📄 TÀI LIỆU K{actualGrade}</h3>
          {(data.documents||[]).map(d=><button key={d.id} onClick={()=>setPreviewDoc(d)}
            className={'block w-full rounded-lg border p-3 text-left text-sm font-bold '+(previewDoc?.id===d.id?'border-blue-500 bg-blue-50':'bg-slate-50')}>{d.title}</button>)}
          {!(data.documents||[]).length&&'Chưa có tài liệu.'}
        </section>
        <div className="lg:col-span-9">{previewDoc?.drive_file_id?<iframe title={previewDoc.title}
            src={`https://drive.google.com/file/d/${encodeURIComponent(previewDoc.drive_file_id)}/preview`}
            className="h-[calc(100vh-150px)] min-h-[530px] w-full rounded-xl border bg-white"/>:
            <div className="rounded-2xl border bg-white p-10 text-center">Chọn tài liệu để xem.</div>}</div>
      </div>}
      {tab==='exams'&&(exam?<div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{if(score===null&&!window.confirm('Thoát màn hình làm bài? Thời gian vẫn tiếp tục chạy.'))return;setExam(null);refresh();}}>← Danh sách</button>
          <b className="text-lg text-blue-900">{exam.title} • Lần {exam.attemptNo} • Mã đề {exam.code}</b>
          <b className="ml-auto text-rose-700">{score!==null?'Đã nộp':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</b>
        </div>
        {score!==null&&<div className="rounded-xl bg-emerald-100 p-5 text-center text-xl font-black text-emerald-800">Điểm: {score} / 10</div>}
        {questions.map((q,i)=><section key={i} className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <p className="font-black text-blue-700">Câu {i+1} • {q.type==='tf'?'Đúng/Sai':q.type==='short'?'Trả lời ngắn':'Trắc nghiệm 4 phương án'}</p>
          <Rich html={q.question} className="text-lg leading-relaxed"/>
          {(q.type||'mcq')==='mcq'&&<div className="grid gap-3 sm:grid-cols-2">{(q.options||[]).map((x,j)=><button key={j} disabled={score!==null}
            className={'rounded-xl border-2 p-4 text-left text-base '+(Number(answers[String(i)])===j?'border-blue-600 bg-blue-50':'border-slate-200 bg-slate-50')}
            onClick={()=>setAnswer(i,j)}><b className="mr-3 text-blue-900">{'ABCD'[j]}.</b><Rich html={x} className="inline-block align-middle"/></button>)}</div>}
          {q.type==='tf'&&(q.statements||[]).map((x,j)=><div key={j} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="min-w-[170px] flex-1"><b className="mr-2 text-blue-700">{'abcd'[j]})</b><Rich html={x.text} className="inline-block"/></span>
            {[true,false].map(v=><button key={String(v)} disabled={score!==null}
              className={'rounded-lg border px-4 py-2 text-sm font-bold '+(answers[String(i)]?.[String(j)]===v?'bg-blue-600 text-white':'bg-white')}
              onClick={()=>setAnswer(i,{...(answers[String(i)]||{}),[String(j)]:v})}>{v?'Đúng':'Sai'}</button>)}</div>)}
          {q.type==='short'&&<input className="w-full max-w-xs rounded-xl border p-3" disabled={score!==null}
            value={String(answers[String(i)]||'')} onChange={e=>setAnswer(i,e.target.value)} placeholder="Nhập đáp số"/>}
        </section>)}
        {score===null&&<button className={BTN} disabled={sending} onClick={submit}>{sending?'Đang nộp bài...':'Nộp bài kiểm tra'}</button>}
      </div>:<div className="space-y-3">
        <h2 className="font-black text-blue-900">📝 ĐỀ KIỂM TRA ĐÃ GIAO CHO LỚP {student.className}</h2>
        {(data.exams||[]).map(e=><article key={e.exercise_id}
          className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex-1"><b className="text-lg">{e.title}</b><p className="text-sm text-slate-500">{e.duration_minutes} phút • Lớp {student.className} • Tối đa {e.max_attempts||1} lượt {e.passwordRequired?'• Cần mật khẩu lớp':''}</p></div>
          <button onClick={()=>openExam(e)} className={BTN}>Vào làm bài</button></article>)}
        {!(data.exams||[]).length&&<p className="rounded-xl bg-white p-8 text-center">Chưa có đề giao cho lớp này.</p>}
      </div>)}
      {tab==='scores'&&<section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-black text-blue-900">🏆 ĐIỂM KIỂM TRA</h2>
        {(scores||[]).map((s,i)=><div key={i} className="flex flex-wrap justify-between gap-3 border-b py-3 text-sm">
          <b>{s.examTitle||'Bài kiểm tra'} • Lần {s.attempt_no||1} • Mã đề {s.examCode||'—'}</b>
          <b className="text-blue-700">{s.score}/10 <span className="text-xs text-emerald-700">(Cao nhất: {s.bestScore ?? s.score})</span></b>
          <span className={s.mrvySynced?'text-emerald-700':'text-amber-700'}>{s.mrvySynced?'Đã ghi nhận ở MRVY':'Chờ đồng bộ MRVY'}</span>
          {s.showAnswers&&s.reviewToken&&<button className="rounded-lg border px-3 py-1 text-xs" onClick={()=>viewAnswers(s)}>Xem đáp án</button>}
          {reviews[s.id]&&<pre className="w-full whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{reviews[s.id]}</pre>}
        </div>)}
        {!scores.length&&<p>Chưa có điểm.</p>}
      </section>}
      {loading&&<div className="text-center text-slate-500">Đang tải dữ liệu...</div>}
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-white p-2 shadow-lg lg:hidden">{NAV.map(navButton)}</nav>
  </div>;
}
export default function MrvyGateway({children}){
  const [auth,setAuth]=useState(null);
  // Luôn khóa giao diện cũ đến khi xác minh xong, tránh lóe màn quản trị.
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    const url=new URL(window.location.href);
    const fromMrvy=url.searchParams.has('mrvy_code');
    const code=url.searchParams.get('mrvy_code');
    const safeError=message=>{if(mounted){setError(message);setLoading(false);}};
    if(fromMrvy){
      sessionStorage.setItem(MRVY_MODE,'1');
      sessionStorage.removeItem(SAVED); // Không tái sử dụng tài khoản học sinh MRVY cũ.
      url.searchParams.delete('mrvy_code');
      history.replaceState(null,'',url.pathname+url.search+url.hash);
      if(!/^[a-f0-9]{64}$/.test(String(code||''))){
        safeError('Mã chuyển từ MRVY không hợp lệ. Em hãy mở lại từ MRVY.');
        return ()=>{mounted=false;};
      }
      fetch(API+'/api/mrvy/exchange',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})
      }).then(async r=>{
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw Error(d.detail||'Không xác minh được tài khoản học sinh từ MRVY.');
        const s=d.student||{};
        if(s.category!=='home'||![10,11,12].includes(Number(s.grade))||!String(s.className||'').trim()||!d.token)
          throw Error('MRVY chưa cung cấp đúng khối/lớp hoặc phiên học sinh.');
        return d;
      }).then(d=>{
        if(mounted){sessionStorage.setItem(SAVED,JSON.stringify(d));setAuth(d);}
      }).catch(e=>safeError(e.message)).finally(()=>{if(mounted)setLoading(false);});
      return()=>{mounted=false;};
    }
    // Một khi tab này được MRVY mở, không bao giờ rơi về giao diện Admin
    // khi phiên học sinh hết hạn hoặc có lỗi mạng.
    if(sessionStorage.getItem(MRVY_MODE)==='1'||sessionStorage.getItem(SAVED)){
      sessionStorage.setItem(MRVY_MODE,'1');
      try{
        const item=JSON.parse(sessionStorage.getItem(SAVED)||'null');
        if(item?.token&&item.student?.category==='home'&&
            [10,11,12].includes(Number(item.student?.grade))&&
            new Date(item.expiresAt).getTime()>Date.now()){
          if(mounted)setAuth(item);
        }else{
          sessionStorage.removeItem(SAVED);
          if(mounted)setError('Phiên học sinh đã hết hạn. Em hãy trở về MRVY để mở Vzota lại.');
        }
      }catch{
        sessionStorage.removeItem(SAVED);
        if(mounted)setError('Phiên MRVY không hợp lệ. Em hãy mở lại từ MRVY.');
      }
    }
    if(mounted)setLoading(false);
    return()=>{mounted=false;};
  },[]);
  if(loading)return <div className="p-10 text-center">Đang xác thực học sinh MRVY...</div>;
  if(error)return <div className="mx-auto mt-16 max-w-lg rounded-xl border p-6 text-center">
    <p className="font-bold text-red-700">{error}</p>
    <a className="mt-4 inline-block text-blue-700 underline" href={import.meta.env.VITE_MRVY_APP_URL||'https://mrvy.vercel.app'}>Quay về MRVY</a>
  </div>;
  if(auth)return <HomeStudentPortal auth={auth} onExit={()=>{
    sessionStorage.removeItem(SAVED);
    sessionStorage.removeItem(MRVY_MODE);
    location.assign(import.meta.env.VITE_MRVY_APP_URL||'https://mrvy.vercel.app');
  }}/>;
  return children;
}
