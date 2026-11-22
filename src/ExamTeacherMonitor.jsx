import React, { useEffect, useMemo, useState } from 'react';

const label = {
  TAB_HIDDEN: 'Rời tab / chuyển ứng dụng', WINDOW_BLUR: 'Mất tập trung',
  WINDOW_FOCUS: 'Quay lại cửa sổ', EXIT_FULLSCREEN: 'Thoát toàn màn hình',
  ENTER_FULLSCREEN: 'Vào toàn màn hình', WINDOW_RESIZE: 'Đổi kích thước',
  COPY_ATTEMPT: 'Sao chép', PRINT_ATTEMPT: 'In tài liệu',
  CONTEXT_MENU: 'Menu chuột phải', SCREENSHOT_KEY_PRESS: 'Nhấn phím Print Screen (không chứng minh đã chụp)',
  PAGE_EXIT: 'Rời trang', OFFLINE: 'Mất mạng', BACK_ONLINE: 'Có mạng trở lại', HEARTBEAT: 'Đang kết nối'
};

export default function ExamTeacherMonitor({ supabase, exercise, onClose }) {
  const [attempts, setAttempts] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [finalizing,setFinalizing] = useState(false);
  const [lastFinalized,setLastFinalized] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true;
    async function reload() {
      const a = await supabase.from('exam_attempts')
      .select('id,student_code,student_name,class_name,started_at,deadline_at,last_seen_at,submitted_at,score,events_count')
      .eq('exercise_id',String(exercise.id)).order('started_at',{ascending:false}).limit(300);
    const ids = (a.data || []).map(x => x.id);
    const b = ids.length ? await supabase.from('exam_events')
      .select('id,attempt_id,event_type,occurred_at').in('attempt_id',ids)
      .order('occurred_at',{ascending:false}).limit(200) : {data:[],error:null};
      if (!live) return;
      if (a.error) setError(a.error.message); else { setAttempts(a.data || []); setError(''); }
      if (!b.error) setEvents(b.data || []);
      setNow(Date.now());
    }
    reload();
    const timer = setInterval(reload, 8000);
    return () => { live = false; clearInterval(timer); };
  }, [exercise.id, supabase]);
  const names = useMemo(() => Object.fromEntries(attempts.map(a => [a.id,a])),[attempts]);
  const active = attempts.filter(a => !a.submitted_at && new Date(a.deadline_at).getTime() > now).length;
  return <div className="rounded-2xl bg-white border-2 border-blue-200 p-4 space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <div><h3 className="font-extrabold text-blue-900">Theo dõi lớp – {exercise.title}</h3>
      <p className="text-xs text-slate-600">Tự cập nhật 8 giây một lần. Nhật ký chỉ hỗ trợ đánh giá; không phải bằng chứng tuyệt đối về gian lận.</p></div>
      <div className="flex flex-wrap gap-2">
        <button disabled={finalizing} onClick={async()=>{
          setFinalizing(true);
          const {data,error:err}=await supabase.rpc('exam_finalize_expired',{p_exercise_id:String(exercise.id)});
          setLastFinalized(err ? 'Lỗi chốt bài: '+err.message : `Đã chấm ${data} bài hết giờ từ đáp án tự lưu.`);
          setFinalizing(false);
        }} className="rounded-lg bg-amber-100 text-amber-900 px-3 py-1.5 font-bold disabled:opacity-40">
          Chốt bài hết giờ
        </button>
        <button onClick={onClose} className="rounded-lg border px-3 py-1.5 font-bold">Đóng</button>
      </div>
    </div>
    {error && <p className="text-rose-700">Không tải được nhật ký: {error}. Kiểm tra quyền giáo viên và SQL.</p>}
    {lastFinalized && <p className="text-xs text-blue-800">{lastFinalized}</p>}
    <div className="font-bold text-sm">Đang làm: {active} · Đã nộp: {attempts.filter(x=>x.submitted_at).length} · Tổng lượt thi: {attempts.length}</div>
    <div className="overflow-x-auto max-h-72 overflow-y-auto"><table className="w-full text-xs text-left"><thead><tr className="bg-slate-100"><th className="p-2">Học sinh</th><th className="p-2">Lớp</th><th className="p-2">Trạng thái</th><th className="p-2">Cảnh báo</th><th className="p-2">Điểm</th></tr></thead>
      <tbody>{attempts.map(a=><tr key={a.id} className="border-b"><td className="p-2">{a.student_code} – {a.student_name}</td><td className="p-2">{a.class_name}</td>
        <td className="p-2">{a.submitted_at?'Đã nộp':new Date(a.deadline_at).getTime() <= now?'Hết giờ':'Đang làm'}</td>
        <td className="p-2 text-orange-800 font-bold">{a.events_count}</td><td className="p-2">{a.score ?? '—'}</td></tr>)}</tbody>
    </table></div>
    <h4 className="font-bold text-sm">Nhật ký gần nhất</h4>
    <div className="max-h-72 overflow-y-auto space-y-1">{events.filter(e=>e.event_type!=='HEARTBEAT').map(e=><div key={e.id} className="text-xs border-b p-2 flex flex-wrap gap-2">
      <span className="text-slate-500">{new Date(e.occurred_at).toLocaleString('vi-VN')}</span>
      <strong>{names[e.attempt_id]?.student_name || 'Học sinh'}</strong>
      <span className="text-orange-700">{label[e.event_type] || e.event_type}</span>
    </div>)}{!events.length && <p className="text-xs text-slate-500">Chưa có nhật ký.</p>}</div>
  </div>;
}
