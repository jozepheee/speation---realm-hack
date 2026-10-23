export default function LearningObject({word}){
 const drawings={
 key:<><circle cx="72" cy="73" r="32" fill="none" stroke="#edb52f" strokeWidth="19"/><path d="M95 98l62 62m-22-22 18-18m-3 33 18-18" stroke="#edb52f" strokeWidth="17" strokeLinejoin="round"/></>,
 tea:<><path d="M45 80h105v58q-52 45-105 0z" fill="#65b9c7"/><path d="M150 88q55-5 25 43h-25" stroke="#65b9c7" fill="none" strokeWidth="12"/><path d="M75 57q-15-15 0-30m32 30q-15-15 0-30" stroke="#c4c8ce" fill="none" strokeWidth="6"/></>,
 ring:<><circle cx="100" cy="119" r="42" fill="none" stroke="#e7b43a" strokeWidth="14"/><path d="M65 55l20-24h30l20 24-35 35z" fill="#7bc8e3" stroke="#368fb7" strokeWidth="5"/></>,
 wing:<path d="M35 143Q42 40 172 35q-20 40-65 57 50-8 50 4-28 33-64 32 28 2 28 13-54 36-86 2" fill="#c2a5ed" stroke="#8061ac" strokeWidth="5"/>,
 ship:<><path d="M27 132h150l-28 39H57z" fill="#697db7"/><path d="M100 32v102M93 40 43 117h50M108 55l49 62h-49" fill="#fff" stroke="#695c8e" strokeWidth="6"/><path d="M15 181q20-15 40 0t40 0t40 0t50 0" stroke="#6dbed4" strokeWidth="8" fill="none"/></>,
 sip:<><path d="M66 83h72l-10 87H76z" fill="#efb070"/><path d="M108 128V51l32-17" fill="none" stroke="#815f9f" strokeWidth="9"/><circle cx="58" cy="45" r="22" fill="#e4bb99"/><path d="M74 51l27 5" stroke="#e4bb99" strokeWidth="12"/></>,
 fan:<><path d="M100 108v66M70 177h60" stroke="#688e99" strokeWidth="12"/><circle cx="100" cy="85" r="60" fill="#d9ece8" stroke="#688e99" strokeWidth="5"/>{[0,120,240].map(a=><path key={a} transform={`rotate(${a} 100 85)`} d="M100 85q-48-8-26-45 35-17 26 45" fill="#77b6b0"/>)}<circle cx="100" cy="85" r="10" fill="#466f7c"/></>,
 pan:<><ellipse cx="80" cy="110" rx="55" ry="43" fill="#717d92"/><ellipse cx="80" cy="103" rx="45" ry="31" fill="#aeb8c5"/><path d="M128 95l56-42" stroke="#434f66" strokeWidth="16" strokeLinecap="round"/></>,
 sink:<><path d="M27 108h148l-20 51H49z" fill="#c5e1e7" stroke="#76a4b2" strokeWidth="5"/><path d="M95 105V62q0-37 35-37t30 35" fill="none" stroke="#8fa8b9" strokeWidth="12"/><path d="M160 68v28" stroke="#6dc0e6" strokeWidth="7" strokeDasharray="5 4"/></>,
 think:<><circle cx="70" cy="132" r="36" fill="#e9bc96"/><path d="M49 160l39-9" stroke="#8e638e" strokeWidth="9"/><circle cx="103" cy="91" r="8" fill="#cdb7e6"/><circle cx="118" cy="70" r="12" fill="#cdb7e6"/><ellipse cx="143" cy="43" rx="43" ry="28" fill="#cdb7e6"/><text x="143" y="54" textAnchor="middle" fontSize="36" fill="#70538d">?</text></>,
 goat:<><ellipse cx="91" cy="127" rx="52" ry="32" fill="#ece4ce"/><path d="M55 145v31m54-31v31" stroke="#a7937c" strokeWidth="12"/><path d="M119 110l8-42 35 2 7 48z" fill="#ece4ce"/><path d="M128 71l-13-30m37 28 13-30" stroke="#a7937c" strokeWidth="8"/><circle cx="151" cy="89" r="4" fill="#354345"/><path d="M35 123l-15-14" stroke="#a7937c" strokeWidth="8"/></>,
 boat:<><path d="M27 125h150l-30 44H57z" fill="#dca166"/><path d="M100 31v95M108 42l54 73h-54z" fill="#f3e1ae" stroke="#90745d" strokeWidth="6"/><path d="M15 180q25-15 45 0t45 0t45 0t40 0" stroke="#6bb8d1" strokeWidth="8" fill="none"/></>
 };
 return <svg viewBox="0 0 200 200" role="img" aria-label={word}>{drawings[word]||<text x="100" y="110" textAnchor="middle" fontSize="25">{word}</text>}</svg>;
}
