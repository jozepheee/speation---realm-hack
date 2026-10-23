"""Acquire original HiACC metadata/archive with bounds and integrity verification.

Run --download to fetch the archive. No extraction or training is implied.
The original paper and repository differ on licensing; preserve the provenance.
"""
import argparse
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from pathlib import Path
from urllib.request import urlopen, Request

RECORD = "https://zenodo.org/api/records/15551669"


def acquire_range(url, start, end, directory):
    """Keep each bounded range separate until complete; interrupted runs resume."""
    path = directory / f'Corpus.range-{start}-{end}'
    expected = end - start + 1
    if path.exists() and path.stat().st_size == expected:
        return path
    for attempt in range(4):
        try:
            request = Request(url, headers={'Range': f'bytes={start}-{end}', 'Accept-Encoding': 'identity'})
            with urlopen(request, timeout=60) as response, path.open('wb') as stream:
                if response.status != 206 or response.headers.get('Content-Range', '').split('/')[0] != f'bytes {start}-{end}':
                    raise RuntimeError('Server did not honor the verified range request')
                received = 0
                while chunk := response.read(min(1024 * 1024, expected - received + 1)):
                    received += len(chunk)
                    if received > expected:
                        raise RuntimeError('Download exceeded its range')
                    stream.write(chunk)
                if received != expected:
                    raise OSError('Incomplete range')
            return path
        except (HTTPError, URLError, OSError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def main(download=False):
    destination = Path(__file__).resolve().parents[2] / "data" / "hiacc"
    destination.mkdir(parents=True, exist_ok=True)
    with urlopen(RECORD, timeout=40) as response:
        metadata = json.load(response)
    (destination / "source_metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    files = [item for item in metadata.get("files", []) if item["key"] == "Corpus.zip"]
    if len(files) != 1:
        raise RuntimeError("Original archive could not be identified")
    archive = files[0]
    if archive["size"] > 2 * 1024 ** 3:
        raise RuntimeError("Archive exceeds the acquisition budget")
    print(f"Original metadata saved; archive size {archive['size']} bytes; declared license {metadata['metadata'].get('license')}")
    if not download:
        return
    output = destination / "Corpus.zip"
    if output.exists():
        checksum = hashlib.md5(output.read_bytes()).hexdigest()
        if f"md5:{checksum}" == archive["checksum"]:
            print("Existing archive checksum verified")
            return
        raise RuntimeError("Existing archive does not match published checksum; preserved for inspection")
    partial = output.with_suffix(".zip.partial")
    size = partial.stat().st_size if partial.exists() else 0
    if size > archive["size"]:
        raise RuntimeError("Existing partial archive exceeds the declared size")
    with ThreadPoolExecutor(max_workers=4) as executor:
        while size < archive['size']:
            ranges = [(start, min(start + 8 * 1024 * 1024 - 1, archive['size'] - 1))
                for start in range(size, min(size + 32 * 1024 * 1024, archive['size']), 8 * 1024 * 1024)]
            futures = [executor.submit(acquire_range, archive['links']['self'], start, end, destination) for start, end in ranges]
            for (start, end), future in zip(ranges, futures):
                path = future.result()
                with partial.open('ab') as stream:
                    stream.write(path.read_bytes())
                    stream.flush()
                size = end + 1
                path.unlink()
                print(f"Downloaded {size}/{archive['size']} bytes", flush=True)
    digest = hashlib.md5()
    with partial.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if size != archive["size"] or f"md5:{digest.hexdigest()}" != archive["checksum"]:
        raise RuntimeError("Archive verification failed; partial file preserved")
    partial.replace(output)
    print("Original HiACC archive downloaded and checksum verified; no training has run")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    main(parser.parse_args().download)
