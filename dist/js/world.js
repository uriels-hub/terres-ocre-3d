/**
 * Original desert settlement for the browser prototype.
 * Three.js is supplied by the application; this module has no network imports.
 */
export function createWorld(THREE, textures = {}) {
  const group = new THREE.Group();
  group.name = 'DesertWorld';
  group.userData = {
    type: 'desert-world',
    navigableBounds: { minX: -74, maxX: 74, minZ: -74, maxZ: 74 },
    spawn: { x: -12, z: 17 },
    seed: 719263,
  };

  const colliders = [];
  const resourceNodes = [];
  const landmarks = [
    { id: 'settlement', name: 'Le Relais des Toiles', x: 9, z: -8, radius: 23 },
    { id: 'ruins', name: 'Les Archives brisées', x: -30, z: -25, radius: 8 },
    { id: 'wreck', name: 'La Carcasse du Levant', x: 28, z: 24, radius: 9 },
    { id: 'well', name: 'Le Puits des Roches', x: -26, z: 25, radius: 7 },
  ];
  let randomState = 719263;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };
  const smoothstep = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const distance = (x, z, px, pz) => Math.hypot(x - px, z - pz);
  const pad = (height, x, z, px, pz, inner, outer, target) =>
    THREE.MathUtils.lerp(target, height, smoothstep(inner, outer, distance(x, z, px, pz)));

  function rawHeight(x, z) {
    let h = 0.48 * Math.sin(x * 0.048) + 0.42 * Math.sin(z * 0.061)
      + 0.23 * Math.sin((x + z) * 0.105)
      + 0.24 * Math.cos(x * 0.15 - z * 0.084);
    h += 5.8 * Math.exp(-((x + 56) ** 2 + (z + 43) ** 2) / 490);
    h += 4.3 * Math.exp(-((x - 56) ** 2 + (z + 42) ** 2) / 410);
    h += 3.7 * Math.exp(-((x + 58) ** 2 + (z - 48) ** 2) / 380);
    h += smoothstep(66, 88, Math.max(Math.abs(x), Math.abs(z)))
      * (3.8 + 1.4 * Math.sin(x * 0.071 + z * 0.083));
    h = pad(h, x, z, 9, -8, 23, 35, 0.32);
    h = pad(h, x, z, -12, 17, 5, 11, 0.24);
    h = pad(h, x, z, -30, -25, 6, 12, 0.38);
    h = pad(h, x, z, 28, 24, 7, 13, 0.24);
    return pad(h, x, z, -26, 25, 5, 11, 0.18);
  }

  // Sampling the same diagonal as PlaneGeometry gives the exact triangulated
  // terrain height, including between vertices, rather than an analytic guess.
  const terrainSize = 180;
  const segments = 128;
  const stride = segments + 1;
  const cell = terrainSize / segments;
  const half = terrainSize / 2;
  const heights = new Float32Array(stride * stride);
  const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  terrainGeometry.rotateX(-Math.PI / 2);
  const positions = terrainGeometry.attributes.position;
  const terrainColors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    heights[index] = rawHeight(x, z);
    positions.setY(index, heights[index]);
    const variation = 0.035 * Math.sin(x * 0.12 + z * 0.09)
      + 0.025 * Math.cos(z * 0.18 - x * 0.07);
    const highland = smoothstep(1.5, 5, heights[index]);
    color.setRGB(0.96 + variation, 0.91 + variation - highland * 0.065,
      0.82 + variation - highland * 0.09);
    color.toArray(terrainColors, index * 3);
  }
  positions.needsUpdate = true;
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  terrainGeometry.computeBoundingBox();
  terrainGeometry.computeBoundingSphere();

  function groundHeight(x, z) {
    const gx = THREE.MathUtils.clamp((x + half) / cell, 0, segments);
    const gz = THREE.MathUtils.clamp((z + half) / cell, 0, segments);
    const ix = Math.min(segments - 1, Math.floor(gx));
    const iz = Math.min(segments - 1, Math.floor(gz));
    const u = gx - ix;
    const v = gz - iz;
    const index = iz * stride + ix;
    const a = heights[index];
    const b = heights[index + stride];
    const c = heights[index + stride + 1];
    const d = heights[index + 1];
    return u + v <= 1
      ? a + u * (d - a) + v * (b - a)
      : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  }

  function repeatedTexture(source, u, v) {
    if (!source) return null;
    const clone = source.clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(u, v);
    clone.needsUpdate = true;
    return clone;
  }
  const sandMap = repeatedTexture(textures.sand, 20, 20);
  const rockMap = repeatedTexture(textures.stone, 1.7, 1.7);
  const adobeMap = repeatedTexture(textures.stone, 1.1, 1.1);
  const rustMap = repeatedTexture(textures.rust, 1.3, 1.3);
  const clothMap = repeatedTexture(textures.cloth, 2, 2);
  const material = (colorValue, map = null, extra = {}) => new THREE.MeshStandardMaterial({
    color: colorValue, map, roughness: 0.96, metalness: 0, ...extra,
  });
  const materials = {
    sand: material(sandMap ? 0xffffff : 0xc5aa7d, sandMap, { vertexColors: true }),
    adobe: material(adobeMap ? 0xe3c8a5 : 0xbca17c, adobeMap),
    paleAdobe: material(adobeMap ? 0xf0dbc0 : 0xc9b394, adobeMap),
    stone: material(rockMap ? 0xd3ae89 : 0xa98765, rockMap),
    darkStone: material(rockMap ? 0xbca68c : 0x92785c, rockMap),
    rust: material(rustMap ? 0xd9c2a9 : 0x846850, rustMap, { metalness: 0.14 }),
    iron: material(0x484b43, null, { roughness: 0.8, metalness: 0.38 }),
    paleMetal: material(0x929488, null, { roughness: 0.75, metalness: 0.4 }),
    patina: material(0x657d71, null, { roughness: 0.84, metalness: 0.16 }),
    water: material(0x4b9293, null, { roughness: 0.66, metalness: 0.16 }),
    cloth: material(clothMap ? 0xf0d6a9 : 0xbcb29a, clothMap, { side: THREE.DoubleSide }),
    ochreCloth: material(clothMap ? 0xd2a577 : 0xa16746, clothMap, { side: THREE.DoubleSide }),
    timber: material(0x756452),
    dark: material(0x282d29),
    brush: material(0x8c8060, null, { side: THREE.DoubleSide }),
    resourceBase: material(0x82775c),
  };
  const terrain = new THREE.Mesh(terrainGeometry, materials.sand);
  terrain.name = 'DesertTerrain';
  terrain.receiveShadow = true;
  terrain.userData = { type: 'ground', size: terrainSize };
  group.add(terrain);

  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cone: new THREE.CylinderGeometry(0.36, 0.5, 1, 8),
    rock: new THREE.DodecahedronGeometry(1, 0),
    mesa: new THREE.CylinderGeometry(1, 1.18, 1, 7),
    ring: new THREE.TorusGeometry(1, 0.09, 5, 16),
    flag: new THREE.PlaneGeometry(1, 1),
  };
  const canopyGeometry = new THREE.BufferGeometry();
  canopyGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0.045, -0.5, 0.5, 0, 0.5,
    -0.5, 0.06, 0.5, 0, -0.13, 0,
  ], 3));
  canopyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.5,
  ], 2));
  canopyGeometry.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
  canopyGeometry.computeVertexNormals();

  function mesh(geometry, mat, parent, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.rotation.y = ry;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const buckets = new Map();
  const dummy = new THREE.Object3D();
  function instance(key, geometry, mat, x, y, z, sx, sy, sz, ry = 0, tint = null, rz = 0) {
    if (!buckets.has(key)) buckets.set(key, { geometry, material: mat, items: [] });
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, ry, rz);
    dummy.updateMatrix();
    buckets.get(key).items.push({ matrix: dummy.matrix.clone(), tint });
  }
  function obstacle(x, z, radius) {
    colliders.push({ x, z, radius });
  }
  function localToWorld(x, z, ox, oz, angle) {
    return { x: ox + Math.cos(angle) * x + Math.sin(angle) * z,
      z: oz - Math.sin(angle) * x + Math.cos(angle) * z };
  }
  function wallColliders(x1, z1, x2, z2, radius = 0.36) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(length / (radius * 1.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      obstacle(THREE.MathUtils.lerp(x1, x2, t), THREE.MathUtils.lerp(z1, z2, t), radius);
    }
  }

  // Hollow adobe rooms: doors remain actual openings, also in collision space.
  function building(x, z, width, depth, height, index) {
    const house = new THREE.Group();
    house.name = 'AdobeRoom-' + (index + 1);
    house.userData = { type: 'building' };
    house.position.set(x, groundHeight(x, z), z);
    const angle = Math.atan2(9 - x, -8 - z);
    house.rotation.y = angle;
    group.add(house);
    const mat = index % 3 === 0 ? materials.paleAdobe : materials.adobe;
    const thickness = 0.4;
    const doorway = 3.2;
    const doorHeight = 2.7;
    const flank = (width - doorway) / 2;
    const walls = [
      [0, height / 2, -depth / 2, width, height, thickness],
      [-width / 2, height / 2, 0, thickness, height, depth],
      [width / 2, height / 2, 0, thickness, height, depth],
      [-(doorway + flank) / 2, height / 2, depth / 2, flank, height, thickness],
      [(doorway + flank) / 2, height / 2, depth / 2, flank, height, thickness],
      [0, doorHeight + (height - doorHeight) / 2, depth / 2, doorway, height - doorHeight, thickness],
    ];
    walls.forEach(parts => mesh(geometries.box, mat, house, ...parts));
    mesh(geometries.box, materials.darkStone, house, 0, 0.065, 0, width, 0.13, depth);
    mesh(geometries.box, mat, house, 0, height + 0.1, 0, width + 0.6, 0.24, depth + 0.6);
    mesh(geometries.box, materials.timber, house, 0, doorHeight + 0.04, depth / 2 + 0.23, doorway + 0.5, 0.17, 0.24);
    const roofSheet = mesh(geometries.box, index % 2 ? materials.patina : materials.rust,
      house, -width * 0.18, height + 0.29, -depth * 0.12, width * 0.58, 0.12, depth * 0.8, -0.08);
    roofSheet.rotation.z = 0.025;
    if (index % 2 === 0) mesh(geometries.box, mat, house, 0, height + 0.62, -depth / 2, width + 0.6, 0.8, 0.4);

    const endpoints = [
      [-width / 2, -depth / 2, width / 2, -depth / 2],
      [-width / 2, -depth / 2, -width / 2, depth / 2],
      [width / 2, -depth / 2, width / 2, depth / 2],
      [-width / 2, depth / 2, -doorway / 2 - 0.12, depth / 2],
      [doorway / 2 + 0.12, depth / 2, width / 2, depth / 2],
    ];
    endpoints.forEach(([ax, az, bx, bz]) => {
      const a = localToWorld(ax, az, x, z, angle);
      const b = localToWorld(bx, bz, x, z, angle);
      wallColliders(a.x, a.z, b.x, b.z);
    });

    // Roof beams and ventilation slits use shared instanced geometry.
    for (let beam = -1; beam <= 1; beam++) {
      const at = localToWorld(beam * width * 0.28, 0, x, z, angle);
      instance('timber-box', geometries.box, materials.timber, at.x, house.position.y + height - 0.2,
        at.z, 0.17, 0.22, depth + 0.9, angle);
    }
    for (let slit = -1; slit <= 1; slit++) {
      const at = localToWorld(slit * 0.64, -depth / 2 - 0.21, x, z, angle);
      instance('dark-box', geometries.box, materials.dark, at.x, house.position.y + height * 0.72,
        at.z, 0.32, 0.7, 0.025, angle);
    }
    if (index === 0 || index === 3 || index === 6) {
      const canopy = mesh(canopyGeometry, index === 3 ? materials.ochreCloth : materials.cloth,
        house, 0, 3.2, depth / 2 + 1.9, width * 0.94, 1, 3.6);
      canopy.name = 'DoorAwning';
      [-width * 0.44, width * 0.44].forEach(px => {
        const at = localToWorld(px, depth / 2 + 3.55, x, z, angle);
        instance('iron-cylinder', geometries.cylinder, materials.iron,
          at.x, house.position.y + 1.62, at.z, 0.14, 3.24, 0.14);
        obstacle(at.x, at.z, 0.18);
      });
    }
    return house;
  }
  [
    [-2, -17, 6.0, 6.0, 4.8], [8, -20, 7.0, 6.0, 6.1],
    [20, -17, 6.0, 7.0, 4.6], [23, -5, 5.5, 6.0, 5.3],
    [17, 5, 7.0, 5.0, 4.7], [5, 5, 6.0, 5.0, 5.0],
    [-6, -2, 5.5, 6.0, 4.2], [-7, -13, 5.0, 5.0, 4.1],
  ].forEach((spec, index) => building(...spec, index));

  function freestandingWall(ax, az, bx, bz, height, broken = false) {
    const length = Math.hypot(bx - ax, bz - az);
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const angle = -Math.atan2(bz - az, bx - ax);
    const y = groundHeight(x, z);
    instance('adobe-wall', geometries.box, materials.adobe, x, y + height / 2, z,
      length, height, 0.65, angle);
    wallColliders(ax, az, bx, bz, 0.43);
    if (broken) {
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        const px = THREE.MathUtils.lerp(ax, bx, t);
        const pz = THREE.MathUtils.lerp(az, bz, t);
        instance('adobe-chunks', geometries.rock, materials.adobe, px,
          groundHeight(px, pz) + height + 0.08, pz, 0.56, 0.24 + random() * 0.28, 0.47, random());
      }
    }
  }
  // Discontinuous perimeter walls: broad entrances west, south and east.
  [[-13, -24, -4, -25], [1, -28, 16, -28], [22, -26, 30, -20],
    [32, -14, 32, -7], [31, 0, 28, 9], [21, 13, 12, 14],
    [3, 14, -6, 10], [-13, 4, -15, -3], [-15, -13, -15, -20]]
    .forEach((spec, index) => freestandingWall(...spec, 1.65 + (index % 3) * 0.32, true));

  // Two water tanks and a work shelter on the north edge of the settlement.
  [[13, -24, 2.0, 4.4], [17.3, -23.5, 1.45, 3.5]].forEach(([x, z, radius, height], index) => {
    const y = groundHeight(x, z);
    mesh(geometries.cylinder, index ? materials.rust : materials.patina,
      group, x, y + height / 2 + 0.45, z, radius * 2, height, radius * 2);
    [0.8, height - 0.3].forEach(level => {
      instance('tank-bands', geometries.cylinder, materials.iron, x, y + level + 0.45, z,
        radius * 2 + 0.11, 0.11, radius * 2 + 0.11);
    });
    instance('tank-plinths', geometries.box, materials.darkStone, x, y + 0.2, z,
      radius * 2 + 0.5, 0.4, radius * 2 + 0.5);
    obstacle(x, z, radius + 0.27);
  });
  const marketRoof = mesh(canopyGeometry, materials.cloth, group, 8.5,
    groundHeight(8.5, -6) + 3.8, -6, 7.3, 1.3, 5.3, -0.08);
  marketRoof.name = 'CentralShadeSail';
  [[5, -8.5], [12, -8.5], [5, -3.5], [12, -3.5]].forEach(([x, z]) => {
    instance('timber-cylinder', geometries.cylinder, materials.timber, x,
      groundHeight(x, z) + 1.95, z, 0.18, 3.9, 0.18);
    obstacle(x, z, 0.2);
  });
  for (let i = 0; i < 17; i++) {
    const x = i < 9 ? 1 + (i % 3) * 1.05 : 18 + (i % 3) * 0.9;
    const z = i < 9 ? -10.3 - Math.floor(i / 3) * 0.9 : -10 - Math.floor((i - 9) / 3) * 0.85;
    const size = 0.65 + random() * 0.3;
    instance('cargo-crates', geometries.box, materials.timber, x,
      groundHeight(x, z) + size / 2, z, size, size, size, random() * 0.13);
  }

  // A deliberately low-detail, animated windmill reads clearly at tactical scale.
  const windmill = new THREE.Group();
  windmill.name = 'SettlementWindmill';
  windmill.position.set(29, groundHeight(29, -22), -22);
  group.add(windmill);
  [-1, 1].forEach(side => {
    const leg = mesh(geometries.box, materials.iron, windmill, side * 1.1, 4.5, 0, 0.22, 9.2, 0.22);
    leg.rotation.z = side * 0.13;
    obstacle(29 + side * 1.1, -22, 0.3);
  });
  [1.4, 3.4, 5.4, 7.4].forEach(y => mesh(geometries.box, materials.rust,
    windmill, 0, y, 0, 2.1 - y * 0.15, 0.12, 0.22));
  const rotor = new THREE.Group();
  rotor.position.set(0, 8.6, 0.3);
  windmill.add(rotor);
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = i * Math.PI / 3;
    rotor.add(blade);
    mesh(geometries.box, materials.iron, blade, 0, 1.48, 0, 0.1, 3.0, 0.1);
    const panel = mesh(geometries.box, i % 2 ? materials.patina : materials.rust,
      blade, 0.35, 2.28, 0.04, 0.75, 1.25, 0.08);
    panel.rotation.z = -0.14;
  }
  const hub = mesh(geometries.cylinder, materials.iron, rotor, 0, 0, 0.1, 0.52, 0.38, 0.52);
  hub.rotation.x = Math.PI / 2;

  // Archives ruin: walls and columns leave an open court and a wide south entry.
  [[-36, -30, -31, -30, 3.8], [-28, -30, -24, -30, 2.7],
    [-36, -30, -36, -25, 3.1], [-24, -30, -24, -24, 4.4],
    [-35, -21, -32, -21, 1.5], [-28, -21, -25, -21, 1.2]]
    .forEach(spec => freestandingWall(...spec, true));
  [[-33.5, -27.5, 3.7], [-26.5, -27.5, 4.4], [-33.5, -23, 2.7], [-26.5, -23, 2.1]]
    .forEach(([x, z, h]) => {
      instance('ruin-columns', geometries.cone, materials.paleAdobe,
        x, groundHeight(x, z) + h / 2, z, 0.85, h, 0.85);
      obstacle(x, z, 0.55);
    });
  instance('ruin-beam', geometries.box, materials.paleAdobe, -30,
    groundHeight(-30, -27.5) + 3.95, -27.5, 7.7, 0.6, 1.1, 0, null, 0.09);
  for (let i = 0; i < 15; i++) {
    const x = -38 + random() * 14;
    const z = -33 + random() * 3;
    instance('ruin-rubble', geometries.rock, materials.adobe, x,
      groundHeight(x, z) + 0.23, z, 0.4 + random() * 0.5, 0.24, 0.4, random() * 4);
  }

  // Wreck of an industrial carrier. The silhouette uses a hull and exposed ribs.
  const wreck = new THREE.Group();
  wreck.name = 'IndustrialCarrierWreck';
  wreck.position.set(28, groundHeight(28, 24), 24);
  wreck.rotation.y = -0.47;
  group.add(wreck);
  mesh(geometries.box, materials.iron, wreck, 0, 1.3, 0, 10, 2.4, 3.9);
  const hull = mesh(geometries.cylinder, materials.rust, wreck, 0, 2.55, 0, 3.85, 9.4, 3.85);
  hull.rotation.z = Math.PI / 2;
  mesh(geometries.box, materials.patina, wreck, -3.3, 2.2, 0, 2.5, 3, 4.2, 0.08);
  for (let i = 0; i < 6; i++) {
    const rib = mesh(geometries.ring, materials.iron, wreck, -4 + i * 1.6, 2.55, 0, 2.03, 2.03, 2.03);
    rib.rotation.y = Math.PI / 2;
  }
  const fallenPanel = mesh(geometries.box, materials.rust, wreck, 3.5, 0.3, 3.7, 3.6, 0.12, 2.7, 0.4);
  fallenPanel.rotation.x = 0.08;
  [-3.6, -1.8, 0, 1.8, 3.6].forEach(x => {
    const at = localToWorld(x, 0, 28, 24, -0.47);
    obstacle(at.x, at.z, 2.22);
  });

  // Functional-looking well with an open timber frame, bucket and stone rim.
  const wellY = groundHeight(-26, 25);
  const wellBase = mesh(geometries.cylinder, materials.darkStone,
    group, -26, wellY + 0.3, 25, 4.0, 0.6, 4.0);
  wellBase.name = 'OldStoneWell';
  mesh(geometries.cylinder, materials.dark, group, -26, wellY + 0.62, 25, 2.8, 0.025, 2.8);
  const wellRim = mesh(geometries.ring, materials.paleAdobe,
    group, -26, wellY + 0.7, 25, 1.57, 1.57, 1.57);
  wellRim.rotation.x = Math.PI / 2;
  [-1.8, 1.8].forEach(offset => {
    instance('timber-box', geometries.box, materials.timber, -26 + offset,
      wellY + 1.95, 25, 0.24, 3.9, 0.24);
    obstacle(-26 + offset, 25, 0.24);
  });
  instance('timber-box', geometries.box, materials.timber, -26, wellY + 3.7, 25, 4.2, 0.28, 0.32);
  instance('iron-cylinder', geometries.cylinder, materials.iron, -26,
    wellY + 2.6, 25, 0.04, 2.1, 0.04);
  mesh(geometries.cone, materials.patina, group, -26, wellY + 1.44, 25, 0.62, 0.65, 0.62);
  obstacle(-26, 25, 1.85);

  const resources = [
    ['water-relay', 'Réserve du relais', 10.8, -3.0, 'water'],
    ['water-well-east', 'Bidons du puits', -22.4, 25.2, 'water'],
    ['water-well-north', 'Réserve d’arpenteur', -27.6, 21.2, 'water'],
    ['water-road', 'Eau de voyage', -14.4, 11.9, 'water'],
    ['water-wreck', 'Caisse de gourdes', 31.3, 30.3, 'water'],
    ['scrap-archives', 'Fer des archives', -34.2, -18.5, 'scrap'],
    ['scrap-ruin-east', 'Pièces anciennes', -21.7, -26.0, 'scrap'],
    ['scrap-carrier', 'Pièces du transporteur', 35.3, 25.5, 'scrap'],
    ['scrap-road', 'Débris de convoyage', 17.9, 18.7, 'scrap'],
  ];
  resources.forEach(([id, label, x, z, kind], index) => {
    const node = new THREE.Group();
    node.name = id;
    const y = groundHeight(x, z);
    node.position.set(x, y, z);
    node.rotation.y = index * 0.73;
    node.userData = { type: 'resource', resourceId: id, kind, label };
    group.add(node);
    mesh(geometries.box, materials.resourceBase, node, 0, 0.08, 0, 1.75, 0.16, 1.55);
    if (kind === 'water') {
      mesh(geometries.cylinder, materials.water, node, -0.35, 0.69, 0, 0.85, 1.15, 0.85);
      mesh(geometries.cylinder, materials.patina, node, 0.5, 0.52, 0.14, 0.62, 0.8, 0.62);
      mesh(geometries.box, materials.paleMetal, node, -0.35, 1.29, 0, 0.28, 0.09, 0.15);
      mesh(geometries.box, materials.paleMetal, node, -0.35, 0.72, 0.43, 0.55, 0.11, 0.035);
    } else {
      for (let piece = 0; piece < 3; piece++) {
        const part = mesh(geometries.box, piece === 1 ? materials.patina : materials.rust,
          node, (piece - 1) * 0.3, 0.22 + piece * 0.15, (piece % 2) * 0.32,
          1.25 - piece * 0.17, 0.18, 0.75, piece * 0.8);
        part.rotation.z = (piece - 1) * 0.17;
      }
      mesh(geometries.cylinder, materials.paleMetal, node, 0.56, 0.5, -0.3, 0.34, 0.6, 0.34);
    }
    resourceNodes.push({ id, label, position: new THREE.Vector3(x, y + 0.6, z),
      kind, amount: 20, mesh: node, remaining: 1 });
  });

  // Keep exploration corridors, the starting area and all interactables clear.
  function reserved(x, z, margin) {
    if (distance(x, z, 9, -8) < 33 + margin) return true;
    if (distance(x, z, -12, 17) < 8 + margin) return true;
    if (landmarks.slice(1).some(point => distance(x, z, point.x, point.z) < point.radius + 3 + margin)) return true;
    return resources.some(point => distance(x, z, point[2], point[3]) < 3 + margin);
  }
  // Canyon boulders are instanced; near-map rocks have matching circular blockers.
  for (let i = 0; i < 115; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 57 + random() * 28;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const sx = 1.7 + random() * 4.5;
    const sy = 1.6 + random() * 7;
    const sz = 1.8 + random() * 3.6;
    if (reserved(x, z, Math.max(sx, sz))) continue;
    const tint = new THREE.Color().setHSL(0.085 + random() * 0.025, 0.18 + random() * 0.1, 0.69 + random() * 0.14);
    instance('canyon-rocks', geometries.rock, materials.stone,
      x, groundHeight(x, z) + sy * 0.43, z, sx, sy, sz, random() * Math.PI, tint);
    if (Math.abs(x) < 77 && Math.abs(z) < 77) obstacle(x, z, Math.max(sx, sz) * 0.81);
  }
  for (let i = 0; i < 48; i++) {
    const x = (random() - 0.5) * 130;
    const z = (random() - 0.5) * 130;
    if (reserved(x, z, 0.6)) continue;
    const scale = 0.28 + random() * 0.85;
    instance('small-rocks', geometries.rock, materials.darkStone,
      x, groundHeight(x, z) + scale * 0.24, z, scale, scale * 0.7, scale * 0.8, random() * 6.28);
    if (scale > 0.65) obstacle(x, z, scale * 0.7);
  }

  // Very distant mesas give a layered horizon with only a handful of draw calls.
  for (let i = 0; i < 14; i++) {
    const angle = i * Math.PI * 2 / 14 + 0.14;
    const radius = 96 + random() * 15;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const width = 7 + random() * 9;
    const height = 7 + random() * 15;
    const base = groundHeight(x, z) - 2;
    instance('distant-mesa', geometries.mesa, materials.darkStone, x,
      base + height / 2, z, width, height, width * (0.65 + random() * 0.35), angle);
    instance('mesa-cap', geometries.mesa, materials.stone, x,
      base + height + 0.8, z, width * 1.05, 1.6, width * 0.8, angle);
  }

  const brushGeometry = new THREE.BufferGeometry();
  brushGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.4, 0, 0, 0.36, 0, 0, -0.2, 0.85, 0,
    0, 0, -0.35, 0, 0, 0.38, 0, 0.65, 0.13,
    -0.2, 0, -0.2, 0.28, 0, 0.28, 0.25, 0.5, 0.1,
  ], 3));
  brushGeometry.computeVertexNormals();
  for (let i = 0; i < 235; i++) {
    const x = (random() - 0.5) * 158;
    const z = (random() - 0.5) * 158;
    if (distance(x, z, 9, -8) < 25 || distance(x, z, -12, 17) < 3) continue;
    const scale = 0.42 + random() * 1.05;
    instance('dry-brush', brushGeometry, materials.brush,
      x, groundHeight(x, z) - 0.025, z, scale, scale, scale, random() * 6.28);
  }
  // Isolated ruined pylons remain outside the central movement corridors.
  [[-48, -7, 7.7], [47, -30, 9.3], [-45, 44, 6.8]].forEach(([x, z, height]) => {
    const y = groundHeight(x, z);
    [-0.75, 0.75].forEach(offset => {
      instance('pylon-legs', geometries.box, materials.iron, x + offset,
        y + height / 2, z, 0.18, height, 0.18, 0, null, offset * -0.06);
    });
    instance('pylon-beams', geometries.box, materials.rust,
      x, y + height - 0.2, z, 3.6, 0.25, 0.35);
    obstacle(x, z, 1.15);
  });

  for (const [name, bucket] of buckets) {
    const batch = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.items.length);
    batch.name = name;
    batch.castShadow = name !== 'dry-brush' && name !== 'small-rocks';
    batch.receiveShadow = true;
    bucket.items.forEach((item, index) => {
      batch.setMatrixAt(index, item.matrix);
      if (item.tint) batch.setColorAt(index, item.tint);
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    group.add(batch);
  }

  function update(dt, elapsed = 0) {
    rotor.rotation.z += Math.min(Math.max(dt || 0, 0), 0.1) * 0.29;
    // A subtle cloth movement; no scene-wide traversal is required per frame.
    marketRoof.rotation.z = Math.sin(elapsed * 0.73) * 0.009;
  }
  group.userData.colliderCount = colliders.length;
  group.userData.resourceCount = resourceNodes.length;
  return { group, terrain, colliders, resourceNodes, landmarks, groundHeight, update };
}
