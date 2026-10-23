// Per-tab reservation lets a reload close its own orphan without closing another tab.
const key=id=>`speation-companion-reservation:${id}`;
const valid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function savedReservation(id){try{const value=window.sessionStorage.getItem(key(id));return valid(value)?value:null;}catch{return null;}}
export function rememberReservation(id,call){try{if(valid(call))window.sessionStorage.setItem(key(id),call);}catch{}}
export function forgetReservation(id,call){try{if(savedReservation(id)===call)window.sessionStorage.removeItem(key(id));}catch{}}
