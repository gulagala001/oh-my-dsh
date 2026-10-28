"""Freeze a single-pass hard/easy order using only public task instructions."""
import hashlib
import json
import re
import tomllib
from pathlib import Path


def schedule(root):
    root = Path(root)
    dataset = json.loads((root / 'config/dataset.json').read_text())
    rows = []
    for item in dataset:
        task = root / 'upstream/deep-swe/tasks' / item['id']
        instruction = (task / 'instruction.md').read_bytes()
        if hashlib.sha256(instruction).hexdigest() != item['instruction_sha256']:
            raise ValueError('Public instruction changed: ' + item['id'])
        meta = tomllib.loads((task / 'task.toml').read_text())['metadata']
        text = instruction.decode()
        words = len(re.findall(r'\S+', text))
        requirements = len(re.findall(r'^\s*(?:[-*]|\d+[.)])\s+', text, re.M))
        feature = meta.get('category') == 'feature_request'
        rows.append({'id': item['id'], 'title': meta.get('display_title', item['id']),
                     'language': item['language'], 'score': words + 80 * requirements + 250 * feature,
                     'words': words, 'requirements': requirements, 'feature': feature,
                     'instruction_sha256': item['instruction_sha256']})
    ranked = sorted(rows, key=lambda r: (r['score'], r['id']))
    ordered = []
    while ranked:
        hard = ranked.pop()
        hard['difficulty'] = '预估较难'
        ordered.append(hard)
        if ranked:
            easy = ranked.pop(0)
            easy['difficulty'] = '预估较易'
            ordered.append(easy)
    for i, row in enumerate(ordered, 1):
        row['position'] = i
    result = {'version': 1, 'attempts': 1, 'retries': 0,
              'method': '仅公开题面：词数 + 80×条目数 + 250×新功能；最高/最低交替，难度为相对预估，非官方标签。',
              'tasks': ordered}
    path = root / 'config/order.json'
    if path.exists():
        if json.loads(path.read_text()) != result:
            raise ValueError('Frozen order no longer matches the public task inputs')
    else:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result
