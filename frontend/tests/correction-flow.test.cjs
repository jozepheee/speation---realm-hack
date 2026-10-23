const {test}=require('node:test');const assert=require('node:assert/strict');
test('corrective readiness needs audio-supported evidence; uncertainty and transcript matches do not qualify',async()=>{
 const {correctionTarget,selfCheckPrompt}=await import('../lib/correctionFlow.js');
 const concern={word:'green',expected_phone:'g',produced_phone:'b',category:'substitution'};
 assert.ok(correctionTarget({state:'tentative_observation',concerns:[concern]},'green'));
 assert.ok(!correctionTarget({state:'insufficient_evidence',concerns:[concern]},'green'));
 assert.ok(!correctionTarget({state:'no_clear_difference',concerns:[]},'green'));
 assert.ok(!correctionTarget({state:'tentative_observation',concerns:[{...concern,category:'uncertain'}]},'green'));
 assert.ok(!correctionTarget({state:'tentative_observation',concerns:[concern]},'blue'));
 assert.match(selfCheckPrompt(8),/Ready/);assert.match(selfCheckPrompt(18),/position/);
});
