"""Bounded, explicitly simulated group-discussion participants."""
from pydantic import BaseModel, Field, ConfigDict

PARTICIPANTS=[
 {'id':'maya','name':'Maya','role':'Moderator'},
 {'id':'asha','name':'Asha','role':'Practical perspective'},
 {'id':'rohan','name':'Rohan','role':'Questioning perspective'},
 {'id':'neha','name':'Neha','role':'Inclusive perspective'},
]
ROUNDS={
 'en':['Opening views: give your position and one reason.','Respond and develop: address another candidate’s point with an example.','Find common ground: summarise the trade-offs and propose a shared conclusion.'],
 'hi':['शुरुआती विचार: अपना पक्ष और उसका एक कारण बताइए।','प्रतिक्रिया और विस्तार: दूसरे उम्मीदवार की बात का उदाहरण के साथ जवाब दीजिए।','साझा निष्कर्ष: अलग-अलग पक्षों को समेटकर एक साझा समाधान सुझाइए।'],
 'ml':['ആരംഭ നിലപാട്: നിങ്ങളുടെ അഭിപ്രായവും ഒരു കാരണവും പറയൂ.','മറുപടിയും വിശദീകരണവും: മറ്റൊരു സ്ഥാനാർഥിയുടെ അഭിപ്രായത്തോട് ഒരു ഉദാഹരണത്തോടെ പ്രതികരിക്കൂ.','പൊതുധാരണ: വ്യത്യസ്ത നിലപാടുകൾ സംഗ്രഹിച്ച് ഒരു സംയുക്ത പരിഹാരം നിർദേശിക്കൂ.'],
}
RULES=('Simulate a respectful age-16+ group discussion, not a quiz. Maya moderates; '
 'Asha focuses on practical trade-offs, Rohan questions assumptions without being hostile, '
 'and Neha brings an inclusive alternative and builds common ground. Keep their views distinct. '
 'Candidates must engage with each other and the learner’s actual words, not deliver generic monologues. '
 'Never speak for the learner, invent their views, infer their emotion, or claim real people are present. '
 'Use only the selected language. Keep each utterance to one or two short sentences. '
 'No unsupported factual statistics or diagnoses. Give the learner time and a fair invitation to speak. ')


class Voices(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    asha:str=Field(min_length=1,max_length=450)
    rohan:str=Field(min_length=1,max_length=450)
    neha:str=Field(min_length=1,max_length=450)
    maya:str=Field(min_length=1,max_length=450)


class Opening(Voices):
    introduction:str=Field(min_length=1,max_length=450)


def messages(voices,position,batch,speakers=None):
    return [{'id':f'{batch}:{speaker}','speaker':speaker,'text':getattr(voices,speaker),'position':position,'batch':batch}
        for speaker in (speakers or ['asha','rohan','neha','maya'])]


def room(opening,support=None):
    speakers=['asha','maya'] if (support or {}).get('discussion_mode')=='supportive' else None
    return {'version':1,'participants':PARTICIPANTS,'messages':[
        {'id':'opening:introduction','speaker':'maya','text':opening.introduction,'position':0,'batch':'opening'},
        *messages(opening,0,'opening',speakers)]}


def steps(language):
    return [{'kind':'discussion','section':None,'prompt':prompt,'source_text':'','cue':''} for prompt in ROUNDS[language]]
