"""Local process health file; contains operational timestamps, never patient data."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import time

JOBS = ('audio-deletion', 'provider-deletion', 'call-expiration', 'call-finalization', 'graph-delivery', 'rehearsal-sounds')


def save(path, states):
    target = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                    prefix=target.name + '.', delete=False) as handle:
        temporary = Path(handle.name)
        json.dump({'jobs': states}, handle)
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def inspect(path, now=None, max_age=600):
    now = time.time() if now is None else now
    try:
        jobs = json.loads(Path(path).read_text(encoding='utf-8'))['jobs']
        if not isinstance(jobs, dict):
            raise ValueError('Invalid jobs state')
        healthy = {name: isinstance(jobs.get(name), dict) and jobs[name].get('ok') is True
            and isinstance(jobs[name].get('completed_at'), (int, float))
            and 0 <= now - jobs[name]['completed_at'] <= max_age for name in JOBS}
    except (OSError, ValueError, KeyError, TypeError):
        healthy = {name: False for name in JOBS}
    return {'healthy': all(healthy.values()), 'jobs': healthy}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path')
    args = parser.parse_args()
    report = inspect(args.path)
    print(json.dumps(report))
    raise SystemExit(0 if report['healthy'] else 1)
