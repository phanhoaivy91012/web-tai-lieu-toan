import React, { useEffect, useState } from 'react';

const normalizeClass = value => String(value || '').trim().replace(/\s+/g, '').toUpperCase();
const API = (import.meta.env.VITE_VZOTA_API_URL || 'https://vzota-api.onrender.com').replace(/\/$/, '');

/** Teacher-only dashboard. This component must be mounted only when App's
 * verified exam_is_admin() result is true; the SQL RPC independently checks it. */
export default function ExamClassDashboard({ supabase, exercise, onClose }) {
  const [report, setReport] = useState(null);
  const [passwords, setPasswords] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [maxAttempts,setMaxAttempts] = useState(1);
  const classes = (report?.classes || []).map(c=>c.className).slice(0, 3);
  async function reload() {
    if (!exercise) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('exam_stats_classes', {
      p_exercise_id: String(exercise.id),
    });
    if (error) setMessage('Chưa đọc được thống kê: ' + error.message);
    else {setReport(data);setMaxAttempts(Number(data?.maxAttempts||1));}
    setBusy(false);
  }
  useEffect(() => { reload(); }, [exercise?.id]);
  async function savePasswords() {
    const payload = {};
    if (!classes.length || classes.length > 3) return setMessage('Chỉ hỗ trợ chọn từ 1 đến 3 lớp.');
    for (const cls of classes) {
      const secret = String(passwords[normalizeClass(cls)] || '');
      if (secret.length < 4 || secret.length > 80) return setMessage('Mỗi lớp cần mật khẩu riêng từ 4–80 ký tự.');
      payload[normalizeClass(cls)] = secret;
    }
    setBusy(true);
    const { error } = await supabase.rpc('exam_set_class_passwords', {
      p_exercise_id: String(exercise.id), p_passwords: payload,
    });
    setBusy(false);
    if (error) return setMessage('Chưa đặt mật khẩu: ' + error.message);
    setPasswords({});
    setMessage('Đã đặt mật khẩu riêng. Học sinh phải nhập mật khẩu lớp trước khi làm bài.');
  }
  async function saveAttempts(){
    setBusy(true);setMessage('');
    const {error}=await supabase.rpc('exam_set_max_attempts',{
      p_exercise_id:String(exercise.id),p_max:Number(maxAttempts)
    });
    setBusy(false);
    setMessage(error?'Không đổi được số lượt: '+error.message:'Đã lưu số lượt làm bài.');
    if(!error)await reload();
  }
  async function revealAnswers(){
    if(!window.confirm('Chỉ công bố đáp án SAU khi đã đóng đề, tránh lộ cho học sinh đang thi. Tiếp tục?'))return;
    setBusy(true);setMessage('');
    const {error}=await supabase.rpc('exam_set_reveal',{
      p_exercise_id:String(exercise.id),p_show:true
    });
    setBusy(false);
    setMessage(error?'Không công bố được: '+error.message:'Đã cho xem đáp án sau khi đóng đề.');
    if(!error)await reload();
  }
  async function retryScores() {
    setBusy(true);setMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.access_token) throw Error('Hãy đăng nhập giáo viên trước.');
      const res = await fetch(API + '/api/mrvy/admin/retry-scores', {
        method: 'POST', headers: {Authorization: 'Bearer ' + data.session.access_token},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(body.detail || 'Máy chủ không đồng bộ được điểm.');
      setMessage(`Đã xử lý ${body.attempted} bản ghi, chuyển thành công ${body.synced}. Chờ/lỗi ${body.remainingOrFailed}.`);
      await reload();
    } catch(e) { setMessage('Chưa đồng bộ được: ' + e.message); }
    finally { setBusy(false); }
  }
  function exportCSV() {
    if(!report) return;
    const rows = [ ['Mã học sinh','Họ tên','Lớp','Lần thi','Mã đề','Điểm','Cao nhất','Đã nộp','Số cảnh báo','Đã gửi MRVY'],
      ...(report.students || []).map(x => [x.studentCode,x.studentName,x.className,x.attemptNo||1,x.examCode,x.score ?? '',x.bestScore??'',x.submittedAt || '',x.incidents || 0,x.mrvySynced ? 'Có' : 'Chưa']) ];
    const esc = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`THONG_KE_VZOTA_${exercise.id}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-3 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-5 rounded-2xl bg-white p-4 text-slate-900 shadow-xl sm:p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-black text-blue-900">Thống kê và mật khẩu theo lớp – {exercise?.title}</h2>
        <button onClick={onClose} className="rounded-lg border px-4 py-2">Đóng</button></div>
      {message&&<p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
      <section className="rounded-xl border p-4 space-y-3">
        <h3 className="font-bold">Số lượt thi & đáp án</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value))}
            className="rounded border px-3 py-2"><option value={1}>1 lượt (mặc định)</option><option value={2}>2 lượt</option></select>
          <button disabled={busy} onClick={saveAttempts} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Lưu số lượt</button>
          <button disabled={busy||report?.showAnswers} onClick={revealAnswers} className="rounded-lg border px-3 py-2 text-sm font-bold">Công bố đáp án sau khi đóng đề</button>
        </div>
        <p className="text-xs text-slate-500">Chỉ đổi số lượt khi chưa ai bắt đầu. Không hiện đáp án khi đề còn mở. MRVY chỉ nhận điểm cao nhất.</p>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="mb-3 font-bold">Mật khẩu riêng cho từng lớp</h3>
        <div className="grid gap-3 sm:grid-cols-2">{classes.map(cls=><label key={cls} className="text-sm font-bold">Lớp {cls}
          <input type="password" autoComplete="new-password" placeholder="Mật khẩu lớp này" value={passwords[normalizeClass(cls)] || ''}
            onChange={e=>setPasswords(v=>({...v,[normalizeClass(cls)]:e.target.value}))}
            className="mt-1 w-full rounded-lg border px-3 py-2"/>
        </label>)}</div>
        <button disabled={busy} onClick={savePasswords} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Lưu mật khẩu các lớp</button>
        <p className="mt-2 text-xs text-slate-500">Chỉ đổi mật khẩu khi chưa có học sinh bắt đầu làm bài. Mật khẩu được lưu dạng băm, không hiển thị lại.</p>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Thống kê kết quả theo lớp</h3>
          <div className="flex gap-2"><button disabled={busy} onClick={reload} className="rounded-lg border px-3 py-2 text-sm">Làm mới</button>
          <button disabled={busy} onClick={retryScores} className="rounded-lg border px-3 py-2 text-sm">Gửi lại điểm MRVY</button>
          <button onClick={exportCSV} disabled={!report} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">Xuất CSV</button></div></div>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
          <thead><tr className="bg-slate-100">{['Lớp','Đã bắt đầu','Đã nộp','Điểm TB','Cao nhất','Thấp nhất','Cảnh báo','Đã về MRVY'].map(h=><th key={h} className="border p-2">{h}</th>)}</tr></thead>
          <tbody>{(report?.classes || []).map(x=><tr key={x.className}>{[x.className,x.started,x.submitted,x.average??'—',x.highest??'—',x.lowest??'—',x.incidents,x.mrvySynced].map((v,i)=><td key={i} className="border p-2">{v}</td>)}</tr>)}</tbody>
        </table></div>
        <h4 className="font-bold">Chi tiết từng học sinh (tối đa 500 lượt)</h4>
        <div className="max-h-[360px] overflow-auto"><table className="w-full text-left text-xs">
          <thead><tr className="bg-slate-100">{['Mã HS','Họ tên','Lớp','Lần thi','Mã đề','Điểm','Cao nhất','Nộp lúc','Cảnh báo','MRVY'].map(h=><th key={h} className="border p-2">{h}</th>)}</tr></thead>
          <tbody>{(report?.students||[]).map((x,i)=><tr key={i}>{[x.studentCode,x.studentName,x.className,x.attemptNo||1,x.examCode||'—',x.score??'Chưa nộp',x.bestScore??'—',x.submittedAt||'—',x.incidents,x.mrvySynced?'Đã gửi':'Chờ'].map((v,j)=><td key={j} className="border p-2">{v}</td>)}</tr>)}</tbody>
        </table></div>
      </section>
    </div>
  </div>;
}
