import React, { useEffect, useRef, useState } from 'react';

const labels = {
  TAB_HIDDEN: 'Rời tab / chuyển ứng dụng', WINDOW_BLUR: 'Cửa sổ mất tập trung',
  EXIT_FULLSCREEN: 'Thoát toàn màn hình', WINDOW_RESIZE: 'Thay đổi kích thước cửa sổ',
  COPY_ATTEMPT: 'Thao tác sao chép', PRINT_ATTEMPT: 'Thao tác in',
  SCREENSHOT_KEY_PRESS: 'Phím Print Screen được nhấn (không xác nhận có ảnh chụp)',
  CONTEXT_MENU: 'Mở menu chuột phải', OFFLINE: 'Mất mạng',
  BACK_ONLINE: 'Kết nối lại', PAGE_EXIT: 'Rời trang',
};

/**
 * Giám sát minh bạch, không ghi phím đã nhập, webcam, microphone hay ảnh màn hình.
 * Trình duyệt KHÔNG thể chặn hoặc phát hiện mọi phương thức chụp màn hình / chia màn hình.
 */
export default function ExamGuard({ supabase, token, deadlineAt, onTimeUp, onViolation }) {
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [warning, setWarning] = useState('');
  const [pending, setPending] = useState(false);
  const lastEvent = useRef({});
  const onTimeUpRef = useRef(onTimeUp);
  const onViolationRef = useRef(onViolation);
  const once = useRef(false);
  useEffect(() => { onTimeUpRef.current = onTimeUp; onViolationRef.current = onViolation; }, [onTimeUp, onViolation]);
  const supported = typeof document.documentElement.requestFullscreen === 'function';

  const logEventRef = useRef(async () => {});
  logEventRef.current = async (type, detail = {}) => {
    if (!token) return;
    const current = Date.now();
    if (current - (lastEvent.current[type] || 0) < (type === 'HEARTBEAT' ? 22000 : 2000)) return;
    lastEvent.current[type] = current;
    if (labels[type]) {
      setWarning(labels[type]);
      if (['TAB_HIDDEN', 'WINDOW_BLUR', 'EXIT_FULLSCREEN', 'COPY_ATTEMPT', 'PRINT_ATTEMPT', 'SCREENSHOT_KEY_PRESS'].includes(type)) {
        onViolationRef.current?.(type);
      }
    }
    try {
      const { error } = await supabase.rpc('exam_log_event', { p_token: token, p_type: type, p_detail: detail });
      if (error) throw error;
    } catch (err) {
      // Mất mạng không thể cam kết truyền nhật ký trong lúc offline.
      console.warn('Không gửi được nhật ký giám sát:', err);
    }
  };

  useEffect(() => {
    if (!token) return;
    const log = (type, detail) => logEventRef.current(type, detail);
    const visibility = () => { if (document.hidden) {setPaused(true);log('TAB_HIDDEN');} };
    const blur = () => {setPaused(true);log('WINDOW_BLUR');};
    const focus = () => log('WINDOW_FOCUS');
    const fullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setFull(active);
      if (!active) setPaused(true);
      log(active ? 'ENTER_FULLSCREEN' : 'EXIT_FULLSCREEN');
    };
    let lastResize = window.innerWidth;
    const resize = () => {
      if (Math.abs(window.innerWidth - lastResize) < 80) return;
      lastResize = window.innerWidth;
      log('WINDOW_RESIZE', { width: window.innerWidth, height: window.innerHeight });
    };
    const copy = e => { e.preventDefault(); log('COPY_ATTEMPT'); };
    const context = e => { e.preventDefault(); log('CONTEXT_MENU'); };
    const keys = e => {
      if (e.key === 'PrintScreen') {
        e.preventDefault(); log('SCREENSHOT_KEY_PRESS');
      }
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault(); log(e.key.toLowerCase() === 'p' ? 'PRINT_ATTEMPT' : 'COPY_ATTEMPT');
      }
    };
    const offline = () => log('OFFLINE');
    const online = () => log('BACK_ONLINE');
    const pageExit = () => { /* Chỉ ghi khi mạng còn hoạt động; có thể bị trình duyệt hủy */ log('PAGE_EXIT'); };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('resize', resize);
    document.addEventListener('copy', copy, true);
    document.addEventListener('contextmenu', context, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('pagehide', pageExit);
    const interval = setInterval(() => log('HEARTBEAT'), 25000);
    log('HEARTBEAT');
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('resize', resize);
      document.removeEventListener('copy', copy, true);
      document.removeEventListener('contextmenu', context, true);
      document.removeEventListener('keydown', keys, true);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', pageExit);
    };
  }, [supabase, token]);

  useEffect(() => {
    if (!token || !deadlineAt) return;
    const tick = () => {
      const current = Date.now(); setNow(current);
      if (current >= new Date(deadlineAt).getTime() && !once.current) {
        once.current = true; onTimeUpRef.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [token, deadlineAt]);
  const seconds = deadlineAt ? Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000)) : 0;
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const fullscreen = async () => {
    setPending(true);
    try {
      if (supported && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!supported) setWarning('Thiết bị không hỗ trợ Fullscreen API; hệ thống chỉ giám sát được một phần.');
      setPaused(false);
    } catch {
      setWarning('Trình duyệt từ chối toàn màn hình. Bấm thử lại từ nút bên dưới.');
    } finally { setPending(false); }
  };

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm space-y-2" role="status">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <strong className="text-amber-950">Giám sát bài kiểm tra · Còn {minutes}:{secs}</strong>
        {supported && !full && <button type="button" disabled={pending} onClick={fullscreen}
          className="bg-blue-600 text-white px-3 py-2 font-bold rounded-lg disabled:opacity-40">
          Vào toàn màn hình
        </button>}
        {full && <span className="font-semibold text-emerald-800">Đang toàn màn hình</span>}
      </div>
      <p className="text-xs text-amber-900">
        Hệ thống ghi lại việc rời tab, mất tập trung, thoát toàn màn hình và các thao tác in/sao chép mà trình duyệt phát hiện được.
        Không ghi âm, không bật camera và không tự chụp màn hình. Không thể phát hiện mọi cách chụp ảnh màn hình.
      </p>
      {warning && <p className="font-bold text-rose-700">Sự kiện gần nhất: {warning}. Giáo viên có thể xem nhật ký.</p>}
      {(paused || (supported && !full)) && <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/95 p-5 text-white text-center gap-4">
        <h2 className="text-2xl font-black">Phiên kiểm tra đang tạm khóa</h2>
        <p className="max-w-md text-sm">Để tiếp tục làm bài, hãy quay lại cửa sổ kiểm tra và vào chế độ toàn màn hình. Đồng hồ vẫn chạy; sự kiện rời màn hình được ghi cho giáo viên.</p>
        <button type="button" onClick={fullscreen} disabled={pending}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-extrabold disabled:opacity-40">
          {supported ? 'Vào toàn màn hình và tiếp tục' : 'Tiếp tục (thiết bị không hỗ trợ toàn màn hình)'}
        </button>
      </div>}
    </div>
  );
}
