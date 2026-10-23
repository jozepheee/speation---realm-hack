import * as THREE from 'three';

const palette={grass:0x64a86b,leaf:0x29745b,rock:0x8c7996,cream:0xffefd1,gold:0xffcc65};
function material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.72,...extra});}
function mesh(parent,geometry,mat,x=0,y=0,z=0){const item=new THREE.Mesh(geometry,mat);item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;}
function ball(parent,mat,x,y,z,sx,sy=sx,sz=sx){const item=mesh(parent,new THREE.SphereGeometry(1,20,14),mat,x,y,z);item.scale.set(sx,sy,sz);return item;}
function cone(parent,mat,x,y,z,radius,height,sides=8){return mesh(parent,new THREE.ConeGeometry(radius,height,sides),mat,x,y,z);}
function cylinder(parent,mat,x,y,z,radius,height){return mesh(parent,new THREE.CylinderGeometry(radius,radius,height,10),mat,x,y,z);}
function label(parent,text,x,y,z,width=3){
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=180;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff7e8';ctx.beginPath();ctx.roundRect(4,4,632,172,36);ctx.fill();ctx.strokeStyle='#d6bf8d';ctx.lineWidth=5;ctx.stroke();
 let size=52;ctx.font=`600 ${size}px "Nirmala UI",sans-serif`;while(ctx.measureText(text).width>590&&size>21){size-=2;ctx.font=`600 ${size}px "Nirmala UI",sans-serif`;}
 ctx.fillStyle='#173f38';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,320,88,600);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.position.set(x,y,z);sprite.scale.set(width,width*180/640,1);parent.add(sprite);return sprite;
}
function tree(parent,x,y,z,scale=1){
 const group=new THREE.Group();group.position.set(x,y,z);group.scale.setScalar(scale);parent.add(group);
 cylinder(group,material(0x805c45),0,.7,0,.12,1.5);
 const leaves=material(palette.leaf);ball(group,leaves,0,1.65,0,.7,.9,.65);ball(group,material(0x64a571),-.4,1.45,.1,.5,.6,.5);
 return group;
}
function island(parent,x,y,z,radius=1.65){
 const group=new THREE.Group();group.position.set(x,y,z);parent.add(group);
 cone(group,material(palette.rock),0,-.8,0,radius,1.8,9).rotation.z=Math.PI;
 mesh(group,new THREE.CylinderGeometry(radius,radius*.95,.32,32),material(palette.grass),0,.05,0);
 const blades=new THREE.InstancedMesh(new THREE.ConeGeometry(.035,.25,3),material(0x94c67d),65);const transform=new THREE.Object3D();
 for(let i=0;i<65;i++){const angle=i*2.4,r=Math.sqrt((i+.5)/65)*radius*.9;transform.position.set(Math.cos(angle)*r,.32,Math.sin(angle)*r);transform.rotation.z=Math.sin(i)*.2;transform.updateMatrix();blades.setMatrixAt(i,transform.matrix);}group.add(blades);
 for(let i=0;i<5;i++){const a=i*1.8;ball(group,material(i%2?0xffcf76:0xe49cc1),Math.cos(a)*radius*.65,.3,Math.sin(a)*radius*.65,.07);}
 return group;
}
function fox(){
 const group=new THREE.Group(),orange=material(0xe48b43),ivory=material(0xffe9c1),dark=material(0x322e36),scarf=material(0x348c8c);
 ball(group,orange,0,.62,0,.32,.45,.43);ball(group,orange,0,1.17,.12,.42,.4,.36);
 ball(group,ivory,0,1.03,.4,.28,.19,.22);ball(group,dark,0,1.11,.59,.065,.05,.06);
 for(const side of [-1,1]){const ear=cone(group,orange,side*.28,1.64,.06,.21,.5,3);ear.rotation.z=-side*.2;cone(group,dark,side*.28,1.68,.11,.115,.25,3);ball(group,dark,side*.19,1.29,.425,.052,.07,.035);ball(group,ivory,side*.175,1.32,.45,.016);}
 const legs=[];for(const x of [-.2,.2])for(const z of [-.25,.25]){const leg=cylinder(group,dark,x,.21,z,.075,.36);legs.push(leg);}
 const tail=new THREE.Group();tail.position.set(0,.55,-.28);tail.rotation.x=-.65;group.add(tail);ball(tail,orange,0,.08,-.34,.21,.22,.5);ball(tail,ivory,0,.12,-.67,.15,.17,.23);
 mesh(group,new THREE.TorusGeometry(.25,.075,8,20),scarf,0,.9,.1).rotation.x=Math.PI/2;
 mesh(group,new THREE.BoxGeometry(.12,.37,.06),scarf,.18,.7,.38).rotation.z=.25;
 return {group,legs,tail};
}
function boat(){
 const group=new THREE.Group(),wood=material(0x9c5a40),gold=material(palette.gold);
 const shape=new THREE.Shape();shape.moveTo(-.5,-1);shape.quadraticCurveTo(-.9,0,-.5,.9);shape.quadraticCurveTo(0,1.5,.5,.9);shape.quadraticCurveTo(.9,0,.5,-1);shape.lineTo(-.5,-1);
 const hull=mesh(group,new THREE.ExtrudeGeometry(shape,{depth:.35,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.12,bevelThickness:.12}),wood);hull.rotation.x=-Math.PI/2;hull.position.y=.12;
 cylinder(group,gold,0,1.25,0,.045,2.4);
 const sailShape=new THREE.Shape();sailShape.moveTo(0,0);sailShape.lineTo(.98,-1.6);sailShape.lineTo(0,-1.5);sailShape.closePath();
 mesh(group,new THREE.ShapeGeometry(sailShape),new THREE.MeshStandardMaterial({color:0xffedc2,side:THREE.DoubleSide,roughness:.8}),0,2.4,0);
 const character=fox();character.group.scale.setScalar(.48);character.group.position.set(0,.45,.5);group.add(character.group);
 return group;
}
function rocket(){
 const group=new THREE.Group(),ivory=material(0xffeddd),red=material(0xda776e),window=material(0x54aebc,{metalness:.5,roughness:.16});
 cylinder(group,ivory,0,.5,0,.35,1.3);cone(group,red,0,1.45,0,.35,.65,24);
 ball(group,window,0,.7,.32,.17,.2,.06);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const fin=cone(group,red,Math.cos(a)*.36,-.05,Math.sin(a)*.36,.23,.65,3);fin.rotation.z=.2;}
 const flame=cone(group,new THREE.MeshBasicMaterial({color:0xffc66a}),0,-.67,0,.2,.7,16);flame.rotation.z=Math.PI;
 group.rotation.z=-Math.PI/2;return {group,flame};
}
export function travelProgress(elapsed,duration){const linear=Math.max(0,Math.min(1,elapsed/Math.max(1,duration)));return {linear,eased:linear*linear*(3-2*linear)};}

export function createAdventureWorld(canvas,{game,challenge,names}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 const scene=new THREE.Scene(),space=game==='story';scene.background=new THREE.Color(space?0x12172e:0xc6e9ed);scene.fog=new THREE.Fog(space?0x12172e:0xc6e9ed,23,70);
 const camera=new THREE.PerspectiveCamera(40,1,.1,110);camera.position.set(0,space?5.5:7.8,18.5);camera.lookAt(0,1,0);
 scene.add(new THREE.HemisphereLight(space?0x91aaff:0xe7f7ff,space?0x30254b:0x537d62,1.65));
 const sun=new THREE.DirectionalLight(0xffe7be,3.8);sun.position.set(-8,15,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-13;sun.shadow.camera.right=13;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.035;scene.add(sun);
 const backdrop=new THREE.Group();scene.add(backdrop);
 if(!space){
  ball(backdrop,new THREE.MeshBasicMaterial({color:0xffe5a8,toneMapped:false}),8,8,-15,2.2);
  const cloudMaterial=material(0xffffff,{transparent:true,opacity:.8});
  for(let i=0;i<9;i++){const cloud=new THREE.Group();cloud.position.set(-17+i*4.5,4.5+(i%3)*1.1,-7-(i%2)*6);for(let j=0;j<4;j++)ball(cloud,cloudMaterial,(j-1.5)*.65,Math.sin(j)*.2,0,.8,.4+(j%2)*.25,.55);backdrop.add(cloud);}
  for(let i=0;i<7;i++){const mountain=mesh(backdrop,new THREE.DodecahedronGeometry(1,1),material(i%2?0x87aaa7:0xa2bfba),-20+i*7,-2,-19);mountain.scale.set(5,5+(i%3)*2,4);mountain.rotation.y=i;}
 }
 const floaters=[],stones=[],planets=[];let water=null,waterBase=null;
 let actor,start,target,foxActor=null,flame=null;
 if(game==='listening'){
  const geometry=new THREE.PlaneGeometry(100,80,80,65);geometry.rotateX(-Math.PI/2);waterBase=geometry.attributes.position.array.slice();
  water=mesh(scene,geometry,new THREE.MeshPhysicalMaterial({color:0x278fa5,roughness:.22,metalness:.28,clearcoat:1,clearcoatRoughness:.2}),0,-.55,0);water.castShadow=false;
  water.material.onBeforeCompile=shader=>{shader.uniforms.uTime={value:0};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSurface=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSurface; uniform float uTime;').replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(vSurface.x*2.8+uTime)+sin(vSurface.z*3.7-uTime*.8); diffuseColor.rgb=mix(vec3(.025,.25,.34),vec3(.10,.53,.59),.5+.5*sin(vSurface.x*.2+vSurface.z*.3)); diffuseColor.rgb+=vec3(.14,.22,.20)*smoothstep(1.5,1.98,ripple);');water.userData.shader=shader;};
  for(let i=0;i<3;i++){const foam=mesh(scene,new THREE.TorusGeometry(2.05,.025,5,60),material(0xb2e9d4,{transparent:true,opacity:.65}),-5+i*5,-.43,-.7);foam.rotation.x=-Math.PI/2;foam.castShadow=false;}
  challenge.options.forEach((word,i)=>{const ground=island(scene,-5+i*5,.2,-.7,1.8);tree(ground,-.5,.18,-.4,.85);tree(ground,.65,.18,-.5,.65);label(scene,word,-5+i*5,3.4,-.4,3.8);});
  actor=boat();start=new THREE.Vector3(-8,-.28,5);scene.add(actor);target=i=>new THREE.Vector3(-5+i*5,-.28,1.7);
 }else if(game==='syllable'){
  const first=island(scene,-7,.6,0,1.6),last=island(scene,7,.6,0,1.6);tree(first,-.6,.2,-.4,.9);tree(last,.55,.2,-.6,1.1);
  const total=challenge.pieces.length;
  // Correct visual order is revealed only by the server-accepted voice outcome.
  for(let i=0;i<total;i++){const stone=island(scene,-4.8+i*9.6/Math.max(1,total-1),.25,0,.58);stone.userData.index=i;floaters.push(stone);stones.push(stone);label(stone,challenge.pieces[i],0,1.15,0,1.3);}
  foxActor=fox();actor=foxActor.group;start=new THREE.Vector3(-7,.95,.15);scene.add(actor);target=()=>new THREE.Vector3(7,.95,.15);
 }else{
  const starPositions=new Float32Array(600*3);for(let i=0;i<600;i++){starPositions[i*3]=Math.sin(i*12.73)*36;starPositions[i*3+1]=Math.cos(i*3.17)*22;starPositions[i*3+2]=-8-Math.abs(Math.sin(i*7.31))*30;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0xe2dbff,size:.075,sizeAttenuation:true})));
  [0x4ba788,0x497fcb,0x9988bf].forEach((color,i)=>{const planet=new THREE.Group();planet.position.set(-5+i*5,1.1+(i===1?.65:0),-1.4);scene.add(planet);planets.push(planet);ball(planet,material(color),0,0,0,1.6);
   const ring=mesh(planet,new THREE.TorusGeometry(2,.045,8,80),material(0xd3b899,{metalness:.35}),0,0,0);ring.rotation.x=Math.PI*.36;ring.rotation.z=.3;ring.castShadow=false;
   if(i===0){for(let j=0;j<7;j++){const angle=j*2.4;const tuft=tree(planet,Math.cos(angle)*.8,1.2,Math.sin(angle)*.65,.27);tuft.rotation.z=-Math.cos(angle)*.3;}}
   else if(i===2){for(let j=0;j<7;j++)ball(planet,material(0x796797),Math.sin(j*3)*1.1,Math.cos(j*2)*.85,1.3,.17,.12,.08);}
   label(scene,names[i],-5+i*5,-1.2,-.4,3);
  });
  const ship=rocket();actor=ship.group;flame=ship.flame;actor.scale.setScalar(.9);start=new THREE.Vector3(-8,-2,4);scene.add(actor);target=i=>new THREE.Vector3(-5+i*5,3.7,-.3);
 }
 actor.position.copy(start);let lastPosition=start.clone();
 const dustPositions=new Float32Array(100*3),dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xffde85,size:.11,transparent:true,opacity:0,sizeAttenuation:true}));scene.add(dust);
 const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height);camera.updateProjectionMatrix();};resize();
 return {resize,draw({time,progress,index=0,quiet=false,order}){
  const p=progress??0,destination=target(index);const eased=travelProgress(p,1).eased;
  if(progress!==null){actor.position.lerpVectors(lastPosition,destination,eased);actor.position.y+=game==='syllable'?Math.abs(Math.sin(p*Math.PI*(challenge.pieces?.length+1||3)))*1.1:Math.sin(p*Math.PI)*.5;}
  else actor.position.copy(lastPosition);
  if(!quiet){actor.position.y+=Math.sin(time*2.6)*.06;actor.rotation.z=game==='story'?-Math.PI/2+Math.sin(time)*.06:Math.sin(time*2)*.025;}
  floaters.forEach((item,i)=>{const slot=order?order.indexOf(i):i;item.position.x=-4.8+slot*9.6/Math.max(1,stones.length-1);item.position.y=.25+(quiet?0:Math.sin(time+i)*.05);item.children[0].material.emissive.setHex(progress!==null&&p>(slot+1)/(stones.length+1)?0x78582c:0x000000);});
  if(foxActor){foxActor.legs.forEach((leg,i)=>leg.rotation.x=progress!==null&&!quiet?Math.sin(time*15+i%2*Math.PI)*.5:0);foxActor.tail.rotation.z=quiet?0:Math.sin(time*3)*.15;}
  if(flame)flame.scale.y=quiet?1:1+Math.sin(time*25)*.22;
  if(water&&!quiet){const values=water.geometry.attributes.position;for(let i=0;i<values.count;i++)values.array[i*3+1]=Math.sin(waterBase[i*3]*.7+time)*.07+Math.cos(waterBase[i*3+2]*.5+time*1.4)*.06;values.needsUpdate=true;if(water.userData.shader)water.userData.shader.uniforms.uTime.value=time;}
  planets.forEach((planet,i)=>{if(!quiet)planet.rotation.y=Math.sin(time*.15+i)*.1;});
  dust.material.opacity=progress!==null?Math.sin(p*Math.PI)*.85:0;
  if(progress!==null){for(let i=0;i<100;i++){dustPositions[i*3]=actor.position.x+Math.sin(i*13.1+time)*(.2+p);dustPositions[i*3+1]=actor.position.y+.5+Math.cos(i*7.3+time)*.8;dustPositions[i*3+2]=actor.position.z+Math.sin(i*5.7)*.7;}dustGeometry.attributes.position.needsUpdate=true;}
  renderer.render(scene,camera);
 },arrive(index){lastPosition=target(index).clone();},dispose(){
  const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(item=>{if(item.geometry)geometries.add(item.geometry);for(const mat of item.material?Array.isArray(item.material)?item.material:[item.material]:[]){materials.add(mat);if(mat.map)textures.add(mat.map);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();
 }};
}
