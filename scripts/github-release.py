"""Prepare immutable GitHub release assets, then publish an explicitly reviewed hash."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'packaging'))
from package_policy import audit_archive, collect_reviewed, DOCUMENT_ALIASES

spec = importlib.util.spec_from_file_location('repository_settings', ROOT / 'scripts/github-settings.py')
github = importlib.util.module_from_spec(spec)
spec.loader.exec_module(github)
REPOSITORY = 'Young581/codex-anydevice'
BASE = '/repos/' + REPOSITORY


def release_identity():
    package = json.loads((ROOT / 'package.json').read_text('utf-8'))
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Release version must be numeric major.minor.patch')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Invalid release commit')
    return 'v' + version, commit


def exact_payload(archive):
    report = audit_archive(archive)
    expected = collect_reviewed(ROOT)
    with zipfile.ZipFile(archive) as source:
        actual = {DOCUMENT_ALIASES.get(name, name): source.read(name)
                  for name in source.namelist() if name.startswith('extension/')}
    if actual != expected:
        raise ValueError('Archive payload differs from reviewed source')
    return report


def tag_commit(token, tag):
    ref = github.request(token, BASE + '/git/ref/tags/' + tag)
    if not ref:
        return None
    obj = ref['object']
    if obj['type'] == 'tag':
        obj = github.request(token, BASE + '/git/tags/' + obj['sha'])['object']
    if obj['type'] != 'commit':
        raise ValueError('Tag must resolve directly to a commit')
    return obj['sha']


def upload(token, release, name, data, mime):
    digest = 'sha256:' + hashlib.sha256(data).hexdigest()
    existing = next((asset for asset in github.request(token, BASE + '/releases/' + str(release['id']) + '/assets')
                     if asset['name'] == name), None)
    if existing:
        if existing.get('digest') != digest:
            raise ValueError('Existing release asset has different bytes; publish a new version')
        return
    if not release['draft']:
        raise ValueError('Published release assets are immutable')
    endpoint = 'https://uploads.github.com/repos/' + REPOSITORY + '/releases/' + str(release['id']) + '/assets'
    call = urllib.request.Request(endpoint + '?name=' + urllib.parse.quote(name, safe=''), data=data, method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': mime,
                 'Accept': 'application/vnd.github+json', 'User-Agent': 'codex-anydevice-release'})
    with urllib.request.urlopen(call, timeout=90) as response:
        asset = json.load(response)
    if asset.get('digest') != digest:
        raise ValueError('Uploaded asset digest did not match')


def prepare(token, archive, notes):
    tag, commit = release_identity()
    report = exact_payload(archive)
    previous = tag_commit(token, tag)
    if previous and previous != commit:
        raise ValueError('Version tag belongs to a different commit; bump the version')
    if not previous:
        annotated = github.request(token, BASE + '/git/tags', 'POST',
            {'tag': tag, 'message': 'Codex AnyDevice ' + tag, 'object': commit, 'type': 'commit'})
        github.request(token, BASE + '/git/refs', 'POST', {'ref': 'refs/tags/' + tag, 'sha': annotated['sha']})
    release = github.request(token, BASE + '/releases/tags/' + tag)
    if not release:
        release = github.request(token, BASE + '/releases', 'POST', {'tag_name': tag, 'target_commitish': commit,
            'name': 'Codex AnyDevice ' + tag, 'body': notes.read_text('utf-8'), 'draft': True, 'prerelease': False})
    if release['prerelease']:
        raise ValueError('Existing release has a different publication type')
    archive_name = 'codex-anydevice-' + report['version'] + '.vsix'
    checksum = (report['sha256'] + '  ' + archive_name + '\n').encode('utf-8')
    report.update({'commit': commit, 'tag': tag, 'packager': '@vscode/vsce 4.0.0', 'payloadMatchesSource': True})
    upload(token, release, archive_name, archive.read_bytes(), 'application/octet-stream')
    upload(token, release, archive_name + '.sha256', checksum, 'text/plain')
    upload(token, release, 'release-audit.json', (json.dumps(report, indent=2) + '\n').encode('utf-8'), 'application/json')
    return release


def download_asset(token, release, destination):
    """Keep authentication on api.github.com; never forward it to a signed asset URL."""
    tag, commit = release_identity()
    if tag_commit(token, tag) != commit:
        raise ValueError('Release tag differs from this checkout')
    name = 'codex-anydevice-' + tag[1:] + '.vsix'
    asset = next((item for item in release['assets'] if item['name'] == name), None)
    if not asset:
        raise ValueError('Release package is missing')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    call = urllib.request.Request('https://api.github.com' + BASE + '/releases/assets/' + str(asset['id']),
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/octet-stream',
                 'User-Agent': 'codex-anydevice-release'})
    try:
        with urllib.request.build_opener(NoRedirect).open(call, timeout=60) as response:
            data = response.read()
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise
        redirect = error.headers['Location']
        parsed = urllib.parse.urlsplit(redirect)
        if parsed.scheme != 'https' or not parsed.hostname.endswith('.githubusercontent.com') or parsed.username or parsed.password:
            raise ValueError('Unexpected release asset host') from None
        with urllib.request.urlopen(redirect, timeout=90) as response:
            data = response.read()
    if asset.get('digest') != 'sha256:' + hashlib.sha256(data).hexdigest():
        raise ValueError('Downloaded release asset digest did not match')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return exact_payload(destination)


def publish(token, expected):
    tag, commit = release_identity()
    if not re.fullmatch(r'[0-9a-f]{64}', expected or '') or tag_commit(token, tag) != commit:
        raise ValueError('Publishing requires the exact reviewed SHA-256 and matching tag')
    release = github.request(token, BASE + '/releases/tags/' + tag)
    if not release:
        raise ValueError('Prepare and review the draft release first')
    names = {asset['name']: asset for asset in release['assets']}
    package = 'codex-anydevice-' + tag[1:] + '.vsix'
    if not all(name in names for name in [package, package + '.sha256', 'release-audit.json']):
        raise ValueError('Draft release assets are incomplete')
    if names[package].get('digest') != 'sha256:' + expected:
        raise ValueError('Draft package differs from the reviewed hash')
    if release['draft']:
        release = github.request(token, BASE + '/releases/' + str(release['id']), 'PATCH',
                                 {'draft': False, 'prerelease': False, 'make_latest': 'true'})
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--prepare', type=Path, metavar='VSIX')
    group.add_argument('--download', type=Path, metavar='VSIX')
    group.add_argument('--publish', action='store_true')
    parser.add_argument('--notes', type=Path, default=ROOT / 'docs/release-notes.md')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    import os
    token = os.environ.get('GITHUB_TOKEN') or github.session('Young581')
    if args.prepare:
        result = prepare(token, args.prepare, args.notes)
    elif args.download:
        release = github.request(token, BASE + '/releases/tags/' + release_identity()[0])
        if not release:
            raise ValueError('Release not found')
        report = download_asset(token, release, args.download)
        print(json.dumps({'downloaded': args.download.name, 'sha256': report['sha256']}))
        return
    else:
        result = publish(token, args.expect_sha256)
    print(json.dumps({'url': result['html_url'], 'tag': result['tag_name'], 'draft': result['draft']}))


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print('GitHub release failed: HTTP ' + str(error.code), file=sys.stderr)
        raise SystemExit(1)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print('GitHub release failed: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
