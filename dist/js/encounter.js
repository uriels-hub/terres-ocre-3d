import { createCharacter } from './characters.js';
import { createCombat } from './combat.js';

const raiderSpawn = {x: 5.5, z: 17};
const approachAngles = [-2.6, -1.55, -.5];

function face(actor, dx, dz, dt) {
  if (Math.hypot(dx, dz) < .001) return;
  const angle = Math.atan2(dx, dz) - actor.group.rotation.y;
  actor.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(1, dt * 13);
}

export function walkPath(actor, path, dt, speed, groundHeight) {
  const p = actor.group.position;
  let budget = speed * dt;
  let travelled = 0;
  while (budget > 0 && path.length) {
    const dx = path[0].x - p.x, dz = path[0].z - p.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(budget, distance);
    if (distance > 0) {
      face(actor, dx, dz, dt);
      p.x += dx * step / distance;
      p.z += dz * step / distance;
    }
    if (step === distance) path.shift();
    travelled += step;
    budget -= step;
  }
  if (travelled) p.y = groundHeight(p.x, p.z);
  return travelled;
}

export function createEncounter(THREE, world, navigation, actors, textures) {
  const combat = createCombat();
  const raider = createCharacter(THREE, {role: 'raider', npc: true, textures, color: 0xc25b38});
  const models = [...actors, raider];
  const fighters = [...combat.allies, combat.enemy];
  const positions = models.map(model => model.group.position);
  const tracks = models.map(() => ({}));
  const canReach = (a, b) => navigation.segmentWalkable(a.x, a.z, b.x, b.z);
  raider.group.userData.hostile = true;
  const warning = new THREE.Mesh(new THREE.RingGeometry(.94, 1.05, 36),
    new THREE.MeshBasicMaterial({color: 0xff8452, side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false}));
  warning.rotation.x = -Math.PI / 2;
  warning.position.y = .075;
  warning.visible = false;
  raider.group.add(warning);

  function placeRaider(point) {
    const valid = point && navigation.walkable(point.x, point.z) ? point : navigation.nearestPoint(raiderSpawn.x, raiderSpawn.z);
    raider.group.position.set(valid.x, world.groundHeight(valid.x, valid.z), valid.z);
    raider.group.rotation.y = -Math.PI / 2;
  }
  function restore(saved) {
    combat.restore(saved?.rules);
    const point = saved?.position;
    placeRaider(point && Number.isFinite(point.x) && Number.isFinite(point.z) ? point : raiderSpawn);
    tracks.forEach(track => Object.assign(track, {path: [], nextPlan: 0, targetId: null, hitUntil: 0, strikeAt: -Infinity, fellAt: -Infinity}));
    models.forEach(model => { model.moving = false; });
  }
  function save() {
    const {x, z} = raider.group.position;
    return {rules: combat.save(), position: {x, z}};
  }
  function plan(id, targetId) {
    const from = positions[id], target = positions[targetId];
    let goal = target;
    if (id < actors.length) {
      const offset = {x: target.x + Math.sin(approachAngles[id]), z: target.z + Math.cos(approachAngles[id])};
      if (navigation.walkable(offset.x, offset.z) && canReach(offset, target)) goal = offset;
    }
    return canReach(from, goal) ? [{x: goal.x, z: goal.z}] : navigation.findPath(from, goal);
  }
  function update(dt, elapsed, waterFactor) {
    const events = combat.update(dt, positions, canReach);
    for (const event of events) {
      if (event.type === 'hit' || event.type === 'miss') tracks[event.sourceId].strikeAt = elapsed;
      if (event.type === 'hit') tracks[event.targetId].hitUntil = elapsed + .23;
      if (event.type === 'down') tracks[event.targetId].fellAt = elapsed;
    }
    fighters.forEach((fighter, id) => {
      const model = models[id], track = tracks[id];
      model.moving = false;
      if (fighter.phase === 'chase') {
        if (track.targetId !== fighter.targetId || elapsed >= track.nextPlan) {
          track.path = plan(id, fighter.targetId);
          track.nextPlan = elapsed + .45;
          track.targetId = fighter.targetId;
        }
        const speed = id < actors.length ? model.speed * waterFactor : 2.75;
        model.moving = walkPath(model, track.path, dt, speed, world.groundHeight) > 0;
      } else {
        track.targetId = null;
        if (fighter.targetId != null && fighter.phase !== 'down') {
          const target = positions[fighter.targetId], from = positions[id];
          face(model, target.x - from.x, target.z - from.z, dt);
        }
      }
    });
    return events;
  }
  function animate(elapsed, selected) {
    fighters.forEach((fighter, id) => {
      const model = models[id], track = tracks[id];
      let action = 'idle', progress = 0;
      if (fighter.phase === 'down') {
        action = 'ko'; progress = Math.min(1, (elapsed - track.fellAt) / .55);
      } else if (elapsed - track.strikeAt < .34) {
        action = 'attack'; progress = (elapsed - track.strikeAt) / .34;
      } else if (fighter.phase === 'recovery' && fighter.progress < .28) {
        action = 'attack'; progress = fighter.progress / .28;
      } else if (track.hitUntil > elapsed) {
        action = 'hit'; progress = 1 - (track.hitUntil - elapsed) / .23;
      } else if (fighter.phase === 'windup') {
        action = 'windup'; progress = fighter.progress;
      }
      model.animate(elapsed, model.moving ? 1.8 : 0, selected.has(id), action, progress);
    });
    warning.visible = combat.enemy.phase === 'windup';
    if (warning.visible) warning.scale.setScalar(.85 + combat.enemy.progress * .85);
  }
  restore();
  return {combat, raider, update, animate, save, restore};
}
