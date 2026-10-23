const {test}=require('node:test'),assert=require('node:assert/strict');
test('listening uses selected contrasts and never becomes a pronunciation grade',async()=>{
 const {pairForTarget,listeningSummary,LISTENING_PAIRS}=await import('../lib/learningActivities.js');
 assert.equal(pairForTarget(' Key ').id,'k-t');assert.equal(pairForTarget('assessment'),null);
 assert.equal(new Set(LISTENING_PAIRS.map(pair=>pair.id)).size,LISTENING_PAIRS.length);
 assert.deepEqual(listeningSummary([{correct:true},{correct:false},{correct:true},{correct:true}]),{completed:true,correct:3,total:4,kind:'listening_choices',speech_accuracy:null});
 assert.equal(listeningSummary([]).completed,false);
});

test('a supported sound contrast selects a real picture pair even when the word is not in the bank',async()=>{
 const {pairForTarget}=await import('../lib/learningActivities.js');
 assert.equal(pairForTarget('green','ɡ','b').id,'g-b');
 assert.equal(pairForTarget('green'),null);
 assert.equal(pairForTarget('sun','s','ʃ').id,'s-sh');
});
