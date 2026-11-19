import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombat } from '../dist/js/combat.js';

const point = x => ({ x, z: 0 });
const melee = [point(0), point(.3), point(-.35), point(1)];

test('the enemy stays neutral until an ordered ally approaches, then pursues only that ally', () => {
  const combat = createCombat();
  const positions = [point(-20), point(0), point(-30), point(1)];
  combat.update(5, positions);
  assert.equal(combat.enemy.phase, 'idle');
  assert.equal(combat.attack([0]), true);
  combat.update(.1, positions);
  assert.equal(combat.allies[0].phase, 'chase');
  assert.equal(combat.enemy.phase, 'idle');
  positions[0] = point(-3);
  combat.update(.1, positions);
  assert.equal(combat.enemy.targetId, 0);
  assert.equal(combat.enemy.phase, 'chase');
  assert.equal(combat.allies[1].phase, 'idle');
  combat.cancel([0]);
  combat.update(.1, positions);
  assert.equal(combat.allies[0].phase, 'idle');
  assert.equal(combat.enemy.targetId, 0);
  positions[0] = point(-15);
  combat.update(.1, positions);
  assert.equal(combat.enemy.phase, 'idle');
});

test('windup is visible before damage, repeated orders preserve it, and pausing freezes both sides', () => {
  const combat = createCombat();
  combat.attack([0]);
  assert.deepEqual(combat.update(.2, melee), []);
  const nara = combat.allies[0];
  assert.equal(nara.phase, 'windup');
  assert.ok(nara.progress > 0 && nara.progress < 1);
  assert.equal(combat.enemy.hp, combat.enemy.maxHp);
  const paused = combat.save();
  combat.attack([0]);
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(combat.update(dt, melee), []);
  assert.deepEqual(combat.save(), paused);
  const hits = combat.update(.38, melee);
  assert.deepEqual(hits, [{ type: 'hit', sourceId: 0, targetId: 3, damage: 9 }]);
  assert.equal(nara.phase, 'recovery');
  assert.equal(combat.enemy.hp, combat.enemy.maxHp - 9);
  assert.equal(combat.update(.28, melee)[0].sourceId, 3);
  assert.equal(nara.hp, nara.maxHp - 17);
});

test('crossing out of reach or behind cover during windup evades the hit', () => {
  for (const escape of ['distance', 'cover']) {
    const combat = createCombat();
    const positions = [...melee];
    combat.attack([0]);
    combat.update(.4, positions);
    if (escape === 'distance') positions[3] = point(3);
    const events = combat.update(.2, positions, () => escape !== 'cover');
    assert.deepEqual(events, [{ type: 'miss', sourceId: 0, targetId: 3, damage: 0 }]);
    assert.equal(combat.enemy.hp, combat.enemy.maxHp);
    combat.update(2, positions, () => escape !== 'cover');
    assert.equal(combat.allies[0].phase, 'chase');
  }
});

test('cancel can interrupt a telegraph but cannot shorten recovery after a hit', () => {
  const combat = createCombat();
  combat.attack([0]);
  combat.update(.4, melee);
  combat.cancel([0]);
  assert.equal(combat.update(.3, melee).length, 0);
  assert.equal(combat.enemy.hp, combat.enemy.maxHp);
  combat.attack([0]);
  combat.update(.58, melee);
  const afterHit = combat.enemy.hp;
  combat.cancel([0]);
  combat.attack([0]);
  combat.update(1.1, melee);
  assert.equal(combat.allies[0].phase, 'recovery');
  assert.equal(combat.enemy.hp, afterHit);
});

test('the squad can defeat the opponent, who stays down, including after save and restore', () => {
  const combat = createCombat();
  combat.attack([0, 1, 2]);
  const events = combat.update(20, melee);
  assert.equal(events.filter(event => event.type === 'down' && event.targetId === 3).length, 1);
  assert.equal(combat.enemy.hp, 0);
  assert.equal(combat.enemy.phase, 'down');
  assert.ok(combat.allies.every(ally => ally.hp > 0 && ally.phase === 'idle'));
  const restored = createCombat();
  assert.equal(restored.restore(combat.save()), true);
  assert.equal(restored.attack([0, 1, 2]), false);
  assert.deepEqual(restored.update(30, melee), []);
  restored.reset();
  assert.equal(restored.enemy.hp, restored.enemy.maxHp);
  assert.equal(restored.enemy.phase, 'idle');
});

test('a downed ally releases its target and cannot receive another attack order', () => {
  const combat = createCombat();
  combat.attack([0]);
  const events = combat.update(20, melee);
  assert.ok(events.some(event => event.type === 'down' && event.targetId === 0));
  assert.equal(combat.allies[0].phase, 'down');
  assert.equal(combat.enemy.phase, 'idle');
  assert.equal(combat.attack([0]), false);
  assert.equal(combat.attack([0, 1]), true);
  combat.update(.1, melee);
  assert.equal(combat.enemy.targetId, 1);
});

test('different frame sizes preserve the sequence of impacts and mid-fight saves resume the same timeline', () => {
  const original = createCombat(), restored = createCombat(), stepped = createCombat();
  original.attack([0, 1, 2]);
  stepped.attack([0, 1, 2]);
  const events = original.update(.74, melee);
  assert.equal(restored.restore(JSON.parse(JSON.stringify(original.save()))), true);
  const more = original.update(4.26, melee);
  assert.deepEqual(restored.update(4.26, melee), more);
  assert.deepEqual(restored.save(), original.save());
  const split = [];
  for (let i = 0; i < 100; i++) split.push(...stepped.update(.05, melee));
  assert.deepEqual(split, [...events, ...more]);
  for (const [index, fighter] of stepped.save().fighters.entries()) {
    const expected = original.save().fighters[index];
    assert.equal(fighter.hp, expected.hp);
    assert.equal(fighter.phase, expected.phase);
    assert.ok(Math.abs(fighter.remaining - expected.remaining) < 1e-8);
  }
});

test('absent and malformed combat saves restore a fresh encounter atomically', () => {
  const fresh = createCombat().save(), combat = createCombat();
  const invalid = structuredClone(fresh);
  invalid.fighters[0].hp = 3;
  invalid.fighters[3].remaining = Infinity;
  const targetingSelf = structuredClone(fresh);
  Object.assign(targetingSelf.fighters[3], { phase: 'chase', targetId: 3 });
  for (const input of [undefined, {}, invalid, targetingSelf]) {
    combat.attack([0]);
    combat.update(1, melee);
    assert.equal(combat.restore(input), false);
    assert.deepEqual(combat.save(), fresh);
  }
});
