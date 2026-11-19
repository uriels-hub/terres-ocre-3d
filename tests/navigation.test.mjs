import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createWorld } from '../dist/js/world.js';
import { createNavigation } from '../dist/js/navigation.js';

const world = createWorld(THREE, {});
const navigation = createNavigation(world.colliders);
const spawn = { x: -12, z: 17 };
const actorStarts = [spawn, { x: -13, z: 18 }, { x: -10.5, z: 19 }, { x: -8, z: 18 }];
const characterRadius = 0.55;
const sampleSpacing = 0.035;

// Check the continuous movement used by actors, independently of the A* grid.
// Sampling catches clipped poles/walls even when both waypoints are free.
function assertClearRoute(from, path, label) {
  assert.ok(path.length > 0, `${label}: no route`);
  let previous = from;
  for (const [index, waypoint] of path.entries()) {
    assert.ok(Number.isFinite(waypoint.x) && Number.isFinite(waypoint.z), `${label}: invalid waypoint`);
    assert.ok(Math.abs(waypoint.x) < 73 && Math.abs(waypoint.z) < 73, `${label}: out of bounds`);
    const length = Math.hypot(waypoint.x - previous.x, waypoint.z - previous.z);
    const samples = Math.max(1, Math.ceil(length / sampleSpacing));
    for (let sample = 0; sample <= samples; sample++) {
      const t = sample / samples;
      const x = previous.x + (waypoint.x - previous.x) * t;
      const z = previous.z + (waypoint.z - previous.z) * t;
      for (const obstacle of world.colliders) {
        const clearance = Math.hypot(x - obstacle.x, z - obstacle.z) - obstacle.radius;
        if (clearance < characterRadius - 1e-7) {
          assert.fail(`${label}: segment ${index} intersects obstacle at (${x.toFixed(4)}, ${z.toFixed(4)}), clearance ${clearance.toFixed(5)}`);
        }
      }
    }
    previous = waypoint;
  }
}

function assertResourceApproach(from, resource, label) {
  const path = navigation.findPath(from, resource.position);
  assertClearRoute(from, path, label);
  const end = path.at(-1);
  assert.ok(Math.hypot(end.x - resource.position.x, end.z - resource.position.z) < 5,
    `${label}: actor stops outside collection range`);
  return path;
}

test('each initial actor position can approach every resource without clipping obstacles', () => {
  assert.equal(world.resourceNodes.length, 9);
  for (const [index, start] of actorStarts.entries()) {
    assert.ok(navigation.walkable(start.x, start.z), `initial position ${index} is blocked`);
    for (const resource of world.resourceNodes) {
      assertResourceApproach(start, resource, `start ${index} -> ${resource.id}`);
    }
  }
});

test('all ordered resource-to-resource journeys remain inside free movement space', () => {
  for (const from of world.resourceNodes) {
    for (const to of world.resourceNodes) {
      if (from === to) continue;
      assertResourceApproach(from.position, to, `${from.id} -> ${to.id}`);
    }
  }
});

test('all eight adobe interiors can be entered and exited through the actual door openings', () => {
  const buildings = world.group.children.filter(object => object.userData.type === 'building');
  assert.equal(buildings.length, 8);
  for (const building of buildings) {
    const destination = { x: building.position.x, z: building.position.z };
    const arrival = navigation.findPath(spawn, destination);
    assertClearRoute(spawn, arrival, `enter ${building.name}`);
    const end = arrival.at(-1);
    assert.ok(Math.hypot(end.x - destination.x, end.z - destination.z) < 1.4,
      `${building.name}: destination is outside the room center`);
    assertClearRoute(end, navigation.findPath(end, spawn), `leave ${building.name}`);
  }
});

test('regression: a route around the west awning cannot clip the thin support pole', () => {
  const from = { x: 1.2032282747945502, z: -11.54375019666464 };
  const path = navigation.findPath(from, spawn);
  // The old route contained (-0.2,-7.2) -> (-0.2,-5.8), cutting through
  // the expanded pole at (-0.8172431115,-6.6795225221) by 0.113 units.
  assertClearRoute(from, path, 'west awning regression');
  const end = path.at(-1);
  assert.ok(Math.hypot(end.x - spawn.x, end.z - spawn.z) < 2);
});

test('regression: reconnecting an off-grid position must preserve a safe first segment', () => {
  const from = { x: 19.950382100137016, z: -22.026825163348974 };
  assert.ok(navigation.walkable(from.x, from.z));
  assertClearRoute(from, navigation.findPath(from, spawn), 'off-grid start regression');
});

test('interrupted movement can be redirected from deterministic positions between waypoints', () => {
  let seed = 20261119;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const journeys = world.resourceNodes.map(resource => navigation.findPath(spawn, resource.position));
  for (let iteration = 0; iteration < 32; iteration++) {
    const route = journeys[Math.floor(random() * journeys.length)];
    const index = Math.floor(random() * route.length);
    const before = index === 0 ? spawn : route[index - 1];
    const after = route[index];
    const fraction = 0.13 + random() * 0.74;
    const from = { x: before.x + (after.x - before.x) * fraction,
      z: before.z + (after.z - before.z) * fraction };
    const target = world.resourceNodes[Math.floor(random() * world.resourceNodes.length)];
    assertResourceApproach(from, target, `redirect ${iteration} -> ${target.id}`);
  }
});

test('a blocked starting position never produces a route that teleports through a wall', () => {
  for (const obstacle of world.colliders.slice(0, 4)) {
    assert.deepEqual(navigation.findPath({ x: obstacle.x, z: obstacle.z }, spawn), []);
  }
});
