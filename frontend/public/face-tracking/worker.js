/* Same-origin assets; camera images never leave this worker/browser. */
importScripts('./vision_bundle.js', './expression-tracker.js', './exercise-vision.js');
let detector;
let exerciseId=null, tongueHue=null;
let calibrationRegion=null,calibrationFrameAt=0;
const tongueCalibration=new ExerciseVision.TongueCalibration();
const mouthReference=new ExerciseVision.MouthReference();
const exerciseCanvas=new OffscreenCanvas(320,240),exerciseContext=exerciseCanvas.getContext('2d',{willReadFrequently:true});
const tracker = new FaceExpressions.ExpressionTracker();
const sample = new OffscreenCanvas(32, 32);
const sampleContext = sample.getContext('2d', { willReadFrequently: true });
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      exerciseId=data.exerciseId||null;
      const files = await Vision.FilesetResolver.forVisionTasks(new URL('./wasm', self.location.href).href);
      detector = await Vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./face_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } else if(data.type==='exercise'){exerciseId=data.exerciseId;
    } else if (data.type === 'calibrate') {
      if(!exerciseId?.startsWith('tongue')||!calibrationRegion||Date.now()-calibrationFrameAt>1000)return;
      const {x,y,width,height}=calibrationRegion,px=Math.round(data.x*320),py=Math.round(data.y*240);
      if(!Number.isFinite(px)||!Number.isFinite(py)||px<x||px>=x+width||py<y||py>=y+height)return;
      const hue=ExerciseVision.calibrationHue(exerciseContext.getImageData(px,py,1,1).data);
      if(hue!==null)tongueHue=hue;
    } else if (data.type === 'reset') tracker.reset();
    else if (data.type === 'frame') {
      calibrationRegion=null;
      if (!detector) throw new Error('Tracker not ready');
      const result = detector.detectForVideo(data.frame, data.timestamp);
      // Face-region lighting, rather than the potentially dark background.
      const face = result.faceLandmarks[0];
      let luminance = 128;
      if (face?.length) {
        const xs = face.map(p => p.x), ys = face.map(p => p.y);
        const x = Math.max(0, Math.min(...xs)) * data.frame.width;
        const y = Math.max(0, Math.min(...ys)) * data.frame.height;
        const width = Math.max(1, Math.min(data.frame.width - x, (Math.max(...xs) - Math.min(...xs)) * data.frame.width));
        const height = Math.max(1, Math.min(data.frame.height - y, (Math.max(...ys) - Math.min(...ys)) * data.frame.height));
        sampleContext.drawImage(data.frame, x, y, width, height, 0, 0, 32, 32);
        const pixels = sampleContext.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        luminance = sum / (pixels.length / 4);
      }
      const observation = tracker.update(result, data.timestamp, luminance);
      if(exerciseId&&observation.status==='tracking'&&face?.[415]){
        const metrics=ExerciseVision.geometry(face,data.frame.width,data.frame.height);
        const shapes=Object.fromEntries((result.faceBlendshapes?.[0]?.categories||[]).filter(item=>['mouthFunnel','mouthPucker','mouthSmileLeft','mouthSmileRight','mouthStretchLeft','mouthStretchRight'].includes(item.categoryName)).map(item=>[item.categoryName,item.score]));
        observation.exercise={valid:true,ratio:metrics.ratio,center:metrics.center,contours:metrics.contours,shape_scores:shapes,calibrated:tongueHue!==null,tongue:null,calibration_status:'show_tongue'};
        if(exerciseId.startsWith('tongue')){
          const reference=mouthReference.project(metrics,face,data.frame.width,data.frame.height);
          exerciseContext.drawImage(data.frame,0,0,320,240);
          const mw=metrics.width/data.frame.width,mh=metrics.width/data.frame.height;
          const x=Math.max(0,metrics.center.x-mw*.9),y=Math.max(0,metrics.center.y-mh*.18),rw=Math.min(1-x,mw*1.8),rh=Math.min(1-y,mh*.95);
          const rx=Math.round(x*320),ry=Math.round(y*240),width=Math.max(1,Math.min(320-rx,Math.round(rw*320))),height=Math.max(1,Math.min(240-ry,Math.round(rh*240)));
          calibrationRegion={x:rx,y:ry,width,height};calibrationFrameAt=Date.now();
          const pixels=exerciseContext.getImageData(rx,ry,width,height).data;
          const blob=ExerciseVision.tongue(pixels,width,height,tongueHue);
          if(blob){const tx=(rx+blob.x*width)/320,ty=(ry+blob.y*height)/240;
            const candidate={x:tx,y:ty,hue:blob.hue,fraction:blob.fraction,dx:(tx-metrics.center.x)/mw,dy:(ty-metrics.center.y)/mh,min_dx:((rx+blob.bounds.x*width)/320-metrics.center.x)/mw,max_dx:((rx+(blob.bounds.x+blob.bounds.width)*width)/320-metrics.center.x)/mw,extends_below_lip:(ry+(blob.bounds.y+blob.bounds.height)*height)/240>face[17].y+mh*.02,bounds:{x:(rx+blob.bounds.x*width)/320,y:(ry+blob.bounds.y*height)/240,width:blob.bounds.width*width/320,height:blob.bounds.height*height/240}};
            // The outer lip landmark moves over an extended tongue. Compare the
            // visible component to the inner lip edge, retaining area checks.
            candidate.extends_below_lip=(ry+(blob.bounds.y+blob.bounds.height)*height)/240>face[14].y+mh*.02;
            if(reference){const referenceWidth=reference.width/data.frame.width;
              candidate.dx=(tx-reference.x)/referenceWidth;
              candidate.min_dx=((rx+blob.bounds.x*width)/320-reference.x)/referenceWidth;
              candidate.max_dx=((rx+(blob.bounds.x+blob.bounds.width)*width)/320-reference.x)/referenceWidth;
            }
            candidate.lateral_shift=(candidate.min_dx+candidate.max_dx)/2;
            if(tongueHue===null){const hue=tongueCalibration.update(candidate,metrics.ratio,data.timestamp);if(hue!==null)tongueHue=hue;observation.exercise.calibration_status='hold_tongue';}
            observation.exercise.calibrated=tongueHue!==null;observation.exercise.tongue=candidate;
          }else tongueCalibration.reset();
        }
      }
      if (observation.status === 'tracking' && result.faceLandmarks.length === 1 && face?.[291]) {
        const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
        const width = distance(face[61],face[291]);
        if (width > 0) observation.oral = { lip_opening_ratio: distance(face[13],face[14])/width, source:'visible_lip_landmarks' };
      }
      self.postMessage({ type: 'result', exerciseId, result: observation });
    }
  } catch (error) {
    console.error('[Local face tracker]', error);
    self.postMessage({ type: 'error', message: 'Local face tracking could not run. Retry or continue without the camera.', diagnostic: String(error.message) });
  } finally { data.frame?.close(); }
};
