/* Original low-poly characters. Facing +Z; the root origin stays at the feet. */
const geometryCaches = new WeakMap();

function geometries(THREE) {
  let cache = geometryCaches.get(THREE);
  if (!cache) {
    cache = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
      taper: new THREE.CylinderGeometry(0.8, 1, 1, 8),
      cone: new THREE.ConeGeometry(1, 1, 8),
      sphere: new THREE.SphereGeometry(1, 8, 5),
      ring: new THREE.RingGeometry(0.48, 0.53, 40),
      marker: new THREE.OctahedronGeometry(0.07, 0),
    };
    geometryCaches.set(THREE, cache);
  }
  return cache;
}

/**
 * @param {object} THREE Injected Three.js namespace (r170).
 * @param {object} config { role, textures, color, npc }
 * @returns {{group: object, animate: Function, setSelected: Function}}
 */
export function createCharacter(THREE, config = {}) {
  const role = ['prospector', 'guard', 'automaton'].includes(config.role)
    ? config.role : 'prospector';
  const textures = config.textures || {};
  const geo = geometries(THREE);
  const group = new THREE.Group();
  group.name = 'character-' + role;
  group.userData.role = role;
  group.userData.npc = Boolean(config.npc);

  const visual = new THREE.Group();
  visual.name = 'animated-body';
  group.add(visual);

  const makeMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.05, flatShading: true, ...options,
  });
  const teamColor = typeof config.color === 'number' ? config.color : 0xc5aa7d;
  const material = {
    cloth: makeMaterial(role === 'guard' ? 0x82735b : 0xc29b62, { map: textures.cloth || null }),
    pale: makeMaterial(0xc3b99b, { map: textures.cloth || null }),
    darkCloth: makeMaterial(0x575447, { map: textures.cloth || null }),
    leather: makeMaterial(0x715a3e),
    darkLeather: makeMaterial(0x413c32),
    metal: makeMaterial(0x68665b, { map: textures.rust || null, metalness: 0.48, roughness: 0.8 }),
    darkMetal: makeMaterial(0x353d3b, { metalness: 0.58, roughness: 0.66 }),
    green: makeMaterial(0x879182, { map: textures.rust || null, metalness: 0.38 }),
    skin: makeMaterial(role === 'guard' ? 0xa87e5d : 0xbd9670),
    hair: makeMaterial(0x383027),
    black: makeMaterial(0x151d1d, { roughness: 0.65 }),
    accent: makeMaterial(teamColor, { roughness: 0.8 }),
    optic: makeMaterial(0xadd5bc, { emissive: 0x49765c, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.15 }),
  };

  function part(parent, kind, mat, position, scale, rotation) {
    const mesh = new THREE.Mesh(geo[kind], mat);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function node(parent, x = 0, y = 0, z = 0) {
    const child = new THREE.Group();
    child.position.set(x, y, z);
    parent.add(child);
    return child;
  }
  function bar(parent, start, end, thickness, mat, depth = thickness) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const mesh = part(parent, 'box', mat, a.clone().add(b).multiplyScalar(0.5).toArray(),
      [thickness, delta.length(), depth]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return mesh;
  }
  function rivet(parent, x, y, z, size = 0.018) {
    return part(parent, 'sphere', material.pale, [x, y, z], [size, size, size * 0.55]);
  }
  function backpack(parent, heavy = false, robot = false) {
    const z = heavy ? -0.35 : -0.26;
    const w = heavy ? 0.48 : 0.35;
    const h = heavy ? 0.56 : 0.42;
    const mat = robot ? material.darkCloth : material.leather;
    part(parent, 'box', mat, [0, 1.28, z], [w, h, 0.23]);
    part(parent, 'box', material.pale, [0, 1.43, z - 0.13], [w * 0.94, 0.12, 0.025], [-0.15, 0, 0]);
    for (const x of [-w * 0.3, w * 0.3]) {
      part(parent, 'box', material.darkLeather, [x, 1.28, z - 0.128], [0.035, h * 0.92, 0.018]);
      part(parent, 'box', material.metal, [x, 1.26, z - 0.146], [0.055, 0.05, 0.015]);
    }
    const rollY = 1.32 + h * 0.5;
    part(parent, 'cylinder', material.pale, [0, rollY, z], [0.09, w + 0.14, 0.09], [0, 0, Math.PI / 2]);
    for (const x of [-w * 0.32, w * 0.32]) {
      part(parent, 'cylinder', material.darkLeather, [x, rollY, z], [0.095, 0.025, 0.095], [0, 0, Math.PI / 2]);
    }
    part(parent, 'cylinder', material.darkMetal, [w * 0.5 + 0.045, 1.2, z], [0.055, 0.23, 0.055]);
  }

  const arms = [];
  const legs = [];
  let head;

  function humanLeg(side, heavy) {
    const pivot = node(visual, side * (heavy ? 0.19 : 0.145), 0.99, 0);
    const legWidth = heavy ? 0.12 : 0.095;
    part(pivot, 'taper', material.darkCloth, [0, -0.205, 0], [legWidth, 0.4, legWidth]);
    const knee = node(pivot, 0, -0.43, 0);
    part(knee, 'sphere', material.darkCloth, [0, 0, 0], [legWidth, 0.075, legWidth]);
    part(knee, 'cylinder', heavy ? material.darkLeather : material.cloth,
      [0, -0.205, 0], [legWidth * 0.78, 0.37, legWidth * 0.78]);
    for (const y of [-0.12, -0.28]) {
      part(knee, 'cylinder', material.pale, [0, y, 0], [legWidth * 0.83, 0.045, legWidth * 0.83]);
    }
    part(knee, 'box', material.darkLeather, [0, -0.475, 0.065], [heavy ? 0.23 : 0.185, 0.16, 0.31]);
    part(knee, 'box', material.black, [0, -0.535, 0.07], [heavy ? 0.245 : 0.195, 0.045, 0.325]);
    if (heavy) {
      part(knee, 'box', material.metal, [0, -0.025, 0.105], [0.19, 0.15, 0.065], [-0.12, 0, 0]);
      part(knee, 'box', material.metal, [0, -0.25, 0.095], [0.15, 0.23, 0.045]);
      rivet(knee, 0, -0.25, 0.125);
    }
    legs.push({ pivot, knee, side });
  }

  function humanArm(side, heavy) {
    const pivot = node(visual, side * (heavy ? 0.385 : 0.285), 1.49, 0);
    pivot.rotation.z = -side * (heavy ? 0.06 : 0.07);
    part(pivot, 'sphere', material.cloth, [0, -0.035, 0], [heavy ? 0.155 : 0.105, 0.12, 0.12]);
    part(pivot, 'taper', material.cloth, [0, -0.18, 0], [heavy ? 0.1 : 0.078, 0.28, 0.085]);
    const elbow = node(pivot, 0, -0.34, 0.005);
    part(elbow, 'sphere', material.darkCloth, [0, 0, 0], [0.075, 0.07, 0.075]);
    part(elbow, 'taper', material.pale, [0, -0.12, 0.015], [heavy ? 0.082 : 0.065, 0.25, 0.072]);
    for (const y of [-0.05, -0.19]) {
      part(elbow, 'cylinder', material.darkLeather, [0, y, 0.015], [heavy ? 0.086 : 0.07, 0.035, 0.078]);
    }
    part(elbow, 'box', material.darkLeather, [0, -0.29, 0.025], [heavy ? 0.12 : 0.095, 0.13, 0.11]);
    part(elbow, 'box', material.skin, [side * 0.045, -0.285, 0.07], [0.035, 0.065, 0.045]);
    if (heavy) {
      part(pivot, 'box', material.metal, [0, -0.025, 0.01], [side < 0 ? 0.29 : 0.23, side < 0 ? 0.18 : 0.13, 0.31], [0, 0, -side * 0.18]);
      part(pivot, 'box', material.metal, [0, -0.19, 0.08], [0.17, 0.17, 0.08]);
      part(elbow, 'box', material.metal, [0, -0.12, 0.095], [0.15, 0.21, 0.06]);
      rivet(pivot, 0, -0.015, 0.18);
    } else {
      part(pivot, 'box', material.accent, [0, -0.12, 0.09], [0.13, 0.065, 0.025]);
    }
    arms.push({ pivot, elbow, side });
    return elbow;
  }

  function buildHuman(heavy) {
    const torsoWidth = heavy ? 0.61 : 0.45;
    part(visual, 'taper', material.cloth, [0, 1.255, 0], [torsoWidth * 0.56, 0.5, heavy ? 0.205 : 0.165]);
    part(visual, 'box', material.darkLeather, [0, 1.035, 0.015], [torsoWidth * 1.03, 0.095, 0.34]);
    part(visual, 'box', material.metal, [0.015, 1.035, 0.2], [0.1, 0.085, 0.035]);
    for (const side of [-1, 1]) {
      humanLeg(side, heavy);
      part(visual, 'box', material.cloth, [side * torsoWidth * 0.28, 0.86, 0.135],
        [torsoWidth * 0.49, heavy ? 0.42 : 0.32, 0.065], [0.06, 0, side * 0.08]);
      part(visual, 'box', material.leather, [side * torsoWidth * 0.53, 1.0, 0.04], [0.12, 0.16, 0.17]);
      rivet(visual, side * torsoWidth * 0.53, 1.04, 0.135, 0.014);
    }
    part(visual, 'box', material.darkCloth, [0, 0.98, -0.17], [torsoWidth * 0.9, heavy ? 0.66 : 0.44, 0.07], [-0.12, 0, 0]);
    bar(visual, [-torsoWidth * 0.35, 1.48, 0.17], [torsoWidth * 0.28, 1.075, 0.19], 0.065, material.leather, 0.035);
    bar(visual, [torsoWidth * 0.35, 1.48, 0.17], [torsoWidth * 0.25, 1.075, 0.19], 0.045, material.darkLeather, 0.03);
    part(visual, 'cylinder', material.pale, [0, 1.535, 0], [0.15, 0.15, 0.14]);
    part(visual, 'box', material.pale, [0.13, 1.39, 0.205], [0.12, 0.28, 0.035], [0, 0, -0.17]);
    head = node(visual, 0, 1.72, 0.015);
    part(head, 'sphere', material.skin, [0, 0, 0], [heavy ? 0.145 : 0.132, 0.17, 0.125]);
    part(head, 'box', material.skin, [0, -0.005, 0.122], [0.045, 0.06, 0.052]);
    for (const side of [-1, 1]) {
      part(head, 'box', material.black, [side * 0.055, 0.025, 0.122], [0.03, 0.014, 0.012]);
      part(head, 'box', material.hair, [side * 0.055, 0.05, 0.118], [0.05, 0.018, 0.018], [0, 0, -side * 0.1]);
    }
    const leftHand = humanArm(-1, heavy);
    const rightHand = humanArm(1, heavy);
    backpack(visual, heavy);
    if (heavy) {
      part(head, 'sphere', material.hair, [0, 0.1, -0.015], [0.15, 0.105, 0.13]);
      part(head, 'sphere', material.hair, [0, -0.085, 0.075], [0.105, 0.105, 0.085]);
      for (const y of [1.19, 1.35, 1.49]) {
        part(visual, 'box', material.metal, [0, y, 0.18], [torsoWidth * 0.81, 0.125, 0.085], [-0.05, 0, 0]);
        for (const x of [-0.19, 0.19]) rivet(visual, x, y, 0.231);
      }
      part(visual, 'box', material.accent, [-0.21, 1.4, 0.235], [0.045, 0.2, 0.017]);
      const blade = node(visual, -0.33, 0.92, -0.1);
      blade.rotation.z = -0.3;
      part(blade, 'box', material.darkLeather, [0, -0.27, 0], [0.105, 0.76, 0.075]);
      part(blade, 'box', material.metal, [0, 0.13, 0], [0.22, 0.045, 0.08]);
      part(blade, 'cylinder', material.leather, [0, 0.25, 0], [0.04, 0.22, 0.04]);
      part(blade, 'sphere', material.metal, [0, 0.37, 0], [0.055, 0.04, 0.05]);
      part(rightHand, 'box', material.metal, [0, -0.18, 0.11], [0.095, 0.04, 0.075]);
    } else {
      part(head, 'sphere', material.hair, [0, 0.06, -0.04], [0.139, 0.15, 0.115]);
      part(head, 'box', material.pale, [0, -0.085, 0.115], [0.21, 0.075, 0.05], [0.04, 0, 0]);
      part(head, 'cylinder', material.darkCloth, [0, 0.14, 0], [0.32, 0.035, 0.255], [0, 0, -0.04]);
      part(head, 'taper', material.cloth, [0, 0.205, -0.01], [0.18, 0.12, 0.15]);
      part(head, 'box', material.darkLeather, [0, 0.175, 0.14], [0.24, 0.045, 0.045]);
      for (const x of [-0.072, 0.072]) {
        part(head, 'cylinder', material.darkMetal, [x, 0.18, 0.17], [0.048, 0.032, 0.048], [Math.PI / 2, 0, 0]);
        part(head, 'cylinder', material.green, [x, 0.18, 0.19], [0.034, 0.008, 0.034], [Math.PI / 2, 0, 0]);
      }
      // The pick remains attached to the hand when the arm swings.
      const pick = node(rightHand, 0, -0.26, 0.1);
      pick.rotation.z = -0.13;
      part(pick, 'cylinder', material.leather, [0, -0.17, 0], [0.022, 0.66, 0.022]);
      part(pick, 'box', material.metal, [0.02, 0.125, 0], [0.34, 0.06, 0.065], [0, 0, 0.07]);
      part(pick, 'cone', material.metal, [-0.21, 0.105, 0], [0.04, 0.18, 0.04], [0, 0, Math.PI / 2]);
      part(leftHand, 'box', material.accent, [0, -0.17, 0.09], [0.09, 0.05, 0.025]);
    }
  }

  function robotLeg(side) {
    const pivot = node(visual, side * 0.16, 1.02, 0);
    part(pivot, 'sphere', material.darkMetal, [0, 0, 0], [0.085, 0.085, 0.085]);
    bar(pivot, [side * -0.025, -0.05, 0], [0, -0.41, 0], 0.07, material.green, 0.075);
    bar(pivot, [side * 0.065, -0.08, -0.02], [side * 0.065, -0.38, -0.02], 0.025, material.metal);
    const knee = node(pivot, 0, -0.43, 0);
    part(knee, 'cylinder', material.darkMetal, [0, 0, 0], [0.085, 0.13, 0.085], [0, 0, Math.PI / 2]);
    part(knee, 'cylinder', material.pale, [side * 0.075, 0, 0], [0.04, 0.018, 0.04], [0, 0, Math.PI / 2]);
    bar(knee, [0, -0.06, 0], [side * -0.025, -0.43, 0.015], 0.065, material.metal);
    part(knee, 'box', material.green, [0, -0.24, 0.045], [side < 0 ? 0.135 : 0.1, 0.26, 0.07], [0.03, 0, side * 0.05]);
    part(knee, 'cylinder', material.pale, [0, -0.32, 0.015], [0.074, 0.09, 0.074]);
    part(knee, 'box', material.darkMetal, [0, -0.525, 0.07], [0.16, 0.12, 0.29]);
    part(knee, 'box', material.metal, [0, -0.54, 0.16], [0.175, 0.06, 0.13]);
    legs.push({ pivot, knee, side });
  }

  function robotArm(side) {
    const pivot = node(visual, side * 0.29, 1.58, 0);
    pivot.rotation.z = -side * 0.09;
    part(pivot, 'cylinder', material.darkMetal, [0, 0, 0], [0.105, 0.13, 0.105], [0, 0, Math.PI / 2]);
    part(pivot, 'cylinder', material.metal, [side * 0.08, 0, 0], [0.067, 0.045, 0.067], [0, 0, Math.PI / 2]);
    part(pivot, 'box', side < 0 ? material.green : material.metal, [0, -0.185, 0], [side < 0 ? 0.125 : 0.075, 0.29, 0.09]);
    bar(pivot, [side * 0.07, -0.06, 0], [side * 0.07, -0.3, 0], 0.025, material.darkMetal);
    const elbow = node(pivot, 0, -0.36, 0);
    part(elbow, 'sphere', material.darkMetal, [0, 0, 0], [0.08, 0.08, 0.08]);
    if (side < 0) {
      part(elbow, 'box', material.green, [0, -0.19, 0.015], [0.22, 0.33, 0.19]);
      part(elbow, 'box', material.metal, [0, -0.19, 0.12], [0.155, 0.27, 0.055]);
      part(elbow, 'box', material.accent, [0, -0.13, 0.153], [0.17, 0.04, 0.018]);
      rivet(elbow, -0.055, -0.26, 0.153);
      rivet(elbow, 0.055, -0.26, 0.153);
    } else {
      for (const x of [-0.035, 0.035]) bar(elbow, [x, -0.05, 0], [x, -0.35, 0.015], 0.035, material.metal);
      part(elbow, 'box', material.green, [0, -0.11, 0.025], [0.12, 0.12, 0.09]);
    }
    part(elbow, 'box', material.darkMetal, [0, -0.405, 0.015], [side < 0 ? 0.16 : 0.105, 0.1, 0.115]);
    for (const x of [-0.045, 0.045]) {
      part(elbow, 'box', material.metal, [x, -0.49, 0.045], [0.035, 0.14, 0.045], [-0.18, 0, x * 2]);
    }
    arms.push({ pivot, elbow, side });
  }

  function buildAutomaton() {
    part(visual, 'box', material.darkMetal, [0, 1.025, 0], [0.36, 0.16, 0.23]);
    part(visual, 'cylinder', material.metal, [0, 1.16, -0.035], [0.07, 0.27, 0.07]);
    part(visual, 'box', material.green, [0, 1.42, 0], [0.38, 0.39, 0.24], [0.035, 0, 0]);
    part(visual, 'box', material.pale, [0.015, 1.46, 0.145], [0.3, 0.24, 0.055], [-0.05, 0, -0.055]);
    part(visual, 'box', material.darkMetal, [-0.04, 1.32, 0.155], [0.22, 0.07, 0.05]);
    for (const x of [-0.11, 0.11]) rivet(visual, x, 1.5, 0.18);
    for (const x of [-0.12, 0, 0.12]) {
      bar(visual, [x, 1.24, 0], [x * 0.8, 1.1, 0.03], 0.035, material.darkMetal);
    }
    part(visual, 'cylinder', material.darkMetal, [0, 1.72, -0.015], [0.055, 0.2, 0.055]);
    bar(visual, [-0.07, 1.65, 0.025], [-0.085, 1.81, 0.035], 0.03, material.metal);
    head = node(visual, 0, 1.89, 0.015);
    part(head, 'box', material.green, [0, 0, 0], [0.45, 0.17, 0.27], [0, 0, -0.045]);
    part(head, 'box', material.pale, [0, 0.105, -0.005], [0.48, 0.045, 0.3], [0.03, 0, -0.045]);
    part(head, 'box', material.black, [0.025, 0.005, 0.145], [0.35, 0.07, 0.025]);
    part(head, 'box', material.optic, [0.025, 0.005, 0.161], [0.25, 0.019, 0.012]);
    part(head, 'cylinder', material.darkMetal, [-0.22, 0.055, -0.015], [0.025, 0.37, 0.025]);
    part(head, 'sphere', material.accent, [-0.22, 0.245, -0.015], [0.035, 0.035, 0.035]);
    part(head, 'box', material.metal, [0.12, -0.12, 0.025], [0.08, 0.08, 0.08]);
    for (const side of [-1, 1]) { robotLeg(side); robotArm(side); }
    backpack(visual, false, true);
    bar(visual, [-0.13, 1.63, 0.145], [0.12, 1.08, 0.16], 0.055, material.leather, 0.025);
    part(visual, 'box', material.accent, [-0.125, 1.45, 0.185], [0.06, 0.13, 0.02]);
    part(visual, 'box', material.darkCloth, [0.12, 0.96, 0.14], [0.13, 0.3, 0.035], [0, 0, -0.1]);
  }

  if (role === 'automaton') buildAutomaton();
  else buildHuman(role === 'guard');

  const selection = new THREE.Group();
  selection.name = 'selection-indicator';
  const selectMaterial = new THREE.MeshBasicMaterial({
    color: config.npc ? 0xd2b77f : 0xe0c58b,
    transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo.ring, selectMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  ring.renderOrder = 2;
  selection.add(ring);
  const marker = new THREE.Mesh(geo.marker, selectMaterial);
  marker.position.y = role === 'automaton' ? 2.43 : 2.28;
  marker.scale.y = 1.4;
  selection.add(marker);
  selection.visible = false;
  group.add(selection);

  function setSelected(value) {
    selection.visible = Boolean(value);
    group.userData.selected = Boolean(value);
  }

  function animate(elapsed, speed = 0, selected = false) {
    const time = Number.isFinite(elapsed) ? elapsed : 0;
    const movement = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 1.8);
    const phase = time * (5 + movement * 3);
    const idle = Math.sin(time * 1.4) * 0.007;
    visual.position.y = movement * Math.abs(Math.sin(phase)) * 0.025 + idle;
    visual.rotation.z = Math.sin(phase) * movement * 0.018;
    for (const leg of legs) {
      const swing = Math.sin(phase + (leg.side > 0 ? Math.PI : 0)) * movement;
      leg.pivot.rotation.x = swing * 0.48;
      leg.knee.rotation.x = Math.max(0, -swing) * 0.55;
    }
    for (const arm of arms) {
      const swing = Math.sin(phase + (arm.side < 0 ? Math.PI : 0)) * movement;
      arm.pivot.rotation.x = swing * 0.4 + Math.sin(time * 1.2 + arm.side) * 0.014;
      arm.elbow.rotation.x = -0.09 - Math.max(0, swing) * 0.15;
    }
    if (head) {
      head.rotation.y = Math.sin(time * 0.62) * (movement > 0.05 ? 0.025 : 0.075);
    }
    marker.position.y = (role === 'automaton' ? 2.43 : 2.28) + Math.sin(time * 2.3) * 0.035;
    marker.rotation.y = time * 0.65;
    setSelected(selected);
  }

  setSelected(false);
  return { group, animate, setSelected };
}
