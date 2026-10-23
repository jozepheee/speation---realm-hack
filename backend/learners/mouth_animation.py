"""Local, bounded Rhubarb cues for generated English audio, never learner diagnosis."""
import base64,json,subprocess,tempfile,threading
from pathlib import Path
from config import settings
from fluency.audio import decode_audio
_capacity=threading.BoundedSemaphore(2)

def cues(encoded):
 binary=Path(settings.RHUBARB_PATH) if settings.RHUBARB_PATH else None
 if not binary or not binary.is_file():return None
 if not _capacity.acquire(blocking=False):return None
 try:
  from learners.care_router import playback_wav
  wave=decode_audio(base64.b64decode(encoded,validate=True))
  if len(wave)>16000*25:return None
  with tempfile.TemporaryDirectory(prefix='speation-mouth-') as folder:
   audio=Path(folder)/'speech.wav';audio.write_bytes(playback_wav(wave))
   result=subprocess.run([str(binary),'-f','json','-r','phonetic','--threads','1',str(audio)],capture_output=True,timeout=5,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   rows=json.loads(result.stdout).get('mouthCues',[])
  if len(rows)>2000 or any(not isinstance(r,dict) or r.get('value') not in set('ABCDEFGHX') or not 0<=r['start']<r['end']<=26 for r in rows):return None
  return {'source':'rhubarb_generated_audio','mouthCues':rows}
 except (ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError):return None
 finally:_capacity.release()
