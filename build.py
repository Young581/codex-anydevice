"""Build the dependency-free development extension offline using reviewed files."""
import argparse
import json
from pathlib import Path, PurePosixPath
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'packaging'))
from package_policy import audit_archive, collect_reviewed


def xml_assets(package, payload):
    ns = 'http://schemas.microsoft.com/developer/vsx-schema/2011'
    manifest = ET.Element('PackageManifest', Version='2.0.0', xmlns=ns)
    metadata = ET.SubElement(manifest, 'Metadata')
    ET.SubElement(metadata, 'Identity', Language='en-US', Id=package['name'],
                  Version=package['version'], Publisher=package['publisher'])
    ET.SubElement(metadata, 'DisplayName').text = package['displayName']
    ET.SubElement(metadata, 'Description').text = package['description']
    ET.SubElement(metadata, 'Tags').text = ','.join(package['keywords'])
    ET.SubElement(metadata, 'Categories').text = ','.join(package['categories'])
    ET.SubElement(metadata, 'GalleryFlags').text = 'Public,Preview'
    ET.SubElement(metadata, 'License').text = 'extension/LICENSE'
    properties = ET.SubElement(metadata, 'Properties')
    for name, value in {
        'Microsoft.VisualStudio.Code.Engine': package['engines']['vscode'],
        'Microsoft.VisualStudio.Code.ExtensionKind': ','.join(package['extensionKind']),
        'Microsoft.VisualStudio.Code.ExecutesCode': 'true',
        'Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown': 'true',
        'Microsoft.VisualStudio.Services.Content.Pricing': 'Free',
        'Microsoft.VisualStudio.Services.Links.Source': package['repository']['url'],
        'Microsoft.VisualStudio.Services.Links.Support': package['bugs']['url'],
    }.items():
        ET.SubElement(properties, 'Property', Id=name, Value=value)
    ET.SubElement(ET.SubElement(manifest, 'Installation'), 'InstallationTarget', Id='Microsoft.VisualStudio.Code')
    ET.SubElement(manifest, 'Dependencies')
    assets = ET.SubElement(manifest, 'Assets')
    for asset_type, name in {
        'Microsoft.VisualStudio.Code.Manifest': 'extension/package.json',
        'Microsoft.VisualStudio.Services.Content.Details': 'extension/README.md',
        'Microsoft.VisualStudio.Services.Content.Changelog': 'extension/CHANGELOG.md',
        'Microsoft.VisualStudio.Services.Content.License': 'extension/LICENSE',
    }.items():
        ET.SubElement(assets, 'Asset', Type=asset_type, Path=name, Addressable='true')
    types = ET.Element('Types', xmlns='http://schemas.openxmlformats.org/package/2006/content-types')
    for suffix in sorted({PurePosixPath(name).suffix.lstrip('.') for name in payload} | {'vsixmanifest'}):
        if suffix:
            mime = {'json': 'application/json', 'js': 'application/javascript', 'md': 'text/markdown', 'css': 'text/css',
                    'vsixmanifest': 'text/xml'}.get(suffix, 'text/plain')
            ET.SubElement(types, 'Default', Extension=suffix, ContentType=mime)
    ET.SubElement(types, 'Override', PartName='/extension/LICENSE', ContentType='text/plain')
    return {
        'extension.vsixmanifest': ET.tostring(manifest, encoding='utf-8', xml_declaration=True),
        '[Content_Types].xml': ET.tostring(types, encoding='utf-8', xml_declaration=True),
    }


def build(source=ROOT, output=None):
    payload = collect_reviewed(source)
    package = json.loads(payload['extension/package.json'])
    payload.update(xml_assets(package, payload))
    output = Path(output or ROOT / 'dist')
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / (package['name'] + '-' + package['version'] + '.vsix')
    with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    report = audit_archive(archive_path)
    archive_path.with_suffix('.vsix.sha256').write_text(
        report['sha256'] + '  ' + archive_path.name + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    try:
        print(json.dumps(build(output=args.output), indent=2))
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError) as error:
        print('Build failed: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
