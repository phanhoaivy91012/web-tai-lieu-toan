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
  const [tab,setTab]=useState('exams');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
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
    try{
      const [result,resultScores]=await Promise.all([
        request(token,'/api/mrvy/home/resources'),request(token,'/api/mrvy/home/scores')
      ]);
      setData(result);setScores(resultScores.scores||[]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{refresh();},[token]);
  useEffect(()=>{
    if(!exam||score!==null||!deadline)return;
    const update=()=>setRemaining(Math.max(0,Math.floor((new Date(deadline).getTime()-Date.now())/1000)));
    update();const id=setInterval(update,1000);return()=>clearInterval(id);
  },[exam,deadline,score]);
  useEffect(()=>{
    if(!exam||score!==null)return;
    const handle=type=>{
      request(token,`/api/mrvy/home/exam/${encodeURIComponent(exam.id)}/event`,{
        method:'POST',body:JSON.stringify({attemptToken:exam.attemptToken,eventType:type,detail:{}})
      }).catch(()=>{});
    };
    const visibility=()=>{if(document.hidden)handle('TAB_HIDDEN');};
    const blur=()=>handle('WINDOW_BLUR');
    const offline=()=>handle('OFFLINE');
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('blur',blur);
    window.addEventListener('offline',offline);
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('offline',offline);};
  },[exam,score,token]);
  useEffect(()=>{
    if(!exam||score!==null)return;
    const id=setTimeout(()=>{
      request(token,`/api/mrvy/home/exam/${encodeURIComponent(exam.id)}/save`,{
        method:'POST',body:JSON.stringify({attemptToken:exam.attemptToken,answers})
      }).catch(e=>setNotice('Cảnh báo: Chưa lưu được câu trả lời mới nhất: '+e.message));
    },750);
    return()=>clearTimeout(id);
  },[answers,exam,score,token]);
  async function openExam(item){
    setLoading(true);setError('');setNotice('');
    try{
      const result=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(item.exercise_id)}/begin`,{method:'POST'});
      let content=result.questions||[];
      if(result.driveFileId){
        const payload=await request(token,`/api/mrvy/home/exam/${encodeURIComponent(item.exercise_id)}/content`);
        content=await decryptExam(payload.content,result.driveKey,result.examCode);
      }
      if(!Array.isArray(content)||!content.length)throw Error('Đề không có câu hỏi.');
      setQuestions(content);
      setExam({id:item.exercise_id,title:item.title,code:result.examCode,attemptToken:result.attemptToken});
      setAnswers(result.answers||{});
      setDeadline(result.deadlineAt);
      setScore(result.submitted?(result.score??0):null);
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
      setNotice(response.mrvySynced?'Điểm đã chuyển về MRVY.':'Điểm đã lưu ở Vzota; MRVY sẽ đồng bộ khi kết nối trở lại.');
      refresh();
    }catch(e){setError(e.message);}finally{setSending(false);}
  }
  useEffect(()=>{if(exam&&score===null&&remaining===0&&deadline&&new Date(deadline).getTime()<=Date.now())submit();},[remaining,exam,score,deadline]);
  const setAnswer=(i,value)=>setAnswers(a=>({...a,[String(i)]:value}));
  const nav=['exams','lessons','documents','scores'];
  const labels={exams:'Bài kiểm tra',lessons:'Bài học',documents:'Tài liệu',scores:'Điểm số'};
  return <div className="min-h-screen bg-slate-100 p-3 sm:p-6 text-slate-900">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <b className="text-xl text-blue-800">VZOTA • Lớp Nhà</b>
      <span className="text-sm text-slate-500">{student.name} · {student.className} · {student.sourceGrade||''}</span>
      <div className="ml-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={refresh}>Làm mới</button>
      <button className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={onExit}>Về MRVY</button></div>
    </header>
    <main className="mx-auto mt-4 max-w-6xl space-y-4">
      {error&&<p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      {notice&&<p className="rounded-xl bg-yellow-50 p-3 text-amber-900">{notice}</p>}
      {exam?<>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <button className="rounded-lg border px-3 py-2" onClick={()=>{if(score===null&&!window.confirm('Thoát màn hình bài làm? Hệ thống vẫn giữ thời gian và đáp án đã lưu.'))return;setExam(null);refresh();}}>← Danh sách</button>
          <b>{exam.title} · Mã đề {exam.code}</b>
          <span className="ml-auto font-semibold text-rose-700">{score!==null?'Đã nộp':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</span>
        </div>
        {score!==null&&<div className="rounded-xl bg-emerald-50 p-5 text-center text-xl font-extrabold text-emerald-800">Điểm: {score} / 10</div>}
        {questions.map((q,i)=><section key={i} className="space-y-3 rounded-2xl border bg-white p-4 sm:p-6 shadow-sm">
          <div className="font-bold text-blue-800">Câu {i+1} · {q.type==='tf'?'Đúng/Sai':q.type==='short'?'Trả lời ngắn':'Trắc nghiệm'}</div>
          <Rich html={q.question} className="text-base leading-relaxed"/>
          {(q.type||'mcq')==='mcq'&&<div className="grid gap-2 sm:grid-cols-2">{(q.options||[]).map((x,j)=><button key={j} disabled={score!==null}
            className={'rounded-xl border p-3 text-left '+(Number(answers[String(i)])===j?'border-blue-600 bg-blue-50':'bg-slate-50')}
            onClick={()=>setAnswer(i,j)}><b className="mr-2">{'ABCD'[j]}.</b><Rich html={x} className="inline-block align-middle"/></button>)}</div>}
          {q.type==='tf'&&(q.statements||[]).map((x,j)=><div key={j} className="flex flex-wrap items-center gap-2 border-b pb-2">
            <span className="mr-auto flex-1"><b>{'abcd'[j]}) </b><Rich html={x.text} className="inline-block"/></span>
            {[true,false].map(v=><button key={String(v)} disabled={score!==null} className={'rounded-lg border px-3 py-2 '+(answers[String(i)]?.[String(j)]===v?'bg-blue-600 text-white':'bg-white')}
              onClick={()=>setAnswer(i,{...(answers[String(i)]||{}),[String(j)]:v})}>{v?'Đúng':'Sai'}</button>)}</div>)}
          {q.type==='short'&&<input className="w-full max-w-xs rounded-lg border p-3" disabled={score!==null}
            value={String(answers[String(i)]||'')} onChange={e=>setAnswer(i,e.target.value)} placeholder="Điền đáp số"/>}
        </section>)}
        {score===null&&<div className="flex justify-end"><button className={BTN} disabled={sending} onClick={submit}>{sending?'Đang nộp...':'Nộp bài'}</button></div>}
      </>:<>
        <nav className="flex flex-wrap gap-2">{nav.map(k=><button key={k} onClick={()=>setTab(k)} className={'rounded-lg px-4 py-2 text-sm font-bold '+(tab===k?'bg-blue-600 text-white':'border bg-white text-slate-700')}>{labels[k]}</button>)}</nav>
        {loading?<p className="p-8 text-center">Đang tải dữ liệu học tập...</p>:<div className="grid gap-3">
          {tab==='exams'&&(data.exams||[]).map(e=><article key={e.exercise_id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm"><div className="flex-1"><b>{e.title}</b><p className="text-xs text-slate-500">{e.duration_minutes} phút · Đã giao cho lớp {student.className}</p></div><button onClick={()=>openExam(e)} className={BTN}>Vào làm bài</button></article>)}
          {tab==='lessons'&&(data.lessons||[]).map(e=><article key={e.id} className="rounded-xl bg-white p-4 shadow-sm"><b>{e.title}</b> {e.drive_file_id&&<a className="ml-3 text-blue-600 underline" target="_blank" rel="noopener noreferrer" href={`https://drive.google.com/file/d/${encodeURIComponent(e.drive_file_id)}/view`}>Mở học liệu</a>}</article>)}
          {tab==='documents'&&(data.documents||[]).map(e=><article key={e.id} className="rounded-xl bg-white p-4 shadow-sm"><b>{e.title}</b> {e.drive_file_id&&<a className="ml-3 text-blue-600 underline" target="_blank" rel="noopener noreferrer" href={`https://drive.google.com/file/d/${encodeURIComponent(e.drive_file_id)}/view`}>Xem tài liệu</a>}</article>)}
          {tab==='scores'&&(scores||[]).map((x,i)=><article key={i} className="rounded-xl bg-white p-4 shadow-sm"><b>Đề {x.exercise_id}</b><span className="ml-3 font-extrabold text-blue-700">{x.score}/10</span><span className="ml-3 text-xs text-slate-500">{x.mrvySynced?'Đã về MRVY':'Đang đồng bộ MRVY'}</span></article>)}
          {tab!=='scores'&&!(data[tab]||[]).length&&<p className="rounded-xl bg-white p-8 text-center text-slate-500">Chưa có nội dung được giao cho khối/lớp của em.</p>}
          {tab==='scores'&&!scores.length&&<p className="rounded-xl bg-white p-8 text-center text-slate-500">Chưa có điểm kiểm tra.</p>}
        </div>}
      </>}
    </main>
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
