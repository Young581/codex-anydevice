"""Audit exact archive bytes and optionally match an already reviewed SHA-256."""
import argparse
import json
from pathlib import Path
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

from package_policy import audit_archive

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', nargs='?', type=Path)
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    package = json.loads((ROOT / 'package.json').read_text('utf-8'))
    archive = args.archive or ROOT / 'dist' / (package['name'] + '-' + package['version'] + '.vsix')
    report = audit_archive(archive)
    if args.expect_sha256 and (not re.fullmatch('[0-9a-fA-F]{64}', args.expect_sha256) or
                              report['sha256'] != args.expect_sha256.lower()):
        raise ValueError('Archive does not match the reviewed SHA-256')
    report.update({'uploaded': False, 'credentials_accessed': False,
                   'reviewed_hash_matched': args.expect_sha256 is not None})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError) as error:
        print('Release audit failed: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
