import React, { useMemo, useState } from 'react';
import { Download, FileUp, ScanLine, Shuffle, CheckCircle2, AlertTriangle, Save, Printer, Upload, RefreshCw } from 'lucide-react';

// Trang này chỉ hiển thị cho giáo viên trong App.jsx. Backend cũng phải xác thực JWT.
const API = (import.meta.env.VITE_VZOTA_API_URL || '').replace(/\/$/, '');
const DEFAULT_BANK = {
  title: 'Đề kiểm tra Toán - Vzota',
  points: { part1: 0.25, part2: 0.25, part3: 0.5 },
  part2_policy: 'progressive',
  part2_progressive_scores: [0, 0.1, 0.25, 0.5, 1],
  part1: [{ id: 'TN1', stem: '2 + 3 bằng bao nhiêu?', options: { A: '4', B: '5', C: '6', D: '7' }, correct: 'B' }],
  part2: [{ id: 'DS1', stem: 'Cho các mệnh đề:', statements: [
    { text: '2 là số chẵn', correct: true }, { text: '9 là số nguyên tố', correct: false },
    { text: '4 > 3', correct: true }, { text: '0 > 2', correct: false },
  ] }],
  part3: [{ id: 'TL1', stem: 'Một nửa của 2,46 là?', answer: '1,23' }],
};
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed';
const primary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
const secondary = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const input = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-500';

const canonicalCode = (value) => (/^\d+$/.test(String(value || '')) ? String(Number(value)) : null);
const numericPattern = (value) => {
  if (value === '') return true;
  if (value.length > 4 || !/^-?\d+(,\d+)?$/.test(value)) return false;
  if (value.includes(',') && ![1, 2].includes(value.indexOf(','))) return false;
  return true;
};
function findStudent(sbd, students, grade, category, classFilter) {
  const code = canonicalCode(sbd);
  if (code === null) return { state: 'missing' };
  const matches = students.filter((s) => Number(s.grade) === Number(grade) && s.category === category
    && (classFilter === 'ALL' || s.class_name?.trim() === classFilter)
    && canonicalCode(s.student_code) === code);
  if (matches.length !== 1) return { state: matches.length > 1 ? 'duplicate' : 'missing' };
  return { state: 'matched', student: matches[0] };
}
function outstanding(scan) {
  if (!scan) return 0;
  return scan.part1.filter((x) => ['review', 'multiple'].includes(x.status)).length
    + scan.part2.reduce((n, q) => n + q.statements.filter((x) => ['review', 'multiple'].includes(x.status)).length, 0)
    + scan.part3.filter((x) => x.status === 'review').length
    + ((/^\d{6}$/.test(scan.student_id || '')) ? 0 : 1)
    + ((/^\d{3}$/.test(scan.exam_code || '')) ? 0 : 1);
}
// Hiển thị 3 màu trên phiếu đã được căn chỉnh về 723 x 974 bởi backend OMR.
// Chỉ tô dựa trên đáp án của chính mã đề; không coi ô được nhận diện là đáp án đúng.
const OMR_VIEW = { width: 723, height: 974 };
const OMR_P1_X = [[333,350.1,367.5,385],[428.2,445.2,462.4,479.8],[521.6,538.6,556.1,573.4]];
const OMR_P2_X = Array.from({length:7}, (_, i) => [110 + 73*i,127.3 + 73*i]);
const OMR_P3_X = Array.from({length:6},(_,i)=>Array.from({length:4},(_,j)=>110+94.4*i+17.1*j));
const COLOR = {correct:'#16a34a', wrong:'#dc2626', missing:'#eab308'};
function examAnswerKey(raw, examCode) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.part1 || raw.part2 || raw.part3) return raw;
  if (Array.isArray(raw.variants)) return raw.variants.find(v => String(v.exam_code) === String(examCode))?.answer_key || null;
  return (raw.answer_keys || raw)[String(examCode)] || null;
}
function equalAnswer(a,b) {
  const norm = v => String(v ?? '').trim().replace(/\./g, ',').toUpperCase();
  return (Array.isArray(b) ? b : [b]).some(x => norm(a) === norm(x));
}
function classifyBubble(entry, expected) {
  if (!entry || entry.status !== 'ok' || entry.answer == null || entry.answer === '') return 'missing';
  return equalAnswer(entry.answer, expected) ? 'correct' : 'wrong';
}
function buildBubbleOverlay(scan, rawKeys) {
  const key = scan?.grading ? examAnswerKey(rawKeys, scan.exam_code) : null;
  if (!key) return {marks:[],count:{correct:0,wrong:0,missing:0},available:false};
  const marks=[];const count={correct:0,wrong:0,missing:0};
  const circle=(x,y,state,id)=>marks.push({kind:'circle',x,y,state,id});
  const box=(x,y,w,h,state,id)=>marks.push({kind:'rect',x,y,w,h,state,id});
  const record=(state)=>{count[state]++;};
  for(const [number,expected] of Object.entries(key.part1 || {})) {
    const n=Number(number);if(!Number.isInteger(n)||n<1||n>30)continue;
    const entry=scan.part1?.[n-1];const xs=OMR_P1_X[Math.floor((n-1)/10)];const y=213+17.15*((n-1)%10);
    const state=classifyBubble(entry,expected);record(state);
    const k='ABCD'.indexOf(entry?.answer);
    if(state==='missing'||k<0) box(xs[0]-11,y-11, xs[3]-xs[0]+22,22,'missing',`I-${n}`);
    else circle(xs[k],y,state,`I-${n}`);
  }
  for(const [number,expected] of Object.entries(key.part2 || {})) {
    const n=Number(number);if(!Number.isInteger(n)||n<1||n>7||!Array.isArray(expected))continue;
    for(let j=0;j<Math.min(4,expected.length);j++) {
      const entry=scan.part2?.[n-1]?.statements?.[j]; const xs=OMR_P2_X[n-1];const y=466.4+17.25*j;
      const state=classifyBubble(entry,expected[j]);record(state);
      const k=['Đ','S'].indexOf(entry?.answer);
      if(state==='missing'||k<0)box(xs[0]-11,y-11,xs[1]-xs[0]+22,22,'missing',`II-${n}-${j}`);
      else circle(xs[k],y,state,`II-${n}-${j}`);
    }
  }
  for(const [number,expected] of Object.entries(key.part3 || {})) {
    const n=Number(number);if(!Number.isInteger(n)||n<1||n>6)continue;
    const entry=scan.part3?.[n-1];const xs=OMR_P3_X[n-1];const state=classifyBubble(entry,expected);record(state);
    // Một đáp án số có thể chiếm nhiều cột; nếu chưa nhận diện rõ thì khoanh cả cụm.
    if(state==='missing'||entry?.reviewer_override||!Array.isArray(entry?.columns)){
      box(xs[0]-12,633,xs[3]-xs[0]+24,212,state,`III-${n}`);
      continue;
    }
    let any=false;
    entry.columns.forEach((col,j)=>{
      if(col?.status!=='ok'||!col.answer)return;
      let y;
      if(/^\d$/.test(col.answer)) y=680.5+17.2*Number(col.answer);
      else if(col.answer==='-'&&j===0)y=646.5;
      else if(col.answer===','&&(j===1||j===2))y=663.4;
      if(y!==undefined){circle(xs[j],y,state,`III-${n}-${j}`);any=true;}
    });
    if(!any)box(xs[0]-12,633,xs[3]-xs[0]+24,212,state,`III-${n}`);
  }
  return {marks,count,available:true};
}
function BubbleOverlay({scan,answerKeys}) {
  const {marks,count,available}=buildBubbleOverlay(scan,answerKeys);
  return <>
    <div className="relative mx-auto w-full max-w-[723px]">
      <img src={scan.preview} alt="Phiếu đã căn chỉnh và chú thích kết quả chấm" className="block h-auto w-full rounded border"/>
      {available && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 723 974" preserveAspectRatio="none" aria-hidden="true">
        {marks.map(m=>m.kind==='circle' ? <circle key={m.id} cx={m.x} cy={m.y} r="9.3" fill="none" stroke={COLOR[m.state]} strokeWidth="4.5"/> :
          <rect key={m.id} x={m.x} y={m.y} width={m.w} height={m.h} rx="5" fill="none" stroke={COLOR[m.state]} strokeWidth="3" strokeDasharray={m.state==='missing'?'5 3':undefined}/>)}
      </svg>}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
      <span className="text-green-700">🟢 Đúng {available?`(${count.correct})`:''}</span>
      <span className="text-red-700">🔴 Sai {available?`(${count.wrong})`:''}</span>
      <span className="text-amber-700">🟡 Trống / chưa rõ {available?`(${count.missing})`:''}</span>
    </div>
    {!available && <p className="mt-2 text-xs text-amber-800">Chưa có kết quả chấm cho mã đề này. Nạp bộ đáp án và chấm lại để hiển thị ba màu.</p>}
    {available && <p className="mt-1 text-xs text-slate-500">Vòng tròn: ô đã đọc. Khung nét đứt vàng: không có lựa chọn chắc chắn. Phần III có thể khoanh cả vùng số.</p>}
  </>;
}

function htmlEscape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function convertExistingExerciseToBank(title, questions) {
  if (!Array.isArray(questions) || !questions.length) throw new Error('Bài tập chưa có dữ liệu câu hỏi trên Drive.');
  const bank = { ...DEFAULT_BANK, title, part1: [], part2: [], part3: [] };
  for (const q of questions) {
    if (/<\s*(img|svg|canvas|table|iframe|script|div|math|path)\b/i.test(String(q.question || '')) ||
        (q.options || []).some?.((s) => /<\s*(img|svg|canvas|table|iframe|script|div|math|path)\b/i.test(String(s)))) {
      throw new Error('Đề có hình/SVG/bảng HTML. Bản in Vzota chưa bảo toàn hình vẽ; hãy xuất đề sang PDF để kiểm tra trước.');
    }
    const id = `${q.type}-${q.id || bank.part1.length + bank.part2.length + bank.part3.length + 1}`;
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 4) throw new Error(`Câu ${id} chưa đủ A/B/C/D.`);
      const correct = typeof q.correct === 'number' ? 'ABCD'[q.correct] : String(q.correct || '');
      if (!'ABCD'.includes(correct) || correct.length !== 1) throw new Error(`Câu ${id} chưa có đáp án đúng.`);
      bank.part1.push({ id, stem: String(q.question || ''), options: Object.fromEntries('ABCD'.split('').map((k, i) => [k, String(q.options[i] || '')])), correct });
    } else if (q.type === 'tf') {
      if (!Array.isArray(q.statements) || q.statements.length !== 4) throw new Error(`Câu ${id} cần đúng 4 ý Đúng/Sai.`);
      if (q.statements.some((s) => typeof s.isTrue !== 'boolean')) throw new Error(`Câu ${id} thiếu đáp án Đúng/Sai.`);
      bank.part2.push({ id, stem: String(q.question || ''), statements: q.statements.map((s) => ({ text: String(s.text || ''), correct: s.isTrue })) });
    } else if (q.type === 'short') {
      const answer = String(q.shortAnswer ?? '').trim().replace('.', ',');
      if (!numericPattern(answer) || !answer) throw new Error(`Đáp án Phần III (${id}) không điền được vào 4 cột phiếu.`);
      bank.part3.push({ id, stem: String(q.question || ''), answer });
    }
  }
  if (bank.part1.length > 30 || bank.part2.length > 7 || bank.part3.length > 6) throw new Error('Số câu vượt quá 30 ABCD, 7 Đ/S hoặc 6 trả lời ngắn trên phiếu.');
  return bank;
}
function downloadFile(name, contents, mime = 'application/json') {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const uri = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = uri; el.download = name; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(uri), 1500);
}
function printVariant(variant) {
  const { title, exam_code: code, questions } = variant;
  let body = `<h1>${htmlEscape(title)}</h1><p><b>Mã đề: ${htmlEscape(code)}</b>　Họ tên: ......................................　Lớp: ...................</p>`;
  [['part1', 'PHẦN I. Trắc nghiệm'], ['part2', 'PHẦN II. Đúng/Sai'], ['part3', 'PHẦN III. Trả lời ngắn']].forEach(([part, label]) => {
    if (!(questions[part] || []).length) return;
    body += `<h2>${label}</h2>`;
    for (const q of questions[part]) {
      body += `<section><strong>Câu ${q.number}.</strong> ${htmlEscape(q.stem)}`;
      if (part === 'part1') for (const a of 'ABCD') body += `<p>${a}. ${htmlEscape(q.options[a])}</p>`;
      if (part === 'part2') (q.statements || []).forEach((st, i) => { body += `<p>${'abcd'[i]}) ${htmlEscape(st.text)}</p>`; });
      body += '</section>';
    }
  });
  const windowRef = window.open('', '_blank');
  if (!windowRef) return window.alert('Hãy cho phép mở cửa sổ để in đề.');
  windowRef.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${htmlEscape(title)} - ${htmlEscape(code)}</title><style>body{font:15px/1.45 Arial,sans-serif;color:#111;max-width:790px;margin:26px auto;padding:0 24px}h1{text-align:center;font-size:21px}h2{font-size:17px;margin-top:22px}section{break-inside:avoid;padding:9px 0;border-bottom:1px dotted #bbb}p{margin:7px 0 4px 18px}.bar{margin:12px 0;padding:12px;background:#eaf1ff;border-radius:8px}@page{size:A4;margin:16mm}@media print{.bar{display:none}body{margin:0;padding:0}}</style><script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']]},svg:{fontCache:'global'}};<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" defer><\/script></head><body><div class="bar">Kiểm tra hiển thị công thức trước khi in. <button onclick="window.print()">In đề / Lưu PDF</button></div>${body}<p style="text-align:center;margin-top:25px">— Hết —</p></body></html>`);
  windowRef.document.close();
}
async function apiRequest(supabase, endpoint, opts = {}) {
  if (!API) throw new Error('Chưa cấu hình VITE_VZOTA_API_URL trên Vercel.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Phiên giáo viên hết hạn. Vui lòng đăng nhập lại.');
  const res = await fetch(`${API}${endpoint}`, {
    ...opts,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(opts.headers || {}) },
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof result.detail === 'string' ? result.detail : `Lỗi máy chấm (HTTP ${res.status})`);
  return result;
}

export default function VzotaPanel({ supabase, students = [], exercises = [], loadExistingExercise, grade, category, onSaved }) {
  const [mode, setMode] = useState('scan');
  const [wordFile, setWordFile] = useState(null);
  const [wordInfo, setWordInfo] = useState(null);
  const [wordConfirmed, setWordConfirmed] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [bankVerified, setBankVerified] = useState(false);
  const [bankText, setBankText] = useState(JSON.stringify(DEFAULT_BANK, null, 2));
  const [keyText, setKeyText] = useState('');
  const [variants, setVariants] = useState([]);
  const [codeStart, setCodeStart] = useState(101);
  const [variantCount, setVariantCount] = useState(4);
  const [seed, setSeed] = useState(2026);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [scanScope, setScanScope] = useState(null);
  const [selected, setSelected] = useState(-1);
  const [notice, setNotice] = useState('');
  const [testName, setTestName] = useState('Kiểm tra Vzota');
  const [classFilter, setClassFilter] = useState('ALL');
  const [filter, setFilter] = useState('all');
  const classes = useMemo(() => [...new Set(students.filter((s) => Number(s.grade) === Number(grade) && s.category === category)
    .map((s) => s.class_name?.trim()).filter(Boolean))].sort(), [students, grade, category]);
  const parsedKeys = useMemo(() => { try { return { keys: JSON.parse(keyText), error: '' }; } catch (e) { return { keys: null, error: keyText.trim() ? e.message : '' }; } }, [keyText]);
  const getMatch = (scan) => findStudent(scan?.student_id, students, grade, category, classFilter);
  const chosen = results[selected];
  const scopeChanged = !!scanScope && (Number(scanScope.grade) !== Number(grade) || scanScope.category !== category || scanScope.classFilter !== classFilter);
  const approvedRows = scopeChanged ? [] : results.filter((r) => r.approved && !r.saved && r.scan?.grading && getMatch(r.scan).state === 'matched');


  async function inspectWordFile(file) {
    if (!file) return;
    setWordFile(file); setWordInfo(null); setWordConfirmed(false); setNotice(''); setBusy(true);
    try {
      const form = new FormData(); form.append('file', file);
      const info = await apiRequest(supabase, '/api/inspect-word', {method:'POST',body:form});
      setWordInfo(info);
      setNotice('Đã phân tích Word. Cần đối chiếu đáp án với bản gốc trước khi trộn.');
    } catch (e) {setNotice('Lỗi đọc Word: '+e.message);}
    finally {setBusy(false);}
  }
  async function mixWordFile() {
    if (!wordFile || !wordInfo || !wordConfirmed || wordInfo.warnings.length) return;
    setBusy(true);setNotice('');
    try {
      const session = await supabase.auth.getSession();
      const token=session.data?.session?.access_token;
      if (!token) throw new Error('Phiên đăng nhập hết hạn.');
      const form=new FormData();
      form.append('file',wordFile);form.append('count',String(variantCount));
      form.append('starting_code',String(codeStart));form.append('seed',String(seed));
      const res=await fetch(`${API}/api/mix-word`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
      if (!res.ok) {const err=await res.json().catch(()=>({}));throw new Error(err.detail || `HTTP ${res.status}`);}
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='Vzota_Word_Mixed.zip';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      setNotice('Đã tải ZIP đề Word và đáp án. Mở file Word kiểm tra trước khi in. Nạp Vzota_bo_dap_an.json từ ZIP để chấm.');
    }catch(e){setNotice('Lỗi trộn Word: '+e.message);}finally{setBusy(false);}
  }

  async function handleMix() {
    if (!bankVerified) return setNotice('Hãy kiểm tra câu hỏi và đáp án, sau đó đánh dấu xác nhận trước khi trộn.');
    setNotice(''); setBusy(true);
    try {
      const bank = JSON.parse(bankText);
      const response = await apiRequest(supabase, '/api/mix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank, count: Number(variantCount), starting_code: Number(codeStart), seed: Number(seed) }),
      });
      setVariants(response.variants); setResults([]); setSelected(-1);
      setKeyText(JSON.stringify(Object.fromEntries(response.variants.map((v) => [v.exam_code, v.answer_key])), null, 2));
      setNotice(`Đã trộn ${response.variants.length} mã đề và chuyển bộ đáp án sang phần chấm.`);
    } catch (e) { setNotice(`Lỗi trộn đề: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function loadExerciseBank() {
    const ex = exercises.find((x) => String(x.id) === selectedExerciseId);
    if (!ex || !loadExistingExercise) return setNotice('Hãy chọn bài tập hiện có.');
    setBusy(true); setNotice('');
    try {
      const questions = await loadExistingExercise(ex);
      const bank = convertExistingExerciseToBank(ex.title, questions);
      setBankText(JSON.stringify(bank, null, 2)); setVariants([]); setBankVerified(false); setKeyText(''); setResults([]); setSelected(-1);
      setNotice(`Đã nạp ${questions.length} câu từ bài tập “${ex.title}”. Cần tự kiểm tra đáp án gốc vì công cụ đọc Word hiện tại có thể tự chọn A khi thiếu đáp án.`);
    } catch (e) { setNotice(`Lỗi nhập bài tập: ${e.message}`); }
    finally { setBusy(false); }
  }
  function updateResult(index, updater) {
    setResults((old) => old.map((row, i) => i === index ? { ...row, scan: updater(row.scan), approved: false } : row));
  }
  function editIdentity(field, value) {
    updateResult(selected, (old) => {
      const scan = { ...old, [field]: value, grading: null };
      const property = field === 'student_id' ? 'student_id_fields' : 'exam_code_fields';
      const digits = field === 'student_id' ? 6 : 3;
      if (new RegExp(`^\\d{${digits}}$`).test(value)) {
        scan[property] = old[property].map((entry, i) => ({ ...entry, answer: value[i], status: 'ok', reviewer_override: true }));
      }
      return scan;
    });
  }
  function editEntry(section, qi, si, value) {
    const answer = value || null;
    if (section === 'part3' && !numericPattern(value)) { setNotice('Đáp án Phần III chỉ được tối đa 4 ký tự: số, dấu âm và dấu phẩy hợp lệ.'); return; }
    updateResult(selected, (old) => {
      const scan = { ...old, grading: null };
      if (section === 'part1') {
        scan.part1 = old.part1.map((q, i) => i === qi ? { ...q, answer, status: answer ? 'ok' : 'blank', reviewer_override: true } : q);
      } else if (section === 'part2') {
        scan.part2 = old.part2.map((q, i) => i === qi ? { ...q, statements: q.statements.map((s, j) => j === si ? { ...s, answer, status: answer ? 'ok' : 'blank', reviewer_override: true } : s) } : q);
      } else {
        scan.part3 = old.part3.map((q, i) => i === qi ? { ...q, answer, status: answer ? 'ok' : 'blank', reviewer_override: true } : q);
      }
      return scan;
    });
  }
  async function handleBatch() {
    if (!files.length) return setNotice('Hãy chọn ảnh phiếu. Có thể chọn nhiều ảnh một lần.');
    if (parsedKeys.error || !parsedKeys.keys) return setNotice('Hãy nhập hoặc nạp bộ đáp án JSON hợp lệ trước khi chấm.');
    setBusy(true); setNotice(''); setResults([]); setSelected(-1);
    setScanScope({ grade, category, classFilter });
    setProgress({ completed: 0, total: files.length });
    const work = Array.from({ length: files.length });
    let cursor = 0; let completed = 0;
    async function worker() {
      while (cursor < files.length) {
        const idx = cursor++;
        const file = files[idx];
        try {
          const form = new FormData();
          form.append('image', file, file.name);
          form.append('answer_key', JSON.stringify(parsedKeys.keys));
          const scan = await apiRequest(supabase, '/api/scan', { method: 'POST', body: form });
          work[idx] = { fileName: file.name, scan, error: '', approved: false };
        } catch (e) {
          work[idx] = { fileName: file.name, scan: null, error: e.message, approved: false };
        }
        completed += 1; setProgress({ completed, total: files.length });
        setResults(work.filter(Boolean).map((x) => ({ ...x })));
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
    setResults(work); setSelected(work.findIndex((r) => r?.scan));
    setBusy(false);
    setNotice(`Đã xử lý ${files.length} ảnh. Thành công ${work.filter((r) => r?.scan).length}, lỗi ${work.filter((r) => !r?.scan).length}. Cần xem ảnh và duyệt trước khi lưu điểm.`);
  }
  async function regrade() {
    if (!chosen?.scan || !parsedKeys.keys) return setNotice('Cần bộ đáp án JSON hợp lệ.');
    if (!/^\d{6}$/.test(chosen.scan.student_id) || !/^\d{3}$/.test(chosen.scan.exam_code)) return setNotice('SBD phải đủ 6 chữ số và mã đề đủ 3 chữ số.');
    setBusy(true); setNotice('');
    try {
      const grading = await apiRequest(supabase, '/api/grade-reviewed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan: chosen.scan, answer_key: parsedKeys.keys }),
      });
      setResults((rows) => rows.map((row, i) => i === selected ? { ...row, scan: { ...row.scan, grading }, approved: false } : row));
      setNotice(`Đã chấm lại ảnh ${chosen.fileName}.`);
    } catch (e) { setNotice(`Không thể chấm lại: ${e.message}`); }
    finally { setBusy(false); }
  }
  function approve(index, yes) {
    if (scopeChanged) return setNotice('Đã đổi khối/lớp/phân hệ sau khi quét. Vui lòng quét lại ảnh trong lớp hiện tại.');
    const row = results[index];
    if (!row?.scan?.grading) return setNotice('Phiếu chưa có kết quả chấm. Hãy chấm lại trước khi duyệt.');
    if (outstanding(row.scan) > 0) return setNotice('Phiếu còn ô tô mơ hồ hoặc SBD/mã đề sai. Hãy kiểm tra và chấm lại.');
    if (getMatch(row.scan).state !== 'matched') return setNotice('Chưa ghép được phiếu với đúng một học sinh trong khối, phân hệ và lớp đang lọc.');
    setResults((rows) => rows.map((x, i) => i === index ? { ...x, approved: yes } : x));
  }
  function approveClean() {
    if (scopeChanged) return setNotice('Đã đổi khối/lớp/phân hệ sau khi quét. Vui lòng quét lại ảnh trong lớp hiện tại.');
    setResults((rows) => rows.map((r) => ({ ...r, approved: !!(!r.saved && r.scan?.grading && outstanding(r.scan) === 0 && getMatch(r.scan).state === 'matched') })));
    setNotice('Đã đánh dấu các phiếu đọc rõ và ghép đúng 1 học sinh. Giáo viên cần kiểm tra trước khi lưu.');
  }
  async function saveScores() {
    if (!parsedKeys.keys || parsedKeys.error) return setNotice('Cần bộ đáp án hợp lệ của đúng lô quét trước khi lưu.');
    if (scopeChanged) return setNotice('Không được lưu điểm của lô quét khác khối/lớp/phân hệ hiện tại.');
    const title = testName.trim();
    if (!title) return setNotice('Hãy nhập tên bài kiểm tra để lưu vào sổ điểm.');
    if (!approvedRows.length) return setNotice('Chưa có phiếu đủ điều kiện và đã được duyệt.');
    if (!window.confirm(`Lưu ${approvedRows.length} điểm bài "${title}" vào sổ điểm Supabase? Chỉ lưu các phiếu đã duyệt.`)) return;
    setBusy(true); setNotice('');
    let saved = 0; const failures = []; const alreadySaved = new Set();
    for (const row of approvedRows) {
      const student = getMatch(row.scan).student;
      const dedupeKey = `${student.student_code}:${student.class_name}`;
      if (alreadySaved.has(dedupeKey)) { failures.push(`Trùng phiếu ${student.student_code} trong lô`); continue; }
      alreadySaved.add(dedupeKey);
      const fullName = `${student.student_code} - ${student.full_name}`;
      const group = `${title} | ${student.class_name}`;
      try {
        const { data: existing, error: checkError } = await supabase.from('submissions')
          .select('id').eq('student_name', fullName).eq('student_class', group).limit(1);
        if (checkError) throw checkError;
        if (existing?.length) { failures.push(`Điểm đã tồn tại: ${fullName}`); continue; }
        const details = row.scan.grading.details || [];
        const rawScore = Number(row.scan.grading.score);
        const maxScore = Number(row.scan.grading.total);
        if (!(maxScore > 0) || !Number.isFinite(rawScore)) throw new Error('Tổng điểm không hợp lệ.');
        const score = Number((10 * rawScore / maxScore).toFixed(2));
        const { error } = await supabase.from('submissions').insert([{
          exercise_id: null, student_name: fullName, student_class: group, score,
          total_correct: details.filter((d) => Number(d.max) > 0 && Number(d.earned) === Number(d.max)).length,
          total_questions: details.length,
        }]);
        if (error) throw error;
        saved += 1;
        setResults((old) => old.map((r) => r === row ? { ...r, approved: false, saved: true } : r));
      } catch (e) { failures.push(`${fullName}: ${e.message}`); }
    }
    if (saved) await onSaved?.();
    setBusy(false);
    setNotice(`Đã lưu ${saved} điểm vào Supabase. ${failures.length ? `Chưa lưu ${failures.length}: ${failures.slice(0, 4).join('; ')}` : 'Không có lỗi.'}`);
  }
  function exportCSV() {
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Tên ảnh', 'SBD', 'Mã đề', 'Họ tên', 'Lớp', 'Điểm thang 10', 'Ô cần xem', 'Đã duyệt', 'Đã lưu', 'Lỗi']];
    results.forEach((r) => {
      const student = getMatch(r.scan);
      const earned = r.scan?.grading?.score;
      const total = r.scan?.grading?.total;
      rows.push([r.fileName, r.scan?.student_id, r.scan?.exam_code,
        student.student?.full_name, student.student?.class_name,
        total > 0 ? (10 * earned / total).toFixed(2) : '', r.scan ? outstanding(r.scan) : '',
        r.approved ? 'Có' : 'Không', r.saved ? 'Có' : 'Không', r.error]);
    });
    downloadFile('Vzota_bang_diem.csv', '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n'), 'text/csv');
  }
  function exportJSON() {
    downloadFile('Vzota_ket_qua.json', JSON.stringify(results.map((r) => ({ ...r, scan: r.scan ? { ...r.scan, preview: undefined } : null })), null, 2));
  }

  const visibleRows = results.map((r, i) => ({ ...r, idx: i })).filter((r) => {
    if (filter === 'issues') return !!r.error || !r.scan?.grading || outstanding(r.scan) > 0 || getMatch(r.scan).state !== 'matched';
    if (filter === 'approved') return r.approved;
    return true;
  });
  const errorAlert = notice.startsWith('Lỗi') || notice.startsWith('Không') || notice.startsWith('Chưa') || notice.startsWith('Hãy') || notice.startsWith('Phiếu');
  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-black text-blue-800">Vzota – Trộn đề và chấm phiếu</h2>
            <p className="text-xs text-slate-500">Dành cho giáo viên • {category === 'school' ? 'Lớp Trường' : 'Lớp Nhà'} • Khối {grade} • Đọc mẫu phiếu v17.0</p></div>
          <div className="flex gap-2"><button className={mode === 'scan' ? primary : secondary} onClick={() => setMode('scan')}><ScanLine size={15}/> Chấm hàng loạt</button>
            <button className={mode === 'mix' ? primary : secondary} onClick={() => setMode('mix')}><Shuffle size={15}/> Trộn đề</button></div>
        </div>
        {!API && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Chưa có địa chỉ API máy chấm. Cần khai báo VITE_VZOTA_API_URL và triển khai backend Python theo README.</p>}
        {notice && <div role="status" className={`mt-3 rounded-xl p-3 text-xs ${errorAlert ? 'bg-rose-50 text-rose-800' : 'bg-blue-50 text-blue-800'}`}>{notice}</div>}
      </section>
      {mode === 'mix' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-7">

            <div className="space-y-3 rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
              <h3 className="font-extrabold text-blue-800">Nhập file Word chuẩn Azota (.docx)</h3>
              <p className="text-xs text-slate-700">Giữ nguyên đối tượng công thức/hình trong Word gốc bằng cách đảo thứ tự câu. Phiên bản này <b>chưa đảo A/B/C/D</b>. Đáp án gạch chân được đọc từ bản gốc; đáp án ngắn từ dòng “Đáp án:”.</p>
              <input aria-label="Chọn đề Word" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={input} disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)inspectWordFile(f);e.target.value='';}}/>
              {wordFile && <p className="text-xs font-semibold">Đã chọn: {wordFile.name}</p>}
              {wordInfo && <div className="space-y-2 rounded-lg bg-white p-3 text-xs">
                <p><b>Phân tích:</b> {wordInfo.counts.part1} câu A/B/C/D · {wordInfo.counts.part2} câu Đ/S · {wordInfo.counts.part3} câu ngắn.</p>
                <p>Đối tượng toán học nhúng: {wordInfo.objects}; hình: {wordInfo.drawings}. Không chuyển các đối tượng này thành chữ thuần.</p>
                {wordInfo.warnings?.length ? <div className="text-red-700"><b>Cần sửa trong Word:</b>{wordInfo.warnings.map((w,i)=><p key={i}>• {w}</p>)}</div> : <p className="text-green-700">Đã tìm được cấu trúc và đáp án cho từng câu. Vẫn cần giáo viên duyệt.</p>}
                <details className="rounded border p-2"><summary className="cursor-pointer font-bold">Xem đáp án phát hiện (trước khi trộn)</summary>
                  {['part1','part2','part3'].map((part,idx)=><div key={part} className="my-1"><b>Phần {['I','II','III'][idx]}: </b>{Object.entries(wordInfo.answers[part]||{}).map(([n,a])=>`${n}: ${Array.isArray(a)?a.join(''):a ?? '?'}; `)}</div>)}
                </details>
                <label className="flex items-start gap-2"><input type="checkbox" checked={wordConfirmed} onChange={e=>setWordConfirmed(e.target.checked)}/> Tôi đã so sánh đáp án với file Word gốc và chấp nhận chỉ đảo thứ tự câu hỏi.</label>
                <button className={primary} disabled={busy || !wordConfirmed || wordInfo.warnings?.length>0} onClick={mixWordFile}><Shuffle size={14}/> Trộn Word và tải đề + đáp án (.zip)</button>
              </div>}
            </div>
            <h3 className="font-extrabold text-slate-800">Ngân hàng câu hỏi (JSON) — phương thức cũ</h3>
            <p className="text-xs text-slate-500">Phiếu hỗ trợ tối đa 30 câu ABCD, 7 câu Đúng/Sai và 6 câu trả lời ngắn. Ví dụ có sẵn chỉ để thử, cần thay bằng đề chính thức.</p>
            {!!exercises.length && <div className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><label className="min-w-52 flex-1 text-xs font-bold text-blue-800">Nạp đề từ tab “Bài tập” hiện có
              <select className={`${input} mt-1`} value={selectedExerciseId} onChange={(e) => setSelectedExerciseId(e.target.value)}><option value="">— Chọn bài tập trên Drive —</option>{exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.title}</option>)}</select></label>
              <button className={primary} disabled={busy || !selectedExerciseId} onClick={loadExerciseBank}><FileUp size={14}/> Nạp vào Vzota</button></div>}
            <div className="flex gap-2"><label className={secondary}><FileUp size={14}/> Nhập ngân hàng JSON<input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setBankText(await f.text()); setVariants([]); setBankVerified(false); setKeyText(''); setResults([]); setSelected(-1); } e.target.value = ''; }}/></label></div>
            <textarea rows={18} spellCheck={false} className={`${input} font-mono text-xs`} value={bankText} onChange={(e) => { setBankText(e.target.value); setVariants([]); setBankVerified(false); setKeyText(''); setResults([]); setSelected(-1); }} />
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-bold text-slate-700">Số mã đề<input className={`${input} mt-1`} type="number" min="1" max="100" value={variantCount} onChange={(e) => setVariantCount(e.target.value)}/></label>
              <label className="text-xs font-bold text-slate-700">Mã bắt đầu<input className={`${input} mt-1`} type="number" min="1" max="999" value={codeStart} onChange={(e) => setCodeStart(e.target.value)}/></label>
              <label className="text-xs font-bold text-slate-700">Hạt trộn<input className={`${input} mt-1`} type="number" value={seed} onChange={(e) => setSeed(e.target.value)}/></label>
            </div>
            <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-900"><input type="checkbox" checked={bankVerified} onChange={(e) => setBankVerified(e.target.checked)} /> Tôi đã kiểm tra đầy đủ nội dung và đáp án các câu, đặc biệt đáp án được tách từ Word.</label>
            <button disabled={busy || !bankVerified} className={primary} onClick={handleMix}><Shuffle size={15}/> Trộn đề và tạo đáp án</button>
          </section>
          <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-5">
            <h3 className="font-extrabold text-slate-800">Danh sách mã đề đã tạo ({variants.length})</h3>
            {variants.length > 0 && <div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => downloadFile('Vzota_cac_ma_de.json', JSON.stringify(variants, null, 2))}><Download size={14}/> Tải toàn bộ đề</button>
              <button className={secondary} onClick={() => downloadFile('Vzota_bo_dap_an.json', keyText)}><Download size={14}/> Tải đáp án</button>
              <button className={primary} onClick={() => setMode('scan')}>Chuyển sang chấm</button></div>}
            {variants.length ? <div className="max-h-[660px] space-y-2 overflow-y-auto">{variants.map((v) => <article key={v.exam_code} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><b className="text-blue-700">Mã {v.exam_code}</b><p className="text-xs text-slate-500">{v.questions.part1.length} TN · {v.questions.part2.length} Đ/S · {v.questions.part3.length} ngắn</p></div><button className={secondary} onClick={() => printVariant(v)}><Printer size={14}/> In đề</button></article>)}</div>
              : <p className="text-sm text-slate-500">Các mã đề sau khi trộn sẽ hiện tại đây.</p>}
          </section>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-5">
              <h3 className="font-extrabold text-slate-800">1. Bộ đáp án từng mã đề</h3>
              <div className="flex flex-wrap gap-2"><label className={secondary}><Upload size={14}/> Nạp đáp án JSON<input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setKeyText(await f.text()); setResults([]); } e.target.value = ''; }}/></label>
                <button className={secondary} disabled={!keyText.trim()} onClick={() => downloadFile('Vzota_bo_dap_an.json', keyText)}><Download size={14}/> Sao lưu đáp án</button></div>
              <textarea rows={7} spellCheck={false} placeholder='Dán JSON dạng {"101":{"part1": {...}, ...}, "102": {...}}' className={`${input} font-mono text-xs`} value={keyText} onChange={(e) => { setKeyText(e.target.value); setResults([]); }}/>
              {parsedKeys.error && <p className="text-xs text-rose-700">JSON chưa hợp lệ: {parsedKeys.error}</p>}
              <label className="block text-xs font-bold text-slate-700">Tên bài kiểm tra lưu trong sổ điểm<input className={`${input} mt-1`} value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="VD: Kiểm tra giữa kỳ I"/></label>
              <label className="block text-xs font-bold text-slate-700">Lớp cần chấm<select className={`${input} mt-1`} value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setResults((old) => old.map((r) => ({ ...r, approved: false }))); }}><option value="ALL">Tất cả lớp thuộc phân hệ này</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            </section>
            <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-7">
              <h3 className="font-extrabold text-slate-800">2. Tải ảnh phiếu để chấm</h3>
              <p className="text-xs text-slate-500">Chọn nhiều ảnh JPG, PNG, WEBP cùng lúc (mỗi ảnh tối đa 16 MB). Ảnh cần đủ bốn góc phiếu mẫu v17.0. Hệ thống xử lý tối đa 3 ảnh đồng thời.</p>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center hover:border-blue-400"><FileUp size={28} className="text-blue-600"/><b className="text-sm text-blue-800">Chọn ảnh bài làm hàng loạt</b><span className="text-xs text-slate-500">{files.length ? `Đã chọn ${files.length} ảnh` : 'Bấm để chọn nhiều ảnh từ máy tính/điện thoại'}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files || []).slice(0, 200)); setResults([]); setSelected(-1); setNotice(''); }}/></label>
              <div className="flex flex-wrap items-center gap-2"><button disabled={busy || !files.length || !parsedKeys.keys} className={primary} onClick={handleBatch}><ScanLine size={15}/> {busy ? 'Đang xử lý...' : `Quét & chấm ${files.length || ''} ảnh`}</button>
                {progress.total > 0 && <span className="text-xs font-bold text-blue-700">{progress.completed}/{progress.total} ảnh</span>}</div>
              <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600 transition-all" style={{ width: progress.total ? `${100 * progress.completed / progress.total}%` : '0%' }}/></div>
              <p className="text-[11px] text-amber-800">Phiên làm việc và ảnh chỉ giữ trong bộ nhớ trình duyệt, chưa lưu thành kho ảnh. Nên xuất JSON/CSV trước khi đóng tab.</p>
            </section>
          </div>
          {results.length > 0 && <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-extrabold text-slate-800">3. Bảng chấm hàng loạt ({results.length})</h3><p className="text-xs text-slate-500">Đã duyệt: {approvedRows.length} • Cần kiểm tra: {results.filter((r) => !r.scan || outstanding(r.scan) > 0 || getMatch(r.scan).state !== 'matched').length}</p></div>
              <div className="flex flex-wrap gap-2"><button className={secondary} disabled={busy || scopeChanged} onClick={approveClean}><CheckCircle2 size={14}/> Đánh dấu phiếu hợp lệ</button><button className={secondary} onClick={exportCSV}><Download size={14}/> Xuất CSV</button><button className={secondary} onClick={exportJSON}><Download size={14}/> Sao lưu JSON</button><button disabled={busy || !approvedRows.length} className={primary} onClick={saveScores}><Save size={14}/> Lưu {approvedRows.length} điểm</button></div></div>
            {scopeChanged && <p className="rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">Bạn đã thay đổi khối/lớp/phân hệ sau khi quét. Kết quả lô cũ không được lưu; hãy chọn lại ảnh và quét mới.</p>}
            <select className={`${input} max-w-52`} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Hiển thị tất cả</option><option value="issues">Phiếu cần xử lý</option><option value="approved">Phiếu đã duyệt</option></select>
            <div className="max-h-[430px] overflow-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr>{['Ảnh', 'SBD', 'Mã đề', 'Học sinh', 'Điểm /10', 'Trạng thái', 'Duyệt'].map((t) => <th key={t} className="p-2.5">{t}</th>)}</tr></thead><tbody className="divide-y">{visibleRows.map((r) => {
              const matching = getMatch(r.scan);
              const score = r.scan?.grading;
              const issue = r.scan ? outstanding(r.scan) : 0;
              return <tr key={`${r.fileName}-${r.idx}`} className={selected === r.idx ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                <td className="p-2.5"><button onClick={() => setSelected(r.idx)} className="max-w-44 truncate font-bold text-blue-700 underline">{r.fileName}</button></td><td className="p-2.5 font-mono">{r.scan?.student_id || '—'}</td><td className="p-2.5">{r.scan?.exam_code || '—'}</td>
                <td className="p-2.5">{matching.state === 'matched' ? matching.student.full_name : <span className="text-amber-700">{matching.state === 'duplicate' ? 'Trùng mã HS' : 'Không tìm thấy HS'}</span>}</td>
                <td className="p-2.5 font-bold text-blue-700">{score && score.total > 0 ? (10 * score.score / score.total).toFixed(2) : '—'}</td>
                <td className="p-2.5">{r.saved ? <span className="text-emerald-700">Đã lưu</span> : r.error ? <span className="text-rose-700">Lỗi: {r.error}</span> : !score ? <span className="text-amber-700">Chưa chấm / thiếu đáp án</span> : issue ? <span className="text-amber-700">{issue} mục cần xem</span> : <span className="text-emerald-700">Đã nhận diện</span>}</td>
                <td className="p-2.5"><label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={busy || scopeChanged || !!r.saved || !r.scan?.grading || issue > 0 || matching.state !== 'matched'} checked={!!r.approved} onChange={(e) => approve(r.idx, e.target.checked)}/> Duyệt</label></td>
              </tr>;
            })}</tbody></table></div>
          </section>}
          {chosen?.scan && <section className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-5"><h3 className="font-extrabold">Ảnh sau căn chỉnh: {chosen.fileName}</h3>
              <BubbleOverlay scan={chosen.scan} answerKeys={parsedKeys.keys}/>
              <p className="text-xs text-slate-500">Mốc đạt: {Math.round((chosen.scan.registration?.anchor_match_ratio || 0) * 100)}%. Chỉ hỗ trợ bố cục phiếu v17.0.</p></div>
            <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm lg:col-span-7">
              <div className="flex items-center justify-between gap-2"><h3 className="font-extrabold">4. Kiểm tra và sửa đáp án</h3>
                <button disabled={busy} className={primary} onClick={regrade}><RefreshCw size={14}/> Chấm lại sau khi sửa</button></div>
              <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">SBD (6 chữ số)<input className={`${input} mt-1 font-mono`} maxLength={6} value={chosen.scan.student_id || ''} onChange={(e) => editIdentity('student_id', e.target.value)}/></label>
                <label className="text-xs font-bold">Mã đề (3 chữ số)<input className={`${input} mt-1 font-mono`} maxLength={3} value={chosen.scan.exam_code || ''} onChange={(e) => editIdentity('exam_code', e.target.value)}/></label></div>
              {outstanding(chosen.scan) > 0 && <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle size={16}/> Còn {outstanding(chosen.scan)} ô hoặc trường cần xem. Ô không tô có thể để trống.</p>}
              <details open className="rounded-xl border p-3"><summary className="cursor-pointer font-bold text-blue-800">Phần I – 30 câu A/B/C/D</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{chosen.scan.part1.map((q, i) => <label key={i} className="flex items-center justify-between gap-2 text-xs"><span className={q.status === 'review' || q.status === 'multiple' ? 'font-bold text-amber-700' : ''}>Câu {i + 1}</span><select aria-label={`Câu ${i + 1}`} className="rounded border px-2 py-1" value={q.answer || ''} onChange={(e) => editEntry('part1', i, -1, e.target.value)}><option value="">—</option>{['A','B','C','D'].map((l) => <option key={l}>{l}</option>)}</select></label>)}</div></details>
              <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold text-blue-800">Phần II – 7 câu × 4 ý Đúng/Sai</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{chosen.scan.part2.flatMap((q, qi) => q.statements.map((s, si) => <label key={`${qi}-${si}`} className="flex items-center justify-between gap-2 text-xs"><span className={['review','multiple'].includes(s.status) ? 'font-bold text-amber-700' : ''}>{qi + 1}{'abcd'[si]}</span><select aria-label={`Câu ${qi + 1}${'abcd'[si]}`} className="rounded border px-2 py-1" value={s.answer || ''} onChange={(e) => editEntry('part2', qi, si, e.target.value)}><option value="">—</option><option value="Đ">Đ</option><option value="S">S</option></select></label>))}</div></details>
              <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold text-blue-800">Phần III – 6 câu số</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{chosen.scan.part3.map((q, i) => <label key={i} className="text-xs">Câu {i + 1}<input aria-label={`Câu ngắn ${i + 1}`} className={`${input} mt-1 font-mono`} maxLength={4} value={q.answer || ''} placeholder="VD: 1,23" onChange={(e) => editEntry('part3', i, -1, e.target.value)}/></label>)}</div></details>
              {chosen.scan.grading && <div className="rounded-xl bg-emerald-50 p-3 text-sm"><b>Điểm:</b> {chosen.scan.grading.score} / {chosen.scan.grading.total} (quy đổi thang 10: <b>{chosen.scan.grading.total > 0 ? (10 * chosen.scan.grading.score / chosen.scan.grading.total).toFixed(2) : '—'}</b>)</div>}
              <p className="text-xs text-slate-500">Khi sửa dữ liệu, kết quả điểm cũ bị vô hiệu hóa. Phải bấm “Chấm lại sau khi sửa”, sau đó duyệt phiếu.</p>
            </div>
          </section>}
        </>
      )}
    </div>
  );
}
