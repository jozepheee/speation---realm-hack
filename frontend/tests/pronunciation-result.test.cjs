const {test}=require('node:test'),assert=require('node:assert/strict');
test('story result separates supported differences from unassessed words and unclear audio',async()=>{
 const {pronunciationResult}=await import('../lib/pronunciationResult.js');
 const item={word:'green',expected_phone:'g',produced_phone:'b',category:'substitution'};
 const result=pronunciationResult({state:'tentative_observation',concerns:[item,item,{...item,word:'invented'}]},'This is green.');
 assert.equal(result.state,'practice');assert.equal(result.concerns.length,1);assert.deepEqual(result.unflagged,['this','is']);
 assert.match(result.explanation,/not individually marked correct/);
 assert.equal(pronunciationResult({state:'no_clear_difference',concerns:[]},'This is green.').state,'clear');
 assert.equal(pronunciationResult({state:'insufficient_evidence',concerns:[item]},'This is green.').state,'uncertain');
 assert.equal(pronunciationResult({state:'tentative_observation',concerns:[{...item,category:'uncertain'}]},'This is green.').state,'uncertain');
 assert.equal(pronunciationResult(null,'This is green.').state,'uncertain');
});
