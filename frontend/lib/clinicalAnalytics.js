function activityDays(data){
 const saved=new Map(data.timeline.map(day=>[day.date,day.counts]));
 if(!data.period_start||!data.period_end)return data.timeline;
 const days=[];
 for(let date=new Date(data.period_start+'T12:00:00Z');date.toISOString().slice(0,10)<data.period_end;date.setUTCDate(date.getUTCDate()+1)){
  const key=date.toISOString().slice(0,10);
  if(data.truncated&&!saved.has(key))continue;
  days.push({date:key,counts:saved.get(key)||Object.fromEntries(Object.keys(data.totals).map(kind=>[kind,0]))});
 }
 return days;
}
function activityComparison(data){
 const total=Object.values(data.totals).reduce((a,b)=>a+b,0);
 const previous=data.previous_totals?Object.values(data.previous_totals).reduce((a,b)=>a+b,0):null;
 return {total,previous,change:previous===null||data.truncated?null:total-previous,
  activeDays:data.timeline.filter(day=>Object.values(day.counts).some(n=>n>0)).length};
}
module.exports={activityDays,activityComparison};
