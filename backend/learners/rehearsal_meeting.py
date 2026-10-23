"""Saved interview/presentation meeting context and named question speakers."""
from learners.discussion import PARTICIPANTS

INTRO={
 'en':{'interview':'Welcome. I am Maya, your interviewer. Let us begin.','presentation':'Welcome. Maya and the AI audience are ready. Present your first slide; say next slide when you want to move on.'},
 'hi':{'interview':'नमस्ते। मैं माया, आपकी इंटरव्यू लेने वाली हूँ। शुरू करते हैं।','presentation':'स्वागत है। माया और एआई श्रोता तैयार हैं। अपनी पहली स्लाइड प्रस्तुत करें। आगे बढ़ने के लिए अगली स्लाइड कहें।'},
 'ml':{'interview':'സ്വാഗതം. ഞാൻ മായ, നിങ്ങളുടെ അഭിമുഖം നടത്തുന്നയാൾ. നമുക്ക് തുടങ്ങാം.','presentation':'സ്വാഗതം. മായയും എഐ പ്രേക്ഷകരും തയ്യാറാണ്. ആദ്യ സ്ലൈഡ് അവതരിപ്പിക്കൂ. മുന്നോട്ട് പോകാൻ അടുത്ത സ്ലൈഡ് എന്ന് പറയൂ.'},
}
CLOSING={'en':'Thank you. Your rehearsal is complete. Your feedback and summary are ready.',
 'hi':'धन्यवाद। आपका अभ्यास पूरा हुआ। आपकी प्रतिक्रिया और सारांश तैयार हैं।',
 'ml':'നന്ദി. നിങ്ങളുടെ പരിശീലനം പൂർത്തിയായി. പ്രതികരണവും സംഗ്രഹവും തയ്യാറാണ്.'}


def create(scenario,language,steps,material,display_name=''):
    participants=[{'id':'maya','name':'Maya','role':'Interviewer'}] if scenario=='interview' else [
        {**p,'role':'Moderator' if p['id']=='maya' else 'AI audience'} for p in PARTICIPANTS]
    text=INTRO[language][scenario]
    if scenario=='interview':
        name=' '.join(display_name.split())[:80]
        text=f"Hi {name}. Welcome to your mock interview. I'm Maya, your interviewer. " if name else "Hi. Welcome to your mock interview. I'm Maya, your interviewer. "
        text+=steps[0]['prompt']
    return {'version':1,'participants':participants,'material':material,
        'messages':[{'id':'opening','speaker':'maya','text':text,'batch':'opening','position':0}],
        'question_source':'reviewed_resume' if scenario=='interview' and material else 'goal_and_role' if scenario=='interview' else 'reviewed_slides'}


def question_message(step,position,batch):
    return {'id':batch+':question','speaker':step.get('speaker','maya'),'text':step['prompt'],'position':position,'batch':batch}
