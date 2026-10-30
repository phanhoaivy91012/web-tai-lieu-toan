import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  BookOpen, FileText, CheckSquare, Info, Lock, LogOut, 
  Eye, EyeOff, Key, Plus, Trash2, Upload, Award, Users, ExternalLink 
} from 'lucide-react';

const GRADES = [10, 11, 12]; // Bạn có thể đổi thành [6, 7, 8, 9] nếu dạy cấp 2

export default function App() {
  const [activeTab, setActiveTab] = useState('lessons');
  const [selectedGrade, setSelectedGrade] = useState(10);
  const [isTeacher, setIsTeacher] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // State dữ liệu
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [teacherInfo, setTeacherInfo] = useState({
    teacher_name: 'Lớp Toán Thầy Phan Hoài Vy',
    phone: '09xx.xxx.xxx',
    announcement: 'Chào mừng các em đến với hệ thống học tập trực tuyến!',
    schedule_note: 'Lịch học và thông báo mới nhất sẽ được cập nhật tại đây.'
  });

  // State Đăng nhập GV
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // State Thêm mới (Dành cho GV)
  const [newTitle, setNewTitle] = useState('');
  const [driveInput, setDriveInput] = useState('');
  const [htmlContentInput, setHtmlContentInput] = useState('');

  // State Làm bài tập & Xem điểm (Tab 3)
  const [activeExercise, setActiveExercise] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [userAnswers, setUserAnswers] = useState({});
  const [submittedScore, setSubmittedScore] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [rawQuizText, setRawQuizText] = useState('');

  // Kiểm tra phiên đăng nhập Giáo viên
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsTeacher(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsTeacher(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Tải dữ liệu theo Khối
  useEffect(() => {
    fetchData();
  }, [selectedGrade, isTeacher]);

  async function fetchData() {
    // 1. Tải Bài học
    const { data: lessonData } = await supabase
      .from('lessons')
      .select('*')
      .eq('grade', selectedGrade)
      .order('created_at', { ascending: false });

    const filteredLessons = isTeacher ? (lessonData || []) : (lessonData || []).filter(l => l.is_active);
    setLessons(filteredLessons);
    if (filteredLessons.length > 0 && (!selectedLesson || selectedLesson.grade !== selectedGrade)) {
      setSelectedLesson(filteredLessons[0]);
    } else if (filteredLessons.length === 0) {
      setSelectedLesson(null);
    }

    // 2. Tải Tài liệu
    const { data: docData } = await supabase
      .from('documents')
      .select('*')
      .eq('grade', selectedGrade)
      .order('created_at', { ascending: false });
    setDocuments(isTeacher ? (docData || []) : (docData || []).filter(d => d.is_active));

    // 3. Tải Bài tập
    const { data: exData } = await supabase
      .from('exercises')
      .select('*')
      .eq('grade', selectedGrade)
      .order('created_at', { ascending: false });
    setExercises(isTeacher ? (exData || []) : (exData || []).filter(e => e.is_active));

    // 4. Tải Thông tin GV
    const { data: infoData } = await supabase
      .from('teacher_info')
      .select('*')
      .eq('id', 1)
      .single();
    if (infoData) setTeacherInfo(infoData);
  }

  // Hàm trích xuất ID từ link Google Drive bất kỳ
  const extractDriveId = (input) => {
    if (!input) return '';
    const match = input.match(/[-\w]{25,}/);
    return match ? match[0] : input.trim();
  };

  // Đăng nhập Giáo viên
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Sai email hoặc mật khẩu giáo viên!');
    else setShowLoginModal(false);
  };

  // ================= XỬ LÝ TAB 1: BÀI HỌC HTML =================
  const handleFileUploadHTML = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!newTitle) setNewTitle(file.name.replace(/\.html?$/i, ''));
    const reader = new FileReader();
    reader.onload = (event) => setHtmlContentInput(event.target.result);
    reader.readAsText(file);
  };

  const addLesson = async () => {
    if (!newTitle) return alert('Vui lòng nhập tên bài học!');
    if (!htmlContentInput && !driveInput) {
      return alert('Vui lòng chọn file .html từ máy/Drive hoặc dán link Google Drive!');
    }
    const fileId = extractDriveId(driveInput);

    const { error } = await supabase.from('lessons').insert([{
      title: newTitle,
      grade: selectedGrade,
      drive_file_id: fileId,
      html_cache: htmlContentInput,
      is_active: true,
      show_answers: false
    }]);

    if (error) {
      alert('Lỗi khi lưu bài học: ' + error.message);
    } else {
      setNewTitle('');
      setDriveInput('');
      setHtmlContentInput('');
      fetchData();
    }
  };

  const toggleLessonStatus = async (lesson, field) => {
    const updatedValue = !lesson[field];
    await supabase.from('lessons').update({ [field]: updatedValue }).eq('id', lesson.id);
    fetchData();
    if (selectedLesson?.id === lesson.id) {
      setSelectedLesson({ ...selectedLesson, [field]: updatedValue });
    }
  };

  // Tiêm CSS điều khiển nút Ẩn/Hiện đáp án ngay lập tức bên trong file HTML
  const getRenderedHtml = (lesson) => {
    if (!lesson?.html_cache) return '';
    const answerControlCss = `
      <style>
        /* Tự động điều khiển mọi class đáp án phổ biến trong file HTML của bạn */
        .dap-an, .loi-giai, .answer, .solution, .answer-box, [id*="dapan"], [id*="loigiai"], details {
          display: ${lesson.show_answers ? 'block' : 'none'} !important;
        }
      </style>
    `;
    return answerControlCss + lesson.html_cache;
  };

  // ================= XỬ LÝ TAB 2: TÀI LIỆU DRIVE =================
  const addDocument = async () => {
    if (!newTitle || !driveInput) return alert('Nhập tên tài liệu và Link Google Drive!');
    const fileId = extractDriveId(driveInput);
    const { error } = await supabase.from('documents').insert([{
      title: newTitle,
      grade: selectedGrade,
      drive_file_id: fileId,
      is_active: true,
      show_answers: false
    }]);
    if (!error) {
      setNewTitle('');
      setDriveInput('');
      fetchData();
    }
  };

  const toggleDocStatus = async (doc, field) => {
    await supabase.from('documents').update({ [field]: !doc[field] }).eq('id', doc.id);
    fetchData();
  };

  // ================= XỬ LÝ TAB 3: BÀI TẬP & BẢNG ĐIỂM =================
  const addExercise = async () => {
    if (!newTitle || !rawQuizText) return alert('Nhập tên bài tập và nội dung câu hỏi!');
    const blocks = rawQuizText.trim().split(/\n\s*\n/);
    const parsedQuestions = blocks.map((block, idx) => {
      const lines = block.trim().split('\n');
      const questionText = lines[0];
      const options = [];
      let correctIndex = 0;
      lines.slice(1).forEach((line, optIdx) => {
        const isCorrect = line.trim().startsWith('*');
        if (isCorrect) correctIndex = optIdx;
        options.push(line.trim().replace(/^\*/, '').trim());
      });
      return { id: idx + 1, question: questionText, options, correct: correctIndex };
    });

    const { error } = await supabase.from('exercises').insert([{
      title: newTitle,
      grade: selectedGrade,
      questions_json: parsedQuestions,
      is_active: true
    }]);
    if (!error) {
      setNewTitle('');
      setRawQuizText('');
      fetchData();
    }
  };

  const openExercise = async (ex) => {
    setActiveExercise(ex);
    setUserAnswers({});
    setSubmittedScore(null);
    if (isTeacher) {
      const { data } = await supabase
        .from('submissions')
        .select('*')
        .eq('exercise_id', ex.id)
        .order('created_at', { ascending: false });
      setSubmissionsList(data || []);
    }
  };

  const submitExercise = async () => {
    if (!studentName.trim() || !studentClass.trim()) {
      return alert('Em hãy nhập Họ tên và Lớp trước khi nộp bài nhé!');
    }
    const questions = activeExercise.questions_json || [];
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correct) correctCount++;
    });
    const finalScore = questions.length > 0 ? ((correctCount / questions.length) * 10).toFixed(2) : 0;

    await supabase.from('submissions').insert([{
      exercise_id: activeExercise.id,
      student_name: studentName.trim(),
      student_class: studentClass.trim(),
      score: finalScore,
      total_correct: correctCount,
      total_questions: questions.length
    }]);

    setSubmittedScore({ score: finalScore, correct: correctCount, total: questions.length });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 font-sans text-slate-800">
      {/* HEADER CHÍNH */}
      <header className="bg-gradient-to-r from-indigo-700 via-blue-700 to-indigo-800 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <BookOpen className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h1 className="font-bold text-lg md:text-xl tracking-tight">LỚP TOÁN THẦY VY</h1>
              <p className="text-xs text-blue-100 hidden sm:block">Hệ thống Bài giảng & Rèn luyện Trực tuyến</p>
            </div>
          </div>

          {/* CHỌN 3 KHỐI (10 - 11 - 12) */}
          <div className="flex bg-indigo-950/50 p-1 rounded-xl border border-white/15">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => { setSelectedGrade(g); setActiveExercise(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all ${
                  selectedGrade === g 
                    ? 'bg-amber-400 text-slate-900 shadow-md scale-105' 
                    : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                Khối {g}
              </button>
            ))}
          </div>

          {/* NÚT ĐĂNG NHẬP GIÁO VIÊN */}
          <div>
            {isTeacher ? (
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex items-center space-x-1.5 bg-rose-500 hover:bg-rose-600 px-3 py-1.5 rounded-xl text-xs md:text-sm font-semibold shadow"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Thoát GV</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center space-x-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium"
              >
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">Giáo viên</span>
              </button>
            )}
          </div>
        </div>

        {/* THANH ĐIỀU HƯỚNG 4 TAB TRÊN DESKTOP/TABLET */}
        <div className="max-w-7xl mx-auto px-4 hidden md:flex space-x-2 border-t border-white/10 pt-2 pb-1">
          {[
            { id: 'lessons', label: '1. Bài học HTML', icon: BookOpen },
            { id: 'documents', label: '2. Tài liệu', icon: FileText },
            { id: 'exercises', label: '3. Bài tập rèn luyện', icon: CheckSquare },
            { id: 'info', label: '4. Thông tin', icon: Info },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-t-xl font-semibold text-sm transition ${
                  activeTab === t.id ? 'bg-slate-50 text-indigo-700' : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
        {/* ==================== TAB 1: BÀI HỌC HTML ==================== */}
        {activeTab === 'lessons' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Cột trái: Danh sách bài học */}
            <div className="lg:col-span-4 space-y-3">
              {isTeacher && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                  <h3 className="font-bold text-indigo-700 text-sm flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Thêm Bài học HTML (Khối {selectedGrade})
                  </h3>
                  <input
                    type="text"
                    placeholder="Tên bài học (VD: Bài 1. Mệnh đề)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                  <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border-2 border-dashed border-indigo-300 bg-indigo-50/40 rounded-xl text-xs font-semibold text-indigo-700 cursor-pointer hover:bg-indigo-100/60 transition">
                    <Upload className="w-4 h-4" />
                    <span>{htmlContentInput ? '✓ Đã nạp file HTML tức thì (0s)!' : 'Chọn file .html từ máy tính / Drive'}</span>
                    <input type="file" accept=".html,.htm" onChange={handleFileUploadHTML} className="hidden" />
                  </label>
                  <input
                    type="text"
                    placeholder="Hoặc dán Link Google Drive dự phòng..."
                    value={driveInput}
                    onChange={(e) => setDriveInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                  <button
                    onClick={addLesson}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-xl text-sm shadow"
                  >
                    Lưu Bài Học
                  </button>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border p-3 space-y-2">
                <h2 className="font-bold text-slate-700 px-1 text-sm uppercase tracking-wider">
                  Danh sách Bài giảng Khối {selectedGrade} ({lessons.length})
                </h2>
                {lessons.length === 0 && (
                  <p className="text-sm text-slate-400 p-4 text-center">Chưa có bài học nào được mở.</p>
                )}
                {lessons.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedLesson(item)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      selectedLesson?.id === item.id 
                        ? 'bg-indigo-50 border-indigo-500 shadow-sm' 
                        : 'hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-800">{item.title}</span>
                      {!item.is_active && (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Đang ẩn</span>
                      )}
                    </div>

                    {/* Bảng công tắc điều khiển dành riêng cho Giáo viên */}
                    {isTeacher && (
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/70 text-xs" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleLessonStatus(item, 'is_active')}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium ${
                            item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {item.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {item.is_active ? 'Đang mở' : 'Đang tắt'}
                        </button>

                        <button
                          onClick={() => toggleLessonStatus(item, 'show_answers')}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium ${
                            item.show_answers ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Key className="w-3.5 h-3.5" />
                          {item.show_answers ? 'Đáp án: BẬT' : 'Đáp án: TẮT'}
                        </button>

                        <button
                          onClick={async () => {
                            if (window.confirm('Xóa bài học này?')) {
                              await supabase.from('lessons').delete().eq('id', item.id);
                              fetchData();
                            }
                          }}
                          className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Cột phải: Khung hiển thị HTML tức thì (0 giây) */}
            <div className="lg:col-span-8">
              {selectedLesson ? (
                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col h-[78vh]">
                  <div className="bg-slate-100 px-4 py-2.5 border-b flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-sm truncate">{selectedLesson.title}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      selectedLesson.show_answers ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedLesson.show_answers ? '✓ Đã mở xem đáp án' : '🔒 Đáp án đang khóa'}
                    </span>
                  </div>
                  {selectedLesson.html_cache ? (
                    <iframe
                      srcDoc={getRenderedHtml(selectedLesson)}
                      title={selectedLesson.title}
                      className="w-full flex-1 border-0"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <iframe
                      src={`https://drive.google.com/file/d/${selectedLesson.drive_file_id}/preview`}
                      title={selectedLesson.title}
                      className="w-full flex-1 border-0"
                    />
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border p-12 text-center text-slate-400">
                  Chọn một bài học bên danh sách để xem nội dung.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: TÀI LIỆU DRIVE ==================== */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {isTeacher && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Tên tài liệu (VD: Đề cương Giữa kì 1)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="px-3 py-2 border rounded-xl text-sm"
                />
                <input
                  type="text"
                  placeholder="Dán Link Google Drive (PDF/Word)..."
                  value={driveInput}
                  onChange={(e) => setDriveInput(e.target.value)}
                  className="px-3 py-2 border rounded-xl text-sm"
                />
                <button
                  onClick={addDocument}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-sm"
                >
                  + Thêm Tài Liệu Khối {selectedGrade}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-white p-4 rounded-2xl shadow-sm border flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-800">{doc.title}</h3>
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">
                        Khối {doc.grade}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-xl hover:bg-indigo-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Mở xem Tài liệu
                      </a>
                      {doc.show_answers && (
                        <span className="inline-flex items-center text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-xl font-semibold">
                          ✓ Đã cho xem Đáp án
                        </span>
                      )}
                    </div>
                  </div>

                  {isTeacher && (
                    <div className="flex items-center justify-between pt-3 border-t text-xs">
                      <button
                        onClick={() => toggleDocStatus(doc, 'is_active')}
                        className={`px-2.5 py-1 rounded-lg font-medium ${
                          doc.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {doc.is_active ? 'Hiển thị: BẬT' : 'Hiển thị: TẮT'}
                      </button>
                      <button
                        onClick={() => toggleDocStatus(doc, 'show_answers')}
                        className={`px-2.5 py-1 rounded-lg font-medium ${
                          doc.show_answers ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {doc.show_answers ? 'Đáp án: BẬT' : 'Đáp án: TẮT'}
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm('Xóa tài liệu này?')) {
                            await supabase.from('documents').delete().eq('id', doc.id);
                            fetchData();
                          }
                        }}
                        className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: BÀI TẬP & KẾT QUẢ ==================== */}
        {activeTab === 'exercises' && (
          <div className="space-y-4">
            {!activeExercise ? (
              <>
                {isTeacher && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                    <h3 className="font-bold text-indigo-700 text-sm">+ Giao Bài Tập Rèn Luyện Mới (Khối {selectedGrade})</h3>
                    <input
                      type="text"
                      placeholder="Tên bài tập (VD: Ôn tập Hàm số - Đề 1)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                    />
                    <textarea
                      rows={5}
                      placeholder={`Nhập câu hỏi nhanh (mỗi câu cách nhau 1 dòng trống, thêm dấu * trước đáp án đúng):\nCâu 1: Đạo hàm của hàm số y = x^2 là:\nA. x\n*B. 2x\nC. 2\nD. x^3`}
                      value={rawQuizText}
                      onChange={(e) => setRawQuizText(e.target.value)}
                      className="w-full p-3 border rounded-xl text-sm font-mono"
                    />
                    <button
                      onClick={addExercise}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-xl text-sm"
                    >
                      Đăng Bài Tập
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {exercises.map((ex) => (
                    <div key={ex.id} className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-800">{ex.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Số câu hỏi: {(ex.questions_json || []).length} câu
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openExercise(ex)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-xl shadow-sm"
                        >
                          {isTeacher ? 'Xem đề & Bảng điểm' : 'Vào làm bài'}
                        </button>
                        {isTeacher && (
                          <button
                            onClick={async () => {
                              if (window.confirm('Xóa bài tập này?')) {
                                await supabase.from('exercises').delete().eq('id', ex.id);
                                fetchData();
                              }
                            }}
                            className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Cột làm bài cho Học sinh */}
                <div className={`${isTeacher ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white p-4 md:p-6 rounded-2xl shadow-sm border space-y-4`}>
                  <div className="flex items-center justify-between border-b pb-3">
                    <h2 className="font-bold text-lg text-indigo-800">{activeExercise.title}</h2>
                    <button
                      onClick={() => setActiveExercise(null)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg"
                    >
                      ← Quay lại danh sách
                    </button>
                  </div>

                  {submittedScore && (
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center space-y-1">
                      <Award className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="font-bold text-emerald-800 text-lg">
                        Điểm của em: {submittedScore.score} / 10 điểm
                      </p>
                      <p className="text-xs text-emerald-600">
                        Số câu đúng: {submittedScore.correct}/{submittedScore.total} câu — Đã ghi nhận vào danh sách của Thầy!
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl">
                    <input
                      type="text"
                      placeholder="Nhập Họ và tên của em..."
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="px-3 py-2 border rounded-xl text-sm bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Lớp (VD: 10A1 hoặc Ca 1)..."
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      className="px-3 py-2 border rounded-xl text-sm bg-white"
                    />
                  </div>

                  <div className="space-y-4">
                    {(activeExercise.questions_json || []).map((q, qIdx) => (
                      <div key={qIdx} className="p-4 rounded-xl border bg-slate-50/50 space-y-2">
                        <p className="font-semibold text-sm md:text-base">{q.question}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              onClick={() => setUserAnswers({ ...userAnswers, [qIdx]: oIdx })}
                              className={`text-left px-3 py-2 rounded-xl border text-sm transition ${
                                userAnswers[qIdx] === oIdx
                                  ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                                  : 'bg-white hover:bg-indigo-50'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={submitExercise}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md"
                  >
                    Nộp Bài & Xem Điểm Ngay
                  </button>
                </div>

                {/* Cột Danh sách học sinh đã làm bài (Chỉ Giáo viên thấy) */}
                {isTeacher && (
                  <div className="lg:col-span-5 bg-white p-4 rounded-2xl shadow-sm border space-y-3 h-fit">
                    <h3 className="font-bold text-indigo-700 flex items-center gap-2 text-sm border-b pb-2">
                      <Users className="w-4 h-4" /> Danh sách Học sinh đã nộp ({submissionsList.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs md:text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2 rounded-l-lg">Họ tên</th>
                            <th className="p-2">Lớp</th>
                            <th className="p-2">Số câu</th>
                            <th className="p-2 rounded-r-lg text-right">Điểm</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {submissionsList.map((s) => (
                            <tr key={s.id}>
                              <td className="p-2 font-medium">{s.student_name}</td>
                              <td className="p-2 text-slate-500">{s.student_class}</td>
                              <td className="p-2">{s.total_correct}/{s.total_questions}</td>
                              <td className="p-2 text-right font-bold text-indigo-600">{s.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: THÔNG TIN GIÁO VIÊN ==================== */}
        {activeTab === 'info' && (
          <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl shadow-sm border space-y-4">
            <h2 className="text-xl font-bold text-indigo-800 border-b pb-2">{teacherInfo.teacher_name}</h2>
            <p className="text-sm text-slate-600"><strong>Liên hệ / Zalo:</strong> {teacherInfo.phone}</p>
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
              <h4 className="font-bold text-amber-900 text-sm mb-1">📌 Thông báo mới nhất:</h4>
              <p className="text-sm text-amber-800 whitespace-pre-line">{teacherInfo.announcement}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl">
              <h4 className="font-bold text-slate-700 text-sm mb-1">📅 Ghi chú / Lịch học:</h4>
              <p className="text-sm text-slate-600 whitespace-pre-line">{teacherInfo.schedule_note}</p>
            </div>

            {isTeacher && (
              <div className="pt-4 border-t space-y-3">
                <h3 className="font-bold text-sm text-indigo-700">Chỉnh sửa Thông tin & Thông báo (Giáo viên):</h3>
                <input
                  type="text"
                  value={teacherInfo.teacher_name || ''}
                  onChange={(e) => setTeacherInfo({ ...teacherInfo, teacher_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="Tên lớp / Giáo viên"
                />
                <input
                  type="text"
                  value={teacherInfo.phone || ''}
                  onChange={(e) => setTeacherInfo({ ...teacherInfo, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="Số điện thoại"
                />
                <textarea
                  rows={3}
                  value={teacherInfo.announcement || ''}
                  onChange={(e) => setTeacherInfo({ ...teacherInfo, announcement: e.target.value })}
                  className="w-full p-3 border rounded-xl text-sm"
                  placeholder="Thông báo tới học sinh..."
                />
                <textarea
                  rows={3}
                  value={teacherInfo.schedule_note || ''}
                  onChange={(e) => setTeacherInfo({ ...teacherInfo, schedule_note: e.target.value })}
                  className="w-full p-3 border rounded-xl text-sm"
                  placeholder="Lịch học các khối..."
                />
                <button
                  onClick={async () => {
                    await supabase.from('teacher_info').update(teacherInfo).eq('id', 1);
                    alert('Đã cập nhật thông tin!');
                  }}
                  className="bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl text-sm"
                >
                  Lưu Thông Tin
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* THANH NAVIGATION DƯỚI ĐÁY MÀN HÌNH DÀNH CHO ĐIỆN THOẠI */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-2 z-30 shadow-lg">
        {[
          { id: 'lessons', label: 'Bài học', icon: BookOpen },
          { id: 'documents', label: 'Tài liệu', icon: FileText },
          { id: 'exercises', label: 'Bài tập', icon: CheckSquare },
          { id: 'info', label: 'Thông tin', icon: Info },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center space-y-1 text-xs font-medium ${
                activeTab === t.id ? 'text-indigo-600 font-bold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* MODAL ĐĂNG NHẬP GIÁO VIÊN */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="font-bold text-lg text-slate-800">Đăng nhập Giáo viên</h3>
            <input
              type="email"
              required
              placeholder="Email giáo viên..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm"
            />
            <input
              type="password"
              required
              placeholder="Mật khẩu..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="px-4 py-2 text-sm text-slate-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold"
              >
                Đăng nhập
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
