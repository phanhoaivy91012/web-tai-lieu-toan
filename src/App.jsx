import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  BookOpen, FileText, CheckSquare, Info, Lock, LogOut, 
  Eye, EyeOff, Key, Plus, Trash2, Upload, Award, Users, 
  ExternalLink, Maximize2, Minimize2, Sparkles, Wand2, 
  Download, FileUp, CheckCircle2, Layers
} from 'lucide-react';

const GRADES = [10, 11, 12];

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
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 14px;
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
  .tb-quick-btn span.lbl {
    font-size: 8px;
    line-height: 1;
    margin-top: 2px;
    opacity: 0.9;
  }
</style>
<script>
  window.addEventListener('load', function() {
    const canvas = document.getElementById('drawing-canvas');
    const scrollBox = document.getElementById('slide-content-scroll');
    if (!canvas || !scrollBox) return;

    window.palmRejectionOnlyPen = false;

    if (!document.getElementById('tablet-quick-helper')) {
      const helper = document.createElement('div');
      helper.id = 'tablet-quick-helper';
      helper.innerHTML = \`
        <button id="qbtn-pen" class="tb-quick-btn" title="Bút viết bảng">
          <span>✏️</span><span class="lbl">Bút</span>
        </button>
        <button id="qbtn-eraser" class="tb-quick-btn" title="Tẩy nét">
          <span>🧹</span><span class="lbl">Tẩy</span>
        </button>
        <button id="qbtn-cursor" class="tb-quick-btn active-mode" title="Chế độ Cuộn trang & Bấm nút">
          <span>👆</span><span class="lbl">Cuộn</span>
        </button>
        <button id="qbtn-palm" class="tb-quick-btn" title="Chống tì tay (Chỉ nhận Bút cảm ứng)">
          <span>✋</span><span class="lbl">Chỉ Bút</span>
        </button>
        <div style="height:1px;background:#334155;margin:2px 0;"></div>
        <button id="qbtn-up" class="tb-quick-btn" title="Cuộn lên">
          <span>▲</span><span class="lbl">Lên</span>
        </button>
        <button id="qbtn-down" class="tb-quick-btn" title="Cuộn xuống viết tiếp">
          <span>▼</span><span class="lbl">Xuống</span>
        </button>
        <button id="qbtn-undo" class="tb-quick-btn" title="Hoàn tác">
          <span>↩️</span><span class="lbl">Lùi</span>
        </button>
      \`;
      document.body.appendChild(helper);

      const syncQuickHighlight = (tool) => {
        ['pen', 'eraser', 'cursor'].forEach(t => {
          const btn = document.getElementById('qbtn-' + t);
          if (btn) btn.classList.toggle('active-mode', t === tool);
        });
      };

      if (typeof window.setDrawTool === 'function') {
        const origSetDrawTool = window.setDrawTool;
        window.setDrawTool = function(t) {
          origSetDrawTool(t);
          syncQuickHighlight(t);
        };
      }

      document.getElementById('qbtn-pen').onclick = () => {
        const bar = document.getElementById('drawing-toolbar');
        if (bar && bar.classList.contains('hidden')) bar.classList.replace('hidden', 'flex');
        if (typeof window.setDrawTool === 'function') window.setDrawTool('pen');
      };
      document.getElementById('qbtn-eraser').onclick = () => {
        if (typeof window.setDrawTool === 'function') window.setDrawTool('eraser');
      };
      document.getElementById('qbtn-cursor').onclick = () => {
        if (typeof window.setDrawTool === 'function') window.setDrawTool('cursor');
      };
      document.getElementById('qbtn-palm').onclick = function() {
        window.palmRejectionOnlyPen = !window.palmRejectionOnlyPen;
        this.classList.toggle('active-mode', window.palmRejectionOnlyPen);
      };
      document.getElementById('qbtn-up').onclick = () => scrollBox.scrollBy({ top: -220, behavior: 'smooth' });
      document.getElementById('qbtn-down').onclick = () => scrollBox.scrollBy({ top: 220, behavior: 'smooth' });
      document.getElementById('qbtn-undo').onclick = () => {
        if (typeof window.undoLastStroke === 'function') window.undoLastStroke();
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
        const palmBtn = document.getElementById('qbtn-palm');
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
      if (stuData && stuData.length > 0) {
        const maxNum = stuData.reduce((max, s) => {
          const n = parseInt(s.student_code, 10);
          return !isNaN(n) && n > max ? n : max;
        }, 0);
        const nextNum = maxNum >= 999 ? 0 : maxNum + 1;
        setNewStuCode(String(nextNum).padStart(3, '0'));
      } else {
        setNewStuCode('001');
      }
    }   
  }

  const extractDriveId = (input) => {
    if (!input) return '';
    const match = input.match(/[-\w]{25,}/);
    return match ? match[0] : input.trim();
  };

  // ================= XỬ LÝ ĐĂNG NHẬP HỌC SINH & GIÁO VIÊN =================
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
      // Học sinh đăng nhập bằng Mã HS 3 số (VD: 001 hoặc nhập 1 tự hiểu là 001)
      const rawCode = loginId.trim();
      const paddedCode = /^\d+$/.test(rawCode) && rawCode.length < 3 
        ? rawCode.padStart(3, '0') 
        : rawCode;

      const { data: stu, error } = await supabase
        .from('student_accounts')
        .select('*')
        .or(`student_code.eq.${rawCode},student_code.eq.${paddedCode}`)
        .eq('password', password.trim())
        .maybeSingle();

      if (error || !stu) {
        return alert('Sai Mã học sinh hoặc Mật khẩu! Em vui lòng kiểm tra lại.');
      }
      setCurrentStudent(stu);
      localStorage.setItem('vy_student_session', JSON.stringify(stu));
      setLoginId('');
      setPassword('');
    }
  };

  const handleLogout = async () => {
    if (isTeacher) {
      await supabase.auth.signOut();
    }
    if (currentStudent) {
      setCurrentStudent(null);
      localStorage.removeItem('vy_student_session');
    }
    setActiveTab('lessons');
  };

  // ================= QUẢN LÝ TÀI KHOẢN HỌC SINH (TAB 6 CỦA GIÁO VIÊN) =================

  // Lấy danh sách các Lớp hiện có thuộc Phân hệ (Trường/Nhà) và Khối đang chọn
  const availableClasses = Array.from(
    new Set(
      studentsList
        .filter((s) => s.category === selectedCategory && s.grade === selectedGrade)
        .map((s) => s.class_name?.trim())
        .filter(Boolean)
    )
  ).sort();

  // Lấy danh sách điểm các bài kiểm tra của 1 học sinh (Khớp theo Mã HS 3 số hoặc Họ tên)
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

  // Giáo viên nhập bổ sung điểm kiểm tra trực tiếp cho học sinh tại Tab 6
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

  // Xử lý đọc trực tiếp file Excel (.xlsx, .xls, .csv) thành danh sách học sinh
  const handleExcelFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) return alert('Thư viện đọc Excel đang tải, vui lòng thử lại sau 2 giây!');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      // Tự động lọc các dòng có dữ liệu (Họ tên, Lớp, SĐT, Mật khẩu)
      const defaultCls = selectedClassFilter !== 'ALL' ? selectedClassFilter : (newStuClass || `10A1`);
      const formattedLines = [];

      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const firstCell = String(row[0] || '').trim();
        // Bỏ qua dòng tiêu đề đầu bảng
        if (idx === 0 && /stt|họ\s*và\s*tên|họ\s*tên|mã\s*hs/i.test(firstCell)) return;

        // Nếu cột 1 là STT (số) thì lấy cột 2 làm Họ tên
        let fullName = '';
        let className = defaultCls;
        let phone = '';
        let pass = '123456';

        if (/^\d+$/.test(firstCell) && row.length >= 2) {
          fullName = String(row[1] || '').trim();
          className = String(row[2] || defaultCls).trim();
          phone = String(row[3] || '').trim();
          pass = String(row[4] || '123456').trim();
        } else {
          fullName = firstCell;
          className = String(row[1] || defaultCls).trim();
          phone = String(row[2] || '').trim();
          pass = String(row[3] || '123456').trim();
        }

        if (fullName) {
          formattedLines.push(`${fullName} | ${className} | ${phone} | ${pass}`);
        }
      });

      setBulkImportText(formattedLines.join('\n'));
      setShowBulkModal(true);
    } catch (err) {
      alert('Không thể đọc file Excel: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Lưu hàng loạt danh sách học sinh vào Supabase (Tự động cấp mã 3 số liên tiếp)
  const handleConfirmBulkImport = async () => {
    const lines = bulkImportText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return alert('Danh sách trống!');

    // Tìm mã 3 số lớn nhất hiện tại để đánh số tiếp theo
    let currentMax = studentsList.reduce((max, s) => {
      const n = parseInt(s.student_code, 10);
      return !isNaN(n) && n > max ? n : max;
    }, 0);

    const defaultCls = selectedClassFilter !== 'ALL' 
      ? selectedClassFilter 
      : (newStuClass.trim() || (uploadCategory === 'school' ? `${selectedGrade}A1` : `Toán ${selectedGrade} - Ca 1`));

    const newRecords = lines.map((line) => {
      // Hỗ trợ ngăn cách bằng dấu | hoặc phím Tab (khi copy trực tiếp từ Excel dán vào) hoặc dấu phẩy
      const parts = line.includes('|') 
        ? line.split('|').map((p) => p.trim())
        : line.includes('\t')
        ? line.split('\t').map((p) => p.trim())
        : line.split(',').map((p) => p.trim());

      currentMax = currentMax >= 999 ? 0 : currentMax + 1;
      const code3Digits = String(currentMax).padStart(3, '0');

      return {
        student_code: code3Digits,
        full_name: parts[0] || 'Học sinh mới',
        class_name: parts[1] || defaultCls,
        phone: parts[2] || '',
        password: parts[3] || '123456',
        grade: selectedGrade,
        category: uploadCategory
      };
    });

    const { error } = await supabase.from('student_accounts').insert(newRecords);
    if (error) {
      alert('Lỗi khi nhập hàng loạt: ' + error.message);
    } else {
      alert(`Đã tạo thành công ${newRecords.length} tài khoản học sinh vào [${uploadCategory === 'school' ? 'Lớp Trường' : 'Lớp Nhà'} - Khối ${selectedGrade}]!`);
      setBulkImportText('');
      setShowBulkModal(false);
      setSelectedCategory(uploadCategory);
      fetchData();
    }
  };
  
  const handleCreateStudentAccount = async (e) => {
    e.preventDefault();
    if (!newStuName.trim() || !newStuClass.trim() || !newStuCode.trim()) {
      return alert('Vui lòng nhập đầy đủ Mã HS, Họ tên và Lớp!');
    }
    const formattedCode = /^\d+$/.test(newStuCode.trim()) 
      ? newStuCode.trim().padStart(3, '0').slice(-3) 
      : newStuCode.trim();

    const { error } = await supabase.from('student_accounts').insert([{
      student_code: formattedCode,
      password: newStuPassword.trim() || '123456',
      full_name: newStuName.trim(),
      grade: selectedGrade,
      class_name: newStuClass.trim(),
      category: uploadCategory, // 'school' hoặc 'home'
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
    const fullHtml = buildFullStandaloneHTML(converterTitle, selectedGrade, parsedPreviewSlides);
    const { error } = await supabase.from('lessons').insert([{
      title: converterTitle.trim(),
      grade: selectedGrade,
      category: uploadCategory,
      drive_file_id: '',
      html_cache: fullHtml,
      is_active: true,
      show_answers: false
    }]);

    if (error) {
      alert('Lỗi lưu bài giảng: ' + error.message);
    } else {
      setSelectedCategory(uploadCategory);
      alert(`Đã lưu ${parsedPreviewSlides.length} Slide vào [${uploadCategory === 'school' ? 'LỚP TRƯỜNG' : 'LỚP NHÀ'} - Khối ${selectedGrade}]!`);
      await fetchData();
      setActiveTab('lessons');
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
      return alert('Vui lòng chọn file .html hoặc dùng Tab 5 (Chuyển PDF/Ảnh ➔ Slide)!');
    }
    const fileId = extractDriveId(driveInput);
    const { error } = await supabase.from('lessons').insert([{
      title: newTitle,
      grade: selectedGrade,
      category: uploadCategory,
      drive_file_id: fileId,
      html_cache: htmlContentInput,
      is_active: true,
      show_answers: false
    }]);
    if (!error) {
      setNewTitle('');
      setDriveInput('');
      setHtmlContentInput('');
      setSelectedCategory(uploadCategory);
      fetchData();
    } else {
      alert('Lỗi: ' + error.message);
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
    if (!lesson?.html_cache) return '';
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
      <script>
        window.addEventListener('DOMContentLoaded', function() {
          window.toggleSolution = function() { return false; };
          if (typeof renderSlide === 'function') {
            const originalRenderSlide = renderSlide;
            window.renderSlide = function() {
              if (typeof revealedSlides !== 'undefined' && Array.isArray(revealedSlides)) {
                revealedSlides.fill(false);
              }
              originalRenderSlide();
            };
            window.renderSlide();
          }
        });
      </script>
    `;
    const fullInjectedCode = TABLET_PRO_DRAWING_INJECTION + lockAnswerCode;
    if (lesson.html_cache.includes('</body>')) {
      return lesson.html_cache.replace('</body>', `${fullInjectedCode}</body>`);
    }
    return lesson.html_cache + fullInjectedCode;
  };

  const addDocument = async () => {
    if (!newTitle || !driveInput) return alert('Nhập tên tài liệu và Link Google Drive!');
    const fileId = extractDriveId(driveInput);
    const { error } = await supabase.from('documents').insert([{
      title: newTitle,
      grade: selectedGrade,
      category: uploadCategory,
      drive_file_id: fileId,
      is_active: true,
      show_answers: false
    }]);
    if (!error) {
      setNewTitle('');
      setDriveInput('');
      setSelectedCategory(uploadCategory);
      fetchData();
    }
  };

  const toggleDocStatus = async (doc, field) => {
    await supabase.from('documents').update({ [field]: !doc[field] }).eq('id', doc.id);
    fetchData();
  };

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
      category: uploadCategory,
      questions_json: parsedQuestions,
      is_active: true
    }]);
    if (!error) {
      setNewTitle('');
      setRawQuizText('');
      setSelectedCategory(uploadCategory);
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
    const sName = isTeacher ? 'Giáo viên thử bài' : `${currentStudent.student_code} - ${currentStudent.full_name}`;
    const sClass = isTeacher ? 'GV' : `${currentStudent.class_name} (${currentStudent.category === 'school' ? 'Trường' : 'Nhà'})`;

    const questions = activeExercise.questions_json || [];
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correct) correctCount++;
    });
    const finalScore = questions.length > 0 ? ((correctCount / questions.length) * 10).toFixed(2) : 0;

    await supabase.from('submissions').insert([{
      exercise_id: activeExercise.id,
      student_name: sName,
      student_class: sClass,
      score: finalScore,
      total_correct: correctCount,
      total_questions: questions.length
    }]);

    setSubmittedScore({ score: finalScore, correct: correctCount, total: questions.length });
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
                      K{g}
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
                  {currentStudent.category === 'school' ? '🏫 Hệ Trường' : '🏠 Hệ Nhà'} • Khối {currentStudent.grade}
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

                          <button
                            onClick={async () => {
                              if (window.confirm('Xóa bài học này?')) {
                                await supabase.from('lessons').delete().eq('id', item.id);
                                fetchData();
                              }
                            }}
                            className="text-rose-400 hover:bg-rose-950 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                  {selectedLesson.html_cache ? (
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

        {/* ==================== TAB 2: TÀI LIỆU DRIVE (PHÂN BIỆT TRƯỜNG & NHÀ) ==================== */}
        {activeTab === 'documents' && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl min-h-[80vh]">
            {isTeacher && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-indigo-800 text-sm">
                    + Thêm Tài Liệu PDF / Word (Khối {selectedGrade})
                  </h3>
                  <div className="w-full sm:w-80">
                    <CategorySelectorPill />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                    className="bg-[#2563eb] hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl text-sm shadow"
                  >
                    Đăng Tài Liệu ({uploadCategory === 'school' ? '🏫 Trường' : '🏠 Nhà'})
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-700 text-sm uppercase">
                Danh sách Tài liệu {effectiveCategory === 'school' ? '🏫 LỚP TRƯỜNG' : '🏠 LỚP NHÀ'} — Khối {effectiveGrade}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.length === 0 && (
                <p className="text-sm text-slate-400 col-span-3 py-8 text-center">Chưa có tài liệu nào trong mục này.</p>
              )}
              {documents.map((doc) => (
                <div key={doc.id} className="bg-white p-4 rounded-2xl shadow-sm border flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-800">{doc.title}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded font-bold shrink-0 ${
                        doc.category === 'school' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {doc.category === 'school' ? '🏫 Trường' : '🏠 Nhà'} • K{doc.grade}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#2563eb] text-white px-3 py-2 rounded-xl hover:bg-blue-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Mở xem Tài liệu
                      </a>
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

        {/* ==================== TAB 3: BÀI TẬP & KẾT QUẢ (TỰ GHI NHẬN TÊN HỌC SINH ĐĂNG NHẬP) ==================== */}
        {activeTab === 'exercises' && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl min-h-[80vh]">
            {!activeExercise ? (
              <>
                {isTeacher && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-indigo-700 text-sm">+ Giao Bài Tập Rèn Luyện Mới (Khối {selectedGrade})</h3>
                      <div className="w-full sm:w-80">
                        <CategorySelectorPill />
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Tên bài tập (VD: Ôn tập Vectơ - Đề 1)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                    />
                    <textarea
                      rows={5}
                      placeholder={`Nhập câu hỏi nhanh (mỗi câu cách nhau 1 dòng trống, thêm dấu * trước đáp án đúng):\nCâu 1: Cho 3 điểm A, B, C. Tổng AB + BC bằng:\nA. CA\n*B. AC\nC. BA\nD. 0`}
                      value={rawQuizText}
                      onChange={(e) => setRawQuizText(e.target.value)}
                      className="w-full p-3 border rounded-xl text-sm font-mono"
                    />
                    <button
                      onClick={addExercise}
                      className="bg-[#2563eb] hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-xl text-sm"
                    >
                      Đăng Bài Tập ({uploadCategory === 'school' ? '🏫 Trường' : '🏠 Nhà'})
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {exercises.map((ex) => (
                    <div key={ex.id} className="bg-white p-4 rounded-2xl shadow-sm border flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-800">{ex.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Số câu hỏi: {(ex.questions_json || []).length} câu • {ex.category === 'school' ? '🏫 Lớp Trường' : '🏠 Lớp Nhà'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openExercise(ex)}
                          className="bg-[#2563eb] hover:bg-blue-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-xl shadow-sm"
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
                        Số câu đúng: {submittedScore.correct}/{submittedScore.total} câu — Đã lưu kết quả vào hồ sơ của Thầy!
                      </p>
                    </div>
                  )}

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
                                  ? 'bg-[#2563eb] text-white border-blue-600 font-semibold'
                                  : 'bg-white hover:bg-blue-50'
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
                    Nộp Bài & Ghi Nhận Điểm
                  </button>
                </div>

                {isTeacher && (
                  <div className="lg:col-span-5 bg-white p-4 rounded-2xl shadow-sm border space-y-3 h-fit">
                    <h3 className="font-bold text-indigo-700 flex items-center gap-2 text-sm border-b pb-2">
                      <Users className="w-4 h-4" /> Danh sách Học sinh đã nộp ({submissionsList.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs md:text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2 rounded-l-lg">Học sinh</th>
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
                              <td className="p-2 text-right font-bold text-blue-600">{s.score}</td>
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

              {/* Cụm nút Nhập danh sách từ Excel / Dán nhanh */}
              <div className="flex items-center gap-2">
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
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Mã HS (3 số):</label>
                    <input
                      type="text"
                      required
                      value={newStuCode}
                      onChange={(e) => setNewStuCode(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl text-sm font-extrabold text-indigo-700 bg-indigo-50/50"
                      placeholder="001"
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

              {/* Cột phải: Bảng danh sách học sinh theo Lớp + Cột Điểm Bài Kiểm Tra */}
              <div className="lg:col-span-9 bg-white p-4 rounded-2xl shadow-sm border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                      Danh sách Học sinh & Điểm Kiểm Tra — {selectedClassFilter === 'ALL' ? 'Tất cả lớp' : `Lớp ${selectedClassFilter}`} ({selectedCategory === 'school' ? '🏫 Hệ Trường' : '🏠 Hệ Nhà'} • Khối {selectedGrade})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Điểm học sinh làm ở Tab Bài tập sẽ tự động hiển thị tại cột Điểm bài kiểm tra (hoặc bấm "+ Điểm" để nhập điểm trên lớp).
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th className="p-2.5 rounded-l-lg">STT</th>
                        <th className="p-2.5">Mã HS</th>
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
                        .map((stu, idx) => {
                          const stuScores = getStudentTestScores(stu);
                          return (
                            <tr key={stu.id} className="hover:bg-slate-50 align-middle">
                              <td className="p-2.5 text-slate-400 font-bold">{idx + 1}</td>
                              <td className="p-2.5 font-extrabold text-indigo-700">{stu.student_code}</td>
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
                              <td className="p-2.5 font-mono text-xs text-slate-500">{stu.password}</td>
                              <td className="p-2.5 text-right">
                                <button
                                  onClick={async () => {
                                    if (window.confirm(`Xóa tài khoản học sinh [${stu.student_code}] ${stu.full_name}?`)) {
                                      await supabase.from('student_accounts').delete().eq('id', stu.id);
                                      fetchData();
                                    }
                                  }}
                                  className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

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
                        Hệ thống tự động cấp Mã học sinh 3 số liên tiếp (001 ➔ 999). Bạn có thể copy trực tiếp các cột từ Excel dán vào đây.
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
                    💡 <strong>Cú pháp mỗi dòng 1 học sinh:</strong> <code>Họ và tên | Lớp | SĐT | Mật khẩu</code> (Nếu chỉ gõ mỗi <strong>Họ và tên</strong> trên 1 dòng, hệ thống sẽ tự lấy Lớp mặc định ở trên và mật khẩu mặc định là <code>123456</code>).
                  </div>

                  <textarea
                    rows={10}
                    value={bulkImportText}
                    onChange={(e) => setBulkImportText(e.target.value)}
                    placeholder={`Nguyễn Văn An | 10A1 | 0912345678 | 123456\nTrần Thị Bình | 10A1\nLê Hoàng Cường`}
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
