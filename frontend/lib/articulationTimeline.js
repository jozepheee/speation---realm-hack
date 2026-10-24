// Authored teaching movements. No spelling guesses and no exact word lip-sync claim.
export function phaseAt(stages,seconds){let start=0;for(let i=0;i<stages.length;i++){const end=start+stages[i].seconds;if(seconds<end||i===stages.length-1)return {index:i,progress:Math.max(0,Math.min(1,(seconds-start)/stages[i].seconds))};start=end;}return {index:0,progress:0};}
export function movementFrame(movement,progress,active=true){
 const x=Math.max(0,Math.min(1,progress)),hold=x<.25?x/.25:x<.72?1:(1-x)/.28,a=active?Math.max(0,hold):0;
 const out={opening:18,rounding:0,teeth:false,air:false,nasal:false,voice:false,back:0,front:0,curl:0,contact:false};
 if(!active||!movement)return out;
 if(movement.startsWith('closure')){out.opening=18*(1-a);out.nasal=movement==='closure_hold';}
 if(['round','round_air','glide_round'].includes(movement)){out.rounding=a;out.opening=20;}
 if(['spread','spread_short','glide_spread'].includes(movement)){out.opening=movement==='glide_spread'?30-15*x:12;out.rounding=-a;}
 if(['open','open_wide'].includes(movement))out.opening=18+a*(movement==='open_wide'?24:12);
 if(['teeth','approach'].includes(movement)){out.teeth=true;out.opening=movement==='teeth'?8:13;}
 if(movement.startsWith('back')){out.back=a;out.contact=true;out.nasal=movement==='back_hold';}
 if(movement.startsWith('front')){out.front=a;out.contact=true;out.nasal=movement==='front_hold';}
 if(movement.startsWith('retroflex')){out.curl=a;out.contact=movement==='retroflex_contact';}
 if(movement==='bunched'){out.back=a*.55;out.curl=a*.45;}
 if(movement==='dental')out.front=a*.75;
 out.air=['air','round_air','teeth'].includes(movement);return out;
}
export function tonguePath(frame){const {back:b,front:f,curl:c}=frame;return `M65 204 Q${55+35*b} ${185-70*b} 119 ${185-135*b} Q155 ${177-55*b} 203 ${181-9*b} Q${255-18*c} ${177-45*c} ${312-45*c-20*f} ${190-105*f-52*c} L310 222 Q170 239 65 219Z`;}
export function playbackKey(plan){return `${plan.language}:${plan.word}:${plan.sound}:${plan.version}:${plan.cache_key}`;}
