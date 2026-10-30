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
  const [isTeacher, setIsTeacher] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isExpandedView, setIsExpandedView] = useState(false);

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [driveInput, setDriveInput] = useState('');
  const [htmlContentInput, setHtmlContentInput] = useState('');

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
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [userAnswers, setUserAnswers] = useState({});
  const [submittedScore, setSubmittedScore] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [rawQuizText, setRawQuizText] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsTeacher(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsTeacher(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedGrade, isTeacher]);

  useEffect(() => {
    const slides = parseSmartMathContentToSlides(converterTitle || 'CHUYÊN ĐỀ TOÁN', converterRawText);
    setParsedPreviewSlides(slides);
  }, [converterTitle, converterRawText]);

  async function fetchData() {
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

    const { data: docData } = await supabase
      .from('documents')
      .select('*')
      .eq('grade', selectedGrade)
      .order('created_at', { ascending: false });
    setDocuments(isTeacher ? (docData || []) : (docData || []).filter(d => d.is_active));

    const { data: exData } = await supabase
      .from('exercises')
      .select('*')
      .eq('grade', selectedGrade)
      .order('created_at', { ascending: false });
    setExercises(isTeacher ? (exData || []) : (exData || []).filter(e => e.is_active));

    const { data: infoData } = await supabase
      .from('teacher_info')
      .select('*')
      .eq('id', 1)
      .single();
    if (infoData) setTeacherInfo(infoData);
  }

  const extractDriveId = (input) => {
    if (!input) return '';
    const match = input.match(/[-\w]{25,}/);
    return match ? match[0] : input.trim();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Sai email hoặc mật khẩu giáo viên!');
    else setShowLoginModal(false);
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

  // 1. CHỨC NĂNG MỚI: TẢI TRỰC TIẾP 1 HOẶC NHIỀU FILE ẢNH (.PNG, .JPG) CHUYỂN SANG SLIDE HTML
  const handleImageFilesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!converterTitle) {
      setConverterTitle(files[0].name.replace(/\.[a-zA-Z0-9]+$/, ''));
    }

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
        // Nếu chưa nhập API Key: tạo câu hỏi kèm ảnh minh họa trực tiếp
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

  // 2. XỬ LÝ DÁN ẢNH TỪ CLIPBOARD (Ctrl + V)
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

  // 3. XỬ LÝ TẢI FILE PDF
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
      drive_file_id: '',
      html_cache: fullHtml,
      is_active: true,
      show_answers: false
    }]);

    if (error) {
      alert('Lỗi lưu bài giảng: ' + error.message);
    } else {
      alert(`Đã tạo thành công ${parsedPreviewSlides.length} Slide vào Khối ${selectedGrade}!`);
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

  // ================= XỬ LÝ TAB 1, 2, 3 =================
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
      drive_file_id: fileId,
      html_cache: htmlContentInput,
      is_active: true,
      show_answers: false
    }]);
    if (!error) {
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

  const navTabs = [
    { id: 'lessons', label: '1. Bài học Slide', icon: BookOpen },
    { id: 'documents', label: '2. Tài liệu', icon: FileText },
    { id: 'exercises', label: '3. Bài tập', icon: CheckSquare },
    { id: 'info', label: '4. Thông tin', icon: Info },
    ...(isTeacher ? [{ id: 'converter', label: '✨ 5. Chuyển PDF/Ảnh ➔ Slide', icon: Wand2 }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] pb-16 md:pb-2 font-sans text-slate-800 flex flex-col">
      {/* HEADER */}
      <header className="bg-[#111827] border-b border-slate-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="bg-[#2563eb] text-white font-extrabold text-xs px-2.5 py-1 rounded-md tracking-wide uppercase">
              TOÁN THẦY VY
            </span>
            <div className="hidden md:flex items-center space-x-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
              {navTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-bold text-xs transition ${
                      activeTab === t.id 
                        ? (t.id === 'converter' ? 'bg-amber-500 text-slate-950 shadow' : 'bg-[#2563eb] text-white shadow') 
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

          <div className="flex bg-slate-800/90 p-0.5 rounded-lg border border-slate-700">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => { setSelectedGrade(g); setActiveExercise(null); }}
                className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition ${
                  selectedGrade === g 
                    ? 'bg-amber-500 text-slate-950 shadow' 
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Khối {g}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {activeTab === 'lessons' && (
              <button
                onClick={() => setIsExpandedView(!isExpandedView)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-xs font-extrabold transition shadow"
              >
                {isExpandedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span>{isExpandedView ? 'Hiện DS Bài' : 'Chế độ Bảng dạy (Full)'}</span>
              </button>
            )}

            {isTeacher ? (
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex items-center space-x-1 bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Thoát GV</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-200"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Giáo viên</span>
              </button>
            )}
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
                        <Plus className="w-3.5 h-3.5" /> Thêm Bài Giảng (Khối {selectedGrade})
                      </h3>
                      <button
                        onClick={() => setActiveTab('converter')}
                        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] px-2 py-1 rounded-md shadow"
                      >
                        <Wand2 className="w-3 h-3" /> Từ PDF / Ảnh
                      </button>
                    </div>
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
                      Lưu Bài Học
                    </button>
                  </div>
                )}

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[82vh]">
                  <h2 className="font-bold text-slate-300 text-xs uppercase tracking-wider px-1">
                    Bài giảng Khối {selectedGrade} ({lessons.length})
                  </h2>
                  {lessons.length === 0 && (
                    <p className="text-xs text-slate-500 p-4 text-center">Chưa có bài học nào được mở.</p>
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

        {/* ==================== TAB 5: CHUYỂN TỪ ẢNH & PDF ➔ SLIDE HTML ==================== */}
        {activeTab === 'converter' && isTeacher && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
            {/* Cột trái: Nhận Ảnh, PDF & Dán Clipboard Ctrl+V */}
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

              {/* Ô nhập Gemini API Key & Trang PDF */}
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

              {/* 2 NÚT CHỌN FILE: CHỌN ẢNH TRỰC TIẾP HOẶC CHỌN FILE PDF */}
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

              {/* Thống kê 4 dạng Slide */}
              <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800 text-center">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-1">
                  <div className="text-xs font-extrabold text-amber-400">{parsedPreviewSlides.filter(s => s.type === 'theory').length}</div>
                  <div className="text-[10px] text-slate-400">Lý thuyết</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-1">
                  <div className="text-xs font-extrabold text-blue-400">{parsedPreviewSlides.filter(s => s.type === 'mcq').length}</div>
                  <div className="text-[10px] text-slate-400">Trắc nghiệm</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-1">
                  <div className="text-xs font-extrabold text-emerald-400">{parsedPreviewSlides.filter(s => s.type === 'tf').length}</div>
                  <div className="text-[10px] text-slate-400">Đúng / Sai</div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-1">
                  <div className="text-xs font-extrabold text-purple-400">{parsedPreviewSlides.filter(s => s.type === 'short').length}</div>
                  <div className="text-[10px] text-slate-400">Trả lời ngắn</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl">
                📋 <strong>Mẹo siêu nhanh:</strong> Bấm <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300">Win + Shift + S</kbd> chụp ảnh câu hỏi/hình vẽ rồi bấm <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-emerald-300">Ctrl + V</kbd> thẳng vào ô dưới đây!
              </div>

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
                  <CheckCircle2 className="w-4 h-4" /> Lưu vào Bài học (Khối {selectedGrade})
                </button>
                <button
                  onClick={handleDownloadConvertedHtml}
                  className="flex items-center justify-center gap-1.5 bg-[#2563eb] hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-lg"
                >
                  <Download className="w-4 h-4" /> Tải file .html về máy
                </button>
              </div>
            </div>

            {/* Cột phải: Bản xem trước trực tiếp (Live Preview) đúng chuẩn Slide Thầy Vy */}
            <div className="lg:col-span-7 flex flex-col">
              <div className="bg-[#0b1120] rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-[calc(100vh-64px)]">
                <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                    <Layers className="w-3.5 h-3.5" /> Xem trước Slide trực tiếp ({parsedPreviewSlides.length} Slide) — Có Bảng vẽ Toán Thầy Vy
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

        {/* ==================== TAB 2: TÀI LIỆU DRIVE ==================== */}
        {activeTab === 'documents' && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl min-h-[80vh]">
            {isTeacher && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Tên tài liệu (VD: Đề cương Chương V - Vectơ)"
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
                  className="bg-[#2563eb] hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl text-sm"
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
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                        Khối {doc.grade}
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

        {/* ==================== TAB 3: BÀI TẬP & KẾT QUẢ ==================== */}
        {activeTab === 'exercises' && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl min-h-[80vh]">
            {!activeExercise ? (
              <>
                {isTeacher && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3">
                    <h3 className="font-bold text-indigo-700 text-sm">+ Giao Bài Tập Rèn Luyện Mới (Khối {selectedGrade})</h3>
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
                    Nộp Bài & Xem Điểm Ngay
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

      {/* THANH NAVIGATION DƯỚI ĐÁY MÀN HÌNH DÀNH CHO ĐIỆN THOẠI / TABLET NHỎ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-slate-800 flex justify-around py-2 z-30 shadow-lg">
        {navTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center space-y-1 text-[11px] font-medium ${
                activeTab === t.id ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{t.label.replace(/^\d+\.\s*|✨\s*\d+\.\s*/g, '')}</span>
            </button>
          );
        })}
      </nav>

      {/* MODAL ĐĂNG NHẬP GIÁO VIÊN */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
                className="bg-[#2563eb] text-white px-5 py-2 rounded-xl text-sm font-semibold"
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
