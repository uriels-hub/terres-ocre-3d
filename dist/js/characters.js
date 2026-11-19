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

// Keep the pivots independently animated while submitting the costume in a few
// material passes. Every vertex is rigidly attached to its original pivot.
function bindCostume(THREE, root, body, materials) {
  root.updateMatrixWorld(true);
  const bones = [];
  const parts = [];
  body.traverse(object => {
    if (object.isBone) bones.push(object);
    if (object.isMesh) parts.push(object);
  });
  const boneIndex = new Map(bones.map((bone, index) => [bone, index]));
  const cloth = [materials.cloth, materials.pale, materials.darkCloth];
  const metal = [materials.metal, materials.darkMetal, materials.green];
  const batches = [[], [], [], []];
  for (const part of parts) {
    const mat = part.material;
    const bucket = cloth.includes(mat) ? 1 : metal.includes(mat) ? 2 : mat === materials.optic ? 3 : 0;
    batches[bucket].push(part);
  }
  const palette = [
    { roughness: .9 }, { map: materials.cloth.map, roughness: 1 },
    { map: materials.metal.map, metalness: .36, roughness: .78 },
    { emissive: 0x7cd2ac, emissiveIntensity: .85 }
  ];
  const geometry = new THREE.BufferGeometry();
  const positions = [], normals = [], uvs = [], colors = [], indices = [], joints = [], weights = [];
  const outputMaterials = [];
  for (let bucket = 0; bucket < batches.length; bucket++) {
    if (!batches[bucket].length) continue;
    const start = indices.length;
    for (const part of batches[bucket]) {
      const transform = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const { position, normal, uv } = transform.attributes;
      const offset = positions.length / 3;
      positions.push(...position.array);
      normals.push(...normal.array);
      uvs.push(...uv.array);
      const color = part.material.color;
      const joint = boneIndex.get(part.parent);
      for (let i = 0; i < position.count; i++) {
        colors.push(color.r, color.g, color.b);
        joints.push(joint, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
      const index = transform.index;
      for (let i = 0; i < (index ? index.count : position.count); i++) {
        indices.push(offset + (index ? index.getX(i) : i));
      }
      part.removeFromParent();
      transform.dispose();
    }
    geometry.addGroup(start, indices.length - start, outputMaterials.length);
    outputMaterials.push(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, ...palette[bucket] }));
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  const skin = new THREE.SkinnedMesh(geometry, outputMaterials);
  skin.name = 'costume';
  skin.castShadow = true;
  skin.receiveShadow = true;
  root.add(skin);
  skin.bind(new THREE.Skeleton(bones));
  // Covers the extended arm and the prone pose for both picking and culling.
  skin.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,.5,0), 3);
}

/**
 * @param {object} THREE Injected Three.js namespace (r170).
 * @param {object} config { role, textures, color, npc }
 * @returns {{group: object, animate: Function, setSelected: Function}}
 */
export function createCharacter(THREE, config = {}) {
  const role = ['prospector', 'guard', 'automaton', 'raider'].includes(config.role)
    ? config.role : 'prospector';
  const textures = config.textures || {};
  const geo = geometries(THREE);
  const group = new THREE.Group();
  group.name = 'character-' + role;
  group.userData.role = role;
  group.userData.npc = Boolean(config.npc);

  const visual = new THREE.Bone();
  visual.name = 'animated-body';
  group.add(visual);

  const makeMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.05, flatShading: true, ...options,
  });
  const teamColor = typeof config.color === 'number' ? config.color : 0xc5aa7d;
  const material = {
    cloth: makeMaterial(role === 'raider' ? 0x682c29 : role === 'guard' ? 0x4a6471 : 0xcfa355, { map: textures.cloth || null }),
    pale: makeMaterial(0xc3b99b, { map: textures.cloth || null }),
    darkCloth: makeMaterial(0x575447, { map: textures.cloth || null }),
    leather: makeMaterial(0x715a3e),
    darkLeather: makeMaterial(0x413c32),
    metal: makeMaterial(0x68665b, { map: textures.rust || null, metalness: 0.48, roughness: 0.8 }),
    darkMetal: makeMaterial(0x353d3b, { metalness: 0.58, roughness: 0.66 }),
    green: makeMaterial(0x77a69c, { map: textures.rust || null, metalness: 0.38 }),
    skin: makeMaterial(role === 'guard' ? 0xa87e5d : 0xbd9670),
    hair: makeMaterial(0x383027),
    black: makeMaterial(0x151d1d, { roughness: 0.65 }),
    accent: makeMaterial(teamColor, { roughness: 0.8 }),
    mantle: makeMaterial(({ prospector: 0xe6a439, guard: 0x456477, automaton: 0x79b9b3, raider: 0xd64632 })[role]),
    bone: makeMaterial(0xe5d7ab),
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
    const child = new THREE.Bone();
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
  // A folded, double-sided pennant with a swallowtail cut into the free end.
  function pennant(parent, mat, a, b, c, d, notch) {
    const raw = [a, b, notch, a, notch, d, b, c, notch];
    const geom = new THREE.BufferGeometry();
    const vertices = [...raw, ...[...raw].reverse()].flat();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
    geom.computeVertexNormals();
    parent.add(new THREE.Mesh(geom, mat));
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
    if (role !== 'raider') backpack(visual, heavy);
    if (role === 'raider') {
      // A split red standard and a pale mask read against the cliffs from either side.
      part(head, 'sphere', material.mantle, [0, 0.075, -0.015], [0.186, 0.178, 0.159]);
      part(head, 'taper', material.bone, [0, -0.035, 0.111], [0.132, 0.22, 0.075], [0, 0, Math.PI]);
      part(head, 'box', material.black, [0, 0.012, 0.177], [0.202, 0.047, 0.025], [0, 0, 0.08]);
      part(visual, 'taper', material.mantle, [-0.055, 1.49, -0.01], [0.385, 0.21, 0.25], [0, 0, 0.16]);
      part(visual, 'taper', material.mantle, [0, 1.04, 0], [0.25, 0.13, 0.20]);
      for (const s of [-1, 1]) {
        pennant(visual, material.mantle, [s*.15,1.48,-.17], [s*.37,1.4,-.16],
          [s*.42,.72,-.26], [s*.13,.84,-.3], [s*.28,.98,-.32]);
      }
      bar(visual, [.05,1,-.19], [-.41,2.19,-.22], .045, material.darkMetal);
      pennant(visual, material.mantle, [-.41,2.2,-.22], [-.75,2.14,-.25],
        [-.79,1.88,-.33], [-.33,2.0,-.23], [-.58,2.02,-.3]);
      const cleaver = node(rightHand, 0, -.28, .075);
      cleaver.rotation.x = Math.PI / 2.8;
      part(cleaver, 'cylinder', material.darkLeather, [0, .055, 0], [.033,.22,.033]);
      part(cleaver, 'box', material.darkMetal, [0,.17,0], [.19,.05,.09]);
      part(cleaver, 'box', material.metal, [0,.43,0], [.15,.50,.043], [0,0,-.07]);
      part(cleaver, 'cone', material.bone, [.03,.73,0], [.081,.15,.027], [0,0,-.22]);
    } else if (heavy) {
      part(head, 'sphere', material.hair, [0, 0.1, -0.015], [0.15, 0.105, 0.13]);
      part(head, 'sphere', material.hair, [0, -0.085, 0.075], [0.105, 0.105, 0.085]);
      for (const y of [1.19, 1.35, 1.49]) {
        part(visual, 'box', material.metal, [0, y, 0.18], [torsoWidth * 0.81, 0.125, 0.085], [-0.05, 0, 0]);
        for (const x of [-0.19, 0.19]) rivet(visual, x, y, 0.231);
      }
      part(visual, 'box', material.accent, [-0.21, 1.4, 0.235], [0.045, 0.2, 0.017]);
      part(head, 'sphere', material.metal, [0,.105,0], [.18,.14,.167]);
      part(head, 'cylinder', material.darkMetal, [0,.09,0], [.216,.037,.196]);
      part(head, 'box', material.bone, [0,.17,.09], [.05,.105,.112]);
      part(visual, 'taper', material.mantle, [0,1.49,-.012], [.422,.14,.236]);
      pennant(visual, material.mantle, [-.31,1.5,-.16], [.29,1.49,-.15],
        [.36,.68,-.33], [-.38,.57,-.37], [.07,.81,-.38]);
      const shield = node(leftHand,-.1,-.09,0);
      part(shield, 'cylinder', material.darkMetal, [0,0,.03], [.33,.085,.39], [Math.PI/2,.10,.1]);
      part(shield, 'cylinder', material.mantle, [0,0,.075], [.295,.044,.355], [Math.PI/2,.10,.1]);
      part(shield, 'box', material.bone, [0,0,.107], [.067,.62,.022], [0,0,-.33]);
      part(shield, 'sphere', material.metal, [0,0,.13], [.105,.105,.065]);
      const baton = node(rightHand,0,-.28,.08);
      baton.rotation.x = 1.24;
      part(baton, 'cylinder', material.leather, [0,.04,0], [.045,.22,.045]);
      part(baton, 'taper', material.metal, [0,.35,0], [.065,.42,.072]);
      part(baton, 'cylinder', material.bone, [0,.56,0], [.086,.11,.085]);
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
      part(visual, 'taper', material.mantle, [0,1.4,-.01], [.35,.25,.218], [0,0,-.09]);
      part(visual, 'taper', material.bone, [0,1.55,0], [.18,.11,.165]);
      pennant(visual, material.mantle, [-.24,1.46,-.2], [.2,1.53,-.22],
        [.19,.92,-.36], [-.32,.88,-.34], [-.03,1.02,-.42]);
      part(head, 'cylinder', material.mantle, [0,.16,0], [.34,.031,.279], [0,0,-.04]);
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
    part(head, 'box', material.mantle, [0,-.035,-.137], [.38,.065,.035]);
    part(visual, 'box', material.mantle, [.225,1.37,-.08], [.145,.41,.30], [0,0,.14]);
    part(visual, 'cylinder', material.bone, [.23,1.56,-.08], [.092,.072,.145]);
    part(head, 'cylinder', material.darkMetal, [-0.22, 0.055, -0.015], [0.025, 0.37, 0.025]);
    part(head, 'sphere', material.accent, [-0.22, 0.245, -0.015], [0.035, 0.035, 0.035]);
    part(head, 'box', material.metal, [0.12, -0.12, 0.025], [0.08, 0.08, 0.08]);
    for (const side of [-1, 1]) { robotLeg(side); robotArm(side); }
    const piston = arms.find(arm => arm.side > 0).elbow;
    part(piston, 'taper', material.mantle, [0,-.33,.028], [.135,.27,.14]);
    part(piston, 'box', material.bone, [0,-.449,.038], [.22,.112,.22]);
    backpack(visual, false, true);
    bar(visual, [-0.13, 1.63, 0.145], [0.12, 1.08, 0.16], 0.055, material.leather, 0.025);
    part(visual, 'box', material.accent, [-0.125, 1.45, 0.185], [0.06, 0.13, 0.02]);
    part(visual, 'box', material.darkCloth, [0.12, 0.96, 0.14], [0.13, 0.3, 0.035], [0, 0, -0.1]);
  }

  if (role === 'automaton') buildAutomaton();
  else buildHuman(role === 'guard');
  bindCostume(THREE, group, visual, material);

  const selection = new THREE.Group();
  selection.name = 'selection-indicator';
  const selectMaterial = new THREE.MeshBasicMaterial({
    color: role === 'raider' ? 0xfa6554 : config.npc ? 0xd2b77f : 0xe0c58b,
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

  function ease(fraction) {
    const t = Math.max(0, Math.min(1, fraction));
    return t*t*(3-2*t);
  }

  function animate(elapsed, speed = 0, selected = false, action = 'idle', progress = 0) {
    const time = Number.isFinite(elapsed) ? elapsed : 0;
    const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const movement = Math.min(1, Math.abs(Number.isFinite(speed) ? speed : 0) / 1.8);
    const phase = time * (5 + movement * 3);
    // Start the downswing just before impact, then follow through from the same pose.
    const release = action === 'windup' ? .72*ease((t-.8)/.2) : .72+.28*ease(t/.22);
    const windup = action === 'windup' ? ease(t/.74)*(1-release) : action === 'attack' ? 1-release : 0;
    const strike = action === 'windup' ? release : action === 'attack' ? release*(1-ease((t-.22)/.78)) : 0;
    const recoil = action === 'hit' ? (1-ease(t)) * (.8 + .2*Math.sin(t*Math.PI*2)) : 0;
    const fall = action === 'ko' ? ease(t) : 0;
    const gait = movement * (1 - Math.max(windup, strike, recoil, fall));
    const idle = Math.sin(time*1.4)*.008*(1-fall);
    const restingHeight = role === 'guard' ? .39 : role === 'raider' ? .31 : .33;
    visual.position.set(.04*windup-.08*recoil, gait*Math.abs(Math.sin(phase))*.04 + idle +
      .025*windup+.012*strike+.017*recoil+restingHeight*fall, -.12*windup+.33*strike-.22*recoil);
    visual.rotation.set(-.15*windup+.23*strike-.28*recoil-1.49*fall,
      -.52*windup+.56*strike+.2*recoil, Math.sin(phase)*gait*.022+.09*windup-.12*strike+.15*recoil+.14*fall);
    for (const leg of legs) {
      const swing = Math.sin(phase + (leg.side > 0 ? Math.PI : 0)) * gait;
      leg.pivot.rotation.x = swing*.55 - .16*(windup+recoil) + leg.side*(.26*windup-.28*strike+.12*fall);
      leg.pivot.rotation.z = leg.side*(.09*windup+.07*strike+.12*fall);
      leg.knee.rotation.x = Math.max(0,-swing)*.62 + .34*windup+.19*recoil+.18*fall;
    }
    for (const arm of arms) {
      const right = arm.side > 0;
      const swing = Math.sin(phase + (right ? 0 : Math.PI)) * gait;
      const rest = Math.sin(time*1.2 + arm.side)*.025*(1-fall);
      arm.pivot.rotation.set(swing*.44+rest +
        (right ? -.92*windup-1.47*strike+.98*fall : -.55*windup+.47*strike) - .45*recoil,
        right ? -.76*windup+.68*strike : .24*windup,
        arm.side*(.075 + (right ? 1.18*windup+.34*strike : .32*windup+.21*strike)+.54*recoil+.66*fall));
      arm.elbow.rotation.x = -.13-Math.max(0,swing)*.17 -
        (right ? 1.72*windup+.10*strike : .77*windup+.29*strike) - .47*recoil-.24*fall;
    }
    head.rotation.set(-.12*windup+.14*strike-.22*recoil+.11*fall,
      Math.sin(time*.62)*(gait>.05 ? .035 : .11)*(1-fall)+.35*windup-.31*strike, -.16*recoil-.25*fall);
    marker.position.y = (role === 'automaton' ? 2.43 : 2.28) + Math.sin(time * 2.3) * 0.035;
    marker.rotation.y = time * 0.65;
    marker.visible = action !== 'ko';
    setSelected(selected);
  }

  setSelected(false);
  return { group, animate, setSelected };
}
