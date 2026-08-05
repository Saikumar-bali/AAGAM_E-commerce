#!/usr/bin/env python3
import base64
import hashlib
import zlib
from pathlib import Path

parts_dir = Path(__file__).with_name('issue203-parts')
parts = sorted(parts_dir.glob('part*.txt'), key=lambda path: int(path.stem.removeprefix('part')))
if len(parts) != 7:
    raise RuntimeError(f'Expected 7 payload parts, found {len(parts)}')
payload = ''.join(path.read_text(encoding='utf-8').strip() for path in parts)
if hashlib.sha256(payload.encode('ascii')).hexdigest() != '3ac18c45fe013186600860e4e19594365912f4bc636749e7a5514bc10bdcd797':
    raise RuntimeError('Issue 203 payload checksum mismatch')
source = zlib.decompress(base64.b64decode(payload)).decode('utf-8')
if hashlib.sha256(source.encode('utf-8')).hexdigest() != 'db895a5d746da2f7ff0984ed594c17a35e8256c247b4d04a2c6e31c7677871e8':
    raise RuntimeError('Issue 203 source checksum mismatch')
exec(compile(source, '<issue-203-fix>', 'exec'))
