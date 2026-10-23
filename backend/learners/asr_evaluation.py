"""Deterministic recognition metrics; never reinterpret ASR WER as pronunciation."""
import re

def words(text):
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",text.casefold().replace('’',"'"))

def errors(reference,hypothesis):
    a,b=words(reference),words(hypothesis)
    previous=[(j,0,0,j) for j in range(len(b)+1)]
    for i,x in enumerate(a,1):
        current=[(i,0,i,0)]
        for j,y in enumerate(b,1):
            if x==y:current.append(previous[j-1]);continue
            substitutions=previous[j-1];deletions=previous[j];insertions=current[-1]
            current.append(min((substitutions[0]+1,substitutions[1]+1,substitutions[2],substitutions[3]),(deletions[0]+1,deletions[1],deletions[2]+1,deletions[3]),(insertions[0]+1,insertions[1],insertions[2],insertions[3]+1)))
        previous=current
    total,s,d,i=previous[-1]
    return {'reference_words':len(a),'errors':total,'substitutions':s,'deletions':d,'insertions':i,'exact_match':a==b}

def report(pairs):
    values=[errors(reference,hypothesis) for reference,hypothesis in pairs]
    n=sum(row['reference_words'] for row in values)
    return {'utterances':len(values),'reference_words':n,'wer':sum(row['errors'] for row in values)/n if n else None,'exact_match_rate':sum(row['exact_match'] for row in values)/len(values) if values else None,**{key:sum(row[key] for row in values) for key in ['substitutions','deletions','insertions']},'clinical_validation':False}
