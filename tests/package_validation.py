"""Package boundaries use temporary synthetic files, never a real Codex Home."""
import importlib.util
import json
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'packaging'))
from package_policy import FILES, DOCUMENT_ALIASES, audit_archive, collect_reviewed, safe_relative, scan

spec = importlib.util.spec_from_file_location('anydevice_build', ROOT / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='anydevice-package-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source'
        for name in FILES:
            destination = self.source / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)

    def archive(self):
        builder.build(self.source, self.root / 'output')
        return next((self.root / 'output').glob('*.vsix'))

    def mutate(self, change):
        original = self.archive()
        changed = self.root / 'changed.vsix'
        with zipfile.ZipFile(original) as source, zipfile.ZipFile(changed, 'w') as target:
            for item in source.infolist():
                target.writestr(item, source.read(item))
            change(target)
        return changed

    def test_reproducible_build_excludes_unreviewed_credentials(self):
        (self.source / 'auth.json').write_text('{"synthetic": true}', encoding='utf-8')
        (self.source / 'extra.js').write_text('unreviewed', encoding='utf-8')
        first = builder.build(self.source, self.root / 'a')
        second = builder.build(self.source, self.root / 'b')
        self.assertEqual(first['sha256'], second['sha256'])
        self.assertEqual(len(first['files']), len(FILES) + 2)
        self.assertNotIn('extension/auth.json', first['files'])

    def test_missing_reviewed_source_fails(self):
        (self.source / 'extension/extension.js').unlink()
        with self.assertRaises(ValueError):
            collect_reviewed(self.source)

    def test_symlink_source_rejected(self):
        file = self.source / 'README.md'
        target = self.root / 'outside.md'
        shutil.copyfile(file, target)
        file.unlink()
        try:
            file.symlink_to(target)
        except OSError:
            self.skipTest('Creating symlinks is unavailable for this OS user')
        with self.assertRaises(ValueError):
            collect_reviewed(self.source)

    def test_paths_must_be_canonical(self):
        for name in ('../auth.json', '/auth.json', 'C:/auth.json', 'a\\b', './a', 'a//b', ''):
            with self.subTest(name=name), self.assertRaises(ValueError):
                safe_relative(name)

    def test_secret_and_private_path_content_rejected(self):
        cases = [b'ghp_' + b'A' * 30, b'sk-' + b'B' * 30,
                 b'-----BEGIN PRIVATE KEY-----', b'C:\\Users\\synthetic-user\\project']
        for content in cases:
            with self.subTest(content=content), self.assertRaises(ValueError):
                scan(content, 'synthetic.txt')

    def test_extra_archive_member_rejected(self):
        archive = self.mutate(lambda output: output.writestr('extension/auth.json', '{}'))
        with self.assertRaises(ValueError):
            audit_archive(archive)

    def test_duplicate_archive_member_rejected(self):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            archive = self.mutate(lambda output: output.writestr('extension/package.json', '{}'))
        with self.assertRaises(ValueError):
            audit_archive(archive)

    def test_case_collision_rejected(self):
        archive = self.mutate(lambda output: output.writestr('extension/readme.md', 'collision'))
        with self.assertRaises(ValueError):
            audit_archive(archive)

    def test_zip_symlink_rejected(self):
        def add(output):
            info = zipfile.ZipInfo('extension/symlink')
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            output.writestr(info, '/outside')
        with self.assertRaises(ValueError):
            audit_archive(self.mutate(add))

    def test_official_vsce_document_aliases_accepted(self):
        original = self.archive()
        changed = self.root / 'normalized.vsix'
        aliases = {value: key for key, value in DOCUMENT_ALIASES.items()}
        with zipfile.ZipFile(original) as source, zipfile.ZipFile(changed, 'w') as target:
            for item in source.infolist():
                target.writestr(aliases.get(item.filename, item.filename), source.read(item))
        self.assertEqual(audit_archive(changed)['extension'], 'Young581.codex-anydevice')

    def test_vscodeignore_matches_exact_payload_allowlist(self):
        lines = (ROOT / '.vscodeignore').read_text('utf-8').splitlines()
        self.assertEqual(lines[0], '**')
        self.assertEqual({line[1:] for line in lines if line.startswith('!')}, set(FILES))


if __name__ == '__main__':
    unittest.main()
