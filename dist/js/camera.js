const TAU = Math.PI * 2;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const wrap = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function createCameraController(THREE,camera,options={}) {
  const groundHeight=options.groundHeight??(()=>0);
  const limits={minPitch:.18,maxPitch:1.43,minDistance:10,maxDistance:130,target:74};
  const initial={x:options.initialTarget?.x??1,z:options.initialTarget?.z??2,yaw:options.initialYaw??.72,pitch:options.initialPitch??.78,distance:options.initialDistance??49};
  const goal={...initial};
  const target=new THREE.Vector3(initial.x,0,initial.z);
  let yaw=initial.yaw,pitch=initial.pitch,distance=initial.distance,following=false;
  const safeHeight=(x,z)=>{const height=groundHeight(x,z);return finite(height)?height:0;};
  function constrain() {
    goal.x=clamp(goal.x,-limits.target,limits.target);goal.z=clamp(goal.z,-limits.target,limits.target);
    goal.yaw=wrap(goal.yaw);goal.pitch=clamp(goal.pitch,limits.minPitch,limits.maxPitch);goal.distance=clamp(goal.distance,limits.minDistance,limits.maxDistance);
  }
  function rotate(deltaYaw,deltaPitch=0) {
    if(finite(deltaYaw))goal.yaw=wrap(goal.yaw+deltaYaw);
    if(finite(deltaPitch))goal.pitch=clamp(goal.pitch+deltaPitch,limits.minPitch,limits.maxPitch);
  }
  function zoom(factor) {if(finite(factor)&&factor>0)goal.distance=clamp(goal.distance*factor,limits.minDistance,limits.maxDistance);}
  function setTarget(x,z,{keepFollowing=false}={}) {
    if(!finite(x)||!finite(z))return;
    goal.x=clamp(x,-limits.target,limits.target);goal.z=clamp(z,-limits.target,limits.target);
    if(!keepFollowing)following=false;
  }
  function pan(dx,dz) {if(finite(dx)&&finite(dz))setTarget(goal.x+dx,goal.z+dz);}
  function panScreen(dx,dy) {
    if(!finite(dx)||!finite(dy))return;
    const scale=distance*.0014;
    pan(-(dx*Math.cos(yaw)+dy*Math.sin(yaw))*scale,(dx*Math.sin(yaw)-dy*Math.cos(yaw))*scale);
  }
  function focus(points) {
    const positions=points.filter(p=>finite(p.x)&&finite(p.z));if(!positions.length)return;
    const center={x:0,z:0};positions.forEach(p=>{center.x+=p.x;center.z+=p.z;});center.x/=positions.length;center.z/=positions.length;
    const radius=Math.max(...positions.map(p=>Math.hypot(p.x-center.x,p.z-center.z)))+2;
    const verticalFov=camera.fov*Math.PI/180,horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*camera.aspect);
    const fit=radius/Math.sin(Math.min(verticalFov,horizontalFov)/2)*1.18;
    setTarget(center.x,center.z,{keepFollowing:true});goal.distance=clamp(Math.max(positions.length===1?16:24,fit),limits.minDistance,limits.maxDistance);
  }
  function setFollowing(value) {following=!!value;}
  function reset({immediate=false}={}) {
    Object.assign(goal,initial);following=false;
    if(immediate){target.set(goal.x,safeHeight(goal.x,goal.z)+.9,goal.z);yaw=goal.yaw;pitch=goal.pitch;distance=goal.distance;}
  }
  function restore(saved) {
    if(!saved||![saved.target?.x,saved.target?.z,saved.yaw,saved.pitch,saved.distance].every(finite))return false;
    goal.x=saved.target.x;goal.z=saved.target.z;goal.yaw=saved.yaw;goal.pitch=saved.pitch;goal.distance=saved.distance;constrain();
    following=saved.following===true;target.set(goal.x,safeHeight(goal.x,goal.z)+.9,goal.z);yaw=goal.yaw;pitch=goal.pitch;distance=goal.distance;
    return true;
  }
  function update(dt=1/60,followTarget=null) {
    if(following&&followTarget&&finite(followTarget.x)&&finite(followTarget.z))setTarget(followTarget.x,followTarget.z,{keepFollowing:true});
    constrain();const alpha=1-Math.exp(-11*clamp(finite(dt)?dt:0,0,.25));
    target.x+=(goal.x-target.x)*alpha;target.z+=(goal.z-target.z)*alpha;target.y=safeHeight(target.x,target.z)+.9;
    yaw=wrap(yaw+wrap(goal.yaw-yaw)*alpha);pitch+=(goal.pitch-pitch)*alpha;distance+=(goal.distance-distance)*alpha;
    const offsetX=Math.sin(yaw)*Math.cos(pitch)*distance,offsetZ=Math.cos(yaw)*Math.cos(pitch)*distance;
    let cameraY=target.y+Math.sin(pitch)*distance;
    // Keep the camera and its view above the sampled terrain at low angles.
    for(let sample=1;sample<=12;sample++){
      const t=sample/12,ground=safeHeight(target.x+offsetX*t,target.z+offsetZ*t)+.55;
      cameraY=Math.max(cameraY,target.y+(ground-target.y)/t);
    }
    camera.position.set(target.x+offsetX,cameraY,target.z+offsetZ);camera.lookAt(target);
  }
  function getState() {
    return {yaw,pitch,distance,target:{x:target.x,y:target.y,z:target.z},following,heading:((Math.round(-yaw*180/Math.PI)%360)+360)%360,position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},goal:{yaw:goal.yaw,pitch:goal.pitch,distance:goal.distance,target:{x:goal.x,z:goal.z}}};
  }
  reset({immediate:true});update(0);
  return {rotate,zoom,pan,panScreen,setTarget,focus,setFollowing,reset,restore,update,getState};
}
