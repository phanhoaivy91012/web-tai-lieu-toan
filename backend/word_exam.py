"""Lossless DOCX question-order mixer for Azota-styled Word files.

Preserves OOXML objects (MathType/OLE/images) by moving original paragraphs,
not by converting them to plain text. Reorders questions and A-D options while preserving embedded OOXML equations.
"""
from __future__ import annotations
import copy
import io
import json
import random
import re
import zipfile
from dataclasses import dataclass
from typing import Any
from docx import Document
from docx.oxml.ns import qn
from lxml import etree
from excel_keys import export_answers_xlsx

PART = re.compile(r'^PHẦN\s+(I|II|III)\.', re.I)
ABCD = re.compile(r'(?<![A-Za-z])([A-D])\s*[.\)]')
TF = re.compile(r'^\s*([a-d])\s*\)')
SHORT = re.compile(r'^\s*Đáp\s*án\s*:\s*(.*?)\s*$',re.I)
MAX_DOCX=12*1024*1024

@dataclass
class Block:
    number:int
    elements:list
    answer:Any
    warnings:list


def is_question(p):
    return p.style.name == 'List Paragraph' and bool(p._p.xpath('./w:pPr/w:numPr'))


def underlined_label(p, label):
    for r in p.runs:
        if r.underline and re.search(r'(?<![A-Za-z])'+re.escape(label)+r'(?![A-Za-z])',r.text,re.I):
            return True
    return False


def get_abcd(p):
    # The sample stores all A/B/C/D options in one or two paragraphs.
    return {m.group(1) for m in ABCD.finditer(p.text)}


def parse_exam(raw:bytes):
    if len(raw)>MAX_DOCX or not zipfile.is_zipfile(io.BytesIO(raw)):
        raise ValueError('Chỉ nhận file DOCX hợp lệ tối đa 12MB.')
    doc=Document(io.BytesIO(raw))
    paragraphs=doc.paragraphs
    sections={1:{'heading':[],'blocks':[]},2:{'heading':[],'blocks':[]},3:{'heading':[],'blocks':[]}}
    section=0; current=None; before=[]
    for p in paragraphs:
        m=PART.match(p.text.strip())
        if m:
            section={'I':1,'II':2,'III':3}[m.group(1).upper()]
            current=None
            sections[section]['heading'].append(p._p)
            continue
        if section==0:
            before.append(p._p); continue
        # Some Azota Word files have an unnumbered heading for the fourth TF question.
        # Start a new block after a complete four-statement block if new stem text begins.
        completed_tf = (section == 2 and current is not None and
            len([x for x in current.elements if TF.match(x.text)]) == 4)
        new_tf_stem = completed_tf and bool(p.text.strip()) and not TF.match(p.text)
        if is_question(p) or new_tf_stem:
            current=Block(number=len(sections[section]['blocks'])+1,elements=[],answer=None,warnings=[])
            sections[section]['blocks'].append(current)
        if current is None:
            sections[section]['heading'].append(p._p)
        else:
            current.elements.append(p)
    for n,data in sections.items():
        for block in data['blocks']:
            if n==1:
                choices=set(); correct=set()
                for p in block.elements:
                    choices|=get_abcd(p)
                    for label in 'ABCD':
                        if label in get_abcd(p) and underlined_label(p,label): correct.add(label)
                block.answer=next(iter(correct)) if len(correct)==1 else None
                if choices != set('ABCD'):
                    block.warnings.append('Chưa phát hiện đủ A/B/C/D')
                if len(correct)!=1:
                    block.warnings.append('Không nhận diện duy nhất 1 đáp án gạch chân')
            elif n==2:
                statements={}
                for p in block.elements:
                    m=TF.match(p.text)
                    if m:
                        a=m.group(1).lower(); statements[a]='Đ' if underlined_label(p,a+')') else 'S'
                block.answer=[statements.get(x) for x in 'abcd']
                if set(statements)!=set('abcd'):
                    block.warnings.append('Chưa phát hiện đủ 4 ý a/b/c/d')
            else:
                answers=[m.group(1) for p in block.elements if (m:=SHORT.match(p.text.strip()))]
                block.answer=answers[0].replace('.',',') if len(answers)==1 else None
                if len(answers)!=1: block.warnings.append('Không tìm được đúng 1 dòng Đáp án:')
                elif not re.fullmatch(r'-?\d+(?:,\d+)?',block.answer) or len(block.answer)>4:
                    block.warnings.append('Đáp án số chưa hợp lệ với phiếu 4 cột')
    counts={f'part{i}':len(sections[i]['blocks']) for i in (1,2,3)}
    for i,limit in [(1,30),(2,7),(3,6)]:
        if counts[f'part{i}']>limit:raise ValueError(f'Phần {i} có nhiều câu hơn mẫu phiếu ({limit}).')
    warnings=[]
    for i in (1,2,3):
        for b in sections[i]['blocks']:
            warnings.extend(f'Phần {i} câu {b.number}: {w}' for w in b.warnings)
    # Preserve all media and embedded equations in original DOCX; don't imply JSON text contains them.
    objects=sum(len(p._p.xpath('.//w:object')) for p in paragraphs)
    drawings=sum(len(p._p.xpath('.//w:drawing')) for p in paragraphs)
    return doc,sections,before,counts,warnings,objects,drawings


def inspect_word(raw:bytes):
    _,sec,_,counts,warnings,objects,drawings=parse_exam(raw)
    return {'counts':counts,'warnings':warnings,'objects':objects,'drawings':drawings,
      'answers':{f'part{i}':{str(b.number):b.answer for b in sec[i]['blocks']} for i in (1,2,3)},
      'format':'docx-original',
      'note':'Giữ nguyên đối tượng Word; đảo thứ tự câu và phương án A/B/C/D của Phần I. Phần II giữ nguyên thứ tự a/b/c/d.'}


def remove_answer_marker(p):
    # Marks correct options using underline; remove only underlines from option/TF label runs.
    for r in p.runs:
        if r.underline and (ABCD.search(r.text) or TF.match(r.text)):
            r.underline=False



def _option_chunks(block):
    """Collect options as OOXML run fragments; never stringify MathType/OLE objects.

    Reject layouts we cannot separate losslessly instead of producing a wrong key.
    """
    options={}; option_paras=[]
    for para in block.elements:
        if not get_abcd(para):
            continue
        option_paras.append(para)
        active=None
        for child in para._p:
            if child.tag == qn('w:pPr'):
                continue
            visible=''.join(child.xpath('.//w:t/text()'))
            # A/B/C/D can be an isolated underlined run followed by a '. ' run.
            match=re.match(r'^\s*([A-D])(?=[.\)]|\s|$)', visible)
            if match:
                label=match.group(1)
                if label in options:
                    raise ValueError(f'Câu {block.number}: xuất hiện phương án {label} nhiều lần')
                options[label]=[]
                active=label
            if active is None:
                if visible.strip():
                    raise ValueError(f'Câu {block.number}: có nội dung nằm trước nhãn A/B/C/D')
                continue
            options[active].append(copy.deepcopy(child))
    if set(options)!=set('ABCD'):
        raise ValueError(f'Câu {block.number}: không thể phân tách đủ 4 phương án an toàn')
    return options,option_paras


def _make_option_paragraph(source_para, nodes, new_label):
    para=copy.deepcopy(source_para._p)
    for child in list(para):
        if child.tag != qn('w:pPr'):
            para.remove(child)
    first=True
    for node in nodes:
        node=copy.deepcopy(node)
        if first:
            # Remove tabs (often used for column alignment) before a moved label.
            for tab in node.xpath('./w:tab'):
                node.remove(tab)
            textnodes=node.xpath('.//w:t')
            for t in textnodes:
                if t.text and re.match(r'^\s*[A-D]',t.text):
                    t.text=re.sub(r'^(\s*)[A-D]',new_label,t.text,count=1)
                    break
            first=False
        # Remove underlining from the answer option, preventing leaks in printed papers.
        for underline in node.xpath('.//w:rPr/w:u'):
            underline.getparent().remove(underline)
        para.append(node)
    return para


def _mixed_part1_paragraphs(block, permutation):
    """Return OOXML paragraphs and answer after options are rearranged.

    permutation is a list of old labels in the new A,B,C,D order.
    """
    opts,option_paras=_option_chunks(block)
    anchor=option_paras[0]
    output=[]; inserted=False
    for p in block.elements:
        if p in option_paras:
            if not inserted:
                for new_label,old_label in zip('ABCD',permutation):
                    output.append(_make_option_paragraph(anchor,opts[old_label],new_label))
                inserted=True
        else:
            output.append(copy.deepcopy(p._p))
    new_answer='ABCD'[permutation.index(block.answer)]
    return output,new_answer


def make_variants(raw:bytes,count:int=4,start:int=101,seed:int=2026):
    if not 1<=count<=30 or start<1 or start+count-1>999:
        raise ValueError('Số mã đề 1–30; mã đề từ 001–999.')
    doc,sections,before,counts,warnings,_,_=parse_exam(raw)
    if warnings:
        raise ValueError('Phải kiểm tra đáp án trước khi trộn: '+'; '.join(warnings[:6]))
    results=[]; files=[]
    for index in range(count):
        code=f'{start+index:03d}'
        cloned=Document(io.BytesIO(raw))
        body=cloned.element.body
        sectPr=body.sectPr
        for el in list(body):
            if el is not sectPr:body.remove(el)
        order_info={}
        for el in before: body.insert(len(body)-1,copy.deepcopy(el))
        for part in (1,2,3):
            for el in sections[part]['heading']:
                body.insert(len(body)-1,copy.deepcopy(el))
            blocks=sections[part]['blocks'][:]
            order=list(range(len(blocks)))
            random.Random(f'{seed}:{index}:{part}').shuffle(order)
            order_info[f'part{part}']=order
            mixed_answers={}
            for qnum,source_idx in enumerate(order,1):
                src=blocks[source_idx]
                if part==1:
                    permutation=list('ABCD')
                    random.Random(f'{seed}:{index}:{part}:{source_idx}:options').shuffle(permutation)
                    paragraphs,new_answer=_mixed_part1_paragraphs(src,permutation)
                    mixed_answers[str(qnum)]=new_answer
                else:
                    mixed_answers[str(qnum)]=src.answer
                    paragraphs=[]
                    for para in src.elements:
                        if part==3 and (SHORT.match(para.text.strip()) or para.text.strip() in ('Trả lời','Lời giải')):
                            continue
                        cp=copy.deepcopy(para._p)
                        if part==2 and TF.match(para.text):
                            for underline in cp.xpath('.//w:rPr/w:u'):
                                underline.getparent().remove(underline)
                        paragraphs.append(cp)
                for cp in paragraphs:
                    body.insert(len(body)-1,cp)
            order_info[f'part{part}_answers']=mixed_answers
        # Add visible code on top; do not change original OLE/media relationship IDs.
        first=cloned.paragraphs[0]
        pre=first.insert_paragraph_before(f'MÃ ĐỀ: {code}   |   VZOTA')
        try: pre.style='Title'
        except KeyError: pre.style='Normal'
        output=io.BytesIO(); cloned.save(output)
        # Reopen to validate ZIP/XML packaging and docx object model.
        Document(io.BytesIO(output.getvalue()))
        key={'part1':{},'part2':{},'part3':{},'points':{'part1':0.25,'part2':0.25,'part3':0.5},'part2_policy':'progressive','part2_progressive_scores':[0,0.1,0.25,0.5,1]}
        for part in (1,2,3):
            for qnum,source_idx in enumerate(order_info[f'part{part}'],1):
                key[f'part{part}'][str(qnum)]=order_info[f'part{part}_answers'][str(qnum)]
        files.append((f'Vzota_ma_{code}.docx',output.getvalue()))
        results.append((code,key))
    return files,dict(results)


def blocks_lookup(sections,part,idx):
    return sections[part]['blocks'][idx].answer


def export_zip(raw:bytes,count:int,start:int,seed:int):
    files,keys=make_variants(raw,count,start,seed)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in files:z.writestr(name,data)
        z.writestr('Vzota_bo_dap_an.json',json.dumps(keys,ensure_ascii=False,indent=2))
        z.writestr('Vzota_bo_dap_an.xlsx',export_answers_xlsx(keys))
        z.writestr('HUONG_DAN.txt','Dùng Vzota_bo_dap_an.xlsx để nạp đáp án vào tab Chấm hàng loạt; không cần dùng JSON.\nCác mã đề đã trộn thứ tự câu và A/B/C/D của Phần I. Phần II giữ nguyên thứ tự a/b/c/d.\nKiểm tra bản in, hình vẽ, bảng và từng đáp án trước khi phát cho học sinh.\nMẫu phiếu chấm Vzota v17.0.\n')
    return out.getvalue(),keys
