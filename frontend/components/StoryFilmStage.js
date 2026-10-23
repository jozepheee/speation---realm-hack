import {useId} from 'react';
import {ease} from '../lib/storyFilm';

function Person({kind,x,y,time,action,progress}){
 const walk=action==='enter'||action==='walk',step=walk?Math.sin(progress*Math.PI*8)*18:0;
 const pointing=action==='point',working=['open','discover','plant','give'].includes(action);
 const suit=kind==='astronaut',robot=kind==='robot',skin='#f1ba95',shirt=suit?'#edf1fc':robot?'#81cbd7':kind==='teacher'?'#d3a166':'#8b76d3';
 const blink=Math.sin(time*1.3)>.995;
 return <g transform={`translate(${x} ${y+(walk?Math.abs(step)*.14:Math.sin(time*1.8)*1.5)})`}>
  <ellipse cx="0" cy="150" rx="64" ry="12" fill="#17254c" opacity=".18"/>
  <g transform={`rotate(${step} -22 78)`}><path d="M-22 73V132" stroke="#3b4771" strokeWidth="24" strokeLinecap="round"/><path d="M-36 138H-12" stroke="#f5d080" strokeWidth="20" strokeLinecap="round"/></g>
  <g transform={`rotate(${-step} 22 78)`}><path d="M22 73V132" stroke="#3b4771" strokeWidth="24" strokeLinecap="round"/><path d="M17 138H42" stroke="#f5d080" strokeWidth="20" strokeLinecap="round"/></g>
  <path d="M-43 6Q0 -10 43 6L49 85Q0 103 -49 85Z" fill={shirt}/>
  <g transform={`rotate(${walk?-step:8} -39 17)`}><path d="M-39 17L-63 64" stroke={shirt} strokeWidth="22" strokeLinecap="round"/><circle cx="-64" cy="70" r="12" fill={skin}/></g>
  <g transform={`rotate(${pointing?-118:working?-55:walk?step:-7} 40 17)`}><path d="M40 17L65 62" stroke={shirt} strokeWidth="22" strokeLinecap="round"/><circle cx="66" cy="68" r="12" fill={skin}/>{pointing&&<path d="M65 69L66 91" stroke={skin} strokeWidth="8" strokeLinecap="round"/>}</g>
  <g transform={`rotate(${working?8:pointing?-10:Math.sin(time)*2} 0 -45)`}>
   <path d="M-55 -53Q-65 -129 1 -132Q69 -129 55 -44L52 17H-54Z" fill={suit?'#c6d4ed':robot?'#397885':'#3e3557'}/>
   {robot?<rect x="-49" y="-100" width="98" height="91" rx="25" fill="#9bdee2"/>:<ellipse cx="0" cy="-63" rx="48" ry="55" fill={skin}/>}
   {!suit&&!robot&&<path d="M-49 -70Q-51 -129 2 -125Q57 -119 47 -68L29 -95L11 -80L-7 -101L-36 -72Z" fill="#3e3557"/>}
   <g fill="#333353"><ellipse cx="-17" cy="-63" rx="5" ry={blink?1:7}/><ellipse cx="18" cy="-63" rx="5" ry={blink?1:7}/></g>
   <path d="M-12 -36Q0 -25 14 -36" fill="none" stroke="#a45e69" strokeWidth="4" strokeLinecap="round"/>
   <ellipse cx="-30" cy="-42" rx="9" ry="5" fill="#e9969d" opacity=".6"/><ellipse cx="30" cy="-42" rx="9" ry="5" fill="#e9969d" opacity=".6"/>
   {suit&&<circle cy="-65" r="64" fill="#b8e8ff" fillOpacity=".12" stroke="#f5f5ff" strokeWidth="12"/>}
  </g>
  {robot&&<><path d="M0 -133V-157" stroke="#9bdee2" strokeWidth="7"/><circle cy="-163" r="10" fill="#ffd16c"/></>}
 </g>;
}

function Animal({kind,x,y,time,action,progress}){
 const bird=kind==='bird',fly=action==='fly'&&bird,hop=fly?Math.sin(progress*Math.PI)*100:Math.sin(time*2)*3;
 const color=bird?'#4bbcc1':kind==='dragon'?'#91c46f':kind==='cat'?'#e8a574':'#c0a0df';
 return <g transform={`translate(${x+(fly?progress*140:0)} ${y-hop})`}>
  <ellipse cy="75" rx="55" ry="10" fill="#203651" opacity=".15"/>
  {!bird&&<><path d="M-30 20L-42 65M29 22L40 65" stroke={color} strokeWidth="19" strokeLinecap="round"/>{kind==='rabbit'?<g fill={color}><ellipse cx="-25" cy="-99" rx="12" ry="42"/><ellipse cx="25" cy="-99" rx="12" ry="42"/></g>:<path d="M-43 -50L-49 -95L-13 -66M16 -67L49 -95L43 -49" fill={color}/>}</>}
  <ellipse cy="3" rx="48" ry="55" fill={color}/><circle cy="-37" r="49" fill={color}/>
  <g transform={`rotate(${bird?Math.sin(time*12)*(fly?50:15):0} -20 3)`}><ellipse cx="-30" cy="5" rx="35" ry="16" fill={bird?'#327f9c':color}/></g>
  <circle cx="17" cy="-44" r="5" fill="#253656"/><circle cx="-14" cy="-44" r="5" fill="#253656"/>
  {bird?<path d="M4 -25L30 -17L4 -9Z" fill="#ffd47b"/>:<path d="M-7 -24Q0 -12 9 -24" fill="none" stroke="#6c526a" strokeWidth="4"/>}
 </g>;
}

function Prop({kind,x,y,time,action,progress}){
 const star=<path d="M0 -37L11 -11L39 -10L18 9L24 37L0 22L-24 37L-18 9L-39 -10L-11 -11Z" fill="#ffdf79"/>;
 if(kind==='star_map'||kind==='map'||kind==='book')return <g transform={`translate(${x} ${y})`}>
  <path d="M-111 18H111L125 48H-125Z" fill="#735e86"/><path d="M-94 47V113M94 47V113" stroke="#735e86" strokeWidth="15"/>
  <g transform={`scale(${action==='open'?.2+.8*ease(progress):1} 1)`}><path d="M-112 -80Q-52 -96 0 -68Q52 -96 112 -80V15Q53 -1 0 23Q-53 -1 -112 15Z" fill={kind==='book'?'#b2c8ea':'#e9d6a4'} stroke="#a88964" strokeWidth="4"/>
   <path d="M0 -68V23M-83 -47L-51 -14L-28 -49L28 -13L65 -48L93 -25" fill="none" stroke={kind==='star_map'?'#7b68b7':'#b3996e'} strokeWidth="3"/>
   {kind==='star_map'&&[-80,-28,28,80].map((cx,i)=><circle key={cx} cx={cx} cy={i%2?-15:-48} r={i===2?6:4} fill={i===2?'#fff8a6':'#7b68b7'}/>)}
   <text y="-58" textAnchor="middle" fontSize="12" fill="#665683">{kind==='star_map'?'STAR MAP':kind.toUpperCase()}</text>
  </g></g>;
 if(kind==='telescope')return <g transform={`translate(${x} ${y}) rotate(-24)`}><path d="M0 28L-56 133M0 28L66 135M0 28L7 145" stroke="#8e98b1" strokeWidth="9"/><rect x="-29" y="-103" width="58" height="134" rx="14" fill="#9faff0" stroke="#596fa5" strokeWidth="5"/><ellipse cy="-104" rx="36" ry="15" fill="#4e416d"/><ellipse cy="-107" rx="25" ry="9" fill="#81d9e4"/><rect x="-45" y="6" width="36" height="18" rx="6" fill="#f4cc77"/></g>;
 if(kind==='saturn')return <g transform={`translate(${x} ${y}) rotate(-18)`}><circle r="69" fill="#dfb18e"/><path d="M-61 -28Q0 -9 61 -28M-68 1Q0 20 68 1M-57 35Q0 46 57 35" stroke="#b88c9a" strokeWidth="9" fill="none"/><ellipse rx="114" ry="25" fill="none" stroke="#f7d1a0" strokeWidth="12"/><circle cx="111" cy="-57" r={7+(Math.sin(time*5)+1)*5} fill="#fff1a7" opacity={.3+(Math.sin(time*5)+1)*.35}/></g>;
 if(kind==='star')return <g transform={`translate(${x} ${y}) scale(${.85+Math.sin(time*4)*.15})`} opacity={.65+Math.sin(time*4)*.3}>{star}</g>;
 if(kind==='moon'||kind==='sun')return <g transform={`translate(${x} ${y})`}><circle r="47" fill={kind==='moon'?'#d9e2fb':'#ffd66c'}/>{kind==='moon'&&<g fill="#b5bfdc"><circle cx="-13" cy="-10" r="12"/><circle cx="18" cy="16" r="8"/></g>}</g>;
 if(kind==='rocket')return <g transform={`translate(${x} ${y-(action==='fly'?progress*160:Math.sin(time*2)*8)})`}><path d="M-24 42L0 -89L24 42Z" fill="#f6f4ff"/><path d="M-24 12L-51 63L-15 48M24 12L51 63L15 48" fill="#e5858c"/><circle cy="-20" r="17" fill="#80cfdc"/><path d={`M-13 46L0 ${80+Math.sin(time*12)*17}L13 46Z`} fill="#ffc665"/></g>;
 if(kind==='door')return <g transform={`translate(${x} ${y})`}><rect x="-60" y="-140" width="120" height="180" rx="28" fill="#473b68"/><g transform={`scale(${action==='open'?1-ease(progress)*.85:1} 1)`}><rect x="-52" y="-132" width="104" height="170" rx="23" fill="#b38d70"/><circle cx="31" cy="-35" r="7" fill="#ffe295"/></g></g>;
 if(kind==='key')return <g transform={`translate(${x} ${y+Math.sin(time*2)*5}) rotate(-25)`}><circle cx="-22" cy="-16" r="25" fill="none" stroke="#ffce64" strokeWidth="13"/><path d="M-4 4L49 60M26 38L41 24M43 55L57 41" stroke="#ffce64" strokeWidth="12"/></g>;
 if(kind==='tree'||kind==='branch')return <g transform={`translate(${x} ${y}) rotate(${Math.sin(time)*1.5})`}><path d={kind==='tree'?'M0 80V-120':'M-100 30L110 -6M-40 20L-70 -30M28 4L48 -48'} stroke="#8b6e69" strokeWidth={kind==='tree'?22:13} strokeLinecap="round"/>{(kind==='tree'?[[-40,-100],[40,-100],[0,-155]]:[[-70,-30],[48,-48],[108,-8]]).map(([cx,cy])=><ellipse key={cx} cx={cx} cy={cy} rx={kind==='tree'?64:30} ry={kind==='tree'?58:15} fill="#70af80"/>)}</g>;
 if(kind==='flower'||kind==='seed')return <g transform={`translate(${x} ${y}) scale(${kind==='seed'&&action==='plant'?.3+progress*.7:1})`}><path d="M0 50V-35" stroke="#68a776" strokeWidth="10"/><ellipse cx="-15" cy="20" rx="20" ry="9" fill="#68a776"/>{Array.from({length:7},(_,i)=><ellipse key={i} cx="0" cy="-52" rx="13" ry="26" fill="#ffd46e" transform={`rotate(${i*360/7} 0 -28)`}/>)}<circle cy="-28" r="19" fill="#af765b"/></g>;
 if(kind==='cake')return <g transform={`translate(${x} ${y})`}><ellipse cy="37" rx="89" ry="15" fill="#d7c3e6"/><rect x="-66" y="-52" width="132" height="88" rx="15" fill="#eaa5b8"/><path d="M-66 -27Q-43 -4 -23 -26Q0 -3 23 -26Q43 -4 66 -27V-52H-66Z" fill="#fff0d8"/><path d="M0 -53V-92" stroke="#8b79cb" strokeWidth="9"/><ellipse cy="-105" rx="8" ry="14" fill="#ffd16c"/></g>;
 if(kind==='ball')return <g transform={`translate(${x+Math.sin(time)*15} ${y-Math.abs(Math.sin(time*2))*25}) rotate(${time*18})`}><circle r="48" fill="#eee9fa" stroke="#8a79b0" strokeWidth="4"/><path d="M0 -25L25 -7L15 22H-15L-25 -7Z" fill="#7c70a1"/></g>;
 if(kind==='boat')return <g transform={`translate(${x} ${y}) rotate(${Math.sin(time*2)*3})`}><path d="M-90 13H90L51 64H-52Z" fill="#ae7b69"/><path d="M-2 15V-113L72 -9H4" fill="#f9d588" stroke="#8f7083" strokeWidth="5"/></g>;
 if(kind==='water')return <g transform={`translate(${x} ${y})`} fill="none" stroke="#70bed1" strokeWidth="8">{[0,22,44].map(d=><path key={d} d={`M-100 ${d}Q-65 ${d-17} -30 ${d}T40 ${d}T110 ${d}`}/>)}</g>;
 if(kind==='basket')return <g transform={`translate(${x} ${y})`}><path d="M-55 -20Q0 -118 55 -20" stroke="#aa7d61" strokeWidth="12" fill="none"/><path d="M-70 -15H70L51 55H-51Z" fill="#d6a872"/><path d="M-35 -12L-28 53M0 -12V53M35 -12L28 53M-61 18H61" stroke="#ae7f5e" strokeWidth="6"/></g>;
 if(kind==='bridge')return <g transform={`translate(${x} ${y})`}><path d="M-125 48Q0 -95 125 48" fill="none" stroke="#a88975" strokeWidth="25"/><path d="M-125 8Q0 -130 125 8M-125 8V80M125 8V80" fill="none" stroke="#7a6475" strokeWidth="9"/></g>;
 return null;
}

export default function StoryFilmStage({plan,frame,time=0,reducedMotion=false}){
 const id=useId().replaceAll(':',''),space=['space','observatory'].includes(plan.setting),inside=['home','school','bakery'].includes(plan.setting),t=reducedMotion?0:time;
 const action=frame.action,p=reducedMotion?(frame.progress>.5?1:0):frame.progress;
 const focus=frame.focus,focusPoint=focus==='saturn'||focus==='star'?[990,205]:[685,430];
 const zoom=frame.camera==='detail'?1.65:frame.camera==='sky'?1.5:frame.camera==='medium'?1.18:1;
 const z=reducedMotion?1:1+(zoom-1)*ease(Math.min(1,p*4));const [cx,cy]=reducedMotion?[640,360]:frame.camera==='sky'?focusPoint:frame.camera==='detail'?focusPoint:[640,360];
 const actorX=action==='enter'&&!reducedMotion?100+ease(p)*240:340;
 const positions={saturn:[985,205],star:[1110,140],telescope:[1030,430],star_map:[680,475],map:[680,475],book:[680,475],branch:[850,470],tree:[1120,470],door:[980,455],moon:[1000,160],sun:[1080,130],water:[900,545],bridge:[930,530],rocket:[910,410],boat:[950,500]};
 return <svg lang="en" translate="no" viewBox="0 0 1280 720" role="img" aria-label={`${plan.setting} animated scene: ${plan.narration}`} data-setting={plan.setting} data-action={action}>
  <defs><linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor={space?'#171c48':inside?'#f4d7bb':'#b4ddea'}/><stop offset="1" stopColor={space?'#66558c':inside?'#f7e9ce':'#f5ecd6'}/></linearGradient><radialGradient id={`${id}-glow`}><stop stopColor="#ffecc2" stopOpacity=".6"/><stop offset="1" stopColor="#ffecc2" stopOpacity="0"/></radialGradient></defs>
  <rect width="1280" height="720" fill={`url(#${id}-sky)`}/>
  <g transform={`translate(${640-cx*z} ${360-cy*z}) scale(${z})`}>
   {space?<>
    {Array.from({length:46},(_,i)=><circle key={i} cx={(i*151+63)%1280} cy={(i*79+20)%420} r={i%7===0?3:1.5} fill="#f9e5bc" opacity={.35+(Math.sin(t+i)+1)*.28}/>)}
    {plan.setting==='observatory'&&<><path d="M-10 450V130Q640 -270 1290 130V450M60 390V155Q640 -100 1220 155V390" fill="none" stroke="#756087" strokeWidth="70"/><path d="M220 0L330 420M640 -30V420M1060 0L950 420" stroke="#756087" strokeWidth="16"/><path d="M0 458H1280V720H0Z" fill="#3c3b68"/><path d="M0 505H1280M230 458L80 720M1045 458L1200 720" stroke="#555074" strokeWidth="3"/><circle cx="680" cy="450" r="220" fill={`url(#${id}-glow)`}/></>}
    {plan.setting==='space'&&<><ellipse cx="620" cy="760" rx="820" ry="310" fill="#9185b5"/><ellipse cx="990" cy="590" rx="115" ry="27" fill="#7f72a3"/><ellipse cx="160" cy="600" rx="140" ry="32" fill="#7f72a3"/></>}
   </>:inside?<>
    <path d="M0 465H1280V720H0Z" fill="#ccab91"/><path d="M0 477H1280M0 590H1280M210 465L85 720M1060 465L1190 720" stroke="#b79083" strokeWidth="3"/>
    <rect x="95" y="80" width="220" height="250" rx="85" fill="#a8d1e4" stroke="#fff3df" strokeWidth="20"/><path d="M205 85V327M99 207H311" stroke="#fff3df" strokeWidth="9"/>
    {plan.setting==='school'&&<g><rect x="475" y="84" width="390" height="180" rx="12" fill="#466e69" stroke="#ae8c77" strokeWidth="15"/><text x="670" y="174" textAnchor="middle" fill="#e6e5c8" fontSize="36">Our next adventure</text></g>}
    {plan.setting==='bakery'&&<g><path d="M445 92H1150V130H445Z" fill="#b18c77"/>{[530,760,980].map(x=><g key={x}><rect x={x} y="23" width="115" height="68" rx="18" fill="#f4e4c5"/><path d={`M${x+24} 48H${x+92}`} stroke="#d6ad9a" strokeWidth="10"/></g>)}<rect x="980" y="220" width="205" height="235" rx="28" fill="#d2bac9"/><rect x="1005" y="262" width="155" height="120" rx="15" fill="#68566f"/></g>}
   </>:<>
    <circle cx="1090" cy="110" r="55" fill="#ffe3a2"/>
    <g fill="#fff9ed" opacity=".7" transform={`translate(${Math.sin(t*.2)*16} 0)`}><ellipse cx="210" cy="100" rx="110" ry="28"/><ellipse cx="770" cy="80" rx="85" ry="23"/></g>
    <path d="M0 415Q190 285 410 400T820 390T1280 380V720H0Z" fill={plan.setting==='beach'?'#7bc7d4':'#85b396'}/><path d="M0 520Q420 355 720 520T1280 475V720H0Z" fill={plan.setting==='beach'?'#f1dca9':'#c4d9ac'}/>
    {plan.setting==='city'&&[30,210,910,1090].map((x,i)=><g key={x}><rect x={x} y={215-i%2*60} width="150" height="240" rx="14" fill={i%2?'#c59cb3':'#9faacb'}/>{[0,1,2].map(k=><rect key={k} x={x+27} y={245+k*59-i%2*60} width="90" height="25" rx="5" fill="#f6e2b7"/>)}</g>)}
    {plan.setting==='forest'&&[70,180,1130,1250].map(x=><Prop key={x} kind="tree" x={x} y={400} time={t}/>)}
   </>}
   {plan.objects.map((kind,i)=>{const [x,y]=positions[kind]||[650+(i%3)*175,490+(i%2)*35];return <Prop key={kind} kind={kind} x={x} y={y} time={t} action={focus===kind?action:kind==='star'||kind==='saturn'?action:'look'} progress={p}/>;})}
   {plan.characters.map((kind,i)=>['bird','dog','cat','rabbit','dragon'].includes(kind)?<Animal key={kind+i} kind={kind} x={kind==='bird'&&plan.objects.includes('branch')?850:820+i*120} y={kind==='bird'&&plan.objects.includes('branch')?380:480} time={t} action={action} progress={p}/>:<Person key={kind+i} kind={kind} x={actorX+i*170} y={420} time={t} action={action} progress={p}/>)}
   {action==='discover'&&focus&&<circle cx={focusPoint[0]} cy={focusPoint[1]} r={95+Math.sin(t*3)*8} fill="none" stroke="#fff1b7" strokeWidth="3" opacity=".7" strokeDasharray="7 12"/>}
   {action==='celebrate'&&Array.from({length:14},(_,i)=><path key={i} d={`M${320+Math.cos(i)*120*p} ${330-Math.sin(i)*130*p}l6 12`} stroke={i%2?'#f2ba80':'#ab92df'} strokeWidth="5" opacity={1-p*.5}/>)}
  </g>
  <path d="M0 0H1280V25H0ZM0 695H1280V720H0Z" fill="#191c37"/>
 </svg>;
}
