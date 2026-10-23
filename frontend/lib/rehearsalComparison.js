export function comparableRehearsal(current,previous){
 const a=current?.report?.comparison_key,b=previous?.report?.comparison_key;
 return Boolean(a&&b&&JSON.stringify(a)===JSON.stringify(b));
}
export function metricChange(before,after){
 return Number.isFinite(before)&&Number.isFinite(after)?Math.round((after-before)*10)/10:null;
}
