let learner='unselected';
export function setLearnerScope(id){learner=String(id);}
export function currentLearnerScope(){return learner;}
export function storageKey(name,scope=learner){return `speation:bakery:${scope}:${name}`;}
