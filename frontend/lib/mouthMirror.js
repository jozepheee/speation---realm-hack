// Visible geometry only. This does not decide whether a sound was correct.
export function mouthMirrorObservation(result){
 const sample=result?.exercise;
 if(!sample?.valid)return null;
 const opening=result.oral?.lip_opening_ratio;
 if(!Number.isFinite(opening)||opening<0||opening>2)return null;
 const shapes=sample.shape_scores||{};
 const values=[shapes.mouthPucker,shapes.mouthFunnel].filter(Number.isFinite);
 return {opening,closure:opening<.035,rounding:values.length?Math.max(0,Math.min(1,Math.max(...values))):null};
}
