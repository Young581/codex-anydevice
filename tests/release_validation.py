"""Release integrity and immutability checks, using synthetic GitHub responses only."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('anydevice_release', ROOT / 'scripts/github-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
spec = importlib.util.spec_from_file_location('anydevice_build', ROOT / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ReleaseTests(unittest.TestCase):
    def test_archive_requires_exact_reviewed_source(self):
        with tempfile.TemporaryDirectory(prefix='anydevice-release-') as temporary:
            output = Path(temporary)
            report = builder.build(output=output)
            archive = output / report['archive']
            self.assertEqual(release.exact_payload(archive)['sha256'], report['sha256'])
            changed = output / 'changed.vsix'
            with zipfile.ZipFile(archive) as source, zipfile.ZipFile(changed, 'w') as target:
                for item in source.infolist():
                    target.writestr(item, source.read(item) + (b'\n' if item.filename == 'extension/README.md' else b''))
            with self.assertRaisesRegex(ValueError, 'differs from reviewed source'):
                release.exact_payload(changed)

    def test_existing_asset_can_never_be_overwritten(self):
        asset = {'name': 'synthetic.vsix', 'digest': 'sha256:' + '0' * 64}
        with patch.object(release.github, 'request', return_value=[asset]), patch.object(release.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(ValueError, 'different bytes'):
                release.upload('synthetic-token', {'id': 1, 'draft': True}, 'synthetic.vsix', b'synthetic', 'application/octet-stream')
            network.assert_not_called()

    def test_published_release_cannot_gain_unreviewed_assets(self):
        with patch.object(release.github, 'request', return_value=[]), patch.object(release.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(ValueError, 'immutable'):
                release.upload('synthetic-token', {'id': 1, 'draft': False}, 'extra', b'synthetic', 'text/plain')
            network.assert_not_called()

    def test_publish_requires_reviewed_hash_and_exact_commit(self):
        with patch.object(release, 'release_identity', return_value=('v0.6.2', 'a' * 40)), \
                patch.object(release, 'tag_commit', return_value='b' * 40), \
                patch.object(release.github, 'request') as network:
            with self.assertRaisesRegex(ValueError, 'matching tag'):
                release.publish('synthetic-token', '0' * 64)
            network.assert_not_called()

    def test_publish_refuses_incomplete_or_wrong_hash_assets(self):
        with patch.object(release, 'release_identity', return_value=('v0.6.2', 'a' * 40)), \
                patch.object(release, 'tag_commit', return_value='a' * 40), \
                patch.object(release.github, 'request', return_value={'id': 1, 'draft': True, 'assets': []}):
            with self.assertRaisesRegex(ValueError, 'incomplete'):
                release.publish('synthetic-token', '0' * 64)

    def test_annotated_tag_resolves_to_exact_commit(self):
        with patch.object(release.github, 'request', side_effect=[{'object': {'type': 'tag', 'sha': 'b' * 40}},
                                                                {'object': {'type': 'commit', 'sha': 'a' * 40}}]):
            self.assertEqual(release.tag_commit('synthetic-token', 'v0.6.2'), 'a' * 40)


if __name__ == '__main__':
    unittest.main()
