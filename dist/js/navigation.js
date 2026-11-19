// Grid A*: 8 neighbours, no diagonal corner cutting, circular obstacles.
export function createNavigation(colliders, limit = 73, cell = .6) {
  const size = Math.floor(limit * 2 / cell) + 1;
  const blocked = new Uint8Array(size * size);
  const point = (index) => ({x:(index % size) * cell - limit, z:Math.floor(index / size) * cell - limit});
  const inside = (x,z) => Math.abs(x) < limit && Math.abs(z) < limit;
  const bucketSize=4,buckets=new Map();
  for(const collider of colliders){
    const r=collider.radius+.55;
    for(let x=Math.floor((collider.x-r)/bucketSize);x<=Math.floor((collider.x+r)/bucketSize);x++)for(let z=Math.floor((collider.z-r)/bucketSize);z<=Math.floor((collider.z+r)/bucketSize);z++){
      const key=x+','+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(collider);
    }
  }
  const nearby=(x,z)=>buckets.get(Math.floor(x/bucketSize)+','+Math.floor(z/bucketSize))||[];
  const walkable = (x,z) => inside(x,z) && !nearby(x,z).some(c => (x-c.x)**2 + (z-c.z)**2 < (c.radius + .55)**2);
  const segmentWalkable = (ax,az,bx,bz) => {
    const dx=bx-ax,dz=bz-az,lengthSq=dx*dx+dz*dz;
    const candidates=new Set();
    for(let x=Math.floor(Math.min(ax,bx)/bucketSize);x<=Math.floor(Math.max(ax,bx)/bucketSize);x++)for(let z=Math.floor(Math.min(az,bz)/bucketSize);z<=Math.floor(Math.max(az,bz)/bucketSize);z++)for(const c of buckets.get(x+','+z)||[])candidates.add(c);
    return ![...candidates].some(c=>{
      const radius=c.radius+.55;
      if(c.x<Math.min(ax,bx)-radius||c.x>Math.max(ax,bx)+radius||c.z<Math.min(az,bz)-radius||c.z>Math.max(az,bz)+radius)return false;
      const t=lengthSq?Math.max(0,Math.min(1,((c.x-ax)*dx+(c.z-az)*dz)/lengthSq)):0;
      return (ax+t*dx-c.x)**2+(az+t*dz-c.z)**2<radius*radius;
    });
  };
  for (let i = 0; i < blocked.length; i++) { const p=point(i); blocked[i]=walkable(p.x,p.z)?0:1; }
  const nearest = (x,z,requireConnection=false) => {
    const gx=Math.max(0,Math.min(size-1,Math.round((x+limit)/cell)));
    const gz=Math.max(0,Math.min(size-1,Math.round((z+limit)/cell)));
    for(let radius=0;radius<12;radius++) {
      let best=-1, distance=Infinity;
      for(let dz=-radius;dz<=radius;dz++) for(let dx=-radius;dx<=radius;dx++) {
        if(radius && Math.abs(dx)!==radius && Math.abs(dz)!==radius) continue;
        const cx=gx+dx, cz=gz+dz;
        if(cx<0||cz<0||cx>=size||cz>=size)continue;
        const index=cz*size+cx;
        if(blocked[index])continue;
        const p=point(index),d=(p.x-x)**2+(p.z-z)**2;
        if(requireConnection&&!segmentWalkable(x,z,p.x,p.z))continue;
        if(d<distance){distance=d;best=index;}
      }
      if(best!==-1)return best;
    }
    return -1;
  };
  function findPath(from, to) {
    const start=nearest(from.x,from.z,true), goal=nearest(to.x,to.z);
    if(start<0||goal<0)return [];
    const scores=new Float32Array(size*size).fill(Infinity), parent=new Int32Array(size*size).fill(-1), closed=new Uint8Array(size*size), heap=[];
    const goalX=goal%size, goalZ=Math.floor(goal/size);
    const heuristic=i=>{const dx=Math.abs(i%size-goalX), dz=Math.abs(Math.floor(i/size)-goalZ);return Math.max(dx,dz)+.414214*Math.min(dx,dz);};
    const push=(i,f)=>{let k=heap.length;heap.push({i,f});while(k){const p=(k-1)>>1;if(heap[p].f<=f)break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
    const pop=()=>{const first=heap[0], last=heap.pop();if(heap.length){heap[0]=last;let k=0;while(true){let m=k,l=k*2+1,r=l+1;if(l<heap.length&&heap[l].f<heap[m].f)m=l;if(r<heap.length&&heap[r].f<heap[m].f)m=r;if(m===k)break;[heap[k],heap[m]]=[heap[m],heap[k]];k=m;}}return first.i;};
    scores[start]=0;push(start,heuristic(start));
    while(heap.length){
      const current=pop();if(closed[current])continue;
      if(current===goal){const result=[];let i=current;while(i!==start&&i!==-1){result.push(point(i));i=parent[i];}result.reverse();const first=point(start);if(Math.hypot(first.x-from.x,first.z-from.z)>.08)result.unshift(first);return result;}
      closed[current]=1;
      const x=current%size,z=Math.floor(current/size);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;
        if(nx<0||nz<0||nx>=size||nz>=size)continue;
        const next=nz*size+nx;if(blocked[next]||closed[next])continue;
        if(dx&&dz&&(blocked[z*size+nx]||blocked[nz*size+x]))continue;
        const cp=point(current),np=point(next);
        if(!segmentWalkable(cp.x,cp.z,np.x,np.z))continue;
        const cost=scores[current]+(dx&&dz?Math.SQRT2:1);
        if(cost<scores[next]){scores[next]=cost;parent[next]=current;push(next,cost+heuristic(next));}
      }
    }
    return [];
  }
  return {findPath, walkable, segmentWalkable, nearestPoint(x,z){const i=nearest(x,z);return i<0?null:point(i);}};
}
