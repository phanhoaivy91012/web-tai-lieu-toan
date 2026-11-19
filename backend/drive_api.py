"""Authenticated Google Drive bridge for Vzota.

One new FastAPI router, attached to existing main.py without replacing existing endpoints.
"""
import os
import json
import base64
import io
import zipfile
import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel


def register_drive_routes(fastapi_app, require_teacher):
    app = APIRouter()
    # Vzota-only private Google Drive bridge.

    # Never expose the Apps Script secret to React / Vercel browser variables.
    DRIVE_SCRIPT_URL = os.getenv('VZOTA_DRIVE_SCRIPT_URL', '').strip()
    DRIVE_SECRET = os.getenv('VZOTA_DRIVE_SECRET', '').strip()
    TEACHER_EMAILS = {e.strip().casefold() for e in os.getenv('VZOTA_TEACHER_EMAILS', '').split(',') if e.strip()}

    async def vzota_drive_teacher(user: dict = Depends(require_teacher)) -> dict:
        # Drive access is more sensitive than scanning. Explicit allowlist required.
        email = str(user.get('email') or '').casefold()
        if not TEACHER_EMAILS or email not in TEACHER_EMAILS:
            raise HTTPException(403, 'Tài khoản chưa được cấp quyền lưu Vzota lên Drive. Cấu hình VZOTA_TEACHER_EMAILS trên Render.')
        if not DRIVE_SCRIPT_URL.startswith('https://script.google.com/macros/s/') or not DRIVE_SECRET or len(DRIVE_SECRET) < 32:
            raise HTTPException(503, 'Chưa cấu hình Vzota Drive Script URL và secret trên Render.')
        return user

    async def _drive_call(user: dict, action: str, **payload):
        args = dict(action=action, userId=user['id'], secret=DRIVE_SECRET, **payload)
        try:
            async with httpx.AsyncClient(timeout=65, follow_redirects=True) as client:
                response = await client.post(DRIVE_SCRIPT_URL, content=json.dumps(args, ensure_ascii=False),
                                             headers={'Content-Type': 'text/plain;charset=utf-8'})
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, 'Không liên lạc được Google Apps Script. Kiểm tra URL / quyền triển khai / dung lượng file.') from exc
        if not isinstance(data, dict) or not data.get('success'):
            raise HTTPException(502, (data.get('error') if isinstance(data,dict) else 'Google Drive trả về dữ liệu không hợp lệ'))
        return data

    @app.post('/api/drive/save-exam')
    async def drive_save_exam(
        zip_file: UploadFile = File(...), word_file: UploadFile = File(...),
        title: str = Form(...), grade: int = Form(...), category: str = Form(...),
        user: dict = Depends(vzota_drive_teacher),
    ):
        import base64
        if not zip_file.filename.lower().endswith('.zip') or not word_file.filename.lower().endswith('.docx'):
            raise HTTPException(415, 'Chỉ nhận ZIP mã đề và DOCX gốc.')
        zip_bytes = await zip_file.read(12 * 1024 * 1024 + 1)
        word_bytes = await word_file.read(12 * 1024 * 1024 + 1)
        if len(zip_bytes) > 12*1024*1024 or len(word_bytes) > 12*1024*1024:
            raise HTTPException(413, 'File vượt giới hạn 12MB cho mỗi tệp.')
        if not zipfile.is_zipfile(io.BytesIO(zip_bytes)) or not zipfile.is_zipfile(io.BytesIO(word_bytes)):
            raise HTTPException(422, 'ZIP hoặc DOCX không hợp lệ.')
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
                if not any(n.lower().endswith('.xlsx') for n in archive.namelist()):
                    raise HTTPException(422, 'ZIP không chứa đáp án Excel.')
        except zipfile.BadZipFile:
            raise HTTPException(422, 'ZIP không hợp lệ.') from None
        return await _drive_call(user, 'vzota_save_exam', title=title[:120], grade=grade, category=category,
            zipBase64=base64.b64encode(zip_bytes).decode(), wordBase64=base64.b64encode(word_bytes).decode())

    class DriveBankRequest(BaseModel):
        title: str
        grade: int
        category: str
        variants: list[dict]
        keys: dict

    @app.post('/api/drive/save-bank')
    async def drive_save_bank(payload: DriveBankRequest, user: dict = Depends(vzota_drive_teacher)):
        from excel_keys import export_answers_xlsx
        from starlette.concurrency import run_in_threadpool
        if not payload.variants or len(payload.variants)>100:
            raise HTTPException(422,'Cần từ 1 đến 100 mã đề.')
        excel = await run_in_threadpool(export_answers_xlsx,payload.keys)
        buff = io.BytesIO()
        with zipfile.ZipFile(buff,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('Vzota_bo_dap_an.xlsx', excel)
            archive.writestr('Ngan_hang_cac_ma_de.json', json.dumps(payload.variants, ensure_ascii=False))
        if buff.tell()>12*1024*1024:raise HTTPException(413,'Ngân hàng vượt 12MB.')
        return await _drive_call(user,'vzota_save_exam',title=payload.title[:120],grade=payload.grade,
              category=payload.category,zipBase64=base64.b64encode(buff.getvalue()).decode(),wordBase64='')

    @app.get('/api/drive/exams')
    async def drive_exams(user: dict = Depends(vzota_drive_teacher)):
        return await _drive_call(user, 'vzota_list')

    class DriveExamRequest(BaseModel):
        examId: str

    @app.post('/api/drive/open-exam')
    async def drive_open_exam(payload: DriveExamRequest, user: dict = Depends(vzota_drive_teacher)):
        return await _drive_call(user, 'vzota_open', examId=payload.examId)

    class DriveResultsRequest(BaseModel):
        examId: str
        resultsJson: str
        resultsCsv: str

    class DriveDownloadRequest(BaseModel):
        examId: str
        kind: str = 'zip'

    @app.post('/api/drive/download-exam')
    async def drive_download_exam(payload: DriveDownloadRequest, user: dict = Depends(vzota_drive_teacher)):
        from fastapi.responses import Response
        if payload.kind not in ('zip','word'):
            raise HTTPException(422,'Chỉ hỗ trợ ZIP và Word.')
        data = await _drive_call(user, 'vzota_download', examId=payload.examId, kind=payload.kind)
        try:
            contents = base64.b64decode(data['base64'], validate=True)
        except (ValueError,KeyError):
            raise HTTPException(502,'Dữ liệu từ Google Drive không hợp lệ.') from None
        if len(contents)>12*1024*1024:raise HTTPException(413,'Tệp vượt 12MB.')
        return Response(contents, media_type='application/zip' if payload.kind=='zip' else
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={'Content-Disposition':'attachment; filename="'+ ('De_da_tron.zip' if payload.kind=='zip' else 'De_goc.docx')+'"'})

    @app.post('/api/drive/save-results')
    async def drive_save_results(payload: DriveResultsRequest, user: dict = Depends(vzota_drive_teacher)):
        return await _drive_call(user, 'vzota_save_results', examId=payload.examId,
                                 resultsJson=payload.resultsJson, resultsCsv=payload.resultsCsv)

    @app.post('/api/drive/save-image')
    async def drive_save_image(examId: str = Form(...), image: UploadFile = File(...),
                               user: dict = Depends(vzota_drive_teacher)):
        import base64
        if image.content_type not in ('image/jpeg','image/png','image/webp'):
            raise HTTPException(415, 'Chỉ nhận ảnh JPEG/PNG/WEBP.')
        content = await image.read(5*1024*1024 + 1)
        if len(content)>5*1024*1024: raise HTTPException(413,'Ảnh quá 5MB.')
        return await _drive_call(user,'vzota_save_image',examId=examId,
                    mimeType=image.content_type,imageBase64=base64.b64encode(content).decode())
    fastapi_app.include_router(app)
