"""Create/check/apply this repository's declared Beacon baseline using cached Git login."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / '.github' / 'repository-settings.json'


def session(account):
    result = subprocess.run(
        ['git', '-c', 'credential.interactive=never', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\nusername=' + account + '\n\n',
        text=True, encoding='utf-8', capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('No cached GitHub login is available; sign in using Git Credential Manager.')
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    token = fields.get('password')
    if not token:
        raise RuntimeError('Git Credential Manager returned no usable session.')
    return token


def request(token, endpoint, method='GET', body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    call = urllib.request.Request('https://api.github.com' + endpoint, data=data, method=method,
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'codex-anydevice-repository-settings'})
    try:
        with urllib.request.urlopen(call, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        if error.code == 404 and method == 'GET':
            return None
        raise RuntimeError('GitHub API ' + method + ' ' + endpoint + ' failed: HTTP ' + str(error.code)) from None


def inspect(token, base, config):
    repo = request(token, base)
    if repo is None:
        raise RuntimeError('Repository does not exist.')
    # Report only declared public settings, never account/credential responses.
    actual = {'settings': {key: repo.get(key) for key in config['settings']}}
    actual['topics'] = request(token, base + '/topics')['names']
    action_permissions = request(token, base + '/actions/permissions')
    actual['actions_permissions'] = {key: action_permissions.get(key) for key in config['actions_permissions']}
    actual['workflow_permissions'] = request(token, base + '/actions/permissions/workflow')
    actual['private_vulnerability_reporting'] = request(token, base + '/private-vulnerability-reporting')['enabled']
    actual['branch_protection'] = request(token, base + '/branches/main/protection')
    actual['rulesets'] = request(token, base + '/rulesets')
    actual['labels'] = sorted((
        {key: item.get(key) for key in ('name', 'color', 'description')}
        for item in request(token, base + '/labels?per_page=100')
    ), key=lambda item: item['name'])
    desired = {key: config[key] for key in actual}
    desired['labels'] = sorted(desired['labels'], key=lambda item: item['name'])
    differences = {key: {'expected': desired[key], 'actual': actual[key]}
                   for key in desired if actual[key] != desired[key]}
    return {'url': repo['html_url'], 'matches_baseline': not differences, 'differences': differences,
            'settings': actual}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create', action='store_true', help='Create only if this repository does not exist')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--apply', action='store_true')
    group.add_argument('--check', action='store_true')
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text('utf-8'))
    account, name = config['repository'].split('/')
    if config['repository'] != 'Young581/codex-anydevice':
        raise RuntimeError('This tool is scoped to Young581/codex-anydevice.')
    token = session(account)
    if request(token, '/user')['login'].lower() != account.lower():
        raise RuntimeError('Authenticated GitHub account does not match the declared owner.')
    base = '/repos/' + config['repository']
    repo = request(token, base)
    if args.create:
        if repo is not None:
            raise RuntimeError('Repository already exists; refusing to repurpose it.')
        repo = request(token, '/user/repos', 'POST', {
            'name': name, 'private': config['settings']['private'],
            'description': config['settings']['description'], 'auto_init': False})
        print(json.dumps({'created': repo['html_url'], 'private': repo['private']}))
    if repo is None:
        raise RuntimeError('Repository does not exist; use --create for first setup.')
    if repo['private'] != config['settings']['private']:
        raise RuntimeError('Refusing to change visibility of an existing repository.')
    if args.apply:
        settings = dict(config['settings'])
        settings.pop('private')
        if request(token, base + '/branches/main') is None:
            settings.pop('default_branch')
        request(token, base, 'PATCH', settings)
        request(token, base + '/topics', 'PUT', {'names': config['topics']})
        request(token, base + '/actions/permissions', 'PUT', config['actions_permissions'])
        request(token, base + '/actions/permissions/workflow', 'PUT', config['workflow_permissions'])
        reporting = request(token, base + '/private-vulnerability-reporting')['enabled']
        if reporting != config['private_vulnerability_reporting']:
            request(token, base + '/private-vulnerability-reporting',
                    'PUT' if config['private_vulnerability_reporting'] else 'DELETE')
        existing = {label['name']: label for label in request(token, base + '/labels?per_page=100')}
        for label in config['labels']:
            old = existing.get(label['name'])
            if old is None:
                request(token, base + '/labels', 'POST', label)
            elif any(old.get(key) != value for key, value in label.items()):
                endpoint = base + '/labels/' + urllib.parse.quote(label['name'], safe='')
                request(token, endpoint, 'PATCH', {'new_name': label['name'],
                                                 'color': label['color'], 'description': label['description']})
        # Never delete existing labels, branch protections or rulesets to match a baseline.
        # A difference is reported for deliberate review instead.
    report = inspect(token, base, config)
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0 if report['matches_baseline'] else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired, urllib.error.URLError) as error:
        print('Repository setup failed: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
