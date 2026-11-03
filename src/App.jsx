import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  BookOpen, FileText, CheckSquare, Info, Lock, LogOut, 
  Eye, EyeOff, Key, Plus, Trash2, Upload, Award, Users, 
  ExternalLink, Maximize2, Minimize2, Sparkles, Wand2, 
  Download, FileUp, CheckCircle2, Layers
} from 'lucide-react';

const GRADES = [10, 11, 12, 0];
const formatGradeLabel = (g, short = false) => (g === 0 ? 'Khác' : short ? `K${g}` : `Khối ${g}`);

// ============================================================================
// 1. ENGINE BẢNG VẼ CHUYÊN DỤNG CHO MÁY TÍNH BẢNG (CHỐNG TRÔI TRANG & TÌ TAY)
// ============================================================================
const TABLET_PRO_DRAWING_INJECTION = `
<style>
  html, body {
    overscroll-behavior: none !important;
    -webkit-touch-callout: none !important;
    -webkit-user-select: none !important;
    user-select: none !important;
  }
  #drawing-canvas.drawing-active {
    pointer-events: auto !important;
    touch-action: none !important;
    cursor: crosshair !important;
  }
  #drawing-canvas.drawing-inactive {
    pointer-events: none !important;
    touch-action: pan-y !important;
  }
  #tablet-quick-helper {
    position: fixed;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 9998;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(15, 23, 42, 0.94);
    backdrop-filter: blur(8px);
    padding: 6px;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 10px 25px rgba(0,0,0,0.45);
  }
  .tb-quick-btn {
    width: 42px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    background: #1e293b;
    border: 1px solid #334155;
    transition: all 0.15s;
  }
  .tb-quick-btn:active { transform: scale(0.92); }
  .tb-quick-btn.active-mode {
    background: #2563eb !important;
    color: #ffffff !important;
    border-color: #60a5fa !important;
  }
  .tb-quick-btn.save-btn {
    background: #059669 !important;
    color: #ffffff !important;
    border-color: #34d399 !important;
  }
  .tb-quick-btn span.lbl {
    font-size: 8px;
    line-height: 1;
    margin-top: 2px;
    opacity: 0.9;
  }
</style>
<script>
  window.addEventListener('load', function() {
    var canvas = document.getElementById('drawing-canvas');
    var scrollBox = document.getElementById('slide-content-scroll');
    if (!canvas || !scrollBox) return;

    window.palmRejectionOnlyPen = false;

    // HÀM NẠP NÉT VIẾT TỪ TRONG FILE HTML (DO THẦY VY ĐÃ LƯU TRÊN DRIVE) VÀO BẢNG VẼ
    var restoreDrawingsFromHtml = function() {
      try {
        if (window.SAVED_SLIDE_DRAWINGS && Array.isArray(window.SAVED_SLIDE_DRAWINGS) && typeof slideDrawings !== 'undefined') {
          for (var i = 0; i < window.SAVED_SLIDE_DRAWINGS.length; i++) {
            if (window.SAVED_SLIDE_DRAWINGS[i] && window.SAVED_SLIDE_DRAWINGS[i].length > 0) {
              slideDrawings[i] = window.SAVED_SLIDE_DRAWINGS[i];
            }
          }
          if (typeof redrawCanvas === 'function') {
            redrawCanvas();
          }
        }
      } catch (err) {
        console.error('Lỗi khôi phục nét vẽ:', err);
      }
    };

    // Gọi khôi phục ngay khi mở bài và sau 200ms (đảm bảo chạy sau renderSlide của file gốc)
    restoreDrawingsFromHtml();
    setTimeout(restoreDrawingsFromHtml, 200);
    setTimeout(restoreDrawingsFromHtml, 600);

    if (!document.getElementById('tablet-quick-helper')) {
      var helper = document.createElement('div');
      helper.id = 'tablet-quick-helper';
      helper.innerHTML =
        '<button id="qbtn-pen" class="tb-quick-btn" title="Bút viết bảng"><span>✏️</span><span class="lbl">Bút</span></button>' +
        '<button id="qbtn-eraser" class="tb-quick-btn" title="Tẩy nét"><span>🧹</span><span class="lbl">Tẩy</span></button>' +
        '<button id="qbtn-cursor" class="tb-quick-btn active-mode" title="Chế độ Cuộn trang & Bấm nút"><span>👆</span><span class="lbl">Cuộn</span></button>' +
        '<button id="qbtn-palm" class="tb-quick-btn" title="Chống tì tay (Chỉ nhận Bút cảm ứng)"><span>✋</span><span class="lbl">Chỉ Bút</span></button>' +
        '<div style="height:1px;background:#334155;margin:2px 0;"></div>' +
        '<button id="qbtn-up" class="tb-quick-btn" title="Cuộn lên"><span>▲</span><span class="lbl">Lên</span></button>' +
        '<button id="qbtn-down" class="tb-quick-btn" title="Cuộn xuống viết tiếp"><span>▼</span><span class="lbl">Xuống</span></button>' +
        '<button id="qbtn-undo" class="tb-quick-btn" title="Hoàn tác"><span>↩️</span><span class="lbl">Lùi</span></button>' +
        '<div style="height:1px;background:#334155;margin:2px 0;"></div>' +
        '<button id="qbtn-save" class="tb-quick-btn save-btn" title="Lưu toàn bộ nét viết thẳng vào file HTML trên Google Drive"><span>💾</span><span class="lbl">Lưu Drive</span></button>';
      document.body.appendChild(helper);

      var syncQuickHighlight = function(tool) {
        ['pen', 'eraser', 'cursor'].forEach(function(t) {
          var btn = document.getElementById('qbtn-' + t);
          if (btn) btn.classList.toggle('active-mode', t === tool);
        });
      };

      if (typeof window.setDrawTool === 'function') {
        var origSetDrawTool = window.setDrawTool;
        window.setDrawTool = function(t) {
          origSetDrawTool(t);
          syncQuickHighlight(t);
        };
      }

      document.getElementById('qbtn-pen').onclick = function() {
        var bar = document.getElementById('drawing-toolbar');
        if (bar && bar.classList.contains('hidden')) bar.classList.replace('hidden', 'flex');
        if (typeof window.setDrawTool === 'function') window.setDrawTool('pen');
      };
      document.getElementById('qbtn-eraser').onclick = function() {
        if (typeof window.setDrawTool === 'function') window.setDrawTool('eraser');
      };
      document.getElementById('qbtn-cursor').onclick = function() {
        if (typeof window.setDrawTool === 'function') window.setDrawTool('cursor');
      };
      document.getElementById('qbtn-palm').onclick = function() {
        window.palmRejectionOnlyPen = !window.palmRejectionOnlyPen;
        this.classList.toggle('active-mode', window.palmRejectionOnlyPen);
      };
      document.getElementById('qbtn-up').onclick = function() { scrollBox.scrollBy({ top: -220, behavior: 'smooth' }); };
      document.getElementById('qbtn-down').onclick = function() { scrollBox.scrollBy({ top: 220, behavior: 'smooth' }); };
      document.getElementById('qbtn-undo').onclick = function() {
        if (typeof window.undoLastStroke === 'function') {
          window.undoLastStroke();
        }
      };

      // KHI BẤM NÚT "💾 LƯU DRIVE": GỬI TOÀN BỘ MẢNG SLIDEDRAWINGS RA NGOÀI APP REACT ĐỂ GHI ĐÈ LÊN DRIVE
      document.getElementById('qbtn-save').onclick = function() {
        if (typeof slideDrawings === 'undefined') {
          alert('File HTML này không có bộ nhớ bảng vẽ slideDrawings!');
          return;
        }
        window.SAVED_SLIDE_DRAWINGS = JSON.parse(JSON.stringify(slideDrawings));
        window.parent.postMessage({
          type: 'VY_SAVE_SLIDE_DRAWINGS',
          drawings: window.SAVED_SLIDE_DRAWINGS
        }, '*');
      };
    }

    canvas.addEventListener('touchstart', function(e) {
      if (typeof drawTool !== 'undefined' && drawTool !== 'cursor') {
        if (e.touches && e.touches.length >= 2) {
          isPointerDown = false;
          currentStroke = null;
          return;
        }
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
      if (typeof drawTool !== 'undefined' && drawTool !== 'cursor') {
        if (e.touches && e.touches.length >= 2) return;
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('pointerdown', function(e) {
      if (e.pointerType === 'pen' && !window.palmRejectionOnlyPen) {
        window.palmRejectionOnlyPen = true;
        var palmBtn = document.getElementById('qbtn-palm');
        if (palmBtn) palmBtn.classList.add('active-mode');
      }
      if (window.palmRejectionOnlyPen && e.pointerType === 'touch') {
        e.stopImmediatePropagation();
        return;
      }
    }, true);

    canvas.addEventListener('pointermove', function(e) {
      if (window.palmRejectionOnlyPen && e.pointerType === 'touch') {
        e.stopImmediatePropagation();
        return;
      }
    }, true);
  });
</script>
`;

function cleanBrokenVietnamesePdfText(str) {
  return str || '';
}

// ============================================================================
// 2. BỘ PHÂN TÍCH TỰ ĐỘNG (AUTO-PARSER) NHẬN DIỆN ĐỦ 4 DẠNG TỪ PDF / VĂN BẢN
// - Lý thuyết ([LT] hoặc I. TÓM TẮT LÝ THUYẾT)
// - Phần I: Trắc nghiệm 4 phương án A, B, C, D
// - Phần II: Trắc nghiệm Đúng/Sai a), b), c), d)
// - Phần III: Trả lời ngắn (Đáp số)
// ============================================================================
function parseSmartMathContentToSlides(lessonTitle, rawText) {
  const slides = [];
  const cleanTitle = (lessonTitle || 'BÀI GIẢNG TOÁN').toUpperCase();

  // Tách bảng đáp án cuối đề nếu có (VD: 1.A 2.B 3.C...)
  const answerKeyMap = {};
  const keyMatches = rawText.matchAll(/\b(\d+)\s*[\.\-\:]\s*([A-D])\b/g);
  for (const m of keyMatches) {
    answerKeyMap[m[1]] = ['A', 'B', 'C', 'D'].indexOf(m[2].toUpperCase());
  }

  // Chia các khối theo từ khóa Câu 1, Câu 2... hoặc [LT]
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let currentPart = 'PHẦN I. CÂU TRẮC NGHIỆM';
  let currentBlocks = [];
  let tempBlock = [];

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Nhận diện tiêu đề chuyển Phần (Phần I, Phần II, Phần III, Lý thuyết)
    if (/^(PHẦN\s*I\b|I\.\s*TRẮC NGHIỆM)/i.test(line) && !/PHẦN\s*II/i.test(line)) {
      if (tempBlock.length) { currentBlocks.push({ part: currentPart, lines: tempBlock }); tempBlock = []; }
      currentPart = 'PHẦN I. CÂU TRẮC NGHIỆM';
      continue;
    }
    if (/^(PHẦN\s*II\b|II\.\s*CÂU TRẮC NGHIỆM ĐÚNG SAI|PHẦN\s*2)/i.test(line) && !/PHẦN\s*III/i.test(line)) {
      if (tempBlock.length) { currentBlocks.push({ part: currentPart, lines: tempBlock }); tempBlock = []; }
      currentPart = 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI';
      continue;
    }
    if (/^(PHẦN\s*III\b|III\.\s*CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN|PHẦN\s*3)/i.test(line)) {
      if (tempBlock.length) { currentBlocks.push({ part: currentPart, lines: tempBlock }); tempBlock = []; }
      currentPart = 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN';
      continue;
    }

    // Nhận diện bắt đầu một Slide Lý thuyết hoặc một Câu hỏi mới
    if (/^(\[LT\]|LÝ THUYẾT:|TÓM TẮT LÝ THUYẾT)/i.test(line) || /^Câu\s+\d+[\.\:\)]/i.test(line)) {
      if (tempBlock.length) {
        currentBlocks.push({ part: currentPart, lines: tempBlock });
      }
      tempBlock = [line];
    } else {
      tempBlock.push(line);
    }
  }
  if (tempBlock.length) {
    currentBlocks.push({ part: currentPart, lines: tempBlock });
  }

  // Phân tích chi tiết từng Block thành đúng cấu trúc Slide của Thầy Vy
  currentBlocks.forEach((blk, idx) => {
    const bLines = blk.lines;
    const headerLine = bLines[0];

    // 1. DẠNG LÝ THUYẾT
    if (/^(\[LT\]|LÝ THUYẾT:|TÓM TẮT LÝ THUYẾT)/i.test(headerLine)) {
      const titlePrompt = headerLine.replace(/^(\[LT\]|LÝ THUYẾT:)\s*/i, '') || `${cleanTitle} — TÓM TẮT LÝ THUYẾT`;
      const bodyParagraphs = bLines.slice(1).map(l => `<p>• ${l.replace(/^[•\-\+]\s*/, '')}</p>`).join('');
      slides.push({
        lesson: 1,
        lessonTitle: cleanTitle,
        part: 'I. TÓM TẮT LÝ THUYẾT',
        subRef: `Lý thuyết • Slide ${idx + 1}`,
        type: 'theory',
        label: 'Lý thuyết',
        prompt: titlePrompt,
        theoryHtml: `
          <div class="bg-blue-50/80 border-l-4 border-blue-600 p-5 rounded-r-xl space-y-2 text-base sm:text-xl leading-relaxed">
            ${bodyParagraphs || '<p>Nội dung tóm tắt lý thuyết trọng tâm.</p>'}
          </div>
        `
      });
      return;
    }

    // Tách nhãn "Câu X." và nội dung đề
    const qMatch = headerLine.match(/^(Câu\s+(\d+)[\.\:\)]?)\s*(.*)/i);
    const qLabel = qMatch ? `Câu ${qMatch[2]}.` : `Câu ${idx + 1}.`;
    const qNum = qMatch ? qMatch[2] : `${idx + 1}`;
    let promptLines = [qMatch ? qMatch[3] : headerLine];
    let solutionLines = [];
    let bodyLines = [];
    let inSolution = false;

    for (let i = 1; i < bLines.length; i++) {
      const l = bLines[i];
      if (/^(Lời giải|HD|Hướng dẫn|Giải|=>)\s*[\:\.]?/i.test(l)) {
        inSolution = true;
        const cleanedSol = l.replace(/^(Lời giải|HD|Hướng dẫn|Giải|=>)\s*[\:\.]?\s*/i, '');
        if (cleanedSol) solutionLines.push(cleanedSol);
        continue;
      }
      if (inSolution) {
        solutionLines.push(l);
      } else {
        bodyLines.push(l);
      }
    }

    // Tách các phương án nếu viết trên cùng 1 dòng (VD: A. ... B. ... C. ... D. ...)
    const expandedBodyLines = [];
    bodyLines.forEach(line => {
      if (/(?:^|\s)\*?[A-D]\.\s+/.test(line) && (line.match(/(?:^|\s)\*?[A-D]\.\s+/g) || []).length > 1) {
        const parts = line.split(/(?=(?:^|\s)\*?[A-D]\.\s+)/).map(s => s.trim()).filter(Boolean);
        expandedBodyLines.push(...parts);
      } else {
        expandedBodyLines.push(line);
      }
    });

    // Kiểm tra xem có các mệnh đề a), b), c), d) (Dạng ĐÚNG/SAI) hay không
    const tfStatements = [];
    const mcqOptions = [];
    let detectedCorrectIdx = answerKeyMap[qNum] !== undefined ? answerKeyMap[qNum] : 0;
    let shortAnsValue = '';

    expandedBodyLines.forEach(line => {
      // Nhận diện mệnh đề a), b), c), d)
      const tfMatch = line.match(/^(\*?)([a-d])\)\s*(.*)/i);
      const mcqMatch = line.match(/^(\*?)([A-D])[\.\)]\s*(.*)/);
      const shortMatch = line.match(/^(Đáp số|ĐS|KQ|Kết quả)\s*[\:\=]\s*(.*)/i);

      if (tfMatch) {
        const hasStar = tfMatch[1] === '*';
        let stText = tfMatch[3];
        let isTrue = hasStar;
        if (/\[(Đ|Đúng|True)\]\s*$/i.test(stText)) {
          isTrue = true;
          stText = stText.replace(/\[(Đ|Đúng|True)\]\s*$/i, '').trim();
        } else if (/\[(S|Sai|False)\]\s*$/i.test(stText)) {
          isTrue = false;
          stText = stText.replace(/\[(S|Sai|False)\]\s*$/i, '').trim();
        }
        tfStatements.push({
          label: `${tfMatch[2].toLowerCase()})`,
          text: stText,
          isTrue
        });
      } else if (mcqMatch) {
        const optIdx = ['A', 'B', 'C', 'D'].indexOf(mcqMatch[2].toUpperCase());
        if (mcqMatch[1] === '*') detectedCorrectIdx = optIdx;
        mcqOptions.push(mcqMatch[3].trim());
      } else if (shortMatch) {
        shortAnsValue = shortMatch[2].trim();
      } else if (tfStatements.length === 0 && mcqOptions.length === 0) {
        promptLines.push(line);
      }
    });

    const fullPrompt = promptLines.filter(Boolean).join(' ');
    const fullSolution = solutionLines.length > 0 
      ? solutionLines.join('<br>') 
      : 'Áp dụng kiến thức trọng tâm đã học để suy ra kết quả.';

    // 2. DẠNG ĐÚNG / SAI (PHẦN II)
    if (tfStatements.length >= 2 || blk.part.includes('PHẦN II')) {
      const finalStatements = tfStatements.length > 0 ? tfStatements : [
        { label: 'a)', text: 'Mệnh đề a', isTrue: true },
        { label: 'b)', text: 'Mệnh đề b', isTrue: false },
        { label: 'c)', text: 'Mệnh đề c', isTrue: true },
        { label: 'd)', text: 'Mệnh đề d', isTrue: false },
      ];
      const summaryTF = finalStatements.map(s => `<strong>${s.label} ${s.isTrue ? 'ĐÚNG' : 'SAI'}</strong>`).join(' &nbsp;|&nbsp; ');
      slides.push({
        lesson: 1,
        lessonTitle: cleanTitle,
        part: 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI',
        subRef: `${qLabel} / Phần II`,
        type: 'tf',
        label: qLabel,
        prompt: fullPrompt,
        statements: finalStatements,
        solution: solutionLines.length > 0 ? `${summaryTF}<br>${fullSolution}` : summaryTF
      });
      return;
    }

    // 3. DẠNG TRẢ LỜI NGẮN (PHẦN III)
    if (shortAnsValue || (mcqOptions.length === 0 && blk.part.includes('PHẦN III'))) {
      slides.push({
        lesson: 1,
        lessonTitle: cleanTitle,
        part: 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN',
        subRef: `${qLabel} / Phần III`,
        type: 'short',
        label: qLabel,
        prompt: fullPrompt,
        shortAnswer: shortAnsValue || 'Xem lời giải',
        solution: fullSolution
      });
      return;
    }

    // 4. DẠNG TRẮC NGHIỆM 4 PHƯƠNG ÁN (PHẦN I)
    while (mcqOptions.length < 4) {
      mcqOptions.push(`Phương án ${['A', 'B', 'C', 'D'][mcqOptions.length]}`);
    }
    slides.push({
      lesson: 1,
      lessonTitle: cleanTitle,
      part: 'PHẦN I. CÂU TRẮC NGHIỆM',
      subRef: `${qLabel} / Phần I`,
      type: 'mcq',
      label: qLabel,
      prompt: fullPrompt,
      options: mcqOptions.slice(0, 4),
      correctIndex: detectedCorrectIdx,
      solution: fullSolution
    });
  });

  return slides;
}

// ============================================================================
// 3. HÀM XUẤT FILE HTML HOÀN CHỈNH Y HỆT FORM "bai tap vecto.html" CỦA THẦY VY
// ============================================================================
function buildFullStandaloneHTML(lessonTitle, grade, slidesArray) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>TOÁN ${grade} | ${lessonTitle} — Toán Thầy Vy</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Inter', sans-serif; background-color: #0b1120; color: #0f172a; overflow: hidden; user-select: none; }
    .slide-scroll::-webkit-scrollbar { width: 10px; }
    .slide-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
    .slide-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 8px; }
    .katex { font-size: 1.1em !important; }
    #drawing-canvas.drawing-active { pointer-events: auto; touch-action: none; cursor: crosshair; }
    #drawing-canvas.drawing-inactive { pointer-events: none; touch-action: pan-y; }
    .tool-active { background-color: #2563eb !important; color: #fff !important; box-shadow: 0 0 0 2px #60a5fa; }
    .color-dot-active { transform: scale(1.22); box-shadow: 0 0 0 2px #0f172a, 0 0 0 3.5px #ffffff; }
  </style>
</head>
<body class="h-screen w-screen flex flex-col justify-between bg-[#0b1120]">
  <header class="bg-[#111827] border-b border-slate-800 px-2.5 py-1 flex items-center justify-between gap-2 z-40 shrink-0 min-h-[42px] overflow-x-auto">
    <div class="flex items-center gap-2 shrink-0">
      <span class="bg-[#2563eb] text-white font-extrabold text-[11px] px-2 py-0.5 rounded uppercase">TOÁN ${grade}</span>
      <span class="text-white font-bold text-xs sm:text-sm truncate max-w-[240px] sm:max-w-md">${lessonTitle}</span>
    </div>

    <div id="drawing-toolbar" class="hidden items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700 shrink-0">
      <button id="tool-cursor" onclick="setDrawTool('cursor')" class="tool-active px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-semibold">👆 Chuột</button>
      <button id="tool-pen" onclick="setDrawTool('pen')" class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-semibold">✏️ Bút</button>
      <button id="tool-highlighter" onclick="setDrawTool('highlighter')" class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-semibold">🖍️</button>
      <button id="tool-eraser" onclick="setDrawTool('eraser')" class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-semibold">🧹 Tẩy</button>
      <div class="flex items-center gap-1.5 px-1">
        <button onclick="setPenColor('#ef4444', this)" class="color-btn color-dot-active w-3.5 h-3.5 rounded-full bg-[#ef4444]"></button>
        <button onclick="setPenColor('#2563eb', this)" class="color-btn w-3.5 h-3.5 rounded-full bg-[#2563eb]"></button>
        <button onclick="setPenColor('#10b981', this)" class="color-btn w-3.5 h-3.5 rounded-full bg-[#10b981]"></button>
      </div>
      <button onclick="undoLastStroke()" class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-xs">↩️</button>
      <button onclick="clearCurrentSlideDrawing()" class="px-2 py-0.5 rounded bg-rose-900 text-rose-100 text-xs">🗑️</button>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      <button onclick="toggleDrawToolbar()" class="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 px-2.5 py-1 rounded-md text-xs font-semibold">
        <span>✏️ Bảng vẽ</span>
      </button>
      <button onclick="openSlideListModal()" class="flex items-center gap-1 bg-[#1f2937] hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-md text-xs font-semibold">
        <span>☰ Mục lục (${slidesArray.length})</span>
      </button>
    </div>
  </header>

  <div class="w-full h-[2px] bg-slate-800 shrink-0 z-40">
    <div id="progress-bar" class="h-full bg-gradient-to-r from-blue-500 via-sky-400 to-amber-400 transition-all duration-300" style="width: 1%;"></div>
  </div>

  <main class="relative flex-1 w-full min-h-0 overflow-hidden flex items-stretch justify-center p-1 sm:p-1.5">
    <div id="slide-card" class="relative w-full h-full bg-white rounded-[12px] sm:rounded-[14px] shadow-2xl border border-slate-200 flex flex-col justify-start overflow-hidden">
      <div id="slide-content-scroll" class="slide-scroll relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div id="slide-scroll-inner" class="relative w-full min-h-full px-5 py-4 sm:px-8 sm:py-6 flex flex-col justify-start">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-20 pointer-events-none">
            <div class="flex flex-wrap items-center gap-2">
              <span id="lesson-badge" class="inline-block bg-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm px-3 py-1 rounded-full uppercase"></span>
              <span id="part-badge" class="inline-block bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] font-bold text-xs sm:text-sm px-3.5 py-1 rounded-full"></span>
            </div>
            <span id="sub-ref-badge" class="text-xs sm:text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full"></span>
          </div>

          <div class="flex flex-col md:flex-row md:items-start gap-3.5 sm:gap-5 mb-5 shrink-0 relative z-20">
            <button id="question-btn" onclick="toggleSolution()" class="shrink-0 bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-95 text-white px-4 py-2.5 rounded-[12px] shadow-md flex items-center gap-2.5 transition cursor-pointer self-start">
              <span id="question-number-label" class="text-xl sm:text-2xl font-extrabold tracking-tight">Câu 1.</span>
              <span id="reveal-btn-badge" class="bg-white/20 text-white text-xs sm:text-sm font-semibold px-2.5 py-0.5 rounded-md">Ẩn/Hiện đáp án</span>
            </button>
            <div id="question-text" class="text-slate-900 font-bold text-xl sm:text-2xl lg:text-[26px] leading-snug flex-1 pt-0.5"></div>
          </div>

          <div id="options-container" class="w-full relative z-20"></div>

          <div id="solution-container" class="hidden mt-5 pt-4 border-t-2 border-dashed border-slate-200 shrink-0 relative z-20">
            <div class="bg-emerald-50/95 border-l-4 border-emerald-500 rounded-r-xl p-4 sm:p-5 shadow-sm">
              <div class="flex items-center gap-2.5 text-emerald-800 font-extrabold text-base sm:text-lg mb-1.5">
                <span>✅ ĐÁP ÁN GỌN NHẸ</span>
                <span id="solution-answer-tag" class="bg-emerald-600 text-white text-xs sm:text-sm px-2.5 py-0.5 rounded font-bold"></span>
              </div>
              <div id="solution-text" class="text-slate-800 text-base sm:text-xl leading-relaxed space-y-1.5 font-medium"></div>
            </div>
          </div>

          <div class="h-36 shrink-0"></div>
          <canvas id="drawing-canvas" class="drawing-inactive absolute top-0 left-0 z-30"></canvas>
        </div>
      </div>
    </div>
  </main>

  <footer class="bg-[#0b1120] border-t border-slate-800/80 px-3 sm:px-5 py-1 flex items-center justify-between gap-2 z-40 shrink-0 min-h-[38px]">
    <button id="prev-btn" onclick="prevSlide()" class="bg-[#172554] hover:bg-[#1e3a8a] text-slate-200 font-bold text-xs sm:text-sm px-3.5 py-1 rounded-lg">◀ Slide trước</button>
    <span id="footer-slide-counter" class="text-white font-bold text-xs sm:text-sm"></span>
    <button id="next-btn" onclick="nextSlide()" class="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs sm:text-sm px-3.5 py-1 rounded-lg">Slide tiếp ▶</button>
  </footer>

  <div id="slide-list-modal" class="fixed inset-0 bg-slate-950/80 z-50 hidden items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 class="text-white font-bold text-base sm:text-lg">Mục lục bài giảng (${slidesArray.length} Slide)</h2>
        <button onclick="closeSlideListModal()" class="text-slate-400 hover:text-white bg-slate-800 w-8 h-8 rounded-lg font-bold">✕</button>
      </div>
      <div id="modal-questions-grid" class="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2"></div>
    </div>
  </div>

  <script>
    const SLIDES = ${JSON.stringify(slidesArray)};
    let currentSlideIndex = 0;
    let revealedSlides = new Array(SLIDES.length).fill(false);
    let userMCQChoice = new Array(SLIDES.length).fill(null);
    let userTFChoices = SLIDES.map(() => ({}));
    let slideDrawings = SLIDES.map(() => []);
    let currentStroke = null, drawTool = 'cursor', penColor = '#ef4444', baseStrokeWidth = 2.8, isPointerDown = false;

    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    const scrollInner = document.getElementById('slide-scroll-inner');

    function resizeCanvas() {
      const width = scrollInner.scrollWidth;
      const height = Math.max(scrollInner.scrollHeight, scrollInner.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      redrawCanvas();
    }
    window.addEventListener('resize', resizeCanvas);

    function setDrawTool(tool) {
      drawTool = tool;
      ['cursor', 'pen', 'highlighter', 'eraser'].forEach(t => {
        const el = document.getElementById('tool-' + t);
        if (el) el.classList.toggle('tool-active', t === tool);
      });
      if (tool === 'cursor') {
        canvas.classList.replace('drawing-active', 'drawing-inactive');
      } else {
        canvas.classList.replace('drawing-inactive', 'drawing-active');
      }
    }

    function setPenColor(color, btnEl) {
      penColor = color;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('color-dot-active'));
      if (btnEl) btnEl.classList.add('color-dot-active');
      if (drawTool === 'cursor' || drawTool === 'eraser') setDrawTool('pen');
    }

    function toggleDrawToolbar() {
      const bar = document.getElementById('drawing-toolbar');
      if (bar.classList.contains('hidden')) {
        bar.classList.replace('hidden', 'flex');
        setDrawTool('pen');
      } else {
        bar.classList.replace('flex', 'hidden');
        setDrawTool('cursor');
      }
      resizeCanvas();
    }

    function getRelativePoint(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (drawTool === 'cursor') return;
      canvas.setPointerCapture(e.pointerId);
      isPointerDown = true;
      currentStroke = {
        tool: drawTool,
        color: penColor,
        width: drawTool === 'highlighter' ? 14 : (drawTool === 'eraser' ? 22 : baseStrokeWidth),
        points: [getRelativePoint(e)]
      };
      slideDrawings[currentSlideIndex].push(currentStroke);
      redrawCanvas();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isPointerDown || !currentStroke) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach(ev => currentStroke.points.push(getRelativePoint(ev)));
      redrawCanvas();
    });

    canvas.addEventListener('pointerup', () => { isPointerDown = false; currentStroke = null; });

    function redrawCanvas() {
      const width = scrollInner.scrollWidth;
      const height = Math.max(scrollInner.scrollHeight, scrollInner.clientHeight);
      ctx.clearRect(0, 0, width, height);
      for (const st of slideDrawings[currentSlideIndex]) {
        if (!st.points || !st.points.length) continue;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = st.width;
        if (st.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (st.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.32;
          ctx.strokeStyle = st.color;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = st.color;
        }
        ctx.beginPath();
        ctx.moveTo(st.points[0].x, st.points[0].y);
        for (let i = 1; i < st.points.length - 1; i++) {
          ctx.quadraticCurveTo(st.points[i].x, st.points[i].y, (st.points[i].x + st.points[i+1].x)/2, (st.points[i].y + st.points[i+1].y)/2);
        }
        if (st.points.length > 1) ctx.lineTo(st.points[st.points.length-1].x, st.points[st.points.length-1].y);
        ctx.stroke();
        ctx.restore();
      }
    }
    function undoLastStroke() { slideDrawings[currentSlideIndex].pop(); redrawCanvas(); }
    function clearCurrentSlideDrawing() { slideDrawings[currentSlideIndex] = []; redrawCanvas(); }

    function selectTFChoice(idx, val) {
      userTFChoices[currentSlideIndex][idx] = val;
      renderSlide();
    }

    function renderSlide() {
      const q = SLIDES[currentSlideIndex];
      const isRevealed = revealedSlides[currentSlideIndex];
      document.getElementById('progress-bar').style.width = ((currentSlideIndex + 1) / SLIDES.length * 100) + '%';
      document.getElementById('lesson-badge').textContent = q.lessonTitle;
      document.getElementById('part-badge').textContent = q.part;
      document.getElementById('sub-ref-badge').textContent = q.subRef;
      document.getElementById('footer-slide-counter').textContent = 'Slide ' + (currentSlideIndex + 1) + ' / ' + SLIDES.length + ' (' + q.subRef + ')';

      const qBtn = document.getElementById('question-btn');
      const qText = document.getElementById('question-text');
      const optBox = document.getElementById('options-container');
      const solBox = document.getElementById('solution-container');
      optBox.innerHTML = '';

      if (q.type === 'theory') {
        qBtn.classList.add('hidden');
        qText.innerHTML = '<span class="text-blue-700 font-extrabold">' + q.prompt + '</span>';
        optBox.innerHTML = q.theoryHtml;
        solBox.classList.add('hidden');
      } else {
        qBtn.classList.remove('hidden');
        document.getElementById('question-number-label').textContent = q.label;
        document.getElementById('reveal-btn-badge').textContent = isRevealed ? 'Ẩn đáp án' : 'Ấn xem đáp án';
        qText.innerHTML = q.prompt;

        if (q.type === 'mcq') {
          const letters = ['A', 'B', 'C', 'D'];
          const grid = document.createElement('div');
          grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4';
          q.options.forEach((optText, idx) => {
            const isSelected = userMCQChoice[currentSlideIndex] === idx;
            const isCorrect = q.correctIndex === idx;
            let cls = 'bg-white border-2 border-[#e2e8f0] hover:border-blue-400 text-slate-900';
            let badge = 'bg-[#f1f5f9] text-slate-800';
            if (isRevealed) {
              if (isCorrect) { cls = 'bg-[#dcfce7] border-2 border-[#22c55e] text-emerald-950'; badge = 'bg-[#22c55e] text-white'; }
              else if (isSelected) { cls = 'bg-rose-50 border-2 border-rose-400 text-rose-900'; badge = 'bg-rose-500 text-white'; }
            } else if (isSelected) {
              cls = 'bg-blue-50 border-2 border-blue-500 text-blue-950'; badge = 'bg-blue-600 text-white';
            }
            const btn = document.createElement('button');
            btn.className = 'w-full px-4 py-3.5 rounded-xl flex items-center gap-3.5 text-left ' + cls;
            btn.onclick = () => { userMCQChoice[currentSlideIndex] = idx; revealedSlides[currentSlideIndex] = true; renderSlide(); };
            btn.innerHTML = '<span class="w-9 h-9 rounded-full font-extrabold text-base sm:text-lg flex items-center justify-center shrink-0 ' + badge + '">' + letters[idx] + '</span><span class="text-lg sm:text-xl font-semibold flex-1">' + optText + '</span>';
            grid.appendChild(btn);
          });
          optBox.appendChild(grid);
        } else if (q.type === 'tf') {
          const tableDiv = document.createElement('div');
          tableDiv.className = 'bg-slate-50 border-2 border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200';
          (q.statements || []).forEach((st, idx) => {
            const userChoice = userTFChoices[currentSlideIndex][idx];
            const row = document.createElement('div');
            row.className = 'px-4 py-3.5 flex items-center justify-between gap-3 bg-white';
            let trueCls = 'bg-slate-100 text-slate-700 border-slate-300', falseCls = 'bg-slate-100 text-slate-700 border-slate-300';
            if (isRevealed) {
              if (st.isTrue) trueCls = 'bg-emerald-600 text-white border-emerald-600';
              else falseCls = 'bg-rose-600 text-white border-rose-600';
            } else {
              if (userChoice === true) trueCls = 'bg-blue-600 text-white border-blue-600';
              if (userChoice === false) falseCls = 'bg-blue-600 text-white border-blue-600';
            }
            row.innerHTML = '<div class="flex items-start gap-3 flex-1"><span class="font-extrabold text-blue-600 text-lg sm:text-xl">' + st.label + '</span><div class="text-slate-900 font-semibold text-lg sm:text-xl">' + st.text + '</div></div><div class="flex gap-2 shrink-0"><button onclick="selectTFChoice(' + idx + ', true)" class="px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm border ' + trueCls + '">ĐÚNG</button><button onclick="selectTFChoice(' + idx + ', false)" class="px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm border ' + falseCls + '">SAI</button></div>';
            tableDiv.appendChild(row);
          });
          optBox.appendChild(tableDiv);
        } else if (q.type === 'short') {
          optBox.innerHTML = '<div class="bg-slate-50 border-2 border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><div class="text-slate-700 font-semibold text-lg sm:text-xl">Bấm vào nút <strong>"' + q.label + ' Ấn xem đáp án"</strong> để hiện kết quả:</div><div class="px-6 py-3 rounded-xl border-2 font-extrabold text-xl sm:text-2xl ' + (isRevealed ? 'bg-emerald-100 border-emerald-500 text-emerald-900' : 'bg-white border-slate-300 text-slate-400') + '">' + (isRevealed ? ('Đáp số: ' + q.shortAnswer) : 'Đáp số: ?') + '</div></div>';
        }

        if (isRevealed) {
          solBox.classList.remove('hidden');
          document.getElementById('solution-text').innerHTML = q.solution;
          if (q.type === 'mcq') document.getElementById('solution-answer-tag').textContent = 'Chọn ' + ['A','B','C','D'][q.correctIndex];
          else if (q.type === 'short') document.getElementById('solution-answer-tag').textContent = 'Đáp số: ' + q.shortAnswer;
          else document.getElementById('solution-answer-tag').textContent = 'Đáp án Đúng/Sai';
        } else {
          solBox.classList.add('hidden');
        }
      }

      if (window.renderMathInElement) {
        renderMathInElement(document.getElementById('slide-card'), { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}], throwOnError: false });
      }
      setTimeout(resizeCanvas, 30);
    }

    function toggleSolution() {
      if (SLIDES[currentSlideIndex].type === 'theory') return;
      revealedSlides[currentSlideIndex] = !revealedSlides[currentSlideIndex];
      renderSlide();
    }
    function prevSlide() { if (currentSlideIndex > 0) { currentSlideIndex--; renderSlide(); } }
    function nextSlide() { if (currentSlideIndex < SLIDES.length - 1) { currentSlideIndex++; renderSlide(); } }
    function openSlideListModal() {
      const grid = document.getElementById('modal-questions-grid');
      grid.innerHTML = '';
      SLIDES.forEach((s, i) => {
        const b = document.createElement('button');
        b.className = 'p-2 rounded-lg border text-left text-xs font-bold ' + (i === currentSlideIndex ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-800 text-slate-200 border-slate-700');
        b.innerHTML = '<div>' + s.label + '</div><div class="text-[10px] opacity-75 truncate">' + s.part + '</div>';
        b.onclick = () => { currentSlideIndex = i; closeSlideListModal(); renderSlide(); };
        grid.appendChild(b);
      });
      document.getElementById('slide-list-modal').classList.replace('hidden', 'flex');
    }
    function closeSlideListModal() {
      document.getElementById('slide-list-modal').classList.replace('flex', 'hidden');
    }
    window.onload = renderSlide;
  </script>
</body>
</html>`;
}

// ============================================================================
// 3B. ENGINE AZOTA & LATEX EX_TEST: DỰNG BẢNG BIẾN THIÊN, ĐỒ THỊ TIKZ & CHẤM ĐIỂM
// ============================================================================

// 1. Chuyển mã Bảng biến thiên LaTeX (\tkzTabInit / \tkzTabVar) sang Bảng HTML sắc nét
function convertTkzTabToHtml(tikzCode) {
  try {
    const initMatch = tikzCode.match(/\\tkzTabInit(?:\[[^\]]*\])?\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/);
    const lineMatch = tikzCode.match(/\\tkzTabLine\s*\{([\s\S]*?)\}/);
    const varMatch = tikzCode.match(/\\tkzTabVar\s*\{([\s\S]*?)\}/);

    if (!initMatch) return '';

    const rowHeaders = initMatch[1]
      .split(',')
      .map((s) => s.split('/')[0].replace(/^\s*|\s*$/g, ''))
      .filter(Boolean);

    const xValues = initMatch[2]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const fPrimeTokens = lineMatch
      ? lineMatch[1].split(',').map((s) => s.trim())
      : [];

    // Lấy các mốc giới hạn/cực trị trong \tkzTabVar{+/..., -/..., +/...}
    const varTokens = varMatch
      ? varMatch[1].split(',').map((s) => s.trim())
      : [];

    let html = `<div class="my-3 overflow-x-auto"><table class="w-full max-w-xl mx-auto border-2 border-slate-800 bg-white text-slate-900 text-sm sm:text-base border-collapse shadow-sm">`;

    // Dòng 1: x
    html += `<tr class="border-b-2 border-slate-800">`;
    html += `<td class="border-r-2 border-slate-800 px-4 py-2 font-bold text-center bg-slate-50 w-24">${rowHeaders[0] || '$x$'}</td>`;
    xValues.forEach((xv) => {
      html += `<td class="px-3 py-2 text-center font-semibold">${xv}</td>`;
    });
    html += `</tr>`;

    // Dòng 2: y' (Xét dấu)
    if (fPrimeTokens.length > 0 || rowHeaders.length >= 2) {
      const signCells = [];
      for (let i = 0; i < xValues.length; i++) {
        const signBefore = fPrimeTokens[2 * i - 1] || '';
        const atPoint = fPrimeTokens[2 * i] || '';
        if (i > 0) {
          const cleanSign = signBefore === '+' || signBefore === '-' ? `$${signBefore}$` : signBefore;
          signCells.push(`<td class="px-2 py-2 text-center font-bold text-blue-700">${cleanSign}</td>`);
        }
        let pointDisplay = '';
        if (atPoint === 'z' || atPoint === '0') pointDisplay = '$0$';
        else if (atPoint === 'd') pointDisplay = '<span class="font-extrabold text-rose-600">||</span>';
        else if (atPoint === 'h') pointDisplay = '';
        else pointDisplay = atPoint;
        signCells.push(`<td class="px-2 py-2 text-center font-bold">${pointDisplay}</td>`);
      }

      html += `<tr class="border-b-2 border-slate-800">`;
      html += `<td class="border-r-2 border-slate-800 px-4 py-2 font-bold text-center bg-slate-50">${rowHeaders[1] || "$y'$"}</td>`;
      html += `<td colspan="${xValues.length}" class="p-0"><div class="grid" style="grid-template-columns: repeat(${xValues.length}, 1fr);">`;
      xValues.forEach((_, idx) => {
        const signRight = fPrimeTokens[2 * idx + 1] || '';
        const atVal = fPrimeTokens[2 * idx] || '';
        let centerSym = atVal === 'z' ? '$0$' : atVal === 'd' ? '<b class="text-rose-600">||</b>' : '';
        let rightSym = signRight === '+' || signRight === '-' ? `$${signRight}$` : '';
        html += `<div class="flex items-center justify-between px-3 py-2">
          <span class="mx-auto font-bold">${centerSym}</span>
          ${idx < xValues.length - 1 ? `<span class="font-extrabold text-indigo-700">${rightSym}</span>` : ''}
        </div>`;
      });
      html += `</div></td></tr>`;
    }

    // Dòng 3: Chiều biến thiên y / f(x)
    if (varTokens.length > 0) {
      html += `<tr>`;
      html += `<td class="border-r-2 border-slate-800 px-4 py-6 font-bold text-center bg-slate-50 align-middle">${rowHeaders[rowHeaders.length - 1] || '$y$'}</td>`;
      varTokens.forEach((tok, idx) => {
        const isHigh = tok.startsWith('+');
        const isDouble = tok.includes('D') || tok.includes('H');
        const valText = tok.replace(/^[\+\-DCH]+\//, '').trim();
        const nextTok = varTokens[idx + 1] || '';
        const nextIsHigh = nextTok.startsWith('+');
        const arrow = idx < varTokens.length - 1
          ? (isHigh && !nextIsHigh ? '↘' : (!isHigh && nextIsHigh ? '↗' : '→'))
          : '';

        html += `<td class="px-2 py-3 text-center relative h-24 align-top">
          <div class="flex flex-col justify-between h-full items-center">
            <div class="${isHigh ? 'font-bold text-emerald-700' : 'opacity-0'}">${isHigh ? (valText || ' ') : '.'}</div>
            <div class="text-xl font-extrabold text-blue-600 my-0.5">${isDouble ? '||' : arrow}</div>
            <div class="${!isHigh ? 'font-bold text-rose-700' : 'opacity-0'}">${!isHigh ? (valText || ' ') : '.'}</div>
          </div>
        </td>`;
      });
      html += `</tr>`;
    }

    html += `</table></div>`;
    return html;
  } catch (e) {
    return '';
  }
}

// 2. Tự động vẽ Đồ thị hàm số SVG nếu trong TikZ có hàm plot(...)
function convertTikzPlotToSvg(tikzCode) {
  const plotMatch = tikzCode.match(/plot\s*\[[^\]]*\]\s*\(\\x\s*,\s*\{([^\}]+)\}\)/i);
  if (!plotMatch) return '';

  const exprRaw = plotMatch[1]
    .replace(/\\x/g, 'x')
    .replace(/\^/g, '**')
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(');

  const pts = [];
  for (let x = -3.8; x <= 3.8; x += 0.1) {
    try {
      // eslint-disable-next-line no-new-func
      const y = new Function('x', `return ${exprRaw};`)(x);
      if (typeof y === 'number' && !isNaN(y) && Math.abs(y) <= 6) {
        const sx = 160 + x * 32;
        const sy = 120 - y * 24;
        pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
      }
    } catch (e) {}
  }
  if (pts.length < 3) return '';

  return `<svg viewBox="0 0 320 240" class="w-full max-w-[300px] h-auto mx-auto my-2 bg-white border rounded-xl p-2 shadow-sm" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#0f172a" />
      </marker>
    </defs>
    <line x1="15" y1="120" x2="305" y2="120" stroke="#0f172a" stroke-width="1.5" marker-end="url(#arrow)" />
    <line x1="160" y1="225" x2="160" y2="15" stroke="#0f172a" stroke-width="1.5" marker-end="url(#arrow)" />
    <text x="295" y="136" font-size="12" font-weight="bold" font-style="italic">x</text>
    <text x="168" y="24" font-size="12" font-weight="bold" font-style="italic">y</text>
    <text x="146" y="135" font-size="11" font-weight="bold">O</text>
    <polyline fill="none" stroke="#2563eb" stroke-width="2.4" points="${pts.join(' ')}" />
  </svg>`;
}

// 3. Làm sạch & chuyển đổi môi trường LaTeX sang HTML + KaTeX

// Giải mã trực tiếp file ảnh WMF / OLE của MathType trong Word sang LaTeX hoặc Vector SVG (Không cần API Key)
function decodeMathTypeFromWordBinary(wmfUint8, oleUint8) {
  // 1. Thử trích xuất chuỗi TeX / Ký hiệu Toán nếu MathType có lưu kèm trong luồng nhị phân
  const extractPrintableMath = (bytes) => {
    if (!bytes) return '';
    let raw = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c <= 126) raw += String.fromCharCode(c);
      else raw += ' ';
    }
    // Tìm nếu trong luồng có sẵn biểu thức TeX $...$ hoặc \[...\]
    const texMatch = raw.match(/\$([^\$]{1,120})\$/);
    if (texMatch) return `$${texMatch[1]}$`;
    return '';
  };

  const embeddedTex = extractPrintableMath(oleUint8) || extractPrintableMath(wmfUint8);
  if (embeddedTex) return embeddedTex;

  // 2. Đọc trực tiếp các bản ghi chữ & ký hiệu Toán học (WMF META_EXTTEXTOUT / META_TEXTOUT) trong file .wmf
  if (!wmfUint8 || wmfUint8.length < 22) return '';
  const view = new DataView(wmfUint8.buffer, wmfUint8.byteOffset, wmfUint8.byteLength);

  let offset = 0;
  let bboxLeft = 0, bboxTop = 0, bboxRight = 1200, bboxBottom = 400;

  // Kiểm tra Aldus Placeable WMF Header (0x9AC6CDD7) để lấy đúng kích thước khung công thức
  if (view.getUint32(0, true) === 0x9AC6CDD7) {
    bboxLeft = view.getInt16(6, true);
    bboxTop = view.getInt16(8, true);
    bboxRight = view.getInt16(10, true);
    bboxBottom = view.getInt16(12, true);
    offset = 22;
  }

  // Bỏ qua Standard WMF Header (18 bytes)
  if (offset + 18 <= wmfUint8.length) {
    offset += 18;
  }

  // Bảng quy đổi ký hiệu Symbol của MathType sang Unicode Toán học chuẩn
  const symbolCharMap = {
    0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2A: '*', 0x2D: '−',
    0x40: '≅', 0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ',
    0x45: 'Ε', 0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι',
    0x4B: 'Κ', 0x4C: 'Λ', 0x4D: 'Μ', 0x4E: 'Ν', 0x4F: 'Ο',
    0x50: 'Π', 0x51: 'Θ', 0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ',
    0x55: 'Υ', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5A: 'Ζ',
    0x5C: '∴', 0x5E: '⊥', 0x61: 'α', 0x62: 'β', 0x63: 'χ',
    0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η',
    0x69: 'ι', 0x6A: 'ϕ', 0x6B: 'κ', 0x6C: 'λ', 0x6D: 'μ',
    0x6E: 'ν', 0x6F: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ',
    0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x76: 'ϖ', 0x77: 'ω',
    0x78: 'ξ', 0x79: 'ψ', 0x7A: 'ζ', 0x7E: '∼',
    0xA3: '≤', 0xA5: '∞', 0xB0: '°', 0xB1: '±', 0xB2: '″',
    0xB3: '≥', 0xB4: '×', 0xB5: '∝', 0xB6: '∂', 0xB7: '•',
    0xB8: '÷', 0xB9: '≠', 0xBA: '≡', 0xBB: '≈', 0xC4: '⊗',
    0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪', 0xCC: '⊂',
    0xCD: '⊆', 0xCE: '∈', 0xCF: '∉', 0xD0: '∠', 0xD1: '∇',
    0xD6: '√', 0xD7: '⋅', 0xD9: '∧', 0xDA: '∨', 0xDB: '⇔',
    0xDC: '⇐', 0xDD: '⇑', 0xDE: '⇒', 0xDF: '⇓', 0xE5: '∑',
    0xAC: '←', 0xAD: '↑', 0xAE: '→', 0xAF: '↓', 0xF2: '∫'
  };

  let isSymbolFont = false;
  const textItems = [];
  const lineItems = [];
  let winOrgX = bboxLeft, winOrgY = bboxTop;
  let winExtX = Math.max(1, bboxRight - bboxLeft);
  let winExtY = Math.max(1, bboxBottom - bboxTop);
  let curX = 0, curY = 0;

  while (offset + 6 <= wmfUint8.length) {
    const sizeWords = view.getUint32(offset, true);
    const func = view.getUint16(offset + 4, true);
    const sizeBytes = sizeWords * 2;
    if (sizeBytes < 6 || offset + sizeBytes > wmfUint8.length) break;

    // META_SETWINDOWORG
    if (func === 0x020B && sizeBytes >= 10) {
      winOrgY = view.getInt16(offset + 6, true);
      winOrgX = view.getInt16(offset + 8, true);
    }
    // META_SETWINDOWEXT
    else if (func === 0x020C && sizeBytes >= 10) {
      winExtY = Math.abs(view.getInt16(offset + 6, true)) || winExtY;
      winExtX = Math.abs(view.getInt16(offset + 8, true)) || winExtX;
    }
    // META_CREATEFONTINDIRECT (Kiểm tra xem font hiện tại có phải Symbol hay không)
    else if (func === 0x02FB && sizeBytes >= 24) {
      const charSet = wmfUint8[offset + 6 + 13];
      let faceName = '';
      for (let k = offset + 6 + 18; k < offset + sizeBytes && wmfUint8[k] !== 0; k++) {
        faceName += String.fromCharCode(wmfUint8[k]);
      }
      isSymbolFont = charSet === 2 || /symbol|mt extra|euclid/i.test(faceName);
    }
    // META_MOVETO
    else if (func === 0x0214 && sizeBytes >= 10) {
      curY = view.getInt16(offset + 6, true);
      curX = view.getInt16(offset + 8, true);
    }
    // META_LINETO (Đường kẻ phân số / căn thức / bảng)
    else if (func === 0x0213 && sizeBytes >= 10) {
      const ny = view.getInt16(offset + 6, true);
      const nx = view.getInt16(offset + 8, true);
      lineItems.push({ x1: curX, y1: curY, x2: nx, y2: ny });
      curX = nx; curY = ny;
    }
    // META_POLYLINE / META_POLYGON (Dấu căn, mũi tên vectơ, ngoặc)
    else if ((func === 0x0325 || func === 0x0324) && sizeBytes >= 10) {
      const count = view.getInt16(offset + 6, true);
      let pOff = offset + 8;
      const pts = [];
      for (let p = 0; p < count && pOff + 4 <= offset + sizeBytes; p++) {
        const px = view.getInt16(pOff, true);
        const py = view.getInt16(pOff + 2, true);
        pts.push({ x: px, y: py });
        pOff += 4;
      }
      for (let p = 0; p < pts.length - 1; p++) {
        lineItems.push({ x1: pts[p].x, y1: pts[p].y, x2: pts[p + 1].x, y2: pts[p + 1].y });
      }
    }
    // META_EXTTEXTOUT (0x0A32) - Bản ghi chứa các chữ số và ký hiệu của MathType
    else if (func === 0x0A32 && sizeBytes >= 14) {
      const ty = view.getInt16(offset + 6, true);
      const tx = view.getInt16(offset + 8, true);
      const strLen = view.getInt16(offset + 10, true);
      const fwOpts = view.getUint16(offset + 12, true);
      const strStart = offset + 14 + ((fwOpts & 0x0006) ? 8 : 0);

      let str = '';
      for (let c = 0; c < strLen && strStart + c < offset + sizeBytes; c++) {
        const code = wmfUint8[strStart + c];
        if (isSymbolFont && symbolCharMap[code]) {
          str += symbolCharMap[code];
        } else if (code >= 32) {
          str += String.fromCharCode(code);
        }
      }
      if (str.trim()) {
        textItems.push({ x: tx, y: ty, text: str });
      }
    }
    // META_TEXTOUT (0x0521)
    else if (func === 0x0521 && sizeBytes >= 12) {
      const strLen = view.getInt16(offset + 6, true);
      const strStart = offset + 8;
      let str = '';
      for (let c = 0; c < strLen && strStart + c < offset + sizeBytes; c++) {
        const code = wmfUint8[strStart + c];
        str += (isSymbolFont && symbolCharMap[code]) ? symbolCharMap[code] : String.fromCharCode(code);
      }
      const afterStr = strStart + strLen + (strLen % 2);
      if (afterStr + 4 <= offset + sizeBytes && str.trim()) {
        const ty = view.getInt16(afterStr, true);
        const tx = view.getInt16(afterStr + 2, true);
        textItems.push({ x: tx, y: ty, text: str });
      }
    }

    if (func === 0x0000) break; // META_EOF
    offset += sizeBytes;
  }

  if (textItems.length === 0 && lineItems.length === 0) return '';

  // Nếu chỉ là biểu thức 1 dòng đơn giản -> Trả về dạng công thức Toán KaTeX mượt mà
  if (lineItems.length === 0 && textItems.length > 0) {
    textItems.sort((a, b) => a.x - b.x);
    const merged = textItems.map((t) => t.text).join('');
    return `$${merged}$`;
  }

  // Nếu có phân số, căn thức, vectơ hoặc hệ phương trình -> Dựng thành thẻ <svg> inline sắc nét ngay trên dòng chữ
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  textItems.forEach((t) => {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x + t.text.length * 140 > maxX) maxX = t.x + t.text.length * 140;
    if (t.y + 240 > maxY) maxY = t.y + 240;
  });
  lineItems.forEach((l) => {
    minX = Math.min(minX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
  });

  if (!isFinite(minX)) { minX = winOrgX; minY = winOrgY; maxX = winOrgX + winExtX; maxY = winOrgY + winExtY; }
  const pad = 60;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = Math.max(200, maxX - minX + pad * 2);
  const vbH = Math.max(160, maxY - minY + pad * 2);
  const displayH = Math.min(54, Math.max(22, Math.round(vbH / 16)));

  const svgLines = lineItems
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#0f172a" stroke-width="${Math.max(12, Math.round(vbH / 28))}" stroke-linecap="round" />`)
    .join('');

  const fontSize = Math.max(150, Math.round(vbH * 0.42));
  const svgTexts = textItems
    .map((t) => {
      const safeText = t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<text x="${t.x}" y="${t.y + Math.round(fontSize * 0.82)}" font-family="Times New Roman, serif" font-size="${fontSize}" fill="#0f172a">${safeText}</text>`;
    })
    .join('');

  return `<svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="height:${displayH}px; width:auto; display:inline-block; vertical-align:middle; margin:0 2px;" xmlns="http://www.w3.org/2000/svg">${svgLines}${svgTexts}</svg>`;
}

function cleanLatexToHtmlMath(str) {
  if (!str) return '';
  let s = str;

  // Chuyển tikzpicture có \tkzTab thành bảng biến thiên HTML, hoặc plot thành đồ thị SVG
  s = s.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, (match) => {
    if (match.includes('\\tkzTab')) {
      return convertTkzTabToHtml(match) || `<div class="p-2 bg-amber-50 border rounded text-xs font-mono">[Bảng biến thiên]</div>`;
    }
    const svgPlot = convertTikzPlotToSvg(match);
    if (svgPlot) return svgPlot;
    return '';
  });

  return s
    .replace(/\\vec\{([^\}]+)\}/g, '\\overrightarrow{$1}')
    .replace(/\\textbf\{([^\}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^\}]+)\}/g, '<em>$1</em>')
    .replace(/\\underline\{([^\}]+)\}/g, '<u>$1</u>')
    .replace(/\\begin\{center\}/g, '<div class="text-center my-1">')
    .replace(/\\end\{center\}/g, '</div>')
    .replace(/\\begin\{enumerate\}/g, '<div class="space-y-1 my-1">')
    .replace(/\\end\{enumerate\}/g, '</div>')
    .replace(/\\begin\{itemize\}/g, '<div class="space-y-1 my-1">')
    .replace(/\\end\{itemize\}/g, '</div>')
    .replace(/\\item\b/g, '<br>• ')
    .replace(/\\\\/g, '<br>')
    .trim();
}

// 4. Hàm tách các cặp ngoặc nhọn {...} cấp 1 trong LaTeX (Dùng cho \choice và \choiceTF)
function extractLatexBraceArgs(str) {
  const results = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === '{') {
      let depth = 1;
      let start = i + 1;
      i++;
      while (i < str.length && depth > 0) {
        if (str[i] === '{' && str[i - 1] !== '\\') depth++;
        else if (str[i] === '}' && str[i - 1] !== '\\') depth--;
        i++;
      }
      results.push(str.slice(start, i - 1).trim());
    } else {
      i++;
    }
  }
  return results;
}

// 5. BỘ PHÂN TÍCH ĐỀ TOÁN TỔNG HỢP: HỖ TRỢ CẢ FILE .TEX (ex_test) VÀ FILE WORD AZOTA
function parseAzotaOrTexToQuestions(rawInput) {
  if (!rawInput || !rawInput.trim()) return [];
  const text = rawInput.replace(/\r\n/g, '\n');

  // NHÁNH A: NẾU LÀ FILE LATEX (.TEX) CHUẨN GÓI EX_TEST (\begin{ex} ... \end{ex})
  if (/\\begin\{ex\}/i.test(text)) {
    const questions = [];
    const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/gi;
    let match;
    let qIdx = 1;

    while ((match = exRegex.exec(text)) !== null) {
      let block = match[1].trim();
      // Bóc tách lời giải \loigiai{...}
      let solution = '';
      const lgPos = block.indexOf('\\loigiai');
      if (lgPos !== -1) {
        const afterLg = block.slice(lgPos + 8);
        const lgArgs = extractLatexBraceArgs(afterLg);
        if (lgArgs.length > 0) solution = cleanLatexToHtmlMath(lgArgs[0]);
        block = block.slice(0, lgPos).trim();
      }

      // Kiểm tra nếu có \immini{Đề}{Hình}
      const imminiPos = block.indexOf('\\immini');
      let extraFigure = '';
      if (imminiPos !== -1) {
        const afterIm = block.slice(imminiPos + 7).replace(/^\s*\[[^\]]*\]/, '');
        const imArgs = extractLatexBraceArgs(afterIm);
        if (imArgs.length >= 2) {
          extraFigure = cleanLatexToHtmlMath(imArgs[1]);
          block = block.slice(0, imminiPos) + '\n' + imArgs[0] + '\n' + extraFigure;
        }
      }

      // Dạng 1: Đúng / Sai (\choiceTF)
      if (/\\choiceTF/i.test(block)) {
        const parts = block.split(/\\choiceTF[t]?\b/i);
        const qPrompt = cleanLatexToHtmlMath(parts[0]);
        const rawStmts = extractLatexBraceArgs(parts[1] || '').slice(0, 4);
        const statements = rawStmts.map((st, idx) => {
          const isTrue = /\\True\b/i.test(st);
          const cleanSt = cleanLatexToHtmlMath(st.replace(/\\True\b/gi, '').trim());
          return {
            label: `${['a', 'b', 'c', 'd'][idx]})`,
            text: cleanSt,
            isTrue
          };
        });
        questions.push({
          id: qIdx++,
          type: 'tf',
          question: qPrompt,
          statements,
          solution
        });
      }
      // Dạng 2: Trả lời ngắn (\shortans{...})
      else if (/\\shortans/i.test(block)) {
        const parts = block.split(/\\shortans(?:\[[^\]]*\])?/i);
        const qPrompt = cleanLatexToHtmlMath(parts[0]);
        const ansArgs = extractLatexBraceArgs(parts[1] || '');
        const shortAnswer = (ansArgs[0] || '').replace(/\$/g, '').trim();
        questions.push({
          id: qIdx++,
          type: 'short',
          question: qPrompt,
          shortAnswer,
          solution
        });
      }
      // Dạng 3: Trắc nghiệm 4 lựa chọn (\choice / \motcot / \haicot)
      else if (/\\(choice|motcot|haicot|boncot)/i.test(block)) {
        const parts = block.split(/\\(?:choice|motcot|haicot|boncot)(?:\[[^\]]*\])?/i);
        const qPrompt = cleanLatexToHtmlMath(parts[0]);
        const rawOpts = extractLatexBraceArgs(parts[1] || '').slice(0, 4);
        let correctIndex = 0;
        const options = rawOpts.map((opt, idx) => {
          if (/\\True\b/i.test(opt)) correctIndex = idx;
          return cleanLatexToHtmlMath(opt.replace(/\\True\b/gi, '').trim());
        });
        while (options.length < 4) options.push('');
        questions.push({
          id: qIdx++,
          type: 'mcq',
          question: qPrompt,
          options,
          correct: correctIndex,
          solution
        });
      }
    }
    return questions;
  }

  // NHÁNH B: ĐỊNH DẠNG WORD AZOTA / VĂN BẢN CHUẨN (Câu 1, Câu 2...)
  const slides = parseSmartMathContentToSlides('ĐỀ KIỂM TRA', text);
  return slides
    .filter((s) => s.type !== 'theory')
    .map((s, idx) => {
      const promptWithFig = s.figureHtml ? `${s.prompt}<div class="my-2">${s.figureHtml}</div>` : s.prompt;
      if (s.type === 'tf') {
        return {
          id: idx + 1,
          type: 'tf',
          question: promptWithFig,
          statements: s.statements,
          solution: s.solution
        };
      }
      if (s.type === 'short') {
        return {
          id: idx + 1,
          type: 'short',
          question: promptWithFig,
          shortAnswer: s.shortAnswer,
          solution: s.solution
        };
      }
      return {
        id: idx + 1,
        type: 'mcq',
        question: promptWithFig,
        options: s.options,
        correct: s.correctIndex || 0,
        solution: s.solution
      };
    });
}

// 6. Component hiển thị nội dung Toán học chuẩn KaTeX + HTML (Bảng biến thiên, SVG, Ảnh)
function MathHtmlBox({ content, className = '' }) {
  const boxRef = React.useRef(null);

  useEffect(() => {
    if (boxRef.current && window.renderMathInElement) {
      try {
        window.renderMathInElement(boxRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } catch (e) {}
    }
  }, [content]);

  return (
    <div
      ref={boxRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: content || '' }}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('lessons');
  const [selectedGrade, setSelectedGrade] = useState(10);
  // Phân hệ đang chọn: 'school' (Lớp Trường) hoặc 'home' (Lớp Nhà)
  const [selectedCategory, setSelectedCategory] = useState('home');

  // Trạng thái Đăng nhập: Giáo viên (Supabase Auth) & Học sinh (Bảng student_accounts)
  const [isTeacher, setIsTeacher] = useState(false);
  const [currentStudent, setCurrentStudent] = useState(() => {
    const saved = localStorage.getItem('vy_student_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginMode, setLoginMode] = useState('student'); // 'student' | 'teacher'
  const [loginId, setLoginId] = useState(''); // Mã HS (VD: 001) hoặc Email GV
  const [password, setPassword] = useState('');

  const [isExpandedView, setIsExpandedView] = useState(false);

  // Dữ liệu các Tab
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null); // Lưu tài liệu đang mở xem trực tiếp trên web
  const [exercises, setExercises] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [teacherInfo, setTeacherInfo] = useState({
    teacher_name: 'Lớp Toán Thầy Phan Hoài Vy',
    phone: '09xx.xxx.xxx',
    announcement: 'Chào mừng các em đến với hệ thống học tập trực tuyến!',
    schedule_note: 'Lịch học và thông báo mới nhất sẽ được cập nhật tại đây.'
  });

  // Form thêm mới (Dành cho Giáo viên)
  const [newTitle, setNewTitle] = useState('');
  const [driveInput, setDriveInput] = useState('');
  const [htmlContentInput, setHtmlContentInput] = useState('');
  const [docFileData, setDocFileData] = useState(null); // Lưu file PDF/Word chọn từ máy
  const [isUploadingDoc, setIsUploadingDoc] = useState(false); // Trạng thái đang tải lên Drive
  const [uploadCategory, setUploadCategory] = useState('home'); // Chọn up bên Trường hay Nhà

  // Form Quản lý Học sinh (Tự động cấp mã 3 số 001 -> 999)
  const [newStuName, setNewStuName] = useState('');
  const [newStuClass, setNewStuClass] = useState('');
  const [newStuPassword, setNewStuPassword] = useState('123456');
  const [newStuCode, setNewStuCode] = useState('');
  const [newStuPhone, setNewStuPhone] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL'); // Chọn lọc theo từng lớp
  const [allSubmissions, setAllSubmissions] = useState([]);              // Lưu toàn bộ điểm bài kiểm tra
  const [bulkImportText, setBulkImportText] = useState('');              // Khung dán nhanh danh sách từ Excel/Word
  const [showBulkModal, setShowBulkModal] = useState(false);             // Bật/tắt bảng nhập hàng loạt
  const [editingStudent, setEditingStudent] = useState(null); // Lưu thông tin học sinh đang bấm Sửa
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassInput, setOldPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');

  // State cho Tab 5: Chuyển PDF & Ảnh ➔ Slide HTML
  const [converterTitle, setConverterTitle] = useState('');
  const [converterRawText, setConverterRawText] = useState(
`[LT] BÀI 1. KHÁI NIỆM VECTƠ — TÓM TẮT LÝ THUYẾT
Vectơ là một đoạn thẳng có hướng (đã chỉ ra điểm đầu và điểm cuối).
Hai vectơ bằng nhau nếu cùng hướng và cùng độ dài: $\\vec{a} = \\vec{b}$.

PHẦN I. CÂU TRẮC NGHIỆM
Câu 1. Cho biểu thức $\\overrightarrow{AB} = \\overrightarrow{AC} \\neq \\vec{0}$. Khi đó:
A. Tam giác ABC là tam giác cân.
B. Tam giác ABC là tam giác đều.
C. Điểm A là trung điểm đoạn thẳng BC.
*D. Điểm B trùng với điểm C.
Lời giải: Hai vectơ bằng nhau có chung điểm đầu A thì điểm cuối phải trùng nhau $\\Rightarrow B \\equiv C$.`
  );
  const [parsedPreviewSlides, setParsedPreviewSlides] = useState([]);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('vy_gemini_key') || '');
  const [pdfPageRange, setPdfPageRange] = useState('1-5');
  const [aiStatusText, setAiStatusText] = useState('');

  // State Làm bài tập & Xem điểm (Tab 3)
  const [activeExercise, setActiveExercise] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [submittedScore, setSubmittedScore] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [rawQuizText, setRawQuizText] = useState('');

  // Kiểm tra phiên Giáo viên
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsTeacher(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsTeacher(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Nếu là Học sinh đăng nhập: Khóa chặt Khối và Phân hệ (Trường/Nhà) theo tài khoản học sinh đó
  const effectiveGrade = isTeacher ? selectedGrade : (currentStudent?.grade || 10);
  const effectiveCategory = isTeacher ? selectedCategory : (currentStudent?.category || 'home');

  useEffect(() => {
    setUploadCategory(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    if (isTeacher || currentStudent) {
      fetchData();
    }
  }, [effectiveGrade, effectiveCategory, isTeacher, currentStudent]);

  useEffect(() => {
    const slides = parseSmartMathContentToSlides(converterTitle || 'CHUYÊN ĐỀ TOÁN', converterRawText);
    setParsedPreviewSlides(slides);
  }, [converterTitle, converterRawText]);

  async function fetchData() {
    // 1. Tải Bài học theo đúng Khối + Phân hệ (Trường / Nhà)
    const { data: lessonData } = await supabase
      .from('lessons')
      .select('*')
      .eq('grade', effectiveGrade)
      .eq('category', effectiveCategory)
      .order('created_at', { ascending: false });

    const filteredLessons = isTeacher ? (lessonData || []) : (lessonData || []).filter(l => l.is_active);
    setLessons(filteredLessons);
    if (filteredLessons.length > 0) {
      setSelectedLesson(filteredLessons[0]);
    } else {
      setSelectedLesson(null);
    }

    // 2. Tải Tài liệu theo đúng Khối + Phân hệ (Trường / Nhà)
    const { data: docData } = await supabase
      .from('documents')
      .select('*')
      .eq('grade', effectiveGrade)
      .eq('category', effectiveCategory)
      .order('created_at', { ascending: false });
    setDocuments(isTeacher ? (docData || []) : (docData || []).filter(d => d.is_active));

    // 3. Tải Bài tập theo đúng Khối + Phân hệ (Trường / Nhà)
    const { data: exData } = await supabase
      .from('exercises')
      .select('*')
      .eq('grade', effectiveGrade)
      .eq('category', effectiveCategory)
      .order('created_at', { ascending: false });
    setExercises(isTeacher ? (exData || []) : (exData || []).filter(e => e.is_active));

    // 4. Tải Thông tin GV
    const { data: infoData } = await supabase
      .from('teacher_info')
      .select('*')
      .eq('id', 1)
      .single();
    if (infoData) setTeacherInfo(infoData);
// 5. Nếu là Giáo viên: Tải danh sách tài khoản học sinh + Toàn bộ điểm bài kiểm tra
    if (isTeacher) {
      const { data: stuData } = await supabase
        .from('student_accounts')
        .select('*')
        .order('student_code', { ascending: true });
      setStudentsList(stuData || []);

      // Tải toàn bộ bài nộp & tên đề kiểm tra để gắn vào hồ sơ từng học sinh
      const { data: subData } = await supabase
        .from('submissions')
        .select('*, exercises(title)')
        .order('created_at', { ascending: false });
      setAllSubmissions(subData || []);

      // Tự động tính mã 3 số tiếp theo (001 -> 999, quá 999 reset về 000)
      // Tự động tính mã 4 số tiếp theo (0001 -> 9999, quá 9999 reset về 0000)
      if (stuData && stuData.length > 0) {
        const maxNum = stuData.reduce((max, s) => {
          const n = parseInt(s.student_code, 10);
          return !isNaN(n) && n > max ? n : max;
        }, 0);
        const nextNum = maxNum >= 9999 ? 0 : maxNum + 1;
        setNewStuCode(String(nextNum).padStart(4, '0'));
      } else {
        setNewStuCode('0001');
      }
    }   
  }

  const extractDriveId = (input) => {
    if (!input) return '';
    const match = input.match(/[-\w]{25,}/);
    return match ? match[0] : input.trim();
  };

  // ================= XỬ LÝ ĐĂNG NHẬP HỌC SINH (MÃ 4 SỐ) & GIÁO VIÊN =================
  const handleUnifiedLogin = async (e) => {
    e.preventDefault();
    if (loginMode === 'teacher') {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginId.trim(),
        password
      });
      if (error) return alert('Sai Email hoặc Mật khẩu Giáo viên!');
      setLoginId('');
      setPassword('');
    } else {
      // Học sinh đăng nhập bằng Mã HS 4 số (VD: gõ 1 hoặc 0001 đều tự hiểu là 0001)
      const rawCode = loginId.trim();
      const padded4Code = /^\d+$/.test(rawCode) ? rawCode.padStart(4, '0').slice(-4) : rawCode;
      const padded3Code = /^\d+$/.test(rawCode) ? rawCode.padStart(3, '0') : rawCode;

      const { data: stu, error } = await supabase
        .from('student_accounts')
        .select('*')
        .or(`student_code.eq.${rawCode},student_code.eq.${padded4Code},student_code.eq.${padded3Code}`)
        .eq('password', password.trim())
        .maybeSingle();

      if (error || !stu) {
        return alert('Sai Mã học sinh (4 số) hoặc Mật khẩu! Em vui lòng kiểm tra lại.');
      }
      setCurrentStudent(stu);
      localStorage.setItem('vy_student_session', JSON.stringify(stu));
      setLoginId('');
      setPassword('');
    }
  };

  const handleLogout = async () => {
    if (isTeacher) await supabase.auth.signOut();
    if (currentStudent) {
      setCurrentStudent(null);
      localStorage.removeItem('vy_student_session');
    }
    setActiveTab('lessons');
  };

  // ================= ĐỔI MẬT KHẨU CHO CẢ HỌC SINH & GIÁO VIÊN =================
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassInput.trim() || newPassInput.trim().length < 4) {
      return alert('Mật khẩu mới phải có ít nhất 4 ký tự!');
    }
    if (newPassInput.trim() !== confirmPassInput.trim()) {
      return alert('Mật khẩu xác nhận không khớp!');
    }

    if (isTeacher) {
      // Giáo viên đổi mật khẩu qua Supabase Auth (Yêu cầu từ 6 ký tự trở lên)
      if (newPassInput.trim().length < 6) {
        return alert('Mật khẩu Giáo viên cần tối thiểu 6 ký tự!');
      }
      const { error } = await supabase.auth.updateUser({ password: newPassInput.trim() });
      if (error) return alert('Lỗi đổi mật khẩu Giáo viên: ' + error.message);
      alert('Đã đổi mật khẩu Giáo viên thành công!');
    } else if (currentStudent) {
      // Học sinh đổi mật khẩu: Kiểm tra mật khẩu hiện tại trước
      if (oldPassInput.trim() !== currentStudent.password) {
        return alert('Mật khẩu hiện tại không đúng!');
      }
      const { error } = await supabase
        .from('student_accounts')
        .update({ password: newPassInput.trim() })
        .eq('id', currentStudent.id);

      if (error) return alert('Lỗi khi đổi mật khẩu: ' + error.message);
      const updatedStu = { ...currentStudent, password: newPassInput.trim() };
      setCurrentStudent(updatedStu);
      localStorage.setItem('vy_student_session', JSON.stringify(updatedStu));
      alert('Em đã đổi mật khẩu thành công!');
    }

    setOldPassInput('');
    setNewPassInput('');
    setConfirmPassInput('');
    setShowPasswordModal(false);
  };

  // ================= GIÁO VIÊN SỬA TOÀN BỘ THÔNG TIN & SỐ BÁO DANH HỌC SINH =================
  const handleUpdateStudentAccount = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;

    const rawCode = (editingStudent.student_code || '').trim();
    const rawName = (editingStudent.full_name || '').trim();
    const rawClass = (editingStudent.class_name || '').trim();

    if (!rawCode || !rawName || !rawClass) {
      return alert('Vui lòng không để trống Số báo danh (Mã HS), Họ tên và Lớp!');
    }

    // Giữ nguyên số báo danh giáo viên tự gõ (nếu chỉ gõ 1-2 số như "5" thì tự lấp số 0 thành "005" hoặc giữ đúng ý giáo viên)
    const formattedCode = /^\d+$/.test(rawCode) && rawCode.length < 3
      ? rawCode.padStart(3, '0')
      : rawCode;

    const { error } = await supabase
      .from('student_accounts')
      .update({
        student_code: formattedCode,
        full_name: rawName,
        class_name: rawClass,
        phone: (editingStudent.phone || '').trim(),
        password: (editingStudent.password || '').trim() || '123456',
        grade: Number(editingStudent.grade) || selectedGrade,
        category: editingStudent.category || selectedCategory
      })
      .eq('id', editingStudent.id);

    if (error) {
      return alert('Lỗi cập nhật (Có thể Số báo danh vừa sửa bị trùng với học sinh khác): ' + error.message);
    }

    // Tự động cập nhật lại Mã HS & Họ tên trong bảng điểm kiểm tra cũ (nếu học sinh này đã có điểm)
    if (editingStudent.old_code && (editingStudent.old_code !== formattedCode || editingStudent.old_name !== rawName)) {
      const oldPrefix = `${editingStudent.old_code} - ${editingStudent.old_name}`;
      const newPrefix = `${formattedCode} - ${rawName}`;
      await supabase
        .from('submissions')
        .update({ student_name: newPrefix })
        .eq('student_name', oldPrefix);
    }

    setEditingStudent(null);
    fetchData();
  };
  
  
  const handleResetStudentPassword = async (stu) => {
    const newPass = window.prompt(
      `Nhập mật khẩu mới để Reset cho học sinh [${stu.student_code}] ${stu.full_name}:`,
      '123456'
    );
    if (newPass === null || !newPass.trim()) return;

    const { error } = await supabase
      .from('student_accounts')
      .update({ password: newPass.trim() })
      .eq('id', stu.id);

    if (error) {
      alert('Lỗi reset mật khẩu: ' + error.message);
    } else {
      alert(`Đã reset mật khẩu của em [${stu.student_code}] ${stu.full_name} thành: ${newPass.trim()}`);
      fetchData();
    }
  };

  const availableClasses = Array.from(
    new Set(
      studentsList
        .filter((s) => s.category === selectedCategory && s.grade === selectedGrade)
        .map((s) => s.class_name?.trim())
        .filter(Boolean)
    )
  ).sort();

  const getStudentTestScores = (stu) => {
    return allSubmissions.filter((sub) => {
      const nameStr = (sub.student_name || '').toLowerCase();
      const codeStr = (stu.student_code || '').toLowerCase();
      const fullNameStr = (stu.full_name || '').toLowerCase();
      return (
        nameStr.startsWith(`${codeStr} -`) ||
        nameStr.includes(`[${codeStr}]`) ||
        (nameStr === fullNameStr && (sub.student_class || '').includes(stu.class_name))
      );
    });
  };

  const handleQuickAddScore = async (stu) => {
    const testName = window.prompt(`Nhập tên bài kiểm tra cho em [${stu.student_code}] ${stu.full_name}:`, 'Kiểm tra 15 phút');
    if (!testName) return;
    const scoreInput = window.prompt(`Nhập điểm số (thang 10) của bài "${testName}":`, '9.0');
    if (scoreInput === null || scoreInput.trim() === '') return;
    const numericScore = parseFloat(scoreInput.replace(',', '.'));
    if (isNaN(numericScore)) return alert('Điểm số không hợp lệ!');

    const { error } = await supabase.from('submissions').insert([{
      exercise_id: null,
      student_name: `${stu.student_code} - ${stu.full_name}`,
      student_class: `${testName.trim()} | ${stu.class_name}`,
      score: numericScore,
      total_correct: 0,
      total_questions: 0
    }]);

    if (error) alert('Lỗi nhập điểm: ' + error.message);
    else fetchData();
  };

  // ================= TẢI FILE EXCEL MẪU CHUẨN (.XLSX) ĐỂ NHẬP KHÔNG BAO GIỜ LỆCH CỘT =================
  const handleDownloadSampleExcel = () => {
    if (!window.XLSX) return alert('Thư viện Excel đang tải, vui lòng thử lại sau 2 giây!');
    const sampleDefaultClass = selectedClassFilter !== 'ALL' 
      ? selectedClassFilter 
      : (selectedCategory === 'school' ? `${selectedGrade}A1` : `Toán ${selectedGrade} - Ca 1`);

    const wsData = [
      ['Mã HS (4 số - Để trống sẽ tự cấp)', 'Họ và tên', 'Lớp', 'Số điện thoại', 'Mật khẩu'],
      ['0001', 'Nguyễn Văn An', sampleDefaultClass, '0912345678', '123456'],
      ['0002', 'Trần Thị Bình', sampleDefaultClass, '0987654321', '123456'],
      ['', 'Lê Hoàng Cường', sampleDefaultClass, '0909123456', '123456']
    ];

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 28 }, { wch: 25 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Hoc_Sinh');
    window.XLSX.writeFile(wb, `Mau_Nhap_Hoc_Sinh_Khoi_${selectedGrade}.xlsx`);
  };

  // Đọc file Excel theo đúng cấu trúc File Mẫu (Hoặc bảng danh sách lớp bất kỳ)
  const handleExcelFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) return alert('Thư viện đọc Excel đang tải, vui lòng thử lại sau 2 giây!');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (rows.length === 0) return alert('File Excel trống!');

      // Nhận diện vị trí các cột dựa trên dòng tiêu đề đầu tiên
      const headerRow = (rows[0] || []).map((c) => String(c || '').toLowerCase().trim());
      const hasHeader = headerRow.some((h) => /họ|tên|lớp|mã|stt|sđt|điện thoại|mật khẩu/.test(h));

      let idxCode = headerRow.findIndex((h) => /mã\s*hs|mã\s*học\s*sinh|mã\s*số/.test(h));
      let idxName = headerRow.findIndex((h) => /họ\s*và\s*tên|họ\s*tên|tên/.test(h));
      let idxClass = headerRow.findIndex((h) => /^lớp|tên\s*lớp/.test(h));
      let idxPhone = headerRow.findIndex((h) => /điện\s*thoại|sđt|phone/.test(h));
      let idxPass = headerRow.findIndex((h) => /mật\s*khẩu|pass/.test(h));

      // Nếu đúng chuẩn File Mẫu 5 cột: [Mã HS, Họ và tên, Lớp, SĐT, Mật khẩu]
      if (idxName === -1) {
        idxCode = 0; idxName = 1; idxClass = 2; idxPhone = 3; idxPass = 4;
      }

      const defaultCls = selectedClassFilter !== 'ALL' 
        ? selectedClassFilter 
        : (newStuClass || (selectedCategory === 'school' ? `${selectedGrade}A1` : `Ca 1`));

      const formattedLines = [];
      const startRow = hasHeader ? 1 : 0;

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((cell) => String(cell).trim() === '')) continue;

        const rawCode = idxCode >= 0 ? String(row[idxCode] || '').trim() : '';
        const fullName = idxName >= 0 ? String(row[idxName] || '').trim() : String(row[0] || '').trim();
        const className = (idxClass >= 0 ? String(row[idxClass] || '').trim() : '') || defaultCls;
        const phone = idxPhone >= 0 ? String(row[idxPhone] || '').trim() : '';
        const pass = (idxPass >= 0 ? String(row[idxPass] || '').trim() : '') || '123456';

        if (!fullName) continue;
        const cleanCode = /^\d+$/.test(rawCode) ? rawCode.padStart(4, '0').slice(-4) : 'AUTO';
        formattedLines.push(`${cleanCode} | ${fullName} | ${className} | ${phone} | ${pass}`);
      }

      setBulkImportText(formattedLines.join('\n'));
      setShowBulkModal(true);
    } catch (err) {
      alert('Không thể đọc file Excel: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Lưu hàng loạt danh sách học sinh (Hỗ trợ Mã HS 4 chữ số: 0001 -> 9999)
  const handleConfirmBulkImport = async () => {
    const lines = bulkImportText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return alert('Danh sách trống!');

    let currentMax = studentsList.reduce((max, s) => {
      const n = parseInt(s.student_code, 10);
      return !isNaN(n) && n > max ? n : max;
    }, 0);

    const defaultCls = selectedClassFilter !== 'ALL' 
      ? selectedClassFilter 
      : (newStuClass.trim() || (uploadCategory === 'school' ? `${selectedGrade}A1` : `Toán ${selectedGrade} - Ca 1`));

    const newRecords = lines.map((line) => {
      const parts = line.includes('|') 
        ? line.split('|').map((p) => p.trim())
        : line.includes('\t')
        ? line.split('\t').map((p) => p.trim())
        : line.split(',').map((p) => p.trim());

      // Nếu cột 1 là Mã 4 số hoặc 'AUTO' (từ file Excel mẫu), ngược lại nếu chỉ gõ Họ tên ở cột 1
      let stuCode = '';
      let fullName = '';
      let className = defaultCls;
      let phone = '';
      let password = '123456';

      if (parts.length >= 2 && (/^\d+$/.test(parts[0]) || parts[0].toUpperCase() === 'AUTO')) {
        if (/^\d+$/.test(parts[0])) {
          stuCode = parts[0].padStart(4, '0').slice(-4);
          const numVal = parseInt(stuCode, 10);
          if (numVal > currentMax) currentMax = numVal;
        } else {
          currentMax = currentMax >= 9999 ? 0 : currentMax + 1;
          stuCode = String(currentMax).padStart(4, '0');
        }
        fullName = parts[1] || 'Học sinh mới';
        className = parts[2] || defaultCls;
        phone = parts[3] || '';
        password = parts[4] || '123456';
      } else {
        currentMax = currentMax >= 9999 ? 0 : currentMax + 1;
        stuCode = String(currentMax).padStart(4, '0');
        fullName = parts[0] || 'Học sinh mới';
        className = parts[1] || defaultCls;
        phone = parts[2] || '';
        password = parts[3] || '123456';
      }

      return {
        student_code: stuCode,
        full_name: fullName,
        class_name: className,
        phone: phone,
        password: password,
        grade: selectedGrade,
        category: uploadCategory
      };
    });

    const { error } = await supabase.from('student_accounts').insert(newRecords);
    if (error) {
      alert('Lỗi khi nhập hàng loạt (Kiểm tra trùng Mã HS): ' + error.message);
    } else {
      alert(`Đã tạo thành công ${newRecords.length} tài khoản học sinh (Mã 4 số) vào [${uploadCategory === 'school' ? 'Lớp Trường' : 'Lớp Nhà'} - Khối ${selectedGrade}]!`);
      setBulkImportText('');
      setShowBulkModal(false);
      setSelectedCategory(uploadCategory);
      fetchData();
    }
  };

  // Tạo lẻ 1 tài khoản học sinh (Mã 4 chữ số: 0001 -> 9999)
  const handleCreateStudentAccount = async (e) => {
    e.preventDefault();
    if (!newStuName.trim() || !newStuClass.trim() || !newStuCode.trim()) {
      return alert('Vui lòng nhập đầy đủ Mã HS (4 số), Họ tên và Lớp!');
    }
    const formattedCode = /^\d+$/.test(newStuCode.trim()) 
      ? newStuCode.trim().padStart(4, '0').slice(-4) 
      : newStuCode.trim();

    const { error } = await supabase.from('student_accounts').insert([{
      student_code: formattedCode,
      password: newStuPassword.trim() || '123456',
      full_name: newStuName.trim(),
      grade: selectedGrade,
      class_name: newStuClass.trim(),
      category: uploadCategory,
      phone: newStuPhone.trim()
    }]);

    if (error) {
      alert('Lỗi tạo tài khoản (Có thể trùng Mã học sinh): ' + error.message);
    } else {
      setNewStuName('');
      setNewStuPhone('');
      fetchData();
    }
  };

  const saveGeminiKey = (val) => {
    setGeminiApiKey(val);
    localStorage.setItem('vy_gemini_key', val);
  };

// DÁN LINK GOOGLE APPS SCRIPT CỦA BẠN VÀO ĐÂY:
  const GAS_DRIVE_URL = 'https://script.google.com/macros/s/AKfycbxfN16PRs1KoS9JHW6-HR-EQZW9qgH6BpPJtmSpa-a3ZKaZuGwi2xlEw_ppZzfAsBMT/exec';

  const [driveContentCache, setDriveContentCache] = useState({});
  const [isLoadingDriveFile, setIsLoadingDriveFile] = useState(false);

  // 1. Tạo file mới trên Google Drive
  const uploadToGoogleDrive = async (fileName, content, mimeType = 'text/html', isBase64 = false) => {
    const res = await fetch(GAS_DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'create', fileName, content, mimeType, isBase64 })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Lỗi lưu file lên Google Drive');
    return data.fileId;
  };

  // 2. Can thiệp sửa (ghi đè) trực tiếp file HTML trên Google Drive
  const updateFileOnGoogleDrive = async (fileId, content, fileName = null) => {
    const res = await fetch(GAS_DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', fileId, content, fileName })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Lỗi cập nhật file trên Google Drive');
    return data.fileId;
  };

 // 3. Đổi tên file trên Google Drive (Kiểm tra phản hồi đồng bộ)
  const renameFileOnGoogleDrive = async (fileId, newName) => {
    if (!fileId) return;
    const res = await fetch(GAS_DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rename', fileId, newName })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Google Drive chưa nhận lệnh đổi tên (Hãy chọn Phiên bản mới trong Manage Deployments của Apps Script)');
    }
  };

  // 4. Xóa file trên Google Drive (Đưa vào thùng rác)
  const deleteFileOnGoogleDrive = async (fileId) => {
    if (!fileId) return;
    const res = await fetch(GAS_DRIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', fileId })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Google Drive chưa nhận lệnh xóa');
    }
  };

  // 5. Đọc nội dung HTML / Bài tập từ Google Drive về Web
  const fetchFromGoogleDrive = async (fileId) => {
    if (!fileId) return '';
    if (driveContentCache[fileId]) return driveContentCache[fileId];
    setIsLoadingDriveFile(true);
    try {
      const res = await fetch(`${GAS_DRIVE_URL}?fileId=${fileId}`);
      const data = await res.json();
      if (data.success && data.content) {
        setDriveContentCache((prev) => ({ ...prev, [fileId]: data.content }));
        return data.content;
      }
    } catch (e) {
      console.error('Lỗi tải từ Drive:', e);
    } finally {
      setIsLoadingDriveFile(false);
    }
    return '';
  };

  useEffect(() => {
    if (selectedLesson && !selectedLesson.html_cache && selectedLesson.drive_file_id) {
      fetchFromGoogleDrive(selectedLesson.drive_file_id);
    }
  }, [selectedLesson]);

  // 6. Nhận nét viết khi bấm nút "💾 Lưu" trên bảng vẽ -> Sửa thẳng HTML trên Drive hoặc Tạo file HTML khác
 useEffect(() => {
    const handleMessageFromIframe = async (event) => {
      if (!event.data || event.data.type !== 'VY_SAVE_SLIDE_DRAWINGS') return;
      if (!isTeacher) return alert('Đã lưu nháp nét viết trên thiết bị của em!');
      if (!selectedLesson) return;

      const drawingsData = event.data.drawings;
      let rawHtml = selectedLesson.html_cache || driveContentCache[selectedLesson.drive_file_id] || '';
      if (!rawHtml) return alert('Không tìm thấy mã nguồn HTML của bài học này!');

      const jsonDrawings = JSON.stringify(drawingsData);

      // 1. GHI ĐÈ TRỰC TIẾP VÀO BIẾN slideDrawings GỐC TRONG FILE HTML (Để tải từ Drive về mở offline vẫn có nét viết ngay)
      let updatedHtml = rawHtml.replace(
        /slideDrawings\s*=\s*SLIDES\.map\(\s*\(\)\s*=>\s*\[\]\s*\)\s*;?/g,
        `slideDrawings = ${jsonDrawings};`
      );

      // 2. NHÚNG KÈM BỘ TỰ ĐỘNG VẼ LẠI (Đảm bảo tương thích với mọi cấu trúc file HTML cũ/mới)
      const openTag = '<scr' + 'ipt id="vy-saved-drawings">';
      const closeTag = '</scr' + 'ipt>';
      const embeddedScript =
        openTag +
        'window.SAVED_SLIDE_DRAWINGS = ' + jsonDrawings + ';' +
        'window.addEventListener("load", function(){' +
        '  var applyDrawings = function(){' +
        '    if(typeof slideDrawings !== "undefined" && Array.isArray(window.SAVED_SLIDE_DRAWINGS)){' +
        '      for(var i=0; i<window.SAVED_SLIDE_DRAWINGS.length; i++){' +
        '        if(window.SAVED_SLIDE_DRAWINGS[i] && window.SAVED_SLIDE_DRAWINGS[i].length > 0){' +
        '          slideDrawings[i] = window.SAVED_SLIDE_DRAWINGS[i];' +
        '        }' +
        '      }' +
        '      if(typeof redrawCanvas === "function") redrawCanvas();' +
        '    }' +
        '  };' +
        '  applyDrawings(); setTimeout(applyDrawings, 150); setTimeout(applyDrawings, 500);' +
        '});' +
        closeTag;

      const regexOld = new RegExp(openTag + '[\\s\\S]*?' + closeTag, 'g');
      updatedHtml = updatedHtml.replace(regexOld, '');

      if (updatedHtml.includes('</body>')) {
        updatedHtml = updatedHtml.replace('</body>', embeddedScript + '</body>');
      } else {
        updatedHtml = updatedHtml + embeddedScript;
      }

      // Hỏi giáo viên muốn Lưu đè lên file hiện tại hay Tạo thành file HTML mới trên Drive
      const choice = window.prompt(
        `💾 ĐỒNG BỘ NÉT VIẾT LÊN GOOGLE DRIVE:\n\n` +
        `• Nhập 1: Ghi đè thẳng vào file "${selectedLesson.title}" trên Drive (Tải từ Drive về mở lên có nguyên nét viết).\n` +
        `• Nhập 2: Lưu thành một file HTML mới trên Drive.`,
        '1'
      );
      if (!choice) return;

      try {
        if (choice.trim() === '2') {
          const newTitleName = window.prompt('Nhập tên cho file bài học HTML mới:', `${selectedLesson.title} (Đã giải)`);
          if (!newTitleName || !newTitleName.trim()) return;

          const newFileId = await uploadToGoogleDrive(
            `[K${selectedGrade}-${selectedCategory.toUpperCase()}] ${newTitleName.trim()}.html`,
            updatedHtml,
            'text/html'
          );

          const { data: inserted, error } = await supabase
            .from('lessons')
            .insert([{
              title: newTitleName.trim(),
              grade: selectedGrade,
              category: selectedCategory,
              drive_file_id: newFileId,
              html_cache: null,
              is_active: true,
              show_answers: selectedLesson.show_answers
            }])
            .select()
            .single();

          if (error) throw error;
          setDriveContentCache((prev) => ({ ...prev, [newFileId]: updatedHtml }));
          alert(`✅ Đã tạo file HTML mới "${newTitleName.trim()}" trên Google Drive kèm toàn bộ nét viết!`);
          await fetchData();
          if (inserted) setSelectedLesson(inserted);
        } else {
          if (selectedLesson.drive_file_id) {
            await updateFileOnGoogleDrive(selectedLesson.drive_file_id, updatedHtml);
            await supabase
              .from('lessons')
              .update({ html_cache: null })
              .eq('id', selectedLesson.id);
            setDriveContentCache((prev) => ({ ...prev, [selectedLesson.drive_file_id]: updatedHtml }));
          } else {
            const newFileId = await uploadToGoogleDrive(
              `[K${selectedGrade}-${selectedCategory.toUpperCase()}] ${selectedLesson.title}.html`,
              updatedHtml,
              'text/html'
            );
            await supabase
              .from('lessons')
              .update({ drive_file_id: newFileId, html_cache: null })
              .eq('id', selectedLesson.id);
            setDriveContentCache((prev) => ({ ...prev, [newFileId]: updatedHtml }));
          }
          alert(`✅ Đã ghi đè nét viết vào thẳng lõi file HTML "${selectedLesson.title}" trên Google Drive!`);
        }
      } catch (err) {
        alert('Lỗi khi lưu lên Google Drive: ' + err.message);
      }
    };

    window.addEventListener('message', handleMessageFromIframe);
    return () => window.removeEventListener('message', handleMessageFromIframe);
  }, [selectedLesson, driveContentCache, isTeacher, selectedGrade, selectedCategory]);

  const handleRenameItemSyncDrive = async (table, item, ext = '.html') => {
    const newName = window.prompt(`Nhập tên mới cho "${item.title}":`, item.title);
    if (!newName || !newName.trim() || newName.trim() === item.title) return;
    const cleanName = newName.trim();

    try {
      // 1. Đổi tên trực tiếp trên Google Drive trước
      if (item.drive_file_id) {
        await renameFileOnGoogleDrive(
          item.drive_file_id,
          `[K${item.grade}-${(item.category || 'home').toUpperCase()}] ${cleanName}${ext}`
        );
      }
      // 2. Sau khi Drive đổi xong mới cập nhật tên trên Web
      const { error } = await supabase.from(table).update({ title: cleanName }).eq('id', item.id);
      if (error) throw error;

      if (selectedLesson?.id === item.id) {
        setSelectedLesson({ ...selectedLesson, title: cleanName });
      }
      fetchData();
      alert(`✅ Đã đồng bộ đổi tên thành "${cleanName}" trên cả Web và Google Drive!`);
    } catch (err) {
      alert('Lỗi đồng bộ Google Drive: ' + err.message);
    }
  };

  const handleDeleteItemSyncDrive = async (table, item) => {
    if (!window.confirm(`Xóa "${item.title}" trên Web VÀ xóa luôn file trên Google Drive?`)) return;
    try {
      if (item.drive_file_id) {
        await deleteFileOnGoogleDrive(item.drive_file_id);
      }
      await supabase.from(table).delete().eq('id', item.id);
      fetchData();
    } catch (err) {
      alert('Lỗi khi xóa file trên Google Drive: ' + err.message);
    }
  };
  
  // ================= AI VISION: CHUYỂN TỪ ẢNH & PDF SANG LATEX + HÌNH VẼ SVG =================
  const convertImagesWithGeminiVision = async (base64Images, appendMode = false) => {
    const prompt = `Bạn là chuyên gia số hóa đề Toán THPT cho hệ thống trình chiếu của Thầy Phan Hoài Vy.
Hãy đọc chính xác nội dung Toán học trong ảnh và xuất ra định dạng chuẩn sau (TUYỆT ĐỐI KHÔNG bọc trong markdown \`\`\`):
1. Mọi công thức Toán, vectơ, phân số, căn thức phải viết trong cặp dấu $...$ chuẩn LaTeX (ví dụ: $\\overrightarrow{AB}$, $\\dfrac{a\\sqrt{3}}{2}$, $\\widehat{ABC} = 60^\\circ$).
2. Phân loại đúng tiêu đề:
   - Lý thuyết: dòng đầu ghi "[LT] Tiêu đề lý thuyết", các dòng dưới ghi nội dung.
   - Trắc nghiệm 4 lựa chọn: ghi "PHẦN I. CÂU TRẮC NGHIỆM", mỗi câu bắt đầu bằng "Câu 1. ...", 4 dòng đáp án "A. ...", "B. ...", "C. ...", "D. ...". Đặt dấu * ngay trước phương án đúng (ví dụ: "*A. ..."). Thêm dòng "Lời giải: ..." ngắn gọn súc tích ở dưới.
   - Đúng/Sai: ghi "PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI", các ý ghi "a) ...", "b) ...", "c) ...", "d) ...", đặt dấu * trước ý Đúng (ví dụ "*a) ...").
   - Trả lời ngắn: ghi "PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN", bên dưới có dòng "Đáp số: ..." và "Lời giải: ...".
3. VẼ LẠI HÌNH HỌC SIÊU NÉT:
   Nếu trong ảnh có hình vẽ minh họa (vectơ, hình học, đồ thị, bảng biến thiên), hãy TỰ VẼ LẠI thành mã <svg viewBox="0 0 320 220" class="w-full h-auto max-h-[240px]" xmlns="http://www.w3.org/2000/svg">...</svg> sắc nét, đúng đỉnh, mũi tên và đặt thẻ <svg>...</svg> trên 1 dòng ngay dưới đề bài của câu đó.`;

    const parts = [
      { text: prompt },
      ...base64Images.map((b64) => {
        const mimeMatch = b64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const rawBase64 = b64.includes(',') ? b64.split(',')[1] : b64;
        return { inline_data: { mime_type: mimeType, data: rawBase64 } };
      })
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } })
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || 'Kiểm tra lại Gemini API Key');
    }
    const data = await res.json();
    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = resultText.replace(/^```[a-z]*\n?/gim, '').replace(/```$/gm, '').trim();
    setConverterRawText((prev) => (appendMode ? (prev + '\n\n' + cleaned).trim() : cleaned));
  };

  const handleImageFilesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!converterTitle) setConverterTitle(files[0].name.replace(/\.[a-zA-Z0-9]+$/, ''));

    const readAsDataURL = (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });

    setIsExtractingPdf(true);
    try {
      const base64List = await Promise.all(files.map(readAsDataURL));
      if (geminiApiKey.trim()) {
        setAiStatusText(`Đang dùng AI chuyển ${files.length} ảnh sang câu hỏi LaTeX & vẽ lại hình SVG...`);
        await convertImagesWithGeminiVision(base64List, true);
      } else {
        const imgBlocks = base64List
          .map((b64, idx) => `Câu ${idx + 1}. Quan sát hình ảnh bài toán sau:\n[IMG:${b64}]\n*A. Đáp án A\nB. Đáp án B\nC. Đáp án C\nD. Đáp án D\nLời giải: Xem hướng dẫn của giáo viên.`)
          .join('\n\n');
        setConverterRawText((prev) => (prev ? prev + '\n\n' + imgBlocks : imgBlocks));
      }
    } catch (err) {
      alert('Lỗi chuyển đổi từ ảnh: ' + err.message);
    } finally {
      setIsExtractingPdf(false);
      setAiStatusText('');
      e.target.value = '';
    }
  };

  const handleClipboardPaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64Img = ev.target.result;
          if (geminiApiKey.trim()) {
            setIsExtractingPdf(true);
            setAiStatusText('Đang nhận diện công thức Toán & vẽ lại hình SVG từ ảnh vừa dán...');
            try {
              await convertImagesWithGeminiVision([base64Img], true);
            } catch (err) {
              alert('Lỗi AI đọc ảnh dán: ' + err.message);
            } finally {
              setIsExtractingPdf(false);
              setAiStatusText('');
            }
          } else {
            setConverterRawText((prev) => `${prev}\n[IMG:${base64Img}]\n`);
          }
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!converterTitle) setConverterTitle(file.name.replace(/\.pdf$/i, ''));
    if (!window.pdfjsLib) return alert('Thư viện PDF đang tải, vui lòng thử lại sau 2 giây!');

    setIsExtractingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let startPage = 1, endPage = Math.min(pdf.numPages, 5);
      const rangeMatch = pdfPageRange.trim().match(/^(\d+)\s*\-\s*(\d+)$/);
      if (rangeMatch) {
        startPage = Math.max(1, parseInt(rangeMatch[1], 10));
        endPage = Math.min(pdf.numPages, parseInt(rangeMatch[2], 10));
      } else if (/^\d+$/.test(pdfPageRange.trim())) {
        startPage = endPage = Math.min(pdf.numPages, parseInt(pdfPageRange.trim(), 10));
      }

      if (geminiApiKey.trim()) {
        setConverterRawText('');
        for (let p = startPage; p <= endPage; p++) {
          setAiStatusText(`Đang dùng AI quét công thức & vẽ hình trang ${p}/${endPage}...`);
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 2.0 });
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = viewport.width;
          tempCanvas.height = viewport.height;
          await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;
          const base64Img = tempCanvas.toDataURL('image/jpeg', 0.88);
          await convertImagesWithGeminiVision([base64Img], p > startPage);
        }
      } else {
        let fullExtractedText = '';
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          let lastY = null, lastX = null, pageLines = '';
          for (const item of textContent.items) {
            const curY = Math.round(item.transform[5]);
            const curX = Math.round(item.transform[4]);
            if (lastY !== null && Math.abs(curY - lastY) > 6) {
              pageLines += '\n';
            } else if (lastX !== null && curX - lastX > 12) {
              pageLines += ' ';
            }
            pageLines += item.str;
            lastY = curY;
            lastX = curX + (item.width || 0);
          }
          fullExtractedText += pageLines + '\n\n';
        }
        setConverterRawText(cleanBrokenVietnamesePdfText(fullExtractedText.trim()));
      }
    } catch (err) {
      alert('Lỗi xử lý PDF: ' + err.message);
    } finally {
      setIsExtractingPdf(false);
      setAiStatusText('');
      e.target.value = '';
    }
  };

  const handleSaveConvertedToLessons = async () => {
    if (!converterTitle.trim()) return alert('Vui lòng nhập Tên bài giảng trước khi lưu!');
    setIsExtractingPdf(true);
    setAiStatusText('Đang lưu file HTML lên Google Drive...');
    try {
      const fullHtml = buildFullStandaloneHTML(converterTitle, selectedGrade, parsedPreviewSlides);
      const driveFileId = await uploadToGoogleDrive(
        `[K${selectedGrade}-${uploadCategory.toUpperCase()}] ${converterTitle.trim()}.html`,
        fullHtml,
        'text/html'
      );

      const { error } = await supabase.from('lessons').insert([{
        title: converterTitle.trim(),
        grade: selectedGrade,
        category: uploadCategory,
        drive_file_id: driveFileId,
        html_cache: null,
        is_active: true,
        show_answers: false
      }]);

      if (error) throw error;
      setDriveContentCache((prev) => ({ ...prev, [driveFileId]: fullHtml }));
      setSelectedCategory(uploadCategory);
      alert(`Đã lưu ${parsedPreviewSlides.length} Slide lên Google Drive thành công!`);
      await fetchData();
      setActiveTab('lessons');
    } catch (err) {
      alert('Lỗi lưu bài giảng lên Drive: ' + err.message);
    } finally {
      setIsExtractingPdf(false);
      setAiStatusText('');
    }
  };

  const handleDownloadConvertedHtml = () => {
    const title = converterTitle.trim() || `Bai-giang-Toan-${selectedGrade}`;
    const fullHtml = buildFullStandaloneHTML(title, selectedGrade, parsedPreviewSlides);
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ================= XỬ LÝ TAB 1, 2, 3 (CÓ CHỌN UP BÊN TRƯỜNG HAY BÊN NHÀ) =================
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
      return alert('Vui lòng chọn file .html hoặc dán link Google Drive!');
    }
    try {
      let fileId = extractDriveId(driveInput);
      // Nếu chọn file .html từ máy -> Tự động đẩy file đó lên Google Drive!
      if (htmlContentInput) {
        fileId = await uploadToGoogleDrive(
          `[K${selectedGrade}-${uploadCategory.toUpperCase()}] ${newTitle.trim()}.html`,
          htmlContentInput,
          'text/html'
        );
        setDriveContentCache((prev) => ({ ...prev, [fileId]: htmlContentInput }));
      }

      const { error } = await supabase.from('lessons').insert([{
        title: newTitle,
        grade: selectedGrade,
        category: uploadCategory,
        drive_file_id: fileId,
        html_cache: null, // Tốn 0 KB trên Supabase
        is_active: true,
        show_answers: false
      }]);

      if (error) throw error;
      setNewTitle('');
      setDriveInput('');
      setHtmlContentInput('');
      setSelectedCategory(uploadCategory);
      fetchData();
    } catch (err) {
      alert('Lỗi đẩy bài học lên Google Drive: ' + err.message);
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

  const getRenderedHtml = (lesson) => {
    const rawHtml = lesson?.html_cache || driveContentCache[lesson?.drive_file_id] || '';
    if (!rawHtml) return '';
    
    // Đoạn mã tự động tiêm công cụ lưu bảng và đồng bộ nét vẽ vào file HTML bất kỳ
    const autoSaveBridgeCode = `
      <script>
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'VY_REQUEST_DRAWINGS') {
            if (typeof slideDrawings !== 'undefined') {
              e.source.postMessage({ type: 'VY_SEND_DRAWINGS', drawings: slideDrawings }, e.origin);
            }
          }
        });
      </script>
    `;

    const lockAnswerCode = lesson.show_answers ? '' : `
      <style>
        #solution-container, #reveal-btn-badge, .dap-an, .loi-giai, .answer, .solution {
          display: none !important;
        }
        #question-btn {
          pointer-events: none !important;
          cursor: default !important;
        }
      </style>
    `;

    const fullInjectedCode = TABLET_PRO_DRAWING_INJECTION + autoSaveBridgeCode + lockAnswerCode;
    if (rawHtml.includes('</body>')) {
      return rawHtml.replace('</body>', `${fullInjectedCode}</body>`);
    }
    return rawHtml + fullInjectedCode;
  };

  // Chọn file PDF / Word / Tài liệu trực tiếp từ máy tính
  const handleFileUploadDocument = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!newTitle) {
      setNewTitle(file.name.replace(/\.[a-zA-Z0-9]+$/, ''));
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultStr = String(ev.target.result || '');
      const base64Content = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
      setDocFileData({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64: base64Content
      });
    };
    reader.readAsDataURL(file);
  };

  const addDocument = async () => {
    if (!newTitle.trim()) return alert('Vui lòng nhập tên tài liệu!');
    if (!docFileData && !driveInput.trim()) {
      return alert('Vui lòng chọn file PDF/Word từ máy tính HOẶC dán Link Google Drive!');
    }

    setIsUploadingDoc(true);
    try {
      let fileId = extractDriveId(driveInput);

      // Nếu Giáo viên chọn file trực tiếp từ máy tính -> Đẩy thẳng lên Google Drive (isBase64 = true)
      if (docFileData) {
        const extMatch = docFileData.fileName.match(/\.[a-zA-Z0-9]+$/);
        const ext = extMatch ? extMatch[0] : '';
        const driveFileName = `[K${selectedGrade}-${uploadCategory.toUpperCase()}] ${newTitle.trim()}${ext}`;

        fileId = await uploadToGoogleDrive(
          driveFileName,
          docFileData.base64,
          docFileData.mimeType,
          true
        );
      }

      const { error } = await supabase.from('documents').insert([{
        title: newTitle.trim(),
        grade: selectedGrade,
        category: uploadCategory,
        drive_file_id: fileId,
        is_active: true,
        show_answers: false
      }]);

      if (error) throw error;

      setNewTitle('');
      setDriveInput('');
      setDocFileData(null);
      setSelectedCategory(uploadCategory);
      fetchData();
      alert('✅ Đã tải tài liệu lên Google Drive và đăng vào lớp thành công!');
    } catch (err) {
      alert('Lỗi tải tài liệu lên Google Drive: ' + err.message);
    } finally {
      setIsUploadingDoc(false);
    }
  };
  const toggleDocStatus = async (doc, field) => {
    await supabase.from('documents').update({ [field]: !doc[field] }).eq('id', doc.id);
    fetchData();
  };

  // Đọc trực tiếp file .tex hoặc file Word .docx chuẩn Azota ngay trên trình duyệt (Không cần API Key)
  const handleQuizFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!newTitle) {
      setNewTitle(file.name.replace(/\.[a-zA-Z0-9]+$/, ''));
    }

    const fileNameLower = file.name.toLowerCase();
    try {
      // 1. Nếu là file LaTeX (.tex) hoặc .txt
      if (fileNameLower.endsWith('.tex') || fileNameLower.endsWith('.txt')) {
        const text = await file.text();
        setRawQuizText(text);
        return;
      }

      // 2. Nếu là file Word (.docx) chuẩn Azota
      if (fileNameLower.endsWith('.docx')) {
        if (!window.JSZip) {
          return alert('Thư viện đọc Word đang khởi tạo, vui lòng bấm chọn lại sau 1 giây!');
        }
        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);
        const docXmlStr = await zip.file('word/document.xml')?.async('string');
        const relsXmlStr = await zip.file('word/_rels/document.xml.rels')?.async('string');

        if (!docXmlStr) return alert('Không đọc được cấu trúc file Word này!');

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(docXmlStr, 'application/xml');

        // Bóc tách toàn bộ Ảnh (PNG/JPG) VÀ Công thức MathType (WMF/EMF) trực tiếp trong trình duyệt
        const mediaMap = {};
        if (relsXmlStr) {
          const relsDoc = parser.parseFromString(relsXmlStr, 'application/xml');
          const relNodes = Array.from(relsDoc.getElementsByTagName('Relationship'));
          for (const rel of relNodes) {
            const rId = rel.getAttribute('Id');
            const target = rel.getAttribute('Target') || '';
            const cleanPath = target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^(\.\.\/)+/, '')}`;
            const zipEntry = zip.file(cleanPath);
            if (!zipEntry) continue;

            if (/\.(png|jpe?g|gif|webp)$/i.test(target)) {
              const b64 = await zipEntry.async('base64');
              const ext = target.split('.').pop().toLowerCase();
              const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
              mediaMap[rId] = { type: 'image', html: `<img src="data:${mime};base64,${b64}" class="max-h-[220px] w-auto inline-block align-middle my-1 rounded" />` };
            } else if (/\.(wmf|emf)$/i.test(target)) {
              const wmfBytes = await zipEntry.async('uint8array');
              const decodedMath = decodeMathTypeFromWordBinary(wmfBytes, null);
              if (decodedMath) {
                mediaMap[rId] = { type: 'math', html: ` ${decodedMath} ` };
              }
            }
          }
        }

        // Duyệt từng đoạn văn <w:p> trong Word
        const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
        const extractedLines = [];
        let autoQuestionCounter = 1;

        for (const p of paragraphs) {
          const hasNumPr = p.getElementsByTagName('w:numPr').length > 0;
          let pText = '';

          const walkNodes = (node) => {
            if (node.nodeName === 'w:r') {
              const rPr = node.getElementsByTagName('w:rPr')[0];
              const isUnderlined = rPr && rPr.getElementsByTagName('w:u').length > 0 && rPr.getElementsByTagName('w:u')[0].getAttribute('w:val') !== 'none';
              const colorVal = rPr?.getElementsByTagName('w:color')[0]?.getAttribute('w:val') || '';
              const isRed = /^(FF0000|C00000|EE0000|DC2626|EF4444)$/i.test(colorVal);

              let runStr = '';
              const tNodes = Array.from(node.getElementsByTagName('w:t'));
              tNodes.forEach((t) => { runStr += t.textContent || ''; });

              if ((isUnderlined || isRed) && /^\s*([A-D][\.\)]|[a-d]\))/.test(runStr)) {
                runStr = '*' + runStr.trimStart();
              }

              const blips = Array.from(node.getElementsByTagName('a:blip'));
              const vImagedata = Array.from(node.getElementsByTagName('v:imagedata'));
              [...blips, ...vImagedata].forEach((imgNode) => {
                const rId = imgNode.getAttribute('r:embed') || imgNode.getAttribute('r:id');
                if (rId && mediaMap[rId]) {
                  runStr += mediaMap[rId].html;
                }
              });

              pText += runStr;
            } else if (node.nodeName === 'm:oMath' || node.nodeName === 'm:oMathPara') {
              const mathTexts = Array.from(node.getElementsByTagName('m:t')).map((m) => m.textContent).join('');
              if (mathTexts) pText += ` $${mathTexts}$ `;
            } else if (node.childNodes && node.childNodes.length > 0) {
              Array.from(node.childNodes).forEach(walkNodes);
            }
          };

          walkNodes(p);
          let cleanLine = pText.replace(/[ \t]+/g, ' ').trim();
          if (!cleanLine) continue;

          // Tự động khôi phục chữ "Câu 1.", "Câu 2." nếu file Word dùng đánh số tự động (Numbering)
          if (
            hasNumPr &&
            !/^(Câu\s+\d+|PHẦN\s+[I123V]+|\*?[A-D][\.\)]|\*?[a-d]\)|Lời giải|HD|Đáp án|Bảng đáp án)/i.test(cleanLine)
          ) {
            cleanLine = `Câu ${autoQuestionCounter++}. ${cleanLine}`;
          }

          extractedLines.push(cleanLine);
        }

        setRawQuizText(extractedLines.join('\n'));
      }
    } catch (err) {
      alert('Lỗi đọc file đề thi: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
 

  // Dùng AI Gemini quét ảnh/PDF đề thi có đồ thị & bảng biến thiên sang thẳng bài tập Tab 3
  const handleQuizImageOrPdfUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!geminiApiKey.trim()) {
      return alert('Vui lòng nhập Gemini API Key (ở Tab 5) để AI tự động vẽ lại Bảng biến thiên & Đồ thị từ Ảnh/PDF!');
    }
    if (!newTitle) setNewTitle(files[0].name.replace(/\.[a-zA-Z0-9]+$/, ''));

    setIsExtractingPdf(true);
    try {
      const readAsDataURL = (f) =>
        new Promise((res) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target.result);
          r.readAsDataURL(f);
        });
      const b64List = await Promise.all(files.map(readAsDataURL));

      const prompt = `Hãy số hóa đề Toán trong ảnh sang định dạng chuẩn sau để học sinh làm bài như Azota (KHÔNG bọc trong markdown \`\`\`):
1. Công thức Toán bọc trong $...$ chuẩn LaTeX.
2. Trắc nghiệm 4 lựa chọn: ghi "PHẦN I. CÂU TRẮC NGHIỆM", mỗi câu "Câu 1. ...", 4 dòng "A. ...", "B. ...", "C. ...", "D. ...", thêm dấu * trước đáp án đúng (VD: "*A. ...").
3. Đúng/Sai: ghi "PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI", các ý "a) ...", "b) ...", "c) ...", "d) ...", thêm dấu * trước ý Đúng.
4. Trả lời ngắn: ghi "PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN", dưới đề có dòng "Đáp số: ...".
5. ĐẶC BIỆT: Nếu câu hỏi có BẢNG BIẾN THIÊN hoặc ĐỒ THỊ HÀM SỐ / HÌNH HỌC, hãy vẽ lại thật chuẩn xác thành thẻ <svg viewBox="0 0 340 210" class="w-full max-w-[360px] h-auto mx-auto my-2 bg-white border rounded-xl p-2" xmlns="http://www.w3.org/2000/svg">...</svg> trên 1 dòng ngay dưới lời dẫn câu hỏi đó.`;

      const parts = [
        { text: prompt },
        ...b64List.map((b64) => ({
          inline_data: {
            mime_type: b64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] || 'image/jpeg',
            data: b64.includes(',') ? b64.split(',')[1] : b64
          }
        }))
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } })
        }
      );
      const data = await res.json();
      const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = resultText.replace(/^```[a-z]*\n?/gim, '').replace(/```$/gm, '').trim();
      setRawQuizText((prev) => (prev ? prev + '\n\n' + cleaned : cleaned));
    } catch (err) {
      alert('Lỗi AI đọc đề: ' + err.message);
    } finally {
      setIsExtractingPdf(false);
      e.target.value = '';
    }
  };

  const addExercise = async () => {
    if (!newTitle.trim() || !rawQuizText.trim()) {
      return alert('Vui lòng nhập Tên đề kiểm tra và tải file .tex / .docx (hoặc dán nội dung câu hỏi)!');
    }

    const parsedQuestions = parseAzotaOrTexToQuestions(rawQuizText);
    if (parsedQuestions.length === 0) {
      return alert('Không nhận diện được câu hỏi nào! Hãy kiểm tra lại định dạng Câu 1... hoặc \\begin{ex}...');
    }

    try {
      const jsonString = JSON.stringify(parsedQuestions);
      const driveFileId = await uploadToGoogleDrive(
        `[BAI-TAP-K${selectedGrade}] ${newTitle.trim()}.json`,
        jsonString,
        'application/json'
      );

      const { error } = await supabase.from('exercises').insert([{
        title: newTitle.trim(),
        grade: selectedGrade,
        category: uploadCategory,
        drive_file_id: driveFileId,
        questions_json: [],
        is_active: true
      }]);

      if (error) throw error;

      setDriveContentCache((prev) => ({ ...prev, [driveFileId]: jsonString }));
      setNewTitle('');
      setRawQuizText('');
      setSelectedCategory(uploadCategory);
      fetchData();
      alert(`✅ Đã tạo đề "${newTitle.trim()}" (${parsedQuestions.length} câu hỏi chuẩn Azota) và lưu lên Google Drive!`);
    } catch (err) {
      alert('Lỗi lưu bài tập lên Google Drive: ' + err.message);
    }
  };

  const openExercise = async (ex) => {
    let loadedExercise = { ...ex };
    if ((!ex.questions_json || ex.questions_json.length === 0) && ex.drive_file_id) {
      const jsonStr = await fetchFromGoogleDrive(ex.drive_file_id);
      if (jsonStr) {
        try {
          loadedExercise.questions_json = JSON.parse(jsonStr);
        } catch (e) {
          console.error('Lỗi đọc JSON bài tập:', e);
        }
      }
    }
    setActiveExercise(loadedExercise);
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

  // Chấm điểm chuẩn cấu trúc mới (Trắc nghiệm + Đúng/Sai bậc thang + Trả lời ngắn)
  const submitExercise = async () => {
    const questions = activeExercise.questions_json || [];
    if (questions.length === 0) return;

    const sName = isTeacher
      ? 'Giáo viên thử bài'
      : `${currentStudent.student_code} - ${currentStudent.full_name}`;
    const sClass = isTeacher
      ? 'GV'
      : `${currentStudent.class_name} (${currentStudent.category === 'school' ? 'Trường' : 'Nhà'})`;

    let earnedPoints = 0;
    let maxPoints = 0;
    let fullCorrectCount = 0;

    questions.forEach((q, idx) => {
      const uAns = userAnswers[idx];
      if (q.type === 'tf') {
        // Chuẩn Bộ GD: Đúng 1 ý = 0.1, 2 ý = 0.25, 3 ý = 0.5, 4 ý = 1.0
        maxPoints += 1.0;
        const stmts = q.statements || [];
        let matchCount = 0;
        stmts.forEach((st, sIdx) => {
          if (uAns && uAns[sIdx] === st.isTrue) matchCount++;
        });
        if (matchCount === 4) { earnedPoints += 1.0; fullCorrectCount++; }
        else if (matchCount === 3) earnedPoints += 0.5;
        else if (matchCount === 2) earnedPoints += 0.25;
        else if (matchCount === 1) earnedPoints += 0.1;
      } else if (q.type === 'short') {
        maxPoints += 0.5;
        const cleanUser = String(uAns || '').trim().replace(',', '.').toLowerCase();
        const cleanKey = String(q.shortAnswer || '').trim().replace(',', '.').toLowerCase();
        if (cleanUser && cleanUser === cleanKey) {
          earnedPoints += 0.5;
          fullCorrectCount++;
        }
      } else {
        // MCQ
        maxPoints += 0.25;
        if (uAns === q.correct) {
          earnedPoints += 0.25;
          fullCorrectCount++;
        }
      }
    });

    const finalScore10 = maxPoints > 0 ? Number(((earnedPoints / maxPoints) * 10).toFixed(2)) : 0;

    await supabase.from('submissions').insert([{
      exercise_id: activeExercise.id,
      student_name: sName,
      student_class: sClass,
      score: finalScore10,
      total_correct: fullCorrectCount,
      total_questions: questions.length
    }]);

    setSubmittedScore({
      score: finalScore10,
      correct: fullCorrectCount,
      total: questions.length
    });

    if (isTeacher) {
      fetchData();
    }
  };
  // Component chọn nhanh Up bên Trường hay bên Nhà cho Giáo viên
  const CategorySelectorPill = () => (
    <div className="flex items-center justify-between bg-slate-950/90 p-1.5 rounded-xl border border-slate-700 text-xs">
      <span className="text-slate-400 font-semibold pl-2">Đăng vào phân hệ:</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setUploadCategory('school')}
          className={`px-3 py-1 rounded-lg font-extrabold transition ${
            uploadCategory === 'school' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          🏫 Lớp Trường
        </button>
        <button
          type="button"
          onClick={() => setUploadCategory('home')}
          className={`px-3 py-1 rounded-lg font-extrabold transition ${
            uploadCategory === 'home' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          🏠 Lớp Nhà
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // MÀN HÌNH BẮT BUỘC ĐĂNG NHẬP (NẾU CHƯA ĐĂNG NHẬP HỌC SINH HOẶC GIÁO VIÊN)
  // ============================================================================
  if (!isTeacher && !currentStudent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b1120] via-[#111827] to-[#1e1b4b] flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6 text-white">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-amber-400 mb-1">
              <BookOpen className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">LỚP TOÁN THẦY VY</h1>
            <p className="text-xs text-slate-400">Đăng nhập để truy cập Bài giảng, Tài liệu & Bài tập theo lớp</p>
          </div>

          {/* Chuyển chế độ Đăng nhập Học sinh / Giáo viên */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setLoginMode('student'); setLoginId(''); setPassword(''); }}
              className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                loginMode === 'student' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              🎓 Học sinh Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('teacher'); setLoginId(''); setPassword(''); }}
              className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                loginMode === 'teacher' ? 'bg-[#2563eb] text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              👨‍🏫 Giáo viên Quản trị
            </button>
          </div>

          <form onSubmit={handleUnifiedLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {loginMode === 'student' ? 'Mã số Học sinh (3 chữ số, VD: 001):' : 'Email Giáo viên:'}
              </label>
              <input
                type={loginMode === 'student' ? 'text' : 'email'}
                required
                placeholder={loginMode === 'student' ? 'Nhập mã học sinh (VD: 001)...' : 'Nhập email giáo viên...'}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Mật khẩu:</label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:border-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              className={`w-full py-3.5 rounded-xl font-extrabold text-sm shadow-lg transition ${
                loginMode === 'student' 
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' 
                  : 'bg-[#2563eb] hover:bg-blue-600 text-white'
              }`}
            >
              {loginMode === 'student' ? 'Vào Lớp Học Ngay →' : 'Đăng Nhập Quyền Giáo Viên →'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navTabs = [
    { id: 'lessons', label: '1. Bài học Slide', icon: BookOpen },
    { id: 'documents', label: '2. Tài liệu', icon: FileText },
    { id: 'exercises', label: '3. Bài tập', icon: CheckSquare },
    { id: 'info', label: '4. Thông tin', icon: Info },
    ...(isTeacher ? [
      { id: 'converter', label: '✨ 5. PDF/Ảnh ➔ Slide', icon: Wand2 },
      { id: 'students', label: '👥 6. TK Học sinh', icon: Users }
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] pb-16 md:pb-2 font-sans text-slate-800 flex flex-col">
      {/* HEADER CHÍNH */}
      <header className="bg-[#111827] border-b border-slate-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="bg-[#2563eb] text-white font-extrabold text-xs px-2.5 py-1 rounded-md tracking-wide uppercase">
              TOÁN THẦY VY
            </span>
            <div className="hidden xl:flex items-center space-x-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              {navTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                      activeTab === t.id 
                        ? (t.id === 'converter' || t.id === 'students' ? 'bg-amber-500 text-slate-950 shadow' : 'bg-[#2563eb] text-white shadow') 
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* KHU VỰC PHÂN HỆ TRƯỜNG / NHÀ & KHỐI LỚP */}
          <div className="flex items-center gap-2">
            {isTeacher ? (
              <>
                {/* Công tắc chuyển chế độ xem & quản lý Trường / Nhà cho Giáo viên */}
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-700">
                  <button
                    onClick={() => { setSelectedCategory('school'); setActiveExercise(null); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition ${
                      selectedCategory === 'school' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    🏫 Lớp Trường
                  </button>
                  <button
                    onClick={() => { setSelectedCategory('home'); setActiveExercise(null); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition ${
                      selectedCategory === 'home' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    🏠 Lớp Nhà
                  </button>
                </div>

                {/* Chọn Khối 10 - 11 - 12 */}
                <div className="flex bg-slate-800/90 p-0.5 rounded-lg border border-slate-700">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      onClick={() => { setSelectedGrade(g); setActiveExercise(null); }}
                      className={`px-2 py-1 rounded-md text-xs font-extrabold transition ${
                        selectedGrade === g ? 'bg-indigo-500 text-white shadow' : 'text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {g === 0 ? '📂 Khác' : `K${g}`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* Nhãn cố định của Học sinh đang đăng nhập (Không thể tự ý đổi sang hệ khác) */
              <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1 rounded-xl border border-slate-700 text-xs">
                <span className={`px-2 py-0.5 rounded font-extrabold ${
                  currentStudent.category === 'school' ? 'bg-sky-500 text-slate-950' : 'bg-amber-500 text-slate-950'
                }`}>
                  {currentStudent.category === 'school' ? '🏫 Hệ Trường' : '🏠 Hệ Nhà'} • {formatGradeLabel(currentStudent.grade)}
                </span>
                <span className="font-bold text-white">
                  [{currentStudent.student_code}] {currentStudent.full_name} ({currentStudent.class_name})
                </span>
              </div>
            )}
          </div>

          {/* NÚT BẢNG DẠY FULL & ĐĂNG XUẤT */}
          <div className="flex items-center gap-1.5">
            {activeTab === 'lessons' && (
              <button
                onClick={() => setIsExpandedView(!isExpandedView)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-xs font-extrabold transition shadow"
              >
                {isExpandedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isExpandedView ? 'Hiện DS Bài' : 'Bảng dạy (Full)'}</span>
              </button>
            )}

            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold shadow"
              title="Đổi mật khẩu tài khoản đang đăng nhập"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đổi MK</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] w-full mx-auto px-1.5 sm:px-3 py-1.5 flex-1 flex flex-col">
        {/* ==================== TAB 1: BÀI HỌC HTML ==================== */}
        {activeTab === 'lessons' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 flex-1">
            {!isExpandedView && (
              <div className="lg:col-span-3 space-y-2.5 flex flex-col">
                {isTeacher && (
                  <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl space-y-2.5 text-white">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-amber-400 text-xs uppercase tracking-wider flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Thêm Bài Học (Khối {selectedGrade})
                      </h3>
                      <button
                        onClick={() => setActiveTab('converter')}
                        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] px-2 py-1 rounded-md shadow"
                      >
                        <Wand2 className="w-3 h-3" /> Từ PDF/Ảnh
                      </button>
                    </div>

                    {/* Chọn up bên Trường hay bên Nhà */}
                    <CategorySelectorPill />

                    <input
                      type="text"
                      placeholder="Tên bài (VD: Chương V - Vectơ)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                    />
                    <label className="flex items-center justify-center gap-1.5 w-full py-2 px-2 border border-dashed border-blue-400/60 bg-blue-950/40 rounded-lg text-xs font-semibold text-blue-300 cursor-pointer hover:bg-blue-900/40 transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span className="truncate">{htmlContentInput ? '✓ Đã nạp file HTML!' : 'Chọn file .html có sẵn'}</span>
                      <input type="file" accept=".html,.htm" onChange={handleFileUploadHTML} className="hidden" />
                    </label>
                    <button
                      onClick={addLesson}
                      className="w-full bg-[#2563eb] hover:bg-blue-600 text-white font-bold py-1.5 rounded-lg text-xs shadow"
                    >
                      Lưu Bài Học ({uploadCategory === 'school' ? 'Trường' : 'Nhà'})
                    </button>
                  </div>
                )}

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[82vh]">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-bold text-slate-300 text-xs uppercase tracking-wider">
                      {effectiveCategory === 'school' ? '🏫 Bài giảng Trường' : '🏠 Bài giảng Nhà'} • K{effectiveGrade} ({lessons.length})
                    </h2>
                  </div>
                  {lessons.length === 0 && (
                    <p className="text-xs text-slate-500 p-4 text-center">Chưa có bài học nào trong phân hệ này.</p>
                  )}
                  {lessons.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedLesson(item)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer ${
                        selectedLesson?.id === item.id 
                          ? 'bg-[#1e293b] border-blue-500 shadow-md' 
                          : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs sm:text-sm text-white truncate">{item.title}</span>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          item.show_answers ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {item.show_answers ? 'Mở ĐA' : 'Khóa ĐA'}
                        </span>
                      </div>

                      {isTeacher && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700 text-[11px]" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleLessonStatus(item, 'is_active')}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                              item.is_active ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {item.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {item.is_active ? 'Hiện' : 'Ẩn'}
                          </button>

                          <button
                            onClick={() => toggleLessonStatus(item, 'show_answers')}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                              item.show_answers ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            <Key className="w-3 h-3" />
                            {item.show_answers ? 'Đáp án: BẬT' : 'Đáp án: TẮT'}
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRenameItemSyncDrive('lessons', item, '.html')}
                              className="text-sky-400 hover:bg-sky-950 px-1.5 py-0.5 rounded font-bold"
                              title="Đổi tên bài học trên Web & Google Drive"
                            >
                              ✏️ Sửa tên
                            </button>
                            <button
                              onClick={() => handleDeleteItemSyncDrive('lessons', item)}
                              className="text-rose-400 hover:bg-rose-950 p-1 rounded"
                              title="Xóa bài học trên Web & Google Drive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={isExpandedView ? 'lg:col-span-12' : 'lg:col-span-9'}>
              {selectedLesson ? (
                <div className="bg-[#0b1120] rounded-xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-[calc(100vh-58px)]">
                  {(selectedLesson.html_cache || driveContentCache[selectedLesson.drive_file_id]) ? (
                    <iframe
                      key={`${selectedLesson.id}-${selectedLesson.show_answers}`}
                      srcDoc={getRenderedHtml(selectedLesson)}
                      title={selectedLesson.title}
                      className="w-full flex-1 border-0"
                      sandbox="allow-scripts allow-same-origin allow-modals"
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
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                  Chọn một bài giảng bên trái để bắt đầu trình chiếu.
                </div>
              )}
            </div>
          </div>
        )}

       {/* ==================== TAB 2: TÀI LIỆU DRIVE (XEM TRỰC TIẾP TRÊN WEB + TẢI VỀ) ==================== */}
        {activeTab === 'documents' && (
          <div className="space-y-4 bg-slate-50 p-3 sm:p-4 rounded-2xl min-h-[82vh] flex flex-col">
            {previewDoc ? (
              /* KHUNG XEM TRỰC TIẾP TÀI LIỆU PDF / WORD NGAY TRÊN TRANG WEB */
              <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden flex flex-col flex-1 h-[calc(100vh-80px)]">
                <div className="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => setPreviewDoc(null)}
                      className="bg-slate-800 hover:bg-slate-700 text-amber-400 font-extrabold px-3 py-1.5 rounded-xl text-xs border border-slate-700 transition shrink-0"
                    >
                      ← Quay lại DS Tài liệu
                    </button>
                    <h3 className="font-extrabold text-xs sm:text-sm text-white truncate">
                      📄 {previewDoc.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`https://drive.google.com/uc?export=download&id=${previewDoc.drive_file_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl shadow transition"
                    >
                      <Download className="w-3.5 h-3.5" /> Tải về máy
                    </a>

                    <a
                      href={`https://drive.google.com/file/d/${previewDoc.drive_file_id}/view`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 transition"
                      title="Mở rộng sang cửa sổ mới"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Tab mới</span>
                    </a>
                  </div>
                </div>

                {/* Khung nhúng PDF / Word trực tiếp từ Google Drive */}
                <iframe
                  src={`https://drive.google.com/file/d/${previewDoc.drive_file_id}/preview`}
                  title={previewDoc.title}
                  className="w-full flex-1 border-0 bg-slate-900"
                  allow="autoplay"
                />
              </div>
            ) : (
              /* DANH SÁCH TÀI LIỆU & FORM THÊM MỚI */
              <>
                {isTeacher && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-indigo-800 text-sm">
                        + Thêm Tài Liệu PDF / Word ({selectedGrade === 0 ? 'Lớp Khác' : `Khối ${selectedGrade}`})
                      </h3>
                      <div className="w-full sm:w-80">
                        <CategorySelectorPill />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-4">
                        <input
                          type="text"
                          placeholder="Tên tài liệu (VD: Đề cương Giữa kì 1)"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl text-sm font-medium"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="flex items-center justify-center gap-1.5 w-full py-2 px-3 border-2 border-dashed border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-800 rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition">
                          <FileUp className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span className="truncate">
                            {docFileData ? `✓ ${docFileData.fileName}` : '📂 Chọn PDF / Word từ máy'}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,image/*"
                            onChange={handleFileUploadDocument}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="md:col-span-3">
                        <input
                          type="text"
                          placeholder="Hoặc dán Link Drive có sẵn..."
                          value={driveInput}
                          onChange={(e) => setDriveInput(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl text-xs sm:text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <button
                          onClick={addDocument}
                          disabled={isUploadingDoc}
                          className="w-full bg-[#2563eb] hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold py-2 px-3 rounded-xl text-xs sm:text-sm shadow transition"
                        >
                          {isUploadingDoc
                            ? '⏳ Đang tải lên...'
                            : `Đăng (${uploadCategory === 'school' ? '🏫 Trường' : '🏠 Nhà'})`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-slate-700 text-sm uppercase">
                    Danh sách Tài liệu {effectiveCategory === 'school' ? '🏫 LỚP TRƯỜNG' : '🏠 LỚP NHÀ'} — {effectiveGrade === 0 ? '📂 Lớp Khác' : `Khối ${effectiveGrade}`} ({documents.length})
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.length === 0 && (
                    <p className="text-sm text-slate-400 col-span-3 py-8 text-center">Chưa có tài liệu nào trong mục này.</p>
                  )}
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setPreviewDoc(doc)}
                      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 flex flex-col justify-between space-y-3 hover:shadow-md transition cursor-pointer"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-slate-800 text-sm sm:text-base hover:text-blue-600 transition">
                            📄 {doc.title}
                          </h3>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-bold shrink-0 ${
                            doc.category === 'school' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {doc.category === 'school' ? '🏫 Trường' : '🏠 Nhà'} • {doc.grade === 0 ? 'Khác' : `K${doc.grade}`}
                          </span>
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#2563eb] text-white px-3.5 py-2 rounded-xl hover:bg-blue-700 shadow-sm transition"
                          >
                            <Eye className="w-3.5 h-3.5" /> Xem ngay trên Web
                          </button>

                          <a
                            href={`https://drive.google.com/uc?export=download&id=${doc.drive_file_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white px-3.5 py-2 rounded-xl hover:bg-emerald-700 shadow-sm transition"
                          >
                            <Download className="w-3.5 h-3.5" /> Tải về máy
                          </a>
                        </div>
                      </div>

                      {isTeacher && (
                        <div className="flex items-center justify-between pt-3 border-t text-xs" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleDocStatus(doc, 'is_active')}
                            className={`px-2.5 py-1 rounded-lg font-bold ${
                              doc.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {doc.is_active ? '👁️ Đang hiện' : '🙈 Đang ẩn'}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleRenameItemSyncDrive('documents', doc, '')}
                              className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg font-bold"
                              title="Đổi tên đồng bộ trên cả Web và Google Drive"
                            >
                              ✏️ Sửa tên
                            </button>
                            <button
                              onClick={() => handleDeleteItemSyncDrive('documents', doc)}
                              className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                              title="Xóa trên Web và xóa luôn trên Google Drive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 3: BÀI TẬP & ĐỀ KIỂM TRA CHUẨN AZOTA / LATEX EX_TEST ==================== */}
        {activeTab === 'exercises' && (
          <div className="space-y-4 bg-slate-100 p-3 sm:p-4 rounded-2xl min-h-[82vh]">
            {!activeExercise ? (
              <>
                {isTeacher && (
                  <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-indigo-100 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                      <div>
                        <h3 className="font-extrabold text-indigo-800 text-sm sm:text-base flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          + Giao Đề Kiểm Tra Chuẩn Azota / File LaTeX (.tex) ({selectedGrade === 0 ? 'Lớp Khác' : `Khối ${selectedGrade}`})
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Hỗ trợ tải trực tiếp <strong>File .tex (gói ex_test)</strong>, <strong>File Word (.docx Azota)</strong> hoặc <strong>Ảnh chụp đề có Bảng biến thiên / Đồ thị</strong>.
                        </p>
                      </div>
                      <div className="w-full sm:w-80">
                        <CategorySelectorPill />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-5">
                        <input
                          type="text"
                          placeholder="Tên đề kiểm tra (VD: Kiểm tra 15p - Hàm số & Bảng biến thiên)"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          className="w-full px-3.5 py-2.5 border rounded-xl text-sm font-bold text-slate-800"
                        />
                      </div>

                      {/* Nút 1: Chọn file .tex hoặc Word .docx Azota */}
                      <div className="md:col-span-4">
                        <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-2 border-dashed border-indigo-400 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition">
                          <FileUp className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>📄 Chọn File .TEX hoặc Word (.docx)</span>
                          <input
                            type="file"
                            accept=".tex,.docx,.txt"
                            onChange={handleQuizFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Nút 2: Quét từ Ảnh đề thi có Đồ thị / BBT bằng AI */}
                      <div className="md:col-span-3">
                        <label className="flex items-center justify-center gap-1.5 w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-dashed border-emerald-400 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition">
                          <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{isExtractingPdf ? '⏳ AI đang vẽ BBT...' : '🖼️ Quét Ảnh Đề (Có BBT/Đồ thị)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleQuizImageOrPdfUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <textarea
                      rows={7}
                      placeholder={
`Bạn có thể chọn file .tex / .docx ở trên, hoặc dán trực tiếp code LaTeX ex_test / văn bản Azota vào đây:

Ví dụ 1 (Code LaTeX .tex):
\\begin{ex}
Cho hàm số $y=f(x)$ có bảng biến thiên như sau:
\\begin{tikzpicture}
\\tkzTabInit[nocadre=false,lgt=1.2,espcl=2.5]{$x$ /0.6,$y'$ /0.6,$y$ /2}{$ -\\infty $ , $0$ , $2$ , $ +\\infty $}
\\tkzTabLine{ , + , z , - , z , + , }
\\tkzTabVar{-/ $-\\infty$ , +/ $3$ , -/ $-1$ , +/ $+\\infty$}
\\end{tikzpicture}
Hàm số đã cho đồng biến trên khoảng nào dưới đây?
\\choice
{\\True $(-\\infty; 0)$}
{$(0; 2)$}
{$(-1; 3)$}
{$(0; +\\infty)$}
\\loigiai{Dựa vào bảng biến thiên, $y' > 0$ trên $(-\\infty; 0)$ và $(2; +\\infty)$.}
\\end{ex}`}
                      value={rawQuizText}
                      onChange={(e) => setRawQuizText(e.target.value)}
                      className="w-full p-3 border rounded-xl text-xs sm:text-sm font-mono bg-slate-50 focus:bg-white"
                    />

                    {/* Xem trước nhanh số câu đã nhận diện */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs font-bold text-slate-600">
                        🔍 Đã nhận diện tự động:{' '}
                        <strong className="text-indigo-700">
                          {parseAzotaOrTexToQuestions(rawQuizText).length} câu hỏi
                        </strong>{' '}
                        (Hỗ trợ công thức LaTeX, Bảng biến thiên <code>\tkzTab</code>, Đồ thị SVG, Trắc nghiệm, Đúng/Sai, Trả lời ngắn)
                      </span>

                      <button
                        onClick={addExercise}
                        className="bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs sm:text-sm shadow-md transition"
                      >
                        🚀 Giao Đề Kiểm Tra ({uploadCategory === 'school' ? '🏫 Trường' : '🏠 Nhà'})
                      </button>
                    </div>
                  </div>
                )}

                {/* DANH SÁCH ĐỀ KIỂM TRA ĐÃ GIAO */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {exercises.length === 0 && (
                    <p className="text-sm text-slate-400 col-span-3 py-10 text-center">
                      Chưa có đề kiểm tra / bài tập nào trong mục này.
                    </p>
                  )}
                  {exercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 flex flex-col justify-between space-y-3 transition"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                            📝 {ex.title}
                          </h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                            ex.category === 'school' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ex.category === 'school' ? '🏫 Trường' : '🏠 Nhà'} • {ex.grade === 0 ? 'Khác' : `K${ex.grade}`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Giao diện chuẩn Azota • Chấm điểm tự động
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t gap-2">
                        <button
                          onClick={() => openExercise(ex)}
                          className="flex-1 bg-[#2563eb] hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold py-2 px-4 rounded-xl shadow-sm transition"
                        >
                          {isTeacher ? '👁️ Xem Đề & Bảng Điểm' : '✏️ Vào Làm Bài Ngay'}
                        </button>

                        {isTeacher && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRenameItemSyncDrive('exercises', ex, '.json')}
                              className="text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg text-xs font-bold"
                              title="Đổi tên đề kiểm tra"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteItemSyncDrive('exercises', ex)}
                              className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                              title="Xóa đề trên Web & Google Drive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ==================== GIAO DIỆN LÀM BÀI TRỰC TUYẾN CHUẨN AZOTA ==================== */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Cột trái (8 phần): Nội dung Đề thi hiển thị Toán KaTeX, Bảng biến thiên, Đồ thị */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                        ĐỀ KIỂM TRA TRỰC TUYẾN • CHUẨN AZOTA
                      </span>
                      <h2 className="font-extrabold text-lg sm:text-xl text-slate-900 mt-1">
                        {activeExercise.title}
                      </h2>
                    </div>

                    <button
                      onClick={() => setActiveExercise(null)}
                      className="text-xs font-extrabold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition"
                    >
                      ← Quay lại danh sách đề
                    </button>
                  </div>

                  {submittedScore && (
                    <div className="bg-emerald-50 border-2 border-emerald-400 p-5 rounded-2xl text-center space-y-1.5 shadow-sm">
                      <Award className="w-10 h-10 text-emerald-600 mx-auto" />
                      <p className="font-extrabold text-emerald-900 text-xl sm:text-2xl">
                        🎉 Điểm số của em: <span className="text-3xl text-emerald-600">{submittedScore.score}</span> / 10 điểm
                      </p>
                      <p className="text-xs sm:text-sm font-semibold text-emerald-700">
                        Số câu hoàn thành đúng tuyệt đối: {submittedScore.correct}/{submittedScore.total} câu — Điểm đã tự động lưu vào Sổ điểm của Thầy Vy!
                      </p>
                    </div>
                  )}

                  {/* DANH SÁCH CÂU HỎI HIỂN THỊ CÔNG THỨC KATEX + BẢNG BIẾN THIÊN + ĐỒ THỊ */}
                  <div className="space-y-4">
                    {(activeExercise.questions_json || []).map((q, qIdx) => {
                      const qType = q.type || 'mcq';
                      return (
                        <div
                          key={qIdx}
                          id={`azota-q-${qIdx}`}
                          className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 scroll-mt-20"
                        >
                          {/* Tiêu đề Câu & Nội dung đề bài */}
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 bg-[#2563eb] text-white font-extrabold text-xs sm:text-sm px-3 py-1 rounded-lg shadow-sm mt-0.5">
                              Câu {qIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                                {qType === 'tf'
                                  ? 'Phần II • Trắc nghiệm Đúng / Sai'
                                  : qType === 'short'
                                  ? 'Phần III • Trả lời ngắn'
                                  : 'Phần I • Trắc nghiệm 4 phương án'}
                              </span>
                              <MathHtmlBox
                                content={q.question}
                                className="text-slate-900 font-semibold text-base sm:text-lg leading-relaxed overflow-x-auto"
                              />
                            </div>
                          </div>

                          {/* DẠNG 1: TRẮC NGHIỆM 4 LỰA CHỌN A, B, C, D */}
                          {qType === 'mcq' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              {(q.options || []).map((opt, oIdx) => {
                                const letter = ['A', 'B', 'C', 'D'][oIdx];
                                const isSelected = userAnswers[qIdx] === oIdx;
                                const isCorrect = q.correct === oIdx;

                                let btnStyle = 'bg-slate-50/80 hover:bg-blue-50/60 border-slate-200 text-slate-800';
                                let circleStyle = 'bg-white border border-slate-300 text-slate-700';

                                if (submittedScore) {
                                  if (isCorrect) {
                                    btnStyle = 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950 font-bold';
                                    circleStyle = 'bg-emerald-600 text-white';
                                  } else if (isSelected) {
                                    btnStyle = 'bg-rose-50 border-2 border-rose-400 text-rose-900';
                                    circleStyle = 'bg-rose-600 text-white';
                                  }
                                } else if (isSelected) {
                                  btnStyle = 'bg-blue-50 border-2 border-[#2563eb] text-blue-950 font-bold shadow-sm';
                                  circleStyle = 'bg-[#2563eb] text-white';
                                }

                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    disabled={!!submittedScore}
                                    onClick={() => setUserAnswers({ ...userAnswers, [qIdx]: oIdx })}
                                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition ${btnStyle}`}
                                  >
                                    <span className={`w-8 h-8 rounded-full font-extrabold text-sm flex items-center justify-center shrink-0 ${circleStyle}`}>
                                      {letter}
                                    </span>
                                    <MathHtmlBox
                                      content={opt.replace(/^[A-D][\.\)]\s*/, '')}
                                      className="text-sm sm:text-base flex-1 overflow-x-auto"
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* DẠNG 2: ĐÚNG / SAI (a, b, c, d) CHUẨN AZOTA */}
                          {qType === 'tf' && (
                            <div className="border rounded-xl overflow-hidden divide-y">
                              {(q.statements || []).map((st, sIdx) => {
                                const currentObj = userAnswers[qIdx] || {};
                                const userChoice = currentObj[sIdx];
                                return (
                                  <div
                                    key={sIdx}
                                    className="p-3 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                                  >
                                    <div className="flex items-start gap-2 flex-1">
                                      <span className="font-extrabold text-blue-700 text-sm sm:text-base">
                                        {st.label}
                                      </span>
                                      <MathHtmlBox
                                        content={st.text}
                                        className="text-slate-800 text-sm sm:text-base font-medium"
                                      />
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                      <button
                                        type="button"
                                        disabled={!!submittedScore}
                                        onClick={() =>
                                          setUserAnswers({
                                            ...userAnswers,
                                            [qIdx]: { ...currentObj, [sIdx]: true }
                                          })
                                        }
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold border transition ${
                                          userChoice === true
                                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                                        }`}
                                      >
                                        Đúng
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!!submittedScore}
                                        onClick={() =>
                                          setUserAnswers({
                                            ...userAnswers,
                                            [qIdx]: { ...currentObj, [sIdx]: false }
                                          })
                                        }
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold border transition ${
                                          userChoice === false
                                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                                        }`}
                                      >
                                        Sai
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* DẠNG 3: TRẢ LỜI NGẮN (ĐIỀN ĐÁP SỐ) */}
                          {qType === 'short' && (
                            <div className="bg-slate-50 p-3.5 rounded-xl border flex flex-wrap items-center gap-3">
                              <span className="text-xs sm:text-sm font-extrabold text-slate-700">
                                ✍️ Điền đáp số của em:
                              </span>
                              <input
                                type="text"
                                disabled={!!submittedScore}
                                value={userAnswers[qIdx] || ''}
                                onChange={(e) => setUserAnswers({ ...userAnswers, [qIdx]: e.target.value })}
                                placeholder="VD: 12,5 hoặc -3"
                                className="px-4 py-2 border-2 border-indigo-300 focus:border-blue-600 rounded-xl text-sm sm:text-base font-extrabold text-indigo-900 w-48 outline-none bg-white"
                              />
                              {submittedScore && (
                                <span className="text-xs sm:text-sm font-extrabold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">
                                  Đáp án chuẩn: {q.shortAnswer}
                                </span>
                              )}
                            </div>
                          )}

                          {/* HIỂN THỊ LỜI GIẢI CHI TIẾT SAU KHI NỘP BÀI (HOẶC CHO GIÁO VIÊN) */}
                          {(submittedScore || isTeacher) && q.solution && (
                            <div className="bg-emerald-50/80 border-l-4 border-emerald-500 p-3.5 rounded-r-xl text-xs sm:text-sm space-y-1">
                              <div className="font-extrabold text-emerald-800">💡 Lời giải chi tiết:</div>
                              <MathHtmlBox content={q.solution} className="text-slate-700 leading-relaxed" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cột phải (4 phần): PHIẾU TRẢ LỜI TRẮC NGHIỆM CỐ ĐỊNH NHƯ AZOTA + BẢNG ĐIỂM LỚP */}
                <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-16">
                  <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-md border border-indigo-100 space-y-4">
                    <div className="flex items-center justify-between border-b pb-2.5">
                      <h3 className="font-extrabold text-indigo-900 text-sm sm:text-base">
                        📋 Phiếu Làm Bài ({Object.keys(userAnswers).length}/{(activeExercise.questions_json || []).length} câu)
                      </h3>
                      {!isTeacher && currentStudent && (
                        <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">
                          SBD: {currentStudent.student_code}
                        </span>
                      )}
                    </div>

                    {/* Lưới ô số thứ tự câu hỏi chuẩn Azota */}
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-60 overflow-y-auto p-1">
                      {(activeExercise.questions_json || []).map((q, idx) => {
                        const ans = userAnswers[idx];
                        const isDone =
                          q.type === 'tf'
                            ? ans && Object.keys(ans).length > 0
                            : q.type === 'short'
                            ? String(ans || '').trim() !== ''
                            : ans !== undefined;

                        const badgeText =
                          q.type === 'mcq' && ans !== undefined
                            ? ['A', 'B', 'C', 'D'][ans]
                            : '';

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`azota-q-${idx}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            className={`h-10 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center border transition ${
                              isDone
                                ? 'bg-[#2563eb] text-white border-blue-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span>{idx + 1}</span>
                            {badgeText && <span className="text-[9px] text-amber-300 leading-none">{badgeText}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {!submittedScore ? (
                      <button
                        onClick={() => {
                          if (window.confirm('Em chắc chắn muốn nộp bài và chấm điểm?')) {
                            submitExercise();
                          }
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl shadow-lg text-sm transition"
                      >
                        ✓ NỘP BÀI & CHẤM ĐIỂM NGAY
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setUserAnswers({});
                          setSubmittedScore(null);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 rounded-xl shadow text-xs sm:text-sm transition"
                      >
                        🔄 Làm lại đề này
                      </button>
                    )}
                  </div>

                  {/* Bảng kết quả nộp bài của học sinh (Dành cho Giáo viên) */}
                  {isTeacher && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border space-y-3">
                      <h3 className="font-extrabold text-indigo-800 flex items-center gap-1.5 text-xs sm:text-sm border-b pb-2">
                        <Users className="w-4 h-4" /> Học sinh đã nộp ({submissionsList.length})
                      </h3>
                      <div className="overflow-x-auto max-h-72">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-bold">
                            <tr>
                              <th className="p-2 rounded-l-lg">Học sinh</th>
                              <th className="p-2">Lớp</th>
                              <th className="p-2 text-right rounded-r-lg">Điểm</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {submissionsList.map((s) => (
                              <tr key={s.id} className="hover:bg-slate-50">
                                <td className="p-2 font-bold text-slate-800">{s.student_name}</td>
                                <td className="p-2 text-slate-500">{s.student_class}</td>
                                <td className="p-2 text-right font-extrabold text-blue-600">{s.score}đ</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 5: CHUYỂN TỪ ẢNH & PDF ➔ SLIDE HTML ==================== */}
        {activeTab === 'converter' && isTeacher && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
            <div 
              onPaste={handleClipboardPaste}
              className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-2.5 text-white"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h2 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Siêu Chuyển Đổi Ảnh & PDF ➔ Slide Thầy Vy
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Tải file Ảnh • Tải PDF • Hoặc bấm <strong className="text-emerald-400">Ctrl + V dán ảnh trực tiếp</strong>
                  </p>
                </div>
              </div>

              {/* Chọn đăng vào Lớp Trường hay Lớp Nhà */}
              <CategorySelectorPill />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800">
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-amber-300 font-bold block mb-1">
                    🔑 Gemini API Key (Đọc ảnh ra LaTeX & Vẽ lại hình SVG):
                  </label>
                  <input
                    type="password"
                    placeholder="Dán API Key (Lấy tại aistudio.google.com)..."
                    value={geminiApiKey}
                    onChange={(e) => saveGeminiKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-emerald-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">
                    📄 Trang PDF:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 1-5"
                    value={pdfPageRange}
                    onChange={(e) => setPdfPageRange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-bold text-center"
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Tên bài giảng (VD: Chương V - Vectơ)"
                value={converterTitle}
                onChange={(e) => setConverterTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white font-semibold"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600/25 hover:bg-emerald-600/40 border border-dashed border-emerald-400 rounded-xl text-xs font-bold text-emerald-200 cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span>{isExtractingPdf ? '⏳ Đang xử lý...' : '🖼️ Chọn Ảnh Đề Toán (.png/.jpg)'}</span>
                  <input type="file" accept="image/*" multiple onChange={handleImageFilesUpload} className="hidden" />
                </label>

                <label className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600/25 hover:bg-blue-600/40 border border-dashed border-blue-400 rounded-xl text-xs font-bold text-blue-200 cursor-pointer transition">
                  <FileUp className="w-4 h-4" />
                  <span>{isExtractingPdf ? '⏳ Đang xử lý...' : '📄 Chọn File PDF từ máy'}</span>
                  <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                </label>
              </div>

              {aiStatusText && (
                <div className="bg-amber-500/20 border border-amber-400 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold animate-pulse">
                  ⚡ {aiStatusText}
                </div>
              )}

              <textarea
                value={converterRawText}
                onChange={(e) => setConverterRawText(e.target.value)}
                rows={11}
                className="w-full flex-1 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 leading-relaxed"
                placeholder="Bấm Ctrl + V để dán ảnh chụp câu hỏi/hình vẽ, hoặc bấm nút Chọn Ảnh / Chọn PDF ở trên..."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleSaveConvertedToLessons}
                  className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-lg"
                >
                  <CheckCircle2 className="w-4 h-4" /> Lưu vào {uploadCategory === 'school' ? 'Lớp Trường' : 'Lớp Nhà'} (K{selectedGrade})
                </button>
                <button
                  onClick={handleDownloadConvertedHtml}
                  className="flex items-center justify-center gap-1.5 bg-[#2563eb] hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-lg"
                >
                  <Download className="w-4 h-4" /> Tải file .html về máy
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col">
              <div className="bg-[#0b1120] rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-[calc(100vh-64px)]">
                <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                    <Layers className="w-3.5 h-3.5" /> Xem trước Slide trực tiếp ({parsedPreviewSlides.length} Slide)
                  </span>
                </div>
                <iframe
                  srcDoc={buildFullStandaloneHTML(converterTitle || 'BÀI GIẢNG TOÁN', selectedGrade, parsedPreviewSlides)}
                  title="Preview Slide"
                  className="w-full flex-1 border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}

       {/* ==================== TAB 6: QUẢN LÝ LỚP, TÀI KHOẢN & ĐIỂM KIỂM TRA HỌC SINH ==================== */}
        {activeTab === 'students' && isTeacher && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl min-h-[82vh]">
            {/* THANH QUẢN LÝ LỚP HỌC & CÔNG CỤ NHẬP DANH SÁCH HÀNG LOẠT */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mr-1">
                  🏫 Quản lý theo Lớp ({selectedCategory === 'school' ? 'Hệ Trường' : 'Hệ Nhà'} - K{selectedGrade}):
                </span>
                <button
                  onClick={() => setSelectedClassFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                    selectedClassFilter === 'ALL'
                      ? 'bg-[#2563eb] text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tất cả lớp ({studentsList.filter(s => s.category === selectedCategory && s.grade === selectedGrade).length})
                </button>
                {availableClasses.map((clsName) => {
                  const countInClass = studentsList.filter(
                    (s) => s.category === selectedCategory && s.grade === selectedGrade && s.class_name?.trim() === clsName
                  ).length;
                  return (
                    <button
                      key={clsName}
                      onClick={() => {
                        setSelectedClassFilter(clsName);
                        setNewStuClass(clsName);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        selectedClassFilter === clsName
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Lớp {clsName} ({countInClass})
                    </button>
                  );
                })}
              </div>

              {/* Cụm nút Tải File Mẫu / Nhập từ Excel / Dán nhanh */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSampleExcel}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3.5 py-2 rounded-xl text-xs shadow transition"
                >
                  <Download className="w-4 h-4" />
                  <span>📄 Tải File Excel Mẫu (.xlsx)</span>
                </button>

                <label className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs cursor-pointer shadow transition">
                  <FileUp className="w-4 h-4" />
                  <span>📥 Nhập từ File Excel</span>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFileUpload} className="hidden" />
                </label>

                <button
                  onClick={() => setShowBulkModal(true)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>📋 Dán danh sách nhanh</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Cột trái: Cấp lẻ từng tài khoản học sinh */}
              <form onSubmit={handleCreateStudentAccount} className="lg:col-span-3 bg-white p-4 rounded-2xl shadow-sm border space-y-3 h-fit">
                <h3 className="font-extrabold text-indigo-800 text-sm border-b pb-2">
                  + Thêm Học Sinh Mới (K{selectedGrade})
                </h3>

                <CategorySelectorPill />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Số báo danh (Mã HS):</label>
                    <input
                      type="text"
                      required
                      value={newStuCode}
                      onChange={(e) => setNewStuCode(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl text-sm font-extrabold text-indigo-700 bg-indigo-50/50"
                      placeholder="VD: 001"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Mật khẩu:</label>
                    <input
                      type="text"
                      required
                      value={newStuPassword}
                      onChange={(e) => setNewStuPassword(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl text-sm font-mono"
                      placeholder="123456"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Họ và tên học sinh:</label>
                  <input
                    type="text"
                    required
                    value={newStuName}
                    onChange={(e) => setNewStuName(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-xl text-sm"
                    placeholder="VD: Nguyễn Văn A"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Tên Lớp:</label>
                    <input
                      type="text"
                      required
                      value={newStuClass}
                      onChange={(e) => setNewStuClass(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl text-sm font-semibold"
                      placeholder={uploadCategory === 'school' ? 'VD: 10A1' : 'VD: Ca 1'}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">SĐT:</label>
                    <input
                      type="text"
                      value={newStuPhone}
                      onChange={(e) => setNewStuPhone(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl text-sm"
                      placeholder="09xx..."
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold py-2 rounded-xl text-xs sm:text-sm shadow"
                >
                  + Thêm vào Lớp {newStuClass || ''}
                </button>
              </form>

              {/* Cột phải: Bảng danh sách học sinh sắp xếp theo SBD từ nhỏ đến lớn */}
              <div className="lg:col-span-9 bg-white p-4 rounded-2xl shadow-sm border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                      Danh sách Học sinh & Điểm Kiểm Tra — {selectedClassFilter === 'ALL' ? 'Tất cả lớp' : `Lớp ${selectedClassFilter}`} ({selectedCategory === 'school' ? '🏫 Hệ Trường' : '🏠 Hệ Nhà'} • Khối {selectedGrade})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Danh sách tự động sắp xếp theo Số báo danh (Mã HS) từ nhỏ đến lớn. Bấm vào <strong>Số báo danh</strong> hoặc nút <strong>✏️ Sửa</strong> để chỉnh sửa toàn bộ thông tin.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th className="p-2.5 rounded-l-lg">STT</th>
                        <th className="p-2.5">SBD (Mã HS) ↑</th>
                        <th className="p-2.5">Họ và tên</th>
                        <th className="p-2.5">Lớp</th>
                        <th className="p-2.5">Điểm bài kiểm tra (Tab Bài tập & Trên lớp)</th>
                        <th className="p-2.5">Mật khẩu</th>
                        <th className="p-2.5 rounded-r-lg text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {studentsList
                        .filter(
                          (s) =>
                            s.category === selectedCategory &&
                            s.grade === selectedGrade &&
                            (selectedClassFilter === 'ALL' || s.class_name?.trim() === selectedClassFilter)
                        )
                        // SẮP XẾP SỐ BÁO DANH TỪ NHỎ ĐẾN LỚN (000 -> 001 -> 002 -> ...)
                        .sort((a, b) => {
                          const numA = parseInt(a.student_code, 10);
                          const numB = parseInt(b.student_code, 10);
                          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                            return numA - numB;
                          }
                          return String(a.student_code || '').localeCompare(String(b.student_code || ''), undefined, { numeric: true });
                        })
                        .map((stu, idx) => {
                          const stuScores = getStudentTestScores(stu);
                          return (
                            <tr key={stu.id} className="hover:bg-slate-50 align-middle">
                              <td className="p-2.5 text-slate-400 font-bold">{idx + 1}</td>
                              <td className="p-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingStudent({
                                      ...stu,
                                      old_code: stu.student_code,
                                      old_name: stu.full_name
                                    })
                                  }
                                  className="font-extrabold text-indigo-700 hover:text-blue-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200/80 transition"
                                  title="Bấm để sửa Số báo danh & thông tin học sinh này"
                                >
                                  {stu.student_code}
                                </button>
                              </td>
                              <td className="p-2.5 font-bold text-slate-800">
                                <div>{stu.full_name}</div>
                                {stu.phone && <div className="text-[10px] text-slate-400 font-normal">📞 {stu.phone}</div>}
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                  stu.category === 'school' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {stu.class_name}
                                </span>
                              </td>
                              <td className="p-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {stuScores.length === 0 ? (
                                    <span className="text-[11px] text-slate-400 italic">Chưa có cột điểm</span>
                                  ) : (
                                    stuScores.map((sc) => {
                                      const testTitle = sc.exercises?.title || (sc.student_class?.includes('|') ? sc.student_class.split('|')[0].trim() : 'Bài KT');
                                      return (
                                        <span
                                          key={sc.id}
                                          title={`${testTitle}: ${sc.score} điểm`}
                                          className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg text-[11px]"
                                        >
                                          <span className="text-slate-600 truncate max-w-[110px]">{testTitle}:</span>
                                          <strong className="text-indigo-700 font-extrabold">{sc.score}đ</strong>
                                        </span>
                                      );
                                    })
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleQuickAddScore(stu)}
                                    className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-md transition"
                                    title="Nhập thêm điểm kiểm tra cho học sinh này"
                                  >
                                    + Điểm
                                  </button>
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{stu.password}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleResetStudentPassword(stu)}
                                    className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded transition"
                                    title="Đặt lại mật khẩu nhanh"
                                  >
                                    🔄 Reset
                                  </button>
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingStudent({
                                        ...stu,
                                        old_code: stu.student_code,
                                        old_name: stu.full_name
                                      })
                                    }
                                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-2.5 py-1 rounded-lg text-xs transition"
                                    title="Chỉnh sửa toàn bộ thông tin học sinh"
                                  >
                                    ✏️ Sửa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (window.confirm(`Xóa tài khoản học sinh [${stu.student_code}] ${stu.full_name}?`)) {
                                        await supabase.from('student_accounts').delete().eq('id', stu.id);
                                        fetchData();
                                      }
                                    }}
                                    className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                                    title="Xóa học sinh"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* MODAL CHỈNH SỬA TOÀN BỘ THÔNG TIN & SỐ BÁO DANH HỌC SINH */}
            {editingStudent && (
              <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <form
                  onSubmit={handleUpdateStudentAccount}
                  className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl border border-slate-200"
                >
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <h3 className="font-extrabold text-base text-indigo-800">
                        ✏️ Chỉnh Sửa Thông Tin Học Sinh
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Giáo viên có thể đổi tùy ý Số báo danh (Mã HS), Họ tên, Lớp, SĐT, Mật khẩu và Phân hệ.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingStudent(null)}
                      className="text-slate-400 hover:text-slate-700 font-bold text-lg px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Số báo danh (Mã HS):
                      </label>
                      <input
                        type="text"
                        required
                        value={editingStudent.student_code}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, student_code: e.target.value })
                        }
                        className="w-full px-3 py-2 border-2 border-indigo-300 rounded-xl text-sm font-extrabold text-indigo-700 bg-indigo-50/40 focus:border-indigo-600 outline-none"
                        placeholder="VD: 001 hoặc 0001"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Mật khẩu đăng nhập:
                      </label>
                      <input
                        type="text"
                        required
                        value={editingStudent.password}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, password: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-xl text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Họ và tên học sinh:
                    </label>
                    <input
                      type="text"
                      required
                      value={editingStudent.full_name}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, full_name: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-xl text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Tên Lớp:
                      </label>
                      <input
                        type="text"
                        required
                        value={editingStudent.class_name}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, class_name: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-xl text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Số điện thoại:
                      </label>
                      <input
                        type="text"
                        value={editingStudent.phone || ''}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, phone: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-xl text-sm"
                        placeholder="09xx..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Phân hệ (Trường / Nhà):
                      </label>
                      <select
                        value={editingStudent.category}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, category: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-slate-50"
                      >
                        <option value="school">🏫 Lớp Trường</option>
                        <option value="home">🏠 Lớp Nhà</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Khối lớp:
                      </label>
                      <select
                        value={editingStudent.grade}
                        onChange={(e) =>
                          setEditingStudent({ ...editingStudent, grade: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-slate-50"
                      >
                        <option value={10}>Khối 10</option>
                        <option value={11}>Khối 11</option>
                        <option value={12}>Khối 12</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t">
                    <button
                      type="button"
                      onClick={() => setEditingStudent(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-[#2563eb] hover:bg-blue-700 text-white shadow-md"
                    >
                      💾 Lưu Thay Đổi
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* MODAL DÁN NHANH / KIỂM TRA DANH SÁCH TRƯỚC KHI NHẬP HÀNG LOẠT */}
            {showBulkModal && (
              <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl p-5 w-full max-w-2xl space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b pb-2.5">
                    <div>
                      <h3 className="font-extrabold text-base text-indigo-800">
                        📥 Nhập Danh Sách Học Sinh Hàng Loạt (Khối {selectedGrade})
                      </h3>
                      <p className="text-xs text-slate-500">
                        Hệ thống tự động cấp Số báo danh theo thứ tự tăng dần. Bạn có thể sửa lại bất kỳ lúc nào.
                      </p>
                    </div>
                    <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border">
                    <CategorySelectorPill />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 shrink-0">Lớp mặc định:</span>
                      <input
                        type="text"
                        placeholder={uploadCategory === 'school' ? 'VD: 10A1' : 'VD: Ca 1'}
                        value={newStuClass}
                        onChange={(e) => setNewStuClass(e.target.value)}
                        className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                    💡 <strong>Cú pháp mỗi dòng 1 học sinh:</strong> <code>Số báo danh | Họ và tên | Lớp | SĐT | Mật khẩu</code> (Hoặc chỉ cần gõ <code>Họ và tên</code> trên mỗi dòng).
                  </div>

                  <textarea
                    rows={10}
                    value={bulkImportText}
                    onChange={(e) => setBulkImportText(e.target.value)}
                    placeholder={`001 | Nguyễn Văn An | 12a | 0912345678 | 123456\n002 | Trần Thị Bình | 12a`}
                    className="w-full p-3 border rounded-xl text-xs sm:text-sm font-mono"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmBulkImport}
                      className="px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                    >
                      ✓ Xác nhận Tạo Hàng Loạt
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: THÔNG TIN GIÁO VIÊN ==================== */}
        {activeTab === 'info' && (
          <div className="max-w-3xl w-full mx-auto bg-white p-6 rounded-2xl shadow-sm border space-y-4 my-4">
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
                  className="bg-[#2563eb] text-white font-semibold px-5 py-2 rounded-xl text-sm"
                >
                  Lưu Thông Tin
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* THANH NAVIGATION DƯỚI ĐÁY MÀN HÌNH DÀNH CHO ĐIỆN THOẠI / TABLET */}
      {/* MODAL ĐỔI MẬT KHẨU DÀNH CHO HỌC SINH & GIÁO VIÊN */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleChangePassword} className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-500" />
                <span>{isTeacher ? 'Đổi Mật Khẩu Giáo Viên' : `Đổi Mật Khẩu Học Sinh (${currentStudent?.student_code})`}</span>
              </h3>
              <button type="button" onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            {!isTeacher && (
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Mật khẩu hiện tại:</label>
                <input
                  type="password"
                  required
                  value={oldPassInput}
                  onChange={(e) => setOldPassInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="Nhập mật khẩu đang dùng..."
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Mật khẩu mới:</label>
              <input
                type="password"
                required
                value={newPassInput}
                onChange={(e) => setNewPassInput(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm"
                placeholder="Nhập mật khẩu mới..."
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Xác nhận mật khẩu mới:</label>
              <input
                type="password"
                required
                value={confirmPassInput}
                onChange={(e) => setConfirmPassInput(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm"
                placeholder="Nhập lại mật khẩu mới..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-[#2563eb] hover:bg-blue-700 text-white shadow"
              >
                Lưu Mật Khẩu Mới
              </button>
            </div>
          </form>
        </div>
      )}
      
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-slate-800 flex justify-around py-2 z-30 shadow-lg">
        {navTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center space-y-1 text-[10px] font-medium ${
                activeTab === t.id ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label.replace(/^\d+\.\s*|✨\s*\d+\.\s*|👥\s*\d+\.\s*/g, '')}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
