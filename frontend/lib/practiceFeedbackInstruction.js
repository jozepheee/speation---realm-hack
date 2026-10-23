import {supportedContrast} from './supportedContrast.js';
// A successful audio attempt ends repetition; a transcript can never supply success.
export function practiceFeedbackInstruction(content,lesson){
 if(content?.assessment_kind==='communication_practice_no_phoneme_grade')return 'Respond briefly to the meaning in summary, accept their own wording, then offer to finish. No pronunciation judgment was made.';
 if(content?.state==='no_clear_difference'&&!content.concerns?.length&&content.word_recognition?.status!=='different_word'){
  if(lesson?.completed||lesson?.stage===1)return 'Say: That sounded clear. You have finished this practice. Do not request another repeat or introduce another target. Offer to end the call.';
  return 'Acknowledge that this attempt sounded clear. Ask: Want to try it in a sentence? Wait for yes or no. Do not ask for another word repeat. If yes, call lesson_action(next). If no, call lesson_action(finish) and finish warmly. This is practice feedback, not mastery.';
 }
 if(lesson?.phase==='offer_break')return 'Do not request another repeat automatically. Say: We have tried a few times. Want to listen another way, or finish for now? Wait for their choice. On finish call lesson_action(finish); on another way call lesson_action(help), use one different short cue and model the word. Unclear audio is not an incorrect pronunciation.';
 if(content?.state==='insufficient_evidence')return 'Say briefly that this audio could not be checked clearly. Model the expected word slowly once. Offer a retry or finish. Do not mark it wrong and do not invent a sound difference.';
 const contrast=supportedContrast(content,content?.teaching_plan?.[0]?.word||content?.concerns?.[0]?.word);
 return (contrast?'Say warmly: '+contrast.speech+' ':'')+'The main screen shows a mouth demonstration. Say warmly: Watch the mouth picture. Listen, then your turn. Model the target word naturally and slowly. Use only one brief child-friendly cue from teaching_plan when it adds help; never make a complex tongue-placement instruction the main explanation, and never call a learner silly. Explain only the supported possible difference, demonstrate the word slowly, then invite one fresh attempt. Do not read IPA symbols as letter names or invent a produced sound. Offer to finish if the learner declines.';
}
