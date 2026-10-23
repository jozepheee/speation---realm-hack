export function learningStoryRevision(plan){
 return plan?.revision||JSON.stringify((plan?.targets||[]).map(item=>[item.word,item.recording_ids||[],item.proposal_ids||[]]));
}
export function storyNeedsRefresh(story,plan){
 return !!story&&!!plan&&!plan.pending_observations&&story.plan_revision!==learningStoryRevision(plan);
}
