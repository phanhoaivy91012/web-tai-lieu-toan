"""Deterministic variants and per-code keys for Vzota v17.0 form."""
from __future__ import annotations

import copy
import random
from typing import Any


class MixError(ValueError):
    pass


def create_variants(bank: dict[str,Any], count: int=3, seed: int=2026,
                    starting_code: int=1) -> list[dict[str,Any]]:
    if not isinstance(bank,dict):
        raise MixError('Ngân hàng câu hỏi phải là đối tượng JSON.')
    if not isinstance(count,int) or not 1 <= count <= 100:
        raise MixError('Số mã đề cần trong khoảng 1–100.')
    if starting_code < 1 or starting_code+count-1 > 999:
        raise MixError('Mã đề phải là số từ 001 đến 999.')
    sections={s:bank.get(s,[]) for s in ('part1','part2','part3')}
    for name,limit in [('part1',30),('part2',7),('part3',6)]:
        if not isinstance(sections[name],list) or len(sections[name])>limit:
            raise MixError(f'{name} vượt quá giới hạn {limit} câu của phiếu này.')
    variants=[]
    for i in range(count):
        rng=random.Random(f'{seed}:{i}')
        questions=copy.deepcopy(sections)
        for section in questions.values():rng.shuffle(section)
        key={'part1':{},'part2':{},'part3':{},
             'points':copy.deepcopy(bank.get('points',{'part1':1,'part2':0.25,'part3':1})),
             'part2_policy':bank.get('part2_policy','per_statement')}
        for n,q in enumerate(questions['part1'],1):
            options=q.get('options',{})
            if not isinstance(options,dict) or not all(k in options for k in 'ABCD'):
                raise MixError('Phần I: mỗi câu phải có options A, B, C, D.')
            correct=q.get('correct')
            if correct not in ('A','B','C','D'):raise MixError('Phần I: correct phải là A, B, C hoặc D.')
            order=list('ABCD')
            rng.shuffle(order)
            source=[(old,options[old]) for old in order]
            q['options']={new:text for new,(_,text) in zip('ABCD',source)}
            key['part1'][str(n)]='ABCD'[order.index(correct)]
            q.pop('correct',None)
            q['number']=n
        for n,q in enumerate(questions['part2'],1):
            statements=q.get('statements',[])
            if not isinstance(statements,list) or len(statements)!=4:
                raise MixError('Phần II: mỗi câu phải có đúng 4 mệnh đề.')
            answers=[]
            for st in statements:
                if st.get('correct') not in (True,False):
                    raise MixError('Phần II: correct phải là true hoặc false.')
                answers.append('Đ' if st['correct'] else 'S')
                st.pop('correct',None)
            key['part2'][str(n)]=answers
            q['number']=n
        for n,q in enumerate(questions['part3'],1):
            if 'answer' not in q:raise MixError('Phần III: thiếu answer.')
            answer=str(q.pop('answer')).replace('.',',')
            if len(answer)>4 or any(c not in '-,0123456789' for c in answer):
                raise MixError('Đáp án phần III phải viết được trong 4 cột dấu/số của mẫu phiếu.')
            if answer.count('-')>1 or ('-' in answer and not answer.startswith('-')):
                raise MixError('Phần III: dấu âm không đúng vị trí.')
            if answer.count(',')>1 or (',' in answer and answer.index(',') not in (1,2)):
                raise MixError('Phần III: dấu phẩy chỉ có ở cột thứ 2 hoặc 3.')
            key['part3'][str(n)]=answer
            q['number']=n
        variants.append({'exam_code':f'{starting_code+i:03d}',
                         'title':str(bank.get('title','Đề thi Vzota')),
                         'questions':questions,'answer_key':key})
    return variants
