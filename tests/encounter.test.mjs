import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createEncounter, walkPath } from '../dist/js/encounter.js';
import { createWorld } from '../dist/js/world.js';
import { createNavigation } from '../dist/js/navigation.js';

const world = createWorld(THREE);
const navigation = createNavigation(world.colliders);
const starts = [[-13,18],[-10.5,19],[-8,18]];
const speeds = [3.5, 2.9, 3.7];

test('the squad can fight at the south gate without crossing a wall at any supported speed', () => {
  for (const speed of [1, 2, 3]) {
    const actors = starts.map(([x,z],i) => {
      const group = new THREE.Group();
      group.position.set(x,world.groundHeight(x,z),z);
      return {group, speed: speeds[i]};
    });
    const encounter = createEncounter(THREE,world,navigation,actors,{});
    encounter.combat.attack([0,1,2]);
    const dt = speed / 20;
    const bodies = [...actors, encounter.raider].map(a=>a.group.position);
    for (let elapsed=0; elapsed<30 && encounter.combat.enemy.hp; elapsed+=dt) {
      const previous = bodies.map(p=>p.clone());
      encounter.update(dt, elapsed, 1);
      for (const [i,p] of bodies.entries()) {
        assert.ok(navigation.segmentWalkable(previous[i].x,previous[i].z,p.x,p.z));
        assert.ok(Math.abs(p.y-world.groundHeight(p.x,p.z))<1e-6);
      }
    }
    assert.equal(encounter.combat.enemy.phase, 'down');
    assert.ok(encounter.combat.allies.some(f=>f.hp<f.maxHp));
    const saved = JSON.parse(JSON.stringify(encounter.save()));
    encounter.restore();
    assert.equal(encounter.combat.enemy.phase, 'idle');
    encounter.restore(saved);
    assert.deepEqual(encounter.save(), saved);
  }
});

test('walking consumes the same distance across short waypoints at different frame rates', () => {
  for (const dt of [.05, .25]) {
    const actor = {group: new THREE.Group()};
    const path = [{x:0,z:0}, {x:.12,z:0}, {x:.65,z:0}, {x:1,z:0}, {x:1.3,z:0}];
    let travelled = 0;
    for (let i=0;i<1/dt;i++) travelled += walkPath(actor,path,dt,1.25,()=>.5);
    assert.ok(Math.abs(travelled-1.25)<1e-6);
    assert.ok(Math.abs(actor.group.position.x-1.25)<1e-6);
    assert.equal(actor.group.position.y,.5);
    assert.equal(path.length,1);
  }
});
