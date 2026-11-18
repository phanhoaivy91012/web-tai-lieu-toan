"""Vzota OMR engine for the single v17.0 bubble-sheet layout supplied by the user.

All coordinates below refer to the 723x974 reference raster. This is a prototype,
not a validated high-stakes assessment engine. Unknown / ambiguous marks are NEVER
silently converted to an answer.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

W, H = 723, 974
TEMPLATE_ID = "vzota-v17-demo"
# Reference center positions of four separated, interior alignment squares.
# Outer corner squares touch the printed border and are not independent contours.
CORNERS = np.float32([[84.5, 196.0], [599.5, 196.0],
                      [565.0, 852.0], [93.0, 852.0]])

# A few dozen square anchors throughout the form enable consistency checks and
# registration refinement beyond correcting the four corners.
ANCHORS = [tuple(p) for p in CORNERS]
ANCHORS += [(float(x), y) for x in (84, 222, 316, 411, 505, 599) for y in (195.5, 384.5)]
ANCHORS += [(float(x), y) for x in (93,166,239,312,385,458,531,604) for y in (448.5, 535.0)]
ANCHORS += [(float(x), y) for x in (93,187,282,376,470,565) for y in (629.0, 852.0)]

# OCR-free coordinates of bubble centers; the printed outline is excluded in scoring.
SBD_X = [101.5, 118.5, 136.0, 153.0, 170.0, 187.0]
CODE_X = [238.0, 255.2, 272.0]
P1_X = [[333.0, 350.1, 367.5, 385.0],
        [428.2, 445.2, 462.4, 479.8],
        [521.6, 538.6, 556.1, 573.4]]
P2_X = [[110.0 + 73 * i, 127.3 + 73 * i] for i in range(7)]
P3_X = [[110.0 + 94.4 * i + 17.1 * j for j in range(4)] for i in range(6)]


@dataclass
class Registered:
    image: np.ndarray
    detected: int
    matched: int
    marker_score: float


def _order(points: np.ndarray) -> np.ndarray:
    # Works for modest tilt and perspective distortion on a portrait sheet.
    pts = np.asarray(points, dtype=np.float32)
    s = pts[:, 0] + pts[:, 1]
    d = pts[:, 0] - pts[:, 1]
    ids = [int(np.argmin(s)), int(np.argmax(d)), int(np.argmax(s)), int(np.argmin(d))]
    if len(set(ids)) != 4:
        raise ValueError('Không xác định được đủ 4 mốc định vị ở góc phiếu.')
    return pts[ids]


def _find_markers(im: np.ndarray) -> np.ndarray:
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) if im.ndim == 3 else im
    blurred = cv2.GaussianBlur(g, (3, 3), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    total = g.shape[0] * g.shape[1]
    candidates: list[tuple[float, float]] = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < max(55, total * 0.000075) or area > total * 0.020:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if min(w,h) < 7 or max(w,h) / max(1,min(w,h)) > 1.8:
            continue
        extent = area / max(1, w * h)
        if extent < 0.53:
            continue
        if cv2.contourArea(cv2.convexHull(c)) > 0 and area / cv2.contourArea(cv2.convexHull(c)) < 0.85:
            continue
        roi = g[y:y+h, x:x+w]
        if np.mean(roi) > 125:
            continue
        candidates.append((x + w/2, y + h/2))
    # De-duplicate contours that describe the same square.
    result: list[tuple[float, float]] = []
    for p in sorted(candidates):
        if all(np.linalg.norm(np.array(p)-np.array(q)) > 5 for q in result):
            result.append(p)
    return np.asarray(result, dtype=np.float32).reshape(-1, 2)


def _estimate_registration(im: np.ndarray) -> Registered:
    h,w = im.shape[:2]
    if min(h,w) < 480:
        raise ValueError('Ảnh quá nhỏ; hãy dùng ảnh có chiều ngắn tối thiểu 480 px.')
    markers = _find_markers(im)
    if len(markers) < 4:
        raise ValueError('Không tìm thấy 4 ô vuông định vị. Hãy chụp trọn phiếu trên nền sáng.')
    # Squares on the four paper corners are the farthest axis-aligned extrema.
    # The quadrilateral spans most of the visible paper, including a small margin.
    detected_corners = _order(markers)
    top_width = np.linalg.norm(detected_corners[0] - detected_corners[1])
    left_height = np.linalg.norm(detected_corners[0] - detected_corners[3])
    if top_width < w * .30 or left_height < h * .36:
        raise ValueError('Bốn góc phiếu không nằm đầy đủ trong ảnh.')
    transform = cv2.getPerspectiveTransform(detected_corners, CORNERS)
    aligned = cv2.warpPerspective(im, transform, (W, H),
                                  flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
                                  borderValue=(255,255,255))
    # Match all inner squares and robustly correct any residual registration drift.
    projected = cv2.perspectiveTransform(markers.reshape(-1,1,2), transform).reshape(-1,2)
    source_matches=[]
    target_matches=[]
    used=set()
    for a in ANCHORS:
        distances = np.linalg.norm(projected - np.asarray(a, dtype=np.float32), axis=1)
        idx = int(np.argmin(distances))
        if idx not in used and distances[idx] < 14:
            used.add(idx)
            source_matches.append(markers[idx])
            target_matches.append(a)
    if len(source_matches) >= 8:
        H2, mask = cv2.findHomography(np.float32(source_matches), np.float32(target_matches),
                                      cv2.RANSAC, 3.5)
        if H2 is not None and int(mask.sum()) >= 8:
            aligned = cv2.warpPerspective(im, H2, (W,H), borderValue=(255,255,255))
    # Measure darkness at expected square centers in the rectified image.
    grey = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    dark_anchors=0
    for x,y in ANCHORS:
        x,y=int(round(x)),int(round(y))
        region = grey[y-4:y+5, x-4:x+5]
        if region.size and np.mean(region) < 110:
            dark_anchors += 1
    score = dark_anchors/len(ANCHORS)
    if score < 0.72:
        raise ValueError(f'Định vị phiếu không đủ tin cậy ({score:.0%} mốc đạt). '
                         'Vui lòng chụp lại, đủ 4 góc và tránh bị cong giấy.')
    return Registered(aligned, len(markers), len(source_matches), score)


def _score_bubble(grey: np.ndarray, x: float, y: float, radius: float=4.0) -> float:
    """Normalized inner-circle graphite darkness, ignoring the printed ring."""
    # Bias to the inner disk because printed circles have radius approx 6.5 px.
    cx,cy=int(round(x)),int(round(y))
    r=8
    crop=grey[cy-r:cy+r+1,cx-r:cx+r+1]
    if crop.shape != (2*r+1,2*r+1):
        return 0.0
    yy,xx=np.ogrid[-r:r+1,-r:r+1]
    mask=(xx*xx + yy*yy) <= radius*radius
    # Bright paper baseline is robust to global changes in exposure.
    paper = float(np.percentile(crop, 94))
    center = crop[mask].astype(np.float32)
    return float(np.clip((paper - np.mean(center)) / max(paper, 1.0),0,1))


def _choice(scores: list[float], labels: list[str], threshold: float=0.16,
            review_threshold: float=0.085) -> dict[str, Any]:
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    best = order[0]
    second_score = scores[order[1]] if len(order) > 1 else 0
    top = scores[best]
    flagged=[labels[i] for i,s in enumerate(scores) if s >= threshold]
    # If a faint mark exists, surface it for a teacher instead of guessing.
    if len(flagged) > 1:
        status, answer = 'multiple', None
    elif top < review_threshold:
        status, answer = 'blank', None
    elif top < threshold:
        status, answer = 'review', None
    elif second_score >= review_threshold and second_score > top * 0.52:
        status, answer = 'review', None
    else:
        status, answer = 'ok', labels[best]
    return {'answer': answer, 'status': status,
            'confidence': round(float(max(0,min(1, (top-second_score)/max(top,0.0001)))),3),
            'scores': {key: round(val,3) for key,val in zip(labels,scores)}}


def _bubble_entry(grey, points, labels, **kwargs):
    scores=[_score_bubble(grey,*p) for p in points]
    return _choice(scores, list(labels), **kwargs)


def _numeric_entry(grey, xs: list[float]) -> dict[str,Any]:
    columns=[]
    marks=[]
    # Special rows: column 0 may have '-', columns 1 and 2 may have ',';
    # other digits always have one of 0..9 per column.
    for j,x in enumerate(xs):
        ys=[680.5+17.2*n for n in range(10)]
        labels=[str(n) for n in range(10)]
        if j == 0:
            ys.append(646.5);labels.append('-')
        if j in (1,2):
            ys.append(663.4);labels.append(',')
        entry=_bubble_entry(grey,[(x,y) for y in ys],labels,
                            threshold=0.16,review_threshold=0.085)
        columns.append(entry)
        marks.append(entry['answer'])
    statuses=[p['status'] for p in columns]
    if any(s in ('multiple','review') for s in statuses):
        status='review'
    elif all(s == 'blank' for s in statuses):
        status='blank'
    else:
        status='ok'
    # Numeric cells should be completed from left-to-right or include blank
    # cells on the right. A gap in the middle is an invalid code.
    tokens=[x for x in marks if x is not None]
    value=''.join(tokens) if status == 'ok' else None
    if value is not None:
        if not tokens or (value.count(',') > 1 or value.count('-') > 1 or
                          ('-' in value and not value.startswith('-')) or
                          value in ('-',',','-,') or
                          any(mark is None for mark in marks[:len(tokens)])):
            status='review';value=None
    return {'answer':value,'status':status,'columns':columns}


def _encode_image(image: np.ndarray, quality: int=85) -> str:
    small = image
    ok, buf=cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY,quality])
    return 'data:image/jpeg;base64,'+base64.b64encode(buf).decode() if ok else ''


def _annotate(image, p1, p2, p3, sbd, code):
    canvas=image.copy()
    color={'ok':(20,145,50), 'review':(0,135,245), 'multiple':(0,0,230)}
    def outline(x,y,status,selected=False):
        # Selected bubbles are marked green; uncertain groups orange/red.
        # Empty bubbles are deliberately left untouched to keep the overlay legible.
        if status=='blank' or (status=='ok' and not selected):
            return
        cv2.circle(canvas,(round(x),round(y)),8,color.get(status,(0,0,255)),2,cv2.LINE_AA)
    for row,x in enumerate(SBD_X):
        entry=sbd[row]
        for n in range(10):
            outline(x,213+17.15*n,entry['status'],entry['answer']==str(n))
    for row,x in enumerate(CODE_X):
        entry=code[row]
        for n in range(10):
            outline(x,213+17.15*n,entry['status'],entry['answer']==str(n))
    for i in range(30):
        group=i//10;entry=p1[i]
        y=213+17.15*(i%10)
        for k,x in enumerate(P1_X[group]):
            outline(x,y,entry['status'],entry['answer']=='ABCD'[k])
    for i in range(7):
        for j in range(4):
            y=466.4+17.25*j
            entry=p2[i]['statements'][j]
            for k,x in enumerate(P2_X[i]):
                outline(x,y,entry['status'],entry['answer']==['Đ','S'][k])
    for i in range(6):
        for j,col in enumerate(p3[i]['columns']):
            x=P3_X[i][j]
            for n in range(10):
                outline(x,680.5+17.2*n,col['status'],col['answer']==str(n))
            if j==0:outline(x,646.5,col['status'],col['answer']=='-')
            if j in (1,2):outline(x,663.4,col['status'],col['answer']==',')
    return canvas


def scan_image(image: np.ndarray, include_preview: bool=True) -> dict[str,Any]:
    if image is None or image.size == 0:
        raise ValueError('Dữ liệu ảnh không hợp lệ.')
    aligned=_estimate_registration(image)
    grey = cv2.cvtColor(aligned.image, cv2.COLOR_BGR2GRAY)
    # Local illumination normalization; CLAHE can amplify print noise on poor
    # paper, so instead trust inner disk versus surrounding local white baseline.
    sbd=[]
    for x in SBD_X:
        sbd.append(_bubble_entry(grey,[(x,213+17.15*n) for n in range(10)],
                                 [str(n) for n in range(10)]))
    code=[]
    for x in CODE_X:
        code.append(_bubble_entry(grey,[(x,213+17.15*n) for n in range(10)],
                                  [str(n) for n in range(10)]))
    p1=[]
    for idx in range(30):
        col=idx//10;row=idx%10
        entry=_bubble_entry(grey, [(x,213+row*17.15) for x in P1_X[col]],
                            ['A','B','C','D'])
        p1.append({'question':idx+1,**entry})
    p2=[]
    for idx in range(7):
        s=[]
        for row in range(4):
            ys=466.4+row*17.25
            s.append({'item':'abcd'[row],**_bubble_entry(
                grey,[(x,ys) for x in P2_X[idx]], ['Đ','S'])})
        p2.append({'question':idx+1,'statements':s})
    p3=[]
    for idx,xs in enumerate(P3_X):
        p3.append({'question':idx+1,**_numeric_entry(grey,xs)})
    needs_review=[]
    for prefix, digits in (('Số báo danh',sbd),('Mã đề',code)):
        needs_review += [f'{prefix} cột {i+1} (chưa đọc)' for i,x in enumerate(digits) if x['status'] != 'ok']
    needs_review += [f'Phần I câu {i+1}' for i,x in enumerate(p1) if x['status'] in ('review','multiple')]
    needs_review += [f'Phần II câu {i+1}{x["item"]}' for i,q in enumerate(p2)
                     for x in q['statements'] if x['status'] in ('review','multiple')]
    needs_review += [f'Phần III câu {i+1}' for i,x in enumerate(p3) if x['status']=='review']
    student=''.join(x['answer'] or '?' for x in sbd)
    exam=''.join(x['answer'] or '?' for x in code)
    result={'template_id':TEMPLATE_ID, 'student_id': student,
            'exam_code':exam,'student_id_fields':sbd,'exam_code_fields':code,
            'part1':p1,'part2':p2,'part3':p3,
            'needs_review':needs_review,
            'registration':{'markers_detected':aligned.detected,
                             'anchors_matched':aligned.matched,
                             'anchor_match_ratio':round(aligned.marker_score,3)}}
    if include_preview:
        result['preview']=_encode_image(_annotate(aligned.image,p1,p2,p3,sbd,code))
    return result


def resolve_answer_key(raw: dict[str,Any], code: str) -> dict[str,Any]:
    """Accept a direct key or keys indexed by the scanned three-digit exam code."""
    if not isinstance(raw,dict):
        raise ValueError('Bộ đáp án không phải JSON object.')
    if any(x in raw for x in ('part1','part2','part3')):
        return raw
    if 'variants' in raw:
        raw={str(v.get('exam_code')): v.get('answer_key') for v in raw['variants']}
    raw=raw.get('answer_keys',raw)
    if not isinstance(raw,dict) or code not in raw:
        raise ValueError(f'Chưa có đáp án cho mã đề {code}. Hãy kiểm tra mã đề được tô.')
    key=raw[code]
    if not isinstance(key,dict):
        raise ValueError(f'Đáp án của mã đề {code} không đúng định dạng.')
    return key


def grade_result(scan: dict[str,Any], answer_key: dict[str,Any]) -> dict[str,Any]:
    """Grade confidently read / manually reviewed marks; no silent guesses."""
    answer_key=resolve_answer_key(answer_key,str(scan.get('exam_code','')))
    key1=answer_key.get('part1',{})
    key2=answer_key.get('part2',{})
    key3=answer_key.get('part3',{})
    points=answer_key.get('points',{'part1':1.0,'part2':0.25,'part3':1.0})
    policy=answer_key.get('part2_policy','per_statement')
    if policy not in ('per_statement','progressive'):
        raise ValueError('part2_policy phải là per_statement hoặc progressive.')
    progressive_scores=answer_key.get('part2_progressive_scores',[0,0.1,0.25,0.5,1])
    if len(progressive_scores)!=5:
        raise ValueError('part2_progressive_scores phải gồm 5 mức (0–4 ý đúng).')
    earned,total=0.0,0.0
    details=[]
    def match(chosen,correct,flag):
        if flag!='ok' or chosen is None:return False
        acceptable=correct if isinstance(correct,list) else [correct]
        return any(str(chosen).strip().upper()==str(c).strip().upper() for c in acceptable)
    def add(section,q,chosen,correct,flag,weight):
        nonlocal earned,total
        weight=float(weight)
        if weight < 0:raise ValueError('Điểm số không được âm.')
        total+=weight
        is_correct=match(chosen,correct,flag)
        if is_correct: earned+=weight
        details.append({'section':section,'question':str(q),
                        'answer':chosen,'correct':correct,
                        'earned':round(weight if is_correct else 0.0,4),
                        'max':weight,'status':flag})
    for q,corr in key1.items():
        n=int(q)
        if n not in range(1,31):raise ValueError('Đáp án Phần I có câu không thuộc 1–30.')
        r=scan['part1'][n-1]
        add('I',n,r['answer'],corr,r['status'],points.get('part1',1.0))
    for q,answer in key2.items():
        n=int(q)
        if n not in range(1,8):raise ValueError('Đáp án Phần II có câu không thuộc 1–7.')
        if not isinstance(answer,list) or len(answer)!=4:
            raise ValueError('Mỗi câu phần II cần đúng 4 đáp án Đ hoặc S.')
        responses=scan['part2'][n-1]['statements']
        if policy=='progressive':
            number_correct=sum(match(r['answer'],corr,r['status']) for r,corr in zip(responses,answer))
            gained=float(progressive_scores[number_correct])
            maximum=float(progressive_scores[4])
            if gained<0 or maximum<gained:raise ValueError('Bảng điểm lũy tiến không hợp lệ.')
            earned+=gained;total+=maximum
            details.append({'section':'II','question':str(n),
                'answer':[r['answer'] for r in responses],'correct':answer,
                'earned':round(gained,4),'max':maximum,
                'status':'ok' if all(r['status']=='ok' for r in responses) else 'review'})
        else:
            for j,corr in enumerate(answer):
                r=responses[j]
                add('II',f'{n}{"abcd"[j]}',r['answer'],corr,r['status'],points.get('part2',0.25))
    for q,corr in key3.items():
        n=int(q)
        if n not in range(1,7):raise ValueError('Đáp án Phần III có câu không thuộc 1–6.')
        r=scan['part3'][n-1]
        accepted=[str(x).replace('.',',') for x in corr] if isinstance(corr,list) else str(corr).replace('.',',')
        add('III',n,r['answer'],accepted,r['status'],points.get('part3',1.0))
    pending=sum(x['status'] in ('review','multiple') for x in scan['part1'])
    pending+=sum(x['status'] in ('review','multiple') for q in scan['part2'] for x in q['statements'])
    pending+=sum(x['status'] == 'review' for x in scan['part3'])
    pending+=sum(x['status']!='ok' for x in scan['student_id_fields']+scan['exam_code_fields'])
    return {'score':round(earned,4),'total':round(total,4),
            'details':details, 'pending_review':pending,
            'selected_exam_code':str(scan.get('exam_code',''))}
