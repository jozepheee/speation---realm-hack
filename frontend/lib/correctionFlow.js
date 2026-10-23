export function correctionTarget(content,word){
 return content?.state==='tentative_observation'&&content.concerns?.some(item=>item.word?.toLowerCase()===word?.toLowerCase()&&item.expected_phone&&item.category!=='uncertain');
}
export function selfCheckPrompt(age){return age>=16?'Does your tongue or lip position match the demonstration?':'Ready to try it like the picture?';}
