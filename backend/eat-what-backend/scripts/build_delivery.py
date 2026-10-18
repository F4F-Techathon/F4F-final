"""Build separate source/docs archives from an explicit, credential-free inventory."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.now(timezone(timedelta(hours=8)))
LABEL = NOW.strftime('%Y-%m-%d')
STAGE = ROOT / 'artifacts' / ('delivery-' + NOW.strftime('%Y%m%d-%H%M%S-%f'))
CODE = STAGE / 'eat-what-backend'
DOCS = STAGE / '交接文档'
SKIP = {'__pycache__', '.git', '.venv', 'node_modules'}


def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def git(repository, *args):
    result = subprocess.run(['git', '-c', 'safe.directory=' + repository.resolve().as_posix(),
                             '-C', str(repository), *args], check=True, stdout=subprocess.PIPE)
    return result.stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    CODE.mkdir(parents=True)
    DOCS.mkdir(parents=True)
    for directory in ('server', 'scripts', 'tests', 'web', 'voices', 'deploy'):
        for source in (ROOT / directory).rglob('*'):
            if not source.is_file() or any(part in SKIP for part in source.relative_to(ROOT).parts):
                continue
            if source.suffix in {'.pyc', '.pyo', '.log', '.pid', '.sqlite3'}:
                continue
            if source.suffix.lower() in {'.md', '.rst'}:
                copy(source, DOCS / '附录' / source.relative_to(ROOT))
            else:
                copy(source, CODE / source.relative_to(ROOT))
    for source in (ROOT / 'data/latest').glob('*.csv'):
        copy(source, CODE / source.relative_to(ROOT))
    for name in ('data/restaurants.json', 'data/brand_characters.json', '.env.example', '.gitignore'):
        copy(ROOT / name, CODE / name)
    for source in ROOT.iterdir():
        if source.is_file() and (source.name.startswith('requirements') or source.name.startswith('constraints-')
                                 or source.suffix in {'.cmd', '.ps1'}):
            copy(source, CODE / source.name)
        if source.is_file() and source.suffix.lower() == '.md':
            copy(source, DOCS / '历史与详细说明' / source.name)
    copy(ROOT / 'handoff/frontend/README.md', DOCS / '00-前端交接说明.md')
    copy(ROOT / 'handoff/后端部署.md', DOCS / '01-后端部署.md')
    copy(ROOT / 'handoff/后端实现索引.md', DOCS / '02-后端实现索引.md')
    for source in (ROOT / 'handoff').glob('*.md'):
        if source.name not in {'后端部署.md', '后端实现索引.md'}:
            copy(source, DOCS / '历史与详细说明/handoff' / source.name)

    # Vendor the exact installed source, including its initialized submodule.
    vendor = ROOT / 'runtime/CosyVoice'
    vendor_files = git(vendor, 'ls-files', '--recurse-submodules', '-z').decode('utf-8').split('\0')
    for relative in vendor_files:
        if not relative or '.github' in Path(relative).parts:
            continue
        source = vendor / relative
        if source.is_file():
            copy(source, CODE / 'runtime/CosyVoice' / relative)
    versions = {'CosyVoice': git(vendor, 'rev-parse', 'HEAD').decode().strip(),
                'Matcha-TTS': git(vendor / 'third_party/Matcha-TTS', 'rev-parse', 'HEAD').decode().strip()}
    config = CODE / 'config'
    config.mkdir()
    copy(ROOT / 'artifacts/current-agent-prompts.json', config / 'agent-prompts.snapshot.json')
    model_manifest = vendor / 'pretrained_models/Fun-CosyVoice3-0.5B/download-manifest.json'
    if model_manifest.exists():
        copy(model_manifest, config / 'cosyvoice-model-manifest.json')
    packages = sorted({(d.metadata['Name'], d.version) for d in importlib.metadata.distributions() if d.metadata['Name']})
    (config / 'python311-installed.txt').write_text('\n'.join(f'{n}=={v}' for n, v in packages) + '\n', encoding='utf-8')
    (config / 'components.json').write_text(json.dumps(versions, indent=2), encoding='utf-8')
    for directory in ('artifacts', 'runtime/logs', 'runtime/tmp'):
        folder = CODE / directory
        folder.mkdir(parents=True, exist_ok=True)
        (folder / '.gitkeep').write_text('', encoding='utf-8')
    (CODE / 'DELIVERY.json').write_text(json.dumps({
        'createdAt': NOW.isoformat(), 'main': 'python scripts/run_backend.py',
        'check': 'python scripts/run_backend.py --check', 'dependencies': 'requirements-handoff.txt',
        'documentationArchive': f'吃啥-交接文档-{LABEL}.zip', 'personaVersion': 'persona-v11',
        'businessSchema': '由前端确定，后端适配；快照不是前端必须采用的业务类型',
        'excluded': ['credentials', 'virtual environments', 'model weights', 'caches', 'session database', 'local logs'],
        'vendorCommits': versions}, ensure_ascii=False, indent=2), encoding='utf-8')

    # Never print or write credential values. Audit exact local credentials too.
    secrets = []
    env = ROOT / '.env.local'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                value = value.strip().strip('\"\'')
                if re.search(r'(?:KEY|SECRET|TOKEN)$', key.strip()) and len(value) >= 16:
                    secrets.append(value.encode())
    for tree in (CODE, DOCS):
        for path in tree.rglob('*'):
            if not path.is_file():
                continue
            relative = path.relative_to(tree)
            if path.name in {'.env', '.env.local'} or path.suffix in {'.sqlite', '.sqlite3', '.db', '.pyc', '.pid', '.log'}:
                raise RuntimeError('Forbidden file: ' + str(relative))
            contents = path.read_bytes()
            if any(value in contents for value in secrets):
                raise RuntimeError('Local credential found in: ' + str(relative))
    for tree in (CODE, DOCS):
        manifest = {p.relative_to(tree).as_posix(): {'bytes': p.stat().st_size, 'sha256': digest(p)}
                    for p in sorted(tree.rglob('*')) if p.is_file()}
        (tree / 'MANIFEST.sha256.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    output = {}
    for tree, name in ((CODE, f'吃啥-完整后端源码-{LABEL}.zip'), (DOCS, f'吃啥-交接文档-{LABEL}.zip')):
        archive = ROOT / 'artifacts' / name
        files = [p for p in sorted(tree.rglob('*')) if p.is_file()]
        with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
            for path in files:
                z.write(path, (Path(tree.name) / path.relative_to(tree)).as_posix())
        with ZipFile(archive) as z:
            assert z.testzip() is None
        output[tree.name] = {'archive': str(archive), 'bytes': archive.stat().st_size, 'files': len(files), 'sha256': digest(archive)}
    result = {'stage': str(STAGE), 'packages': output, 'credentialsExcluded': True}
    (ROOT / 'artifacts/delivery-latest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
