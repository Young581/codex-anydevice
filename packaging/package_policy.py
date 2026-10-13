"""Explicit payload allowlist and offline validation; no credential access."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

FILES = (
    'package.json', 'package.nls.json', 'package.nls.zh-cn.json',
    'extension/extension.js', 'README.md', 'README.en.md', 'CHANGELOG.md',
    'extension/lib/setup-model.js', 'extension/lib/setup-controller.js',
    'extension/lib/runtime.js', 'extension/lib/strings.js', 'extension/lib/webview.js',
    'extension/assets/setup.js', 'extension/assets/setup.css',
    'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'docs/research.md',
    'docs/architecture.md', 'docs/openclaw-poc.md', 'docs/roadmap.md', 'docs/setup.md',
)
DOCUMENT_ALIASES = {
    'extension/LICENSE.txt': 'extension/LICENSE',
    'extension/readme.md': 'extension/README.md',
    'extension/changelog.md': 'extension/CHANGELOG.md',
}
SECRET_PATTERNS = (
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{20,}'),
    re.compile(rb'sk-[A-Za-z0-9_-]{24,}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'[A-Za-z]:[\\/]Users[\\/](?!Public[\\/]|Default[\\/])[^\s"<>]+', re.I),
)


def safe_relative(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or '\x00' in name:
        raise ValueError('Invalid package path')
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ('', '.', '..') for part in name.split('/')):
        raise ValueError('Package path is not a canonical relative path')
    return name


def scan(data, name):
    for pattern in SECRET_PATTERNS:
        if pattern.search(data):
            raise ValueError('Sensitive content rejected in ' + name)


def validate_manifest(package):
    if package.get('name') != 'codex-anydevice' or package.get('publisher') != 'Young581':
        raise ValueError('Unexpected extension identity')
    if not re.fullmatch(r'\d+\.\d+\.\d+', package.get('version', '')):
        raise ValueError('Invalid extension version')
    if package.get('main') != './extension/extension.js' or package.get('extensionKind') != ['workspace']:
        raise ValueError('Unexpected extension entry or host')
    if package.get('dependencies') or package.get('optionalDependencies'):
        raise ValueError('Offline builder does not support runtime dependencies')
    return package


def collect_reviewed(root):
    root = Path(root).resolve()
    payload = {}
    for relative in FILES:
        safe_relative(relative)
        source = root / relative
        current = root
        for part in PurePosixPath(relative).parts:
            current = current / part
            if current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
                raise ValueError('Links are not allowed in package sources: ' + relative)
        if not source.is_file() or root not in source.resolve().parents:
            raise ValueError('Missing or escaped package source: ' + relative)
        data = source.read_bytes()
        data.decode('utf-8')
        scan(data, relative)
        payload['extension/' + relative] = data
    validate_manifest(json.loads(payload['extension/package.json']))
    return payload


def audit_archive(archive_path):
    archive_path = Path(archive_path)
    raw = archive_path.read_bytes()
    expected = {'extension/' + name for name in FILES}
    expected |= {'extension.vsixmanifest', '[Content_Types].xml'}
    files = {}
    original_names = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for info in archive.infolist():
            safe_relative(info.filename)
            name = DOCUMENT_ALIASES.get(info.filename, info.filename)
            if name in files or any(key.casefold() == name.casefold() for key in files):
                raise ValueError('Duplicate or case-colliding package member')
            if name not in expected or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError('Unexpected package member: ' + info.filename)
            if info.file_size > 4 * 1024 * 1024:
                raise ValueError('Oversized package member')
            data = archive.read(info)
            data.decode('utf-8')
            scan(data, info.filename)
            files[name] = data
            original_names[name] = info.filename
    if set(files) != expected:
        raise ValueError('Package members do not match the exact allowlist')
    package = validate_manifest(json.loads(files['extension/package.json']))
    import xml.etree.ElementTree as ET
    manifest = ET.fromstring(files['extension.vsixmanifest'])
    ns = {'v': 'http://schemas.microsoft.com/developer/vsx-schema/2011'}
    identity = manifest.find('v:Metadata/v:Identity', ns)
    if identity is None or any(identity.get(key) != package[field] for key, field in
                               [('Id', 'name'), ('Publisher', 'publisher'), ('Version', 'version')]):
        raise ValueError('VSIX manifest identity mismatch')
    ET.fromstring(files['[Content_Types].xml'])
    return {
        'archive': archive_path.name,
        'extension': package['publisher'] + '.' + package['name'],
        'version': package['version'],
        'sha256': hashlib.sha256(raw).hexdigest(),
        'files': {original_names[name]: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
    }
