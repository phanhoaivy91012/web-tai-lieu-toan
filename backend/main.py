"""Vzota secure OMR API for existing Toán Thầy Vy website.

The frontend's Supabase Auth session is verified via Supabase Auth /user.
No service_role key required. No student data or images are persisted here.
"""
from __future__ import annotations

import json
import os
from typing import Annotated

import cv2
import httpx
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
import io
import zipfile

from mixer import MixError, create_variants
from omr import grade_result, scan_image
from word_exam import inspect_word, export_zip
from excel_keys import export_answers_xlsx, import_answers_xlsx

app = FastAPI(title='Vzota OMR API', version='0.2.0')
origins = [x.strip().rstrip('/') for x in os.getenv('ALLOWED_ORIGINS', '').split(',') if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Authorization', 'Content-Type'],
)

SUPABASE_URL = os.getenv('SUPABASE_URL', '').strip().rstrip('/')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '').strip()
MAX_FILE_BYTES = 16 * 1024 * 1024


async def require_teacher(authorization: Annotated[str | None, Header()] = None) -> dict:
    # Fail closed. Never accept a JWT merely because it is syntactically valid.
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(503, 'Máy chấm chưa cấu hình Supabase Auth.')
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Bạn phải đăng nhập tài khoản giáo viên.')
    token = authorization.removeprefix('Bearer ').strip()
    if not token or len(token) > 8000:
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ.')
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                f'{SUPABASE_URL}/auth/v1/user',
                headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
            )
    except httpx.HTTPError:
        raise HTTPException(503, 'Không xác minh được phiên giáo viên qua Supabase.') from None
    if resp.status_code != 200:
        raise HTTPException(401, 'Phiên giáo viên đã hết hạn hoặc không hợp lệ.')
    try:
        user = resp.json()
    except ValueError:
        raise HTTPException(503, 'Supabase trả về dữ liệu xác thực không hợp lệ.') from None
    if not isinstance(user, dict) or not user.get('id'):
        raise HTTPException(401, 'Không xác định được tài khoản giáo viên.')
    # The source app defines teacher as a signed-in Supabase Auth user.
    # For multiple teacher roles, add role authorization here and matching RLS policies.
    return user


class MixRequest(BaseModel):
    bank: dict
    count: int = 4
    seed: int = 2026
    starting_code: int = 101


class ReviewedGradeRequest(BaseModel):
    scan: dict
    answer_key: dict


@app.get('/api/health')
def health():
    return {'status': 'ok', 'service': 'Vzota', 'template': 'vzota-v17-demo', 'auth_configured': bool(SUPABASE_URL and SUPABASE_ANON_KEY)}


@app.post('/api/mix')
async def mix(payload: MixRequest, _user: dict = Depends(require_teacher)):
    try:
        return {'variants': create_variants(payload.bank, payload.count, payload.seed, payload.starting_code)}
    except (MixError, ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post('/api/scan')
async def scan(
    image: UploadFile = File(...),
    answer_key: str | None = Form(None),
    _user: dict = Depends(require_teacher),
):
    if image.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/bmp'):
        raise HTTPException(415, 'Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc BMP.')
    raw = await image.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, 'Ảnh vượt giới hạn 16 MB.')
    im = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise HTTPException(422, 'Không đọc được ảnh.')
    if im.shape[0] * im.shape[1] > 25_000_000:
        raise HTTPException(413, 'Ảnh quá lớn (vượt 25 megapixel).')
    try:
        result = await run_in_threadpool(scan_image, im)
        if answer_key and answer_key.strip():
            keys = json.loads(answer_key)
            if not isinstance(keys, dict):
                raise ValueError('Đáp án cần là một đối tượng JSON.')
            try:
                result['grading'] = await run_in_threadpool(grade_result, result, keys)
            except ValueError as exc:
                # Return scan result to allow correcting exam code and rescoring.
                result['grading_warning'] = str(exc)
        return result
    except (ValueError, KeyError, TypeError, cv2.error) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post('/api/grade-reviewed')
async def grade_reviewed(payload: ReviewedGradeRequest, _user: dict = Depends(require_teacher)):
    try:
        return await run_in_threadpool(grade_result, payload.scan, payload.answer_key)
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post('/api/inspect-word')
async def inspect_word_api(file: UploadFile = File(...), _user: dict = Depends(require_teacher)):
    if not file.filename.lower().endswith('.docx'):
        raise HTTPException(415, 'Chỉ hỗ trợ file Word .docx.')
    raw = await file.read(12 * 1024 * 1024 + 1)
    try:
        return await run_in_threadpool(inspect_word, raw)
    except (ValueError, TypeError, KeyError, IndexError, Exception) as exc:
        raise HTTPException(422, f'Không thể phân tích Word: {exc}') from exc


@app.post('/api/mix-word')
async def mix_word_api(
    file: UploadFile = File(...), count: int = Form(4),
    starting_code: int = Form(101), seed: int = Form(2026),
    _user: dict = Depends(require_teacher)
):
    if not file.filename.lower().endswith('.docx'):
        raise HTTPException(415, 'Chỉ hỗ trợ file Word .docx.')
    raw = await file.read(12 * 1024 * 1024 + 1)
    try:
        content, _ = await run_in_threadpool(export_zip,raw,count,starting_code,seed)
    except Exception as exc:
        raise HTTPException(422, f'Không thể trộn Word: {exc}') from exc
    return StreamingResponse(io.BytesIO(content),media_type='application/zip',
        headers={'Content-Disposition':'attachment; filename="Vzota_Word_Mixed.zip"'})


@app.post('/api/import-answers-xlsx')
async def import_answers_excel(file: UploadFile = File(...), _user: dict = Depends(require_teacher)):
    if not file.filename.lower().endswith('.xlsx'):
        raise HTTPException(415, 'Chỉ nhận tệp Excel .xlsx do Vzota xuất.')
    raw=await file.read(5*1024*1024+1)
    try:
        keys=await run_in_threadpool(import_answers_xlsx,raw)
        return {'answer_keys': keys, 'codes': sorted(keys)}
    except (ValueError,KeyError,IndexError,TypeError,zipfile.BadZipFile) as exc:
        raise HTTPException(422, f'Lỗi đọc đáp án Excel: {exc}') from exc


@app.post('/api/export-answers-xlsx')
async def export_answers_excel(payload: dict, _user: dict = Depends(require_teacher)):
    try:
        raw=await run_in_threadpool(export_answers_xlsx,payload)
    except (ValueError,KeyError,IndexError,TypeError) as exc:
        raise HTTPException(422, f'Lỗi xuất đáp án Excel: {exc}') from exc
    return StreamingResponse(io.BytesIO(raw),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename="Vzota_bo_dap_an.xlsx"'})
from drive_api import register_drive_routes
register_drive_routes(app, require_teacher)
