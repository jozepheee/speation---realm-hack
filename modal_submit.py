"""Submit training to the deployed Modal app and exit without waiting."""
import json
from datetime import datetime, timezone
from pathlib import Path
import modal

if __name__ == '__main__':
    function = modal.Function.from_name('neuronudge-training-v3', 'train')
    call = function.spawn('train')
    record = {'function_call_id': call.object_id,
              'submitted_at': datetime.now(timezone.utc).isoformat()}
    target = Path(__file__).parent / 'artifacts' / 'modal-job.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(record, indent=2))
    print(json.dumps(record))
