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
    def test_published_release_lookup_does_not_list_drafts(self):
        entry = {'id': 1, 'tag_name': 'v0.6.3', 'draft': False}
        with patch.object(release.github, 'request', return_value=entry) as network:
            self.assertEqual(release.find_release('synthetic-token', 'v0.6.3'), entry)
            self.assertEqual(network.call_count, 1)

    def test_draft_lookup_falls_back_to_list_and_matches_exact_tag(self):
        entry = {'id': 2, 'tag_name': 'v0.6.3', 'draft': True}
        with patch.object(release.github, 'request', side_effect=[None, [
            {'id': 1, 'tag_name': 'v0.6.2', 'draft': True}, entry]]):
            self.assertEqual(release.find_release('synthetic-token', 'v0.6.3'), entry)

    def test_draft_lookup_pages_and_missing_tag_remains_missing(self):
        full_page = [{'tag_name': 'v0.0.' + str(i)} for i in range(100)]
        with patch.object(release.github, 'request', side_effect=[None, full_page, []]) as network:
            self.assertIsNone(release.find_release('synthetic-token', 'v0.6.3'))
            self.assertTrue(network.call_args.args[1].endswith('page=2'))

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
