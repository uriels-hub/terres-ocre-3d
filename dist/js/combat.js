const profiles = [
  { hp: 65, damage: 9, windup: .58, recovery: 1.12 },   // Nara
  { hp: 98, damage: 14, windup: .68, recovery: 1.18 },  // Brak
  { hp: 78, damage: 10, windup: .48, recovery: 1.02 },  // Ivo
  { hp: 88, damage: 17, windup: .86, recovery: 1.12 }   // Marauder
];
const enemyId = 3;
const meleeRange = 1.4;
const hitRange = 1.6;
const noticeRange = 5.5;
const pursuitRange = 9;
const epsilon = 1e-9;

export function createCombat() {
  const fighters = profiles.map((profile, id) => ({
    id, maxHp: profile.hp, hp: profile.hp, phase: 'idle', targetId: null, remaining: 0,
    get progress() {
      if (this.phase !== 'windup' && this.phase !== 'recovery') return 0;
      return Math.min(1, Math.max(0, 1 - this.remaining / profile[this.phase]));
    }
  }));
  const allies = fighters.slice(0, enemyId);
  const enemy = fighters[enemyId];

  function reset() {
    for (const fighter of fighters) {
      Object.assign(fighter, { hp: fighter.maxHp, phase: 'idle', targetId: null, remaining: 0 });
    }
  }

  function disengage(fighter) {
    // A move can interrupt a windup. Reissuing attack still owes any post-hit recovery.
    if (fighter.phase === 'windup') fighter.remaining = 0;
    fighter.phase = fighter.hp > 0 ? 'idle' : 'down';
    fighter.targetId = null;
  }

  function attack(indices) {
    if (!enemy.hp) return false;
    let accepted = false;
    for (const index of indices) {
      const ally = allies[index];
      if (!Number.isInteger(index) || !ally?.hp) continue;
      if (ally.targetId === null) {
        ally.targetId = enemyId;
        ally.phase = 'chase';
      }
      accepted = true;
    }
    return accepted;
  }

  function cancel(indices) {
    for (const index of indices) {
      if (Number.isInteger(index) && allies[index]) disengage(allies[index]);
    }
  }

  // Positions stay owned by navigation. Check its obstacle clearance both before and at impact.
  function update(dt, positions, canReach = () => true) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0) return events;
    function distance(a, b) {
      const from = positions[a], to = positions[b];
      if (!from || !to) return Infinity;
      return Math.hypot(from.x - to.x, from.z - to.z);
    }
    function inReach(fighter, radius) {
      return distance(fighter.id, fighter.targetId) <= radius &&
        canReach(positions[fighter.id], positions[fighter.targetId]);
    }

    function resolveWindup(fighter) {
      const target = fighters[fighter.targetId];
      const landed = inReach(fighter, hitRange);
      const damage = landed ? Math.min(profiles[fighter.id].damage, target.hp) : 0;
      events.push({ type: landed ? 'hit' : 'miss', sourceId: fighter.id, targetId: target.id, damage });
      fighter.phase = 'recovery';
      fighter.remaining = profiles[fighter.id].recovery;
      target.hp -= damage;
      if (target.hp === 0) {
        disengage(target);
        target.remaining = 0;
        events.push({ type: 'down', sourceId: fighter.id, targetId: target.id, damage: 0 });
      }
    }

    function advancePhases() {
      for (const fighter of fighters) {
        if (fighter.targetId !== null && !fighters[fighter.targetId].hp) disengage(fighter);
        if (fighter.phase === 'windup' && fighter.remaining === 0) resolveWindup(fighter);
      }
      if (enemy.targetId !== null && distance(enemyId, enemy.targetId) > pursuitRange) disengage(enemy);
      if (enemy.hp && enemy.targetId === null) {
        let nearest = Infinity;
        for (const ally of allies) {
          const range = distance(enemyId, ally.id);
          if (ally.targetId === enemyId && range <= noticeRange && range < nearest) {
            nearest = range;
            enemy.targetId = ally.id;
            enemy.phase = 'chase';
          }
        }
      }
      for (const fighter of fighters) {
        if (fighter.targetId === null) continue;
        if (!fighters[fighter.targetId].hp) {
          disengage(fighter);
          continue;
        }
        if (fighter.phase === 'windup' || (fighter.phase === 'recovery' && fighter.remaining > 0)) continue;
        if (!inReach(fighter, meleeRange)) {
          fighter.phase = 'chase';
        } else if (fighter.remaining > 0) {
          fighter.phase = 'recovery';
        } else {
          fighter.phase = 'windup';
          fighter.remaining = profiles[fighter.id].windup;
        }
      }
    }

    // Visit each timed transition in chronological order, including at high game speeds.
    advancePhases();
    while (dt > 0) {
      let next = Infinity;
      for (const fighter of fighters) {
        if (fighter.remaining > 0) next = Math.min(next, fighter.remaining);
      }
      if (!Number.isFinite(next)) break;
      const step = Math.min(dt, next);
      for (const fighter of fighters) {
        fighter.remaining = Math.max(0, fighter.remaining - step);
        if (fighter.remaining <= epsilon) fighter.remaining = 0;
      }
      dt -= step;
      advancePhases();
    }
    return events;
  }

  function save() {
    return { version: 1, fighters: fighters.map(({ hp, phase, targetId, remaining }) =>
      ({ hp, phase, targetId, remaining })) };
  }

  function restore(data) {
    reset();
    if (data?.version !== 1 || !Array.isArray(data.fighters) || data.fighters.length !== fighters.length) return false;
    for (const [id, entry] of data.fighters.entries()) {
      if (!entry || !Number.isInteger(entry.hp) || entry.hp < 0 || entry.hp > profiles[id].hp) return false;
      const { phase, targetId, remaining } = entry;
      if (!['idle', 'chase', 'windup', 'recovery', 'down'].includes(phase)) return false;
      if ((phase === 'down') !== (entry.hp === 0)) return false;
      if (phase === 'idle' || phase === 'down') {
        if (targetId !== null) return false;
      } else if (id === enemyId ? !Number.isInteger(targetId) || !allies[targetId] : targetId !== enemyId) {
        return false;
      }
      const maxTime = phase === 'windup' ? profiles[id].windup : profiles[id].recovery;
      if (!Number.isFinite(remaining) || remaining < 0 || remaining > maxTime || (phase === 'down' && remaining !== 0)) return false;
    }
    for (const fighter of fighters) {
      const { hp, phase, targetId, remaining } = data.fighters[fighter.id];
      Object.assign(fighter, { hp, phase, targetId, remaining });
    }
    for (const fighter of fighters) {
      if (fighter.targetId !== null && !fighters[fighter.targetId].hp) disengage(fighter);
    }
    return true;
  }

  return { allies, enemy, attack, cancel, update, save, restore, reset };
}
