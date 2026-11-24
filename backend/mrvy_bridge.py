"""MRVY -> Vzota bridge. App receives a one-time MRVY code, never a password.

Keep SUPABASE_SERVICE_ROLE_KEY strictly on Render (never VITE_/GitHub).
Register router in backend/main.py: from mrvy_bridge import router as mrvy_router; app.include_router(mrvy_router)
"""
from __future__ import annotations
import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/mrvy", tags=["MRVY Bridge"])
SB_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SB_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SB_ANON = os.getenv("SUPABASE_ANON_KEY", "")
MRVY_URL = os.getenv("MRVY_BRIDGE_API_URL", "")
BRIDGE_SECRET = os.getenv("MRVY_VZOTA_SHARED_SECRET", "")
DRIVE_SCRIPT_URL = os.getenv("MRVY_DRIVE_READ_URL", "")
# Same Apps Script already used by the Vzota learning-tab in src/App.jsx.
COURSE_DRIVE_URL = os.getenv("MRVY_COURSE_DRIVE_URL", "https://script.google.com/macros/s/AKfycbxfN16PRs1KoS9JHW6-HR-EQZW9qgH6BpPJtmSpa-a3ZKaZuGwi2xlEw_ppZzfAsBMT/exec")
DRIVE_ID_RX = re.compile(r"^[a-zA-Z0-9_-]{20,200}$")
TOKEN_RX = re.compile(r"^[0-9a-f]{64}$")
EXAM_RX = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


def _configured():
    if not (SB_URL and SB_KEY and BRIDGE_SECRET and len(BRIDGE_SECRET) >= 32):
        raise HTTPException(503, "Cần cấu hình Supabase B và mã kết nối MRVY trên Render.")
    if not MRVY_URL.startswith("https://"):
        raise HTTPException(503, "Địa chỉ MRVY chưa được cấu hình an toàn.")
    if SB_KEY.startswith("sb_publishable_"):
        raise HTTPException(503, "Đang sử dụng khóa public của Supabase. Render cần khóa secret hoặc service_role của Supabase Vzota.")


def _parse_bearer(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Hãy mở Vzota từ tài khoản học sinh MRVY.")
    token = authorization[7:].strip()
    if not TOKEN_RX.fullmatch(token):
        raise HTTPException(401, "Phiên MRVY không hợp lệ.")
    return token


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def _db(method: str, table_or_rpc: str, *, params=None, data=None, rpc=False):
    _configured()
    prefix = "rpc/" if rpc else ""
    path = f"{SB_URL}/rest/v1/{prefix}{table_or_rpc}"
    # Supabase sb_secret_* là API key mới, KHÔNG phải JWT.
    # Gửi sb_secret_* qua apikey, không đưa vào Authorization: Bearer.
    # Legacy service_role JWT vẫn cần Authorization: Bearer như trước.
    headers = {"apikey": SB_KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=representation"}
    if not SB_KEY.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {SB_KEY}"
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            response = await client.request(method, path, headers=headers, params=params, json=data)
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Không kết nối được Supabase Vzota.") from exc
    if response.status_code == 401:
        raise HTTPException(503, "Supabase Vzota từ chối khóa truy cập (401). Kiểm tra SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY thuộc cùng một dự án Supabase Vzota.")
    if response.status_code >= 400:
        raise HTTPException(503, f"Dịch vụ dữ liệu Vzota lỗi HTTP {response.status_code}.")
    try:
        return response.json() if response.content else None
    except ValueError:
        return None


async def _mrvy(action: str, args=None):
    _configured()
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            response = await client.post(MRVY_URL,
                headers={"x-vzota-secret": BRIDGE_SECRET, "Content-Type": "application/json"},
                json={"action": action, **(args or {})})
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Không kết nối được máy chủ MRVY.") from exc
    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code >= 400:
        raise HTTPException(403 if response.status_code in (401,403) else 503,
                            body.get("error", "Không xác minh được MRVY."))
    return body


async def _session(authorization: str | None):
    token = _parse_bearer(authorization)
    rows = await _db("GET", "exam_home_sessions", params={
        "select": "mrvy_student_id,student_name,class_name,grade,expires_at",
        "session_hash": "eq." + _hash(token),
        "expires_at": "gt." + datetime.now(timezone.utc).isoformat(),
        "limit": 1,
    })
    if not rows:
        raise HTTPException(401, "Phiên Vzota hết hạn. Vui lòng quay lại MRVY và mở Vzota lần nữa.")
    return rows[0], token


async def _teacher(authorization: str | None):
    if not SB_ANON:
        raise HTTPException(503, "Thiếu cấu hình Supabase Auth trên Render.")
    token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(401, "Chỉ giáo viên được xem danh sách lớp MRVY.")
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get(f"{SB_URL}/auth/v1/user", headers={
            "apikey": SB_ANON, "Authorization": f"Bearer {token}"})
    if response.status_code != 200:
        raise HTTPException(401, "Phiên giáo viên không hợp lệ.")
    user = response.json()
    rows = await _db("GET", "exam_admins", params={"select": "user_id", "user_id": "eq." + user["id"], "limit": 1})
    if not rows:
        raise HTTPException(403, "Tài khoản chưa có quyền quản lý đề thi.")
    return user


class ExchangeBody(BaseModel):
    code: str = Field(min_length=64, max_length=64)


class AnswerBody(BaseModel):
    attemptToken: str
    answers: dict[str, Any] = Field(default_factory=dict)


class BeginBody(BaseModel):
    classPassword: str = Field(default="", max_length=80)


class EventBody(BaseModel):
    attemptToken: str
    eventType: str
    detail: dict[str, Any] = Field(default_factory=dict)


@router.post("/exchange")
async def exchange(data: ExchangeBody):
    if not TOKEN_RX.fullmatch(data.code):
        raise HTTPException(400, "Mã chuyển tiếp không hợp lệ.")
    result = await _mrvy("exchange", {"code": data.code})
    user = result.get("student") or {}
    student_id = str(user.get("studentId", ""))
    grade = user.get("grade")
    classroom = re.sub(r"\s+", " ", str(user.get("className", "")).strip()).upper()
    classroom = re.sub(r"^(10|11|12)\s+([A-Z])", r"\1\2", classroom)
    name = str(user.get("name", "")).strip()
    if not re.fullmatch(r"\d{1,12}", student_id) or grade not in (10,11,12) or not classroom or not name:
        raise HTTPException(403, "MRVY chưa có đủ mã học sinh, lớp hoặc khối.")
    user["className"] = classroom
    access = secrets.token_hex(32)
    expiry = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    await _db("POST", "exam_home_sessions", data={
        "session_hash": _hash(access), "mrvy_student_id": student_id,
        "student_name": name, "class_name": classroom, "grade": grade,
        "expires_at": expiry,
    })
    # Dọn khóa hết hạn, giữ tối đa 3 giờ để hạn chế Supabase Free.
    await _db("DELETE", "exam_home_sessions",params={"expires_at":"lt."+datetime.now(timezone.utc).isoformat()})
    return {"token": access, "student": {**user,"category":"home"}, "expiresAt": expiry}


@router.get("/classes")
async def classes(authorization: str | None = Header(default=None)):
    await _teacher(authorization)
    return await _mrvy("classes")


async def _drive_text(file_id: str, *, max_chars: int = 16_000_000):
    if not DRIVE_ID_RX.fullmatch(str(file_id or "")):
        raise HTTPException(400, "File học liệu không hợp lệ.")
    target = DRIVE_SCRIPT_URL if DRIVE_SCRIPT_URL.startswith("https://") else COURSE_DRIVE_URL
    if not target.startswith("https://"):
        raise HTTPException(503, "Chưa có máy chủ đọc học liệu Drive.")
    async with httpx.AsyncClient(timeout=50, follow_redirects=True) as client:
        try:
            response = await client.get(target, params={"fileId": file_id})
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Không tải được học liệu từ Google Drive.") from exc
    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code != 200 or not body.get("success"):
        raise HTTPException(503, "Google Drive chưa trả nội dung học liệu.")
    content = body.get("content")
    if not isinstance(content, str) or not 0 < len(content) <= max_chars:
        raise HTTPException(503, "Học liệu trống hoặc quá dung lượng hỗ trợ.")
    return content


@router.get("/home/lesson/{lesson_id}/html")
async def lesson_html(lesson_id: str, authorization: str | None = Header(default=None)):
    student, _ = await _session(authorization)
    if not EXAM_RX.fullmatch(lesson_id):
        raise HTTPException(400, "Mã bài học không hợp lệ.")
    rows = await _db("GET", "lessons", params={
        "select": "title,drive_file_id,html_cache,show_answers",
        "id": "eq."+lesson_id, "category": "eq.home", "is_active": "eq.true",
        "grade": "eq."+str(student["grade"]), "limit":1,
    })
    if not rows:
        raise HTTPException(403, "Bài học không thuộc khối học sinh hoặc đã khóa.")
    row = rows[0]
    content = row.get("html_cache") or ""
    if not content and row.get("drive_file_id"):
        content = await _drive_text(row["drive_file_id"])
    if not content or "<html" not in content.lower():
        raise HTTPException(422, "Bài học chưa có nội dung HTML hợp lệ.")
    return {"title":row["title"],"html":content,"showAnswers":bool(row.get("show_answers"))}


@router.get("/home/resources")
async def resources(authorization: str | None = Header(default=None)):
    student, _ = await _session(authorization)
    params = {"grade": "eq." + str(student["grade"]), "category": "eq.home",
              "is_active": "eq.true", "select": "id,title,drive_file_id"}
    lessons = await _db("GET", "lessons", params=params)
    documents = await _db("GET", "documents", params=params)
    exams = await _db("GET", "exam_papers", params={
        "select": "exercise_id,title,assigned_classes,duration_minutes",
        "grade": "eq." + str(student["grade"]), "category": "eq.home"
    })
    def _class_key(text):
        return re.sub(r"\s+", "", str(text or "")).upper()
    exams = [e for e in (exams or []) if any(
        _class_key(name) == _class_key(student["class_name"])
        for name in (e.get("assigned_classes") or [])
    )]
    # exam_papers may remain for inactive exercise; explicitly check exercise.is_active.
    exercises = await _db("GET", "exercises", params={"select":"id,is_active", "grade":"eq."+str(student["grade"]),"category":"eq.home"})
    active = {str(x["id"]) for x in exercises or [] if x["is_active"]}
    exams = [e for e in exams if str(e["exercise_id"]) in active]
    # Only return a flag - never expose per-class password hashes to students.
    for exam in exams:
        configured = await _db("GET", "exam_class_passwords", params={
            "select":"class_key", "exercise_id":"eq."+str(exam["exercise_id"]),
            "limit":1,
        })
        exam["passwordRequired"] = bool(configured)
    return {"student":student,"lessons":lessons or [],"documents":documents or [],"exams":exams}


async def _attempt_owned(exam_id, student, attempt_token):
    if not EXAM_RX.fullmatch(str(exam_id)):
        raise HTTPException(400, "ID đề không hợp lệ.")
    rows = await _db("GET", "exam_attempts", params={
        "select": "id,attempt_token,submitted_at,score,variant_index,mrvy_synced_at",
        "attempt_token": "eq." + str(attempt_token), "exercise_id": "eq." + exam_id,
        "student_code": "eq.MRVY:" + student["mrvy_student_id"], "limit":1})
    if not rows:
        raise HTTPException(403, "Phiên làm bài không thuộc học sinh này.")
    return rows[0]


@router.post("/home/exam/{exam_id}/begin")
async def begin_exam(exam_id: str, body: BeginBody, authorization: str | None = Header(default=None)):
    student, token = await _session(authorization)
    if not EXAM_RX.fullmatch(exam_id):
        raise HTTPException(400, "ID đề không hợp lệ.")
    return await _db("POST", "exam_home_begin", rpc=True,
                     data={"p_exercise_id": exam_id, "p_session": token,
                           "p_class_password": body.classPassword})


@router.get("/home/exam/{exam_id}/content")
async def exam_content(exam_id: str, authorization: str | None = Header(default=None)):
    student, _ = await _session(authorization)
    if not EXAM_RX.fullmatch(exam_id):
        raise HTTPException(400, "ID đề không hợp lệ.")
    attempt = await _db("GET","exam_attempts",params={
        "select":"id","exercise_id":"eq."+exam_id,
        "student_code":"eq.MRVY:"+student["mrvy_student_id"],"limit":1})
    if not attempt:
        raise HTTPException(403, "Phải mở phiên kiểm tra trước khi tải đề.")
    paper = await _db("GET", "exam_papers", params={"select":"encrypted_drive_file_id", "exercise_id":"eq."+exam_id,"limit":1})
    drive_id = (paper[0] if paper else {}).get("encrypted_drive_file_id")
    if not drive_id:
        raise HTTPException(404, "Đề đời cũ không có file Drive mã hóa.")
    content = await _drive_text(drive_id)
    return {"content": content}


@router.post("/home/exam/{exam_id}/save")
async def save_answers(exam_id: str, body: AnswerBody, authorization: str | None = Header(default=None)):
    student, _ = await _session(authorization)
    await _attempt_owned(exam_id,student,body.attemptToken)
    return {"saved": await _db("POST", "exam_save_answers", rpc=True,
                      data={"p_token":body.attemptToken,"p_answers":body.answers})}


@router.post("/home/exam/{exam_id}/event")
async def log_event(exam_id: str, body: EventBody, authorization: str | None = Header(default=None)):
    student, _ = await _session(authorization)
    await _attempt_owned(exam_id,student,body.attemptToken)
    return {"logged": await _db("POST","exam_log_event",rpc=True,
      data={"p_token":body.attemptToken,"p_type":body.eventType,"p_detail":body.detail})}


async def _sync_score(exam_id, student_id, score, attempt_id, variant_index, already_synced_at=None):
    # Giữ marker lâu dài trên lượt làm bài; không gửi lại điểm chỉ vì hàng đợi
    # "sent" đã được tự dọn sau 90 ngày.
    if already_synced_at:
        return True
    previous = await _db("GET", "exam_home_score_sync", params={
        "select": "status,sent_at", "attempt_id": "eq." + str(attempt_id), "limit": 1})
    if previous and previous[0].get("status") == "sent":
        await _db("PATCH", "exam_attempts", params={"id": "eq." + str(attempt_id)},
                  data={"mrvy_synced_at": previous[0].get("sent_at") or datetime.now(timezone.utc).isoformat()})
        return True
    paper = await _db("GET", "exam_papers", params={
        "select": "title,variants", "exercise_id": "eq." + exam_id, "limit": 1})
    if not paper:
        raise HTTPException(503, "Không tìm thấy đề để đồng bộ điểm.")
    p = paper[0]
    codes = p.get("variants") or []
    exam_code = codes[variant_index].get("code", "") if 0 <= variant_index < len(codes) else ""
    # PENDING được giữ lại nếu mạng lỗi; chỉ MRVY xác nhận thành công mới đánh dấu SENT.
    await _db("POST", "exam_home_score_sync", data={
        "attempt_id": attempt_id, "student_id": student_id, "exercise_id": exam_id,
        "status": "pending", "score": score, "sent_at": None})
    try:
        acknowledged = await _mrvy("score", {"studentId": student_id, "examId": exam_id,
                               "examName": p.get("title") or "Bài kiểm tra Vzota",
                               "score": float(score), "examCode": exam_code})
        if acknowledged.get("success") is not True:
            return False
    except HTTPException:
        return False
    sent_at = datetime.now(timezone.utc).isoformat()
    # Viết marker trước khi hàng đợi được dọn (điểm trên MRVY là upsert theo đề và HS).
    await _db("PATCH", "exam_attempts", params={"id": "eq." + str(attempt_id)},
              data={"mrvy_synced_at": sent_at})
    await _db("PATCH", "exam_home_score_sync", params={"attempt_id": "eq." + str(attempt_id)},
              data={"status": "sent", "sent_at": sent_at})
    return True


@router.post("/home/exam/{exam_id}/submit")
async def submit_exam(exam_id: str,body:AnswerBody,authorization: str | None=Header(default=None)):
    student,_=await _session(authorization)
    attempt=await _attempt_owned(exam_id,student,body.attemptToken)
    result=await _db("POST","exam_submit",rpc=True,
        data={"p_token":body.attemptToken,"p_answers":body.answers})
    fresh=await _attempt_owned(exam_id,student,body.attemptToken)
    if fresh.get("score") is None:
        raise HTTPException(503,"Bài chưa được ghi điểm trong Supabase.")
    synced=await _sync_score(exam_id,student["mrvy_student_id"],fresh["score"],fresh["id"],fresh["variant_index"],fresh.get("mrvy_synced_at"))
    return {**(result or {}),"mrvySynced":synced}


@router.get("/home/scores")
async def scores(authorization: str | None=Header(default=None)):
    student,_=await _session(authorization)
    rows=await _db("GET","exam_attempts",params={
        "select":"id,exercise_id,score,variant_index,submitted_at,mrvy_synced_at",
        "student_code":"eq.MRVY:"+student["mrvy_student_id"],
        "submitted_at":"not.is.null", "order":"submitted_at.desc","limit":100})
    queue=await _db("GET","exam_home_score_sync",params={
        "select":"attempt_id,status","student_id":"eq."+student["mrvy_student_id"]})
    queue_by={q["attempt_id"]:q["status"] for q in queue or []}
    for a in rows or []:
        if a.get("mrvy_synced_at") or queue_by.get(a["id"]) == "sent":
            queue_by[a["id"]] = "sent"
            continue
        try:
            if await _sync_score(a["exercise_id"], student["mrvy_student_id"],
                                 a["score"], a["id"], a["variant_index"]):
                queue_by[a["id"]] = "sent"
        except HTTPException:
            pass
    paper_ids=sorted({str(a["exercise_id"]) for a in rows or [] if EXAM_RX.fullmatch(str(a["exercise_id"]))})
    paper_by={}
    if paper_ids:
        papers=await _db("GET","exam_papers",params={
            "select":"exercise_id,title,variants",
            "exercise_id":"in.("+",".join(paper_ids)+")",
        })
        paper_by={str(p["exercise_id"]):p for p in papers or []}
    output=[]
    for a in rows or []:
        p=paper_by.get(str(a["exercise_id"]),{})
        variants=p.get("variants") or []
        index=a.get("variant_index")
        code=variants[index].get("code") if isinstance(index,int) and 0<=index<len(variants) else ""
        output.append({**a,"examTitle":p.get("title") or "Bài kiểm tra",
            "examCode":code,
            "mrvySynced":bool(a.get("mrvy_synced_at")) or queue_by.get(a["id"])=="sent"})
    return {"scores":output}


@router.post("/admin/retry-scores")
async def retry_scores(authorization: str | None = Header(default=None)):
    await _teacher(authorization)
    pending = await _db("GET", "exam_home_score_sync", params={
        "select": "attempt_id,student_id,exercise_id,score",
        "status": "eq.pending", "limit": 30,
    })
    sent = 0
    failed = 0
    for item in pending or []:
        try:
            attempts = await _db("GET", "exam_attempts", params={
                "select":"id,submitted_at,variant_index,mrvy_synced_at,score",
                "id":"eq."+str(item["attempt_id"]),"limit":1,
            })
            if not attempts or attempts[0].get("submitted_at") is None:
                continue
            a = attempts[0]
            if await _sync_score(item["exercise_id"],item["student_id"],
                                 a["score"],a["id"],a["variant_index"],a.get("mrvy_synced_at")):
                sent += 1
            else:
                failed += 1
        except (HTTPException, KeyError, TypeError, ValueError):
            failed += 1
    return {"attempted":len(pending or []),"synced":sent,"remainingOrFailed":failed}
