import * as THREE from '../vendor/three.module.min.js';
import { createWorld } from './world.js';
import { createCharacter } from './characters.js';
import { createNavigation } from './navigation.js';
import { createCameraController } from './camera.js';

const $ = id => document.getElementById(id);
const storeKey = 'terres-ocre-expedition-v1';
const specs = [
  {name:'Nara',role:'prospector',color:0xd9b373,speed:3.5},
  {name:'Brak',role:'guard',color:0xb5b1a3,speed:2.9},
  {name:'Ivo',role:'automaton',color:0x91b5a3,speed:3.7}
];
const state = {started:false,paused:false,speed:1,water:72,scrap:0,collected:0,elapsed:0,selected:new Set([0,1,2]),discovered:new Set(),completed:false};
let renderer, scene, camera, world, actors=[], navigation, textures, marker, routeLine, cameraController;
let saveElapsed=0, uiElapsed=0, frameCount=0, warnedWater=false;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(), clock=new THREE.Clock();
const keys=new Set(), touches=new Map(), cameraActions=new Set();
let pointerOrigin=null, touchGesture=null, multiGesture=false, toastTimer;

function toast(text) {
  $('toast').textContent=text; $('toast').classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);
}
function fail(error) {
  console.error(error);
  $('error-panel').hidden=false;
  $('error-message').textContent='La scène 3D ne peut pas démarrer. Utilisez un navigateur récent avec WebGL 2 et vérifiez que l’accélération graphique est activée. '+error.message;
  $('loading-status').textContent='Le chargement a rencontré un problème.';
}
function loadTexture(url) {
  return new Promise((resolve,reject)=>new THREE.TextureLoader().load(url,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);resolve(texture);
  },undefined,()=>reject(new Error('Texture indisponible : '+url))));
}
async function initialize() {
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:1.75));
    renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    renderer.domElement.setAttribute('aria-label','Vallée désertique en 3D. Cliquez sur le sol pour déplacer les personnages sélectionnés.');
    renderer.domElement.tabIndex=0;
    $('viewport').append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();state.paused=true;fail(new Error('Contexte graphique interrompu. Rechargez la page.'));});
    scene=new THREE.Scene();scene.background=new THREE.Color(0xc5bb9f);scene.fog=new THREE.FogExp2(0xc5bb9f,.0048);
    camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.2,650);
    const sky=new THREE.Mesh(new THREE.SphereGeometry(360,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x889ba4)},bottom:{value:new THREE.Color(0xe7cfaa)}},vertexShader:'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 p;void main(){float h=clamp(normalize(p).y*1.5,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.7)),1.);}'}));
    sky.name='Ciel';scene.add(sky);
    scene.add(new THREE.HemisphereLight(0xe0e6e5,0x8c6845,2.25));
    const sun=new THREE.DirectionalLight(0xffdfb4,3.1);sun.position.set(-50,65,30);sun.castShadow=true;
    sun.shadow.mapSize.set(innerWidth<700?1024:2048,innerWidth<700?1024:2048);
    Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:190});
    sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);
    $('loading-status').textContent='Préparation des matières et du terrain…';
    const loaded=await Promise.all(['sand','stone','rust','cloth'].map(name=>loadTexture('assets/'+name+'.png')));
    textures=Object.fromEntries(['sand','stone','rust','cloth'].map((name,i)=>[name,loaded[i]]));
    world=createWorld(THREE,textures);scene.add(world.group);
    cameraController=createCameraController(THREE,camera,{groundHeight:world.groundHeight});
    navigation=createNavigation(world.colliders);
    const starts=[[-13,18],[-10.5,19],[-8,18]];
    actors=specs.map((spec,index)=>{
      const visual=createCharacter(THREE,{...spec,textures});
      visual.group.userData.actorIndex=index;
      visual.group.position.set(starts[index][0],world.groundHeight(...starts[index]),starts[index][1]);
      visual.group.rotation.y=Math.PI;scene.add(visual.group);
      return {...spec,...visual,index,path:[],gatherTarget:null,gatherTime:0,status:'Au repos',travelled:0};
    });
    for(const node of world.resourceNodes){node.mesh.userData.resourceId=node.id;node.initialRemaining=node.remaining??1;node.remaining=node.initialRemaining;}
    marker=new THREE.Mesh(new THREE.RingGeometry(.75,.84,36),new THREE.MeshBasicMaterial({color:0xe4c58c,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));
    marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
    restore();bindInputs();updateCamera();updateUI();
    $('start-button').disabled=false;$('loading-status').textContent='La vallée est prête. Votre escouade vous attend.';
    $('start-button').addEventListener('click',start);
    window.expedition={
      getState:()=>({started:state.started,paused:state.paused,speed:state.speed,water:state.water,scrap:state.scrap,collected:state.collected,completed:state.completed,selected:[...state.selected],discovered:[...state.discovered],elapsed:state.elapsed,frames:frameCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,actors:actors.map(a=>({name:a.name,x:a.group.position.x,y:a.group.position.y,z:a.group.position.z,path:a.path.length,status:a.status})),resources:world.resourceNodes.map(n=>({id:n.id,kind:n.kind,x:n.position.x,z:n.position.z,remaining:n.remaining})),landmarks:world.landmarks.map(l=>({...l})),textures:loaded.length,camera:cameraController.getState()}),
      move:(x,z)=>commandMove(x,z),select:indices=>selectUnits(indices),gather:()=>gatherNearest(),focus:()=>focusSelection(),
      project:(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight,visible:p.z<1};},
      save:()=>save(),reset:()=>reset(),isWalkable:(x,z)=>navigation.walkable(x,z)
    };
    renderer.setAnimationLoop(frame);
  } catch(error) {fail(error);}
}
function start() {
  if(state.started)return;state.started=true;clock.getDelta();
  $('loading-overlay').classList.add('dismissed');
  setTimeout(()=>$('loading-overlay').hidden=true,550);
  renderer.domElement.focus({preventScroll:true});
  toast('Cliquez sur le sol pour déplacer l’escouade. Caméra 360° : glisser droit, flèches du clavier ou panneau Caméra.');
}
function updateCamera(dt=0) {
  const selected=actors.filter(a=>state.selected.has(a.index));
  const center=selected.length?selected.reduce((sum,a)=>sum.add(a.group.position),new THREE.Vector3()).divideScalar(selected.length):null;
  cameraController.update(dt,center);
}
function selectUnits(indices) {
  state.selected=new Set(indices.filter(i=>Number.isInteger(i)&&i>=0&&i<actors.length));
  if(!state.selected.size)state.selected.add(0);
  actors.forEach(a=>a.setSelected(state.selected.has(a.index)));updateUI();
}
function focusSelection() {
  const selected=actors.filter(a=>state.selected.has(a.index));if(!selected.length)return;
  cameraController.focus(selected.map(a=>a.group.position));
}
function commandMove(x,z,resource=null) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  x=THREE.MathUtils.clamp(x,-70,70);z=THREE.MathUtils.clamp(z,-70,70);
  const selected=actors.filter(a=>state.selected.has(a.index));let issued=0;
  const view=cameraController.getState();
  selected.forEach((actor,index)=>{
    const offset=selected.length>1?(index-(selected.length-1)/2)*1.8:0;
    const target={x:x+offset*Math.cos(view.yaw),z:z-offset*Math.sin(view.yaw)};
    const path=navigation.findPath(actor.group.position,target);
    if(!path.length){const near=navigation.nearestPoint(target.x,target.z);if(near&&Math.hypot(near.x-actor.group.position.x,near.z-actor.group.position.z)<2){actor.path=[];actor.gatherTarget=resource;issued++;}return;}
    actor.path=path;actor.gatherTarget=resource;actor.gatherTime=0;actor.status=resource?'Vers la réserve':'En marche';issued++;
  });
  if(issued){marker.position.set(x,world.groundHeight(x,z)+.09,z);marker.visible=true;marker.userData.shownAt=state.elapsed;drawRoute(selected[0]);}
  else toast('Ce passage est inaccessible. Choisissez un point plus dégagé.');
  updateUI();return issued>0;
}
function drawRoute(actor) {
  if(routeLine){scene.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}
  if(!actor?.path.length)return;
  const points=[actor.group.position.clone().add(new THREE.Vector3(0,.12,0)),...actor.path.map(p=>new THREE.Vector3(p.x,world.groundHeight(p.x,p.z)+.12,p.z))];
  routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xddc794,transparent:true,opacity:.4}));scene.add(routeLine);
}
function gatherNearest() {
  let node=null, best=Infinity;
  for(const n of world.resourceNodes){if(n.remaining<=0)continue;for(const actor of actors){if(!state.selected.has(actor.index))continue;const d=actor.group.position.distanceTo(n.position);if(d<best){best=d;node=n;}}}
  if(!node||best>5){toast('Approchez-vous d’un bidon ou d’un amas de fer pour récupérer son contenu.');return false;}
  for(const actor of actors){if(state.selected.has(actor.index)&&actor.group.position.distanceTo(node.position)<5){actor.gatherTarget=node;actor.gatherTime=0;actor.path=[];}}
  return true;
}
function collect(node,actor) {
  if(node.remaining<=0)return;
  node.remaining=0;node.mesh.visible=false;state.collected++;
  if(node.kind==='water'){state.water=Math.min(100,state.water+node.amount);warnedWater=false;toast(actor.name+' a récupéré de l’eau. Réserve +'+node.amount+'.');}
  else {state.scrap+=node.amount;toast(actor.name+' a récupéré '+node.amount+' unités de métal.');}
  actors.filter(a=>a.gatherTarget===node).forEach(a=>{a.gatherTarget=null;a.gatherTime=0;a.status='Au repos';});
  checkObjective();save();updateUI();
}
function checkObjective() {
  const visited=state.discovered.has(world.landmarks[0]?.id);
  if(state.collected>=3&&visited&&!state.completed){state.completed=true;toast('Expédition réussie : colonie repérée et trois réserves récupérées. La vallée reste à explorer.');}
}
function updateActors(dt) {
  for(const actor of actors){
    let moving=0;
    if(actor.path.length){
      const waypoint=actor.path[0], p=actor.group.position;
      const dx=waypoint.x-p.x,dz=waypoint.z-p.z,distance=Math.hypot(dx,dz);
      const step=actor.speed*(state.water>0?1:.55)*dt;
      if(distance<=step+.04){p.x=waypoint.x;p.z=waypoint.z;actor.path.shift();}
      else {p.x+=dx/distance*step;p.z+=dz/distance*step;}
      if(distance>.01){const desired=Math.atan2(dx,dz), difference=Math.atan2(Math.sin(desired-actor.group.rotation.y),Math.cos(desired-actor.group.rotation.y));actor.group.rotation.y+=difference*Math.min(1,dt*10);}
      p.y=world.groundHeight(p.x,p.z);moving=1;actor.travelled+=step;actor.status='En marche';
    }
    if(!actor.path.length){
      if(actor.gatherTarget?.remaining>0){
        const distance=actor.group.position.distanceTo(actor.gatherTarget.position);
        if(distance<5){actor.gatherTime+=dt;actor.status='Récupération '+Math.min(100,Math.round(actor.gatherTime/2.5*100))+' %';if(actor.gatherTime>=2.5)collect(actor.gatherTarget,actor);}
        else {actor.status='Réserve trop éloignée';actor.gatherTarget=null;}
      } else {actor.status='Au repos';actor.gatherTarget=null;}
    }
    actor.animate(state.elapsed,moving,state.selected.has(actor.index));
    for(const landmark of world.landmarks){
      if(!state.discovered.has(landmark.id)&&Math.hypot(actor.group.position.x-landmark.x,actor.group.position.z-landmark.z)<landmark.radius){state.discovered.add(landmark.id);toast('Lieu découvert : '+landmark.name);checkObjective();}
    }
  }
}
function frame() {
  const realDt=Math.min(clock.getDelta(),.08);frameCount++;
  if(state.started&&!state.paused){
    const dt=realDt*state.speed;state.elapsed+=dt;
    state.water=Math.max(0,state.water-dt*.065);
    if(state.water<20&&!warnedWater){warnedWater=true;toast('L’eau se fait rare. Recherchez les bidons bleu-vert et les réserves du puits.');}
    updateActors(dt);world.update?.(dt,state.elapsed);
    saveElapsed+=realDt;if(saveElapsed>8){saveElapsed=0;save();}
  } else actors.forEach(actor=>actor.setSelected(state.selected.has(actor.index)));
  if(state.started){
    const turn=(keys.has('arrowleft')||cameraActions.has('left')?1:0)-(keys.has('arrowright')||cameraActions.has('right')?1:0);
    const tilt=(keys.has('arrowup')||cameraActions.has('up')?1:0)-(keys.has('arrowdown')||cameraActions.has('down')?1:0);
    const zoom=(cameraActions.has('zoom-out')?1:0)-(cameraActions.has('zoom-in')?1:0);
    if(turn||tilt)cameraController.rotate(turn*realDt*1.65,tilt*realDt*.85);
    if(zoom)cameraController.zoom(Math.exp(zoom*realDt*1.2));
    const forward=(keys.has('w')||keys.has('z')?1:0)-(keys.has('s')?1:0);
    const side=(keys.has('d')?1:0)-(keys.has('a')||keys.has('q')?1:0);
    if(forward||side){const view=cameraController.getState(),speed=view.distance*.55*realDt/(Math.hypot(forward,side)||1);cameraController.pan((-Math.sin(view.yaw)*forward+Math.cos(view.yaw)*side)*speed,(-Math.cos(view.yaw)*forward-Math.sin(view.yaw)*side)*speed);}
  }
  updateCamera(realDt);
  if(marker?.visible){const age=state.elapsed-marker.userData.shownAt;marker.scale.setScalar(1+.12*Math.sin(age*4));if(age>8)marker.visible=false;}
  uiElapsed+=realDt;if(uiElapsed>.15){uiElapsed=0;updateUI();drawMinimap();}
  renderer.render(scene,camera);
}
function updateUI() {
  $('water-value').textContent=Math.ceil(state.water);$('scrap-value').textContent=state.scrap;
  $('water-value').closest('div')?.classList.toggle('low',state.water<20);
  const totalMinutes=16*60+35+Math.floor(state.elapsed/5),day=1+Math.floor(totalMinutes/1440),minutes=totalMinutes%1440;
  $('day-time').textContent='Jour '+day+' · '+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  $('objective-progress').textContent=Math.min(3,state.collected)+'/3';
  $('objective-text').textContent=state.completed?'Expédition réussie. La vallée reste à explorer.':state.collected>=3?'Rejoindre la colonie pour terminer l’expédition.':'Explorer la colonie et récupérer 3 réserves.';
  $('objective-text').closest('section,aside,div')?.classList.toggle('complete',state.completed);
  document.querySelectorAll('.unit-card').forEach(card=>{const index=Number(card.dataset.unit);card.classList.toggle('selected',state.selected.has(index));card.setAttribute('aria-pressed',String(state.selected.has(index)));});
  actors.forEach(a=>{const label=$('unit-status-'+a.index);if(label)label.textContent=state.paused?'En pause':a.status;});
  $('selection-label').textContent=state.selected.size===3?'Escouade complète':actors.filter(a=>state.selected.has(a.index)).map(a=>a.name).join(' · ');
  $('pause-button').textContent=state.paused?'Reprendre':'Pause';$('pause-button').setAttribute('aria-pressed',String(state.paused));
  $('speed-button').textContent='×'+state.speed;
  const cameraView=cameraController.getState();
  $('camera-heading').textContent='Orientation '+String(cameraView.heading).padStart(3,'0')+'°';
  $('camera-follow').setAttribute('aria-pressed',String(cameraView.following));
  $('camera-follow').textContent=cameraView.following?'Suivi actif':'Suivre';
  let nearby=false;
  for(const n of world.resourceNodes)if(n.remaining>0&&actors.some(a=>state.selected.has(a.index)&&a.group.position.distanceTo(n.position)<5))nearby=true;
  $('gather-button').disabled=!nearby||state.paused||!state.started;
}
function drawMinimap() {
  const canvas=$('minimap'),ctx=canvas.getContext('2d');if(!ctx)return;
  const w=canvas.width,h=canvas.height,extent=72, map=(x,z)=>[w/2+x/(extent*2)*w,h/2+z/(extent*2)*h];
  ctx.fillStyle='#292b25';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#77715a';ctx.globalAlpha=.18;
  for(let band=0;band<8;band++){ctx.beginPath();for(let x=0;x<=w;x+=5){const y=band*h/7+Math.sin(x*.024+band)*9; x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  ctx.globalAlpha=1;
  for(const c of world.colliders){const [x,y]=map(c.x,c.z);ctx.fillStyle='#75705b';ctx.beginPath();ctx.arc(x,y,Math.max(1,c.radius*w/(extent*2)),0,Math.PI*2);ctx.fill();}
  for(const l of world.landmarks){const [x,y]=map(l.x,l.z);ctx.strokeStyle=state.discovered.has(l.id)?'#dec59b':'#8d8a72';ctx.strokeRect(x-3,y-3,6,6);}
  for(const n of world.resourceNodes){if(n.remaining<=0)continue;const [x,y]=map(n.position.x,n.position.z);ctx.fillStyle=n.kind==='water'?'#9abcb6':'#c1966d';ctx.fillRect(x-1.5,y-1.5,3,3);}
  for(const actor of actors){const [x,y]=map(actor.group.position.x,actor.group.position.z);ctx.fillStyle=state.selected.has(actor.index)?'#f5d69a':'#b9b39f';ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill();}
  const view=cameraController.getState(),[cx,cy]=map(view.target.x,view.target.z);ctx.strokeStyle='#eee2be';ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(cx,cy,view.distance*.3,0,Math.PI*2);ctx.moveTo(cx,cy);ctx.lineTo(cx-Math.sin(view.yaw)*12,cy-Math.cos(view.yaw)*12);ctx.stroke();ctx.globalAlpha=1;
  ctx.fillStyle='#bfbba6';ctx.font='11px sans-serif';ctx.fillText('N',w/2-4,12);
}
function pick(clientX,clientY,additive=false) {
  if(!state.started||$('help-dialog').open)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects([...actors.map(a=>a.group),...world.resourceNodes.filter(n=>n.remaining>0).map(n=>n.mesh)],true);
  for(const hit of hits){
    let object=hit.object;
    while(object){
      if(Number.isInteger(object.userData.actorIndex)){
        const index=object.userData.actorIndex;
        if(additive){const selection=new Set(state.selected);selection.has(index)?selection.delete(index):selection.add(index);selectUnits([...selection]);}else selectUnits([index]);
        return;
      }
      if(object.userData.resourceId){const node=world.resourceNodes.find(n=>n.id===object.userData.resourceId);commandMove(node.position.x,node.position.z,node);toast(node.label+' : l’escouade se met en route.');return;}
      object=object.parent;
    }
  }
  const ground=raycaster.intersectObject(world.terrain,false)[0];if(ground)commandMove(ground.point.x,ground.point.z);
}
function bindInputs() {
  const canvas=renderer.domElement;
  const clearPointers=()=>{touches.clear();pointerOrigin=null;touchGesture=null;multiGesture=false;};
  const clearInputs=()=>{keys.clear();cameraActions.clear();clearPointers();};
  const gesture=()=>{
    const [a,b]=[...touches.values()];
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};
  };
  const nudgeCamera=action=>{
    if(action==='left')cameraController.rotate(.13);
    if(action==='right')cameraController.rotate(-.13);
    if(action==='up')cameraController.rotate(0,.07);
    if(action==='down')cameraController.rotate(0,-.07);
    if(action==='zoom-in')cameraController.zoom(.9);
    if(action==='zoom-out')cameraController.zoom(1/.9);
  };
  for(const action of ['left','right','up','down','zoom-in','zoom-out']){
    const button=$('camera-'+action);
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||!state.started)return;
      event.preventDefault();button.focus({preventScroll:true});button.setPointerCapture(event.pointerId);
      cameraActions.add(action);nudgeCamera(action);
    });
    const release=()=>cameraActions.delete(action);
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('click',event=>{if(event.detail===0&&state.started)nudgeCamera(action);});
  }
  $('camera-toggle').addEventListener('click',()=>{
    const panel=$('camera-panel');panel.hidden=!panel.hidden;
    $('camera-toggle').setAttribute('aria-expanded',String(!panel.hidden));cameraActions.clear();
  });
  $('camera-reset').addEventListener('click',()=>{cameraController.reset();updateUI();});
  $('camera-follow').addEventListener('click',()=>{
    const follow=!cameraController.getState().following;cameraController.setFollowing(follow);
    if(follow)focusSelection();updateUI();
  });
  document.querySelectorAll('.unit-card').forEach(card=>card.addEventListener('click',event=>{
    const index=Number(card.dataset.unit);
    if(event.shiftKey){const set=new Set(state.selected);set.has(index)?set.delete(index):set.add(index);selectUnits([...set]);}else selectUnits([index]);
  }));
  $('select-all').addEventListener('click',()=>selectUnits([0,1,2]));
  $('focus-unit').addEventListener('click',focusSelection);
  $('pause-button').addEventListener('click',()=>{state.paused=!state.paused;updateUI();});
  $('speed-button').addEventListener('click',()=>{state.speed=state.speed===1?2:state.speed===2?3:1;updateUI();});
  $('gather-button').addEventListener('click',gatherNearest);
  $('help-button').addEventListener('click',()=>{$('help-dialog').showModal();clearInputs();});
  $('close-help').addEventListener('click',()=>$('help-dialog').close());
  $('reset-button')?.addEventListener('click',()=>{reset();$('help-dialog').close();});
  $('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog'))$('help-dialog').close();});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',event=>{if(!state.started)return;event.preventDefault();cameraController.zoom(Math.exp(event.deltaY*.001));},{passive:false});
  canvas.addEventListener('pointerdown',event=>{
    if(!state.started)return;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size===1){pointerOrigin={x:event.clientX,y:event.clientY,moved:false,button:event.button,type:event.pointerType};multiGesture=false;}
    if(touches.size===2){multiGesture=true;touchGesture=gesture();}
  });
  canvas.addEventListener('pointermove',event=>{
    if(!touches.has(event.pointerId)||!pointerOrigin)return;
    const previous=touches.get(event.pointerId);touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    if(Math.hypot(event.clientX-pointerOrigin.x,event.clientY-pointerOrigin.y)>5)pointerOrigin.moved=true;
    if(touches.size===2){
      const next=gesture(),previousGesture=touchGesture;
      if(previousGesture){
        if(previousGesture.distance>0&&next.distance>0)cameraController.zoom(previousGesture.distance/next.distance);
        const twist=Math.atan2(Math.sin(next.angle-previousGesture.angle),Math.cos(next.angle-previousGesture.angle));
        cameraController.rotate(-(next.x-previousGesture.x)*.006-twist,(next.y-previousGesture.y)*.004);
      }
      touchGesture=next;
    }
    else if(pointerOrigin.button===2)cameraController.rotate(-dx*.006,dy*.004);
    else if(pointerOrigin.button===1||event.pointerType==='touch')cameraController.panScreen(dx,dy);
  });
  const pointerUp=event=>{
    const click=pointerOrigin&&!pointerOrigin.moved&&!multiGesture&&pointerOrigin.button===0;
    touches.delete(event.pointerId);
    if(click)pick(event.clientX,event.clientY,event.shiftKey);
    if(touches.size<2)touchGesture=null;
    if(!touches.size)clearPointers();
  };
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',clearPointers);
  canvas.addEventListener('lostpointercapture',event=>{if(touches.has(event.pointerId))clearPointers();});
  window.addEventListener('keydown',event=>{
    if(!state.started||$('help-dialog').open||event.ctrlKey||event.metaKey||event.altKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    const key=event.key.toLowerCase();
    if(key==='tab'||((key===' '||key==='enter')&&event.target.closest('button,summary,a')))return;
    keys.add(key);
    if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(key))event.preventDefault();
    if(event.repeat)return;
    if(key===' '){state.paused=!state.paused;updateUI();}
    if(key==='e')gatherNearest();if(key==='f')focusSelection();
    if(key==='r'){cameraController.reset();updateUI();}
    if(key==='g')selectUnits([0,1,2]);if(['1','2','3'].includes(key))selectUnits([Number(key)-1]);
    if(key==='escape'){actors.filter(a=>state.selected.has(a.index)).forEach(a=>{a.path=[];a.gatherTarget=null;});toast('Ordre annulé.');}
  });
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur',clearInputs);
  document.addEventListener('visibilitychange',()=>{clearInputs();if(document.hidden&&state.started){state.paused=true;save();updateUI();}});
  window.addEventListener('beforeunload',save);
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  $('minimap').addEventListener('pointerdown',event=>{const rect=event.currentTarget.getBoundingClientRect();cameraController.setTarget((event.clientX-rect.left)/rect.width*144-72,(event.clientY-rect.top)/rect.height*144-72);});
  selectUnits([...state.selected]);
}
function save() {
  if(!state.started)return false;
  const view=cameraController.getState();
  try {localStorage.setItem(storeKey,JSON.stringify({version:1,water:state.water,scrap:state.scrap,collected:state.collected,elapsed:state.elapsed,discovered:[...state.discovered],completed:state.completed,used:world.resourceNodes.filter(n=>n.remaining<=0).map(n=>n.id),positions:actors.map(a=>({x:a.group.position.x,z:a.group.position.z})),selected:[...state.selected],camera:{...view.goal,following:view.following}}));return true;}catch{return false;}
}
function restore() {
  try {
    const data=JSON.parse(localStorage.getItem(storeKey));if(data?.version!==1||!Array.isArray(data.positions)||data.positions.length!==3)return;
    if(![data.water,data.scrap,data.collected,data.elapsed].every(Number.isFinite))return;
    state.water=THREE.MathUtils.clamp(data.water,0,100);state.scrap=Math.max(0,Math.floor(data.scrap));state.collected=Math.max(0,Math.min(world.resourceNodes.length,Math.floor(data.collected)));state.elapsed=Math.max(0,data.elapsed);
    state.discovered=new Set((Array.isArray(data.discovered)?data.discovered:[]).filter(id=>world.landmarks.some(l=>l.id===id)));state.completed=!!data.completed;
    for(const n of world.resourceNodes)if(Array.isArray(data.used)&&data.used.includes(n.id)){n.remaining=0;n.mesh.visible=false;}
    data.positions.forEach((p,i)=>{if(Number.isFinite(p.x)&&Number.isFinite(p.z)){const valid=navigation.nearestPoint(p.x,p.z);if(valid)actors[i].group.position.set(valid.x,world.groundHeight(valid.x,valid.z),valid.z);}});
    if(Array.isArray(data.selected)){const indices=data.selected.filter(i=>Number.isInteger(i)&&i>=0&&i<actors.length);if(indices.length)state.selected=new Set(indices);}
    if(data.camera)cameraController.restore(data.camera);
    $('loading-status').textContent='Votre expédition précédente a été retrouvée.';
  } catch { /* Unavailable or obsolete local save: begin a fresh expedition. */ }
}
function reset() {
  try{localStorage.removeItem(storeKey);}catch{}
  Object.assign(state,{water:72,scrap:0,collected:0,elapsed:0,completed:false,paused:false,speed:1,discovered:new Set()});warnedWater=false;
  const starts=[[-13,18],[-10.5,19],[-8,18]];
  actors.forEach((a,i)=>{a.path=[];a.gatherTarget=null;a.gatherTime=0;a.group.position.set(starts[i][0],world.groundHeight(...starts[i]),starts[i][1]);a.status='Au repos';});
  world.resourceNodes.forEach(n=>{n.remaining=n.initialRemaining;n.mesh.visible=true;});
  if(routeLine){scene.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}
  marker.visible=false;cameraController.reset({immediate:true});selectUnits([0,1,2]);updateCamera();updateUI();save();toast('Une nouvelle expédition commence.');
}
initialize();
