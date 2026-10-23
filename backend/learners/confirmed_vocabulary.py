"""Remember owner-confirmed interpretations, never use them as pronunciation evidence."""
import unicodedata
from difflib import SequenceMatcher

def normalize(text):
 return ' '.join(''.join(c.casefold() if unicodedata.category(c)[0] in 'LMN' or c in "'’" else ' ' for c in unicodedata.normalize('NFC',text or '')).split())

def remembered_candidates(heard,rows):
 target=normalize(heard)
 if not target:return []
 candidates=[]
 for original,confirmed in rows:
  source=normalize(original)
  # Short phrases require exact matches. Never collapse negation or numbers.
  exact=source==target
  similar=len(target.split())>=4 and SequenceMatcher(None,target,source).ratio()>=.94
  protected=lambda value:{w for w in value.split() if w in {'no','not','never',"don't","can't","won't"} or any(c.isdigit() for c in w)}
  if source and confirmed and (exact or similar and protected(source)==protected(target)) and confirmed not in candidates:candidates.append(confirmed)
 return candidates[:2]
