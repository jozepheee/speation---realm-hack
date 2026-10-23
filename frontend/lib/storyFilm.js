// A bounded storyboard drives both the visible world and its animated actions.
export const SETTINGS=['park','forest','space','observatory','school','bakery','home','beach','city'];
export const CHARACTERS=['maya','friend','astronaut','teacher','robot','bird','dog','cat','rabbit','dragon'];
export const OBJECTS=['star_map','saturn','telescope','map','ball','key','book','cake','flower','rocket','tree','star','boat','branch','water','door','basket','seed','bridge','moon','sun'];
export const ACTIONS=['enter','walk','look','open','discover','point','fly','give','plant','celebrate'];
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
export const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};

export function storyFilmPlan(scene={},title=''){
 const visual=scene.visual||{},text=`${scene.narration||''} ${scene.sentence||''}`.toLowerCase();
 let setting=SETTINGS.includes(visual.setting)?visual.setting:null;
 // Repair old saved scenes and model-supplied scenery which contradicts the story.
 if(/observator|telescope|star map/.test(text))setting='observatory';
 else if(/\b(space|saturn|astronaut|orbit|planet)\b/.test(text))setting='space';
 else if(/\b(bakery|baker|oven)\b/.test(text))setting='bakery';
 else if(/\b(forest|woods)\b/.test(text))setting='forest';
 else if(/\b(beach|ocean|seashore)\b/.test(text))setting='beach';
 else if(/\b(classroom|school)\b/.test(text))setting='school';
 setting ||= 'home';
 const aliases={star_map:/star map/,saturn:/saturn/,telescope:/telescope|observator/,map:/\bmap\b/,ball:/\bball\b/,key:/\bkey\b/,book:/\bbook\b/,cake:/\bcake\b/,flower:/\bflower\b/,rocket:/\brocket\b/,tree:/\btree\b/,star:/\bstar[s]?\b|blinking point|glowing mark/,boat:/\bboat\b/,branch:/\bbranch\b/,water:/\bwater\b/,door:/\bdoor\b|locked/,basket:/\bbasket\b/,seed:/\bseed\b/,bridge:/\bbridge\b/,moon:/\bmoon\b/,sun:/\bsun\b/};
 const mentioned=OBJECTS.filter(name=>aliases[name]?.test(text));
 let objects=mentioned.length?mentioned:(visual.objects||[]).filter(name=>OBJECTS.includes(name));
 if(setting==='observatory')objects=[...new Set(['star_map','telescope',...objects])];
 if(objects.includes('star_map'))objects=objects.filter(name=>name!=='map');
 let characters=CHARACTERS.filter(name=>new RegExp(`\\b${name}\\b`).test(text));
 if(!characters.length)characters=(visual.characters||[]).filter(name=>CHARACTERS.includes(name));
 if(!characters.length)characters=[setting==='space'?'astronaut':'maya'];
 if(characters.length===1&&characters[0]==='bird')characters.unshift('maya');
 const supplied=visual.shots?.filter(shot=>ACTIONS.includes(shot.action)&&(!shot.focus||objects.includes(shot.focus))&&['wide','medium','detail','sky'].includes(shot.camera));
 let shots=supplied?.length>=3?supplied:null;
 if(!shots){
  const openingDoor=objects.includes('door')&&/\b(open|opens|opened|unlock|unlocks|unlocked)\b/.test(text);
  const focal=openingDoor?'door':objects.find(name=>['star_map','map','key','book','cake','seed','ball','rocket','boat'].includes(name))||objects[0]||null;
  const sentences=(scene.narration||'').match(/[^.!?]+[.!?]?/g)?.map(x=>x.trim()).filter(Boolean)||[];
  shots=[
   {action:'enter',camera:'wide',focus:null},
   {action:openingDoor||objects.includes('star_map')||objects.includes('book')||objects.includes('map')?'open':'discover',camera:'medium',focus:focal},
   {action:objects.includes('star')||objects.includes('saturn')?'discover':objects.includes('seed')&&/\bplant\w*\b/.test(text)?'plant':/\b(fly|flies|flew|flying|flap)\b/.test(text)?'fly':'look',camera:objects.includes('saturn')?'sky':'detail',focus:objects.includes('saturn')?'saturn':objects.includes('star')?'star':focal},
   {action:/\b(point|notice|blink|glow|look)\w*\b/.test(text)?'point':/\b(celebrat|cheer|happy|smile)\w*\b/.test(text)?'celebrate':'look',camera:'wide',focus:objects.includes('saturn')?'saturn':focal},
  ].map((shot,i)=>({...shot,line:sentences[i]||''}));
 }
 return {setting,characters:characters.slice(0,3),objects:objects.slice(0,8),shots:shots.slice(0,6),narration:scene.narration||'',title};
}

export function filmFrame(plan,progress){
 const position=clamp(progress)*plan.shots.length,index=Math.min(plan.shots.length-1,Math.floor(position));
 return {...plan.shots[index],index,progress:progress>=1?1:position-index,totalProgress:clamp(progress)};
}

export function narrationProgress(media,alignment,plan){
 if(!media||!Number.isFinite(media.duration)||media.duration<=0)return 0;
 // Provider character alignment is preferred when available; otherwise the audio clock controls the cut timing.
 const ends=alignment?.character_end_times_seconds;
 const end=Array.isArray(ends)&&Number.isFinite(ends.at(-1))?Math.max(ends.at(-1),.1):media.duration;
 const raw=clamp(media.currentTime/end);
 if(!plan?.shots.every(shot=>shot.line?.trim()))return raw;
 let offset=0;
 const weights=plan.shots.map(shot=>shot.line.length);
 const total=weights.reduce((a,b)=>a+b,0);
 const boundaries=plan.shots.map((shot,i)=>{
  offset+=shot.line.length+(i?1:0);
  return Array.isArray(ends)&&ends.length>=plan.narration.length&&Number.isFinite(ends[offset-1])?ends[offset-1]:end*weights.slice(0,i+1).reduce((a,b)=>a+b,0)/total;
 });
 const current=media.currentTime;
 const index=boundaries.findIndex(bound=>current<bound);
 if(index<0)return 1;
 const start=index?boundaries[index-1]:0;
 return (index+clamp((current-start)/(boundaries[index]-start||1)))/plan.shots.length;
}
