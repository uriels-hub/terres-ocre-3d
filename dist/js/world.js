/**
 * Original desert settlement for the browser prototype.
 * Three.js is supplied by the application; this module has no network imports.
 */
export function addDesertLight(THREE, scene, shadowSize) {
  scene.fog = new THREE.FogExp2(0xd8b99c, 0.0072);
  scene.background = new THREE.Color(0xd8b99c);
  scene.add(new THREE.HemisphereLight(0xc8dfeb, 0x977252, 1.75));
  const sun = new THREE.DirectionalLight(0xffdaae, 2.65);
  sun.position.set(-57, 45, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, {left:-65, right:65, top:65, bottom:-65, near:1, far:190});
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.0002;
  scene.add(sun);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {sunDirection: {value: sun.position.clone().normalize()}},
    vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      uniform vec3 sunDirection;
      varying vec3 p;
      void main() {
        vec3 ray = normalize(p);
        float h = pow(clamp(ray.y * 1.5, 0., 1.), .57);
        vec3 skyColor = mix(vec3(.79,.57,.39), vec3(.18,.36,.46), h);
        float facing = max(dot(ray,sunDirection), 0.);
        skyColor += vec3(.68,.39,.13) * pow(facing, 22.);
        skyColor += vec3(3.0,2.4,1.6) * smoothstep(.99962,.99985,facing);
        gl_FragColor = vec4(skyColor,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(360,24,12), material);
  sky.name = 'Ciel';
  scene.add(sky);
}

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
  const trails = [
    [[-29,25],[-20,21],[-13,17],[-10,10],[-8,6],[-2,2],[2,-5],[9,-7]],
    [[-33,-20],[-24,-18],[-17,-10],[-12,-8],[-3,-8],[9,-7],[22,-10],[37,-7]],
    [[30,28],[24,22],[15,17],[8,14],[8,9],[10,3],[9,-7],[11,-17],[17,-28]],
  ];
  function trailDistance(x,z) {
    let nearest = Infinity;
    for (const route of trails) {
      for (let i = 1; i < route.length; i++) {
        const [ax, az] = route[i-1], [bx, bz] = route[i];
        const dx = bx-ax, dz = bz-az;
        const t = THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
        nearest = Math.min(nearest, Math.hypot(x-ax-t*dx,z-az-t*dz));
      }
    }
    return nearest;
  }
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    heights[index] = rawHeight(x, z);
    positions.setY(index, heights[index]);
    const variation = 0.035 * Math.sin(x * 0.12 + z * 0.09)
      + 0.025 * Math.cos(z * 0.18 - x * 0.07);
    const highland = smoothstep(1.5, 5, heights[index]);
    const trail = 1 - smoothstep(1.1, 2.9, trailDistance(x,z) + variation * 8);
    const dust = .065 * Math.sin(x * .25 + z * .16 + 2.4 * Math.sin(z * .1));
    color.setRGB(.86 + variation + dust + trail * .15,
      .68 + variation + dust - highland * .13 + trail * .24,
      .49 + variation + dust - highland * .14 + trail * .33);
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
  const material = (colorValue, map = null, extra = {}) => new THREE.MeshStandardMaterial({
    color: colorValue, map, roughness: 0.96, metalness: 0, ...extra,
  });
  const materials = {
    sand: material(sandMap ? 0xffffff : 0xc5aa7d, sandMap, { vertexColors: true }),
    adobe: material(adobeMap ? 0xe7ad87 : 0xbf8969, adobeMap),
    paleAdobe: material(adobeMap ? 0xffe5b6 : 0xd4bc91, adobeMap),
    stone: material(rockMap ? 0xd3ae89 : 0xa98765, rockMap),
    darkStone: material(rockMap ? 0xbca68c : 0x92785c, rockMap),
    rust: material(rustMap ? 0xd9c2a9 : 0x846850, rustMap, { metalness: 0.14 }),
    iron: material(0x484b43, null, { roughness: 0.8, metalness: 0.38 }),
    paleMetal: material(0x929488, null, { roughness: 0.75, metalness: 0.4 }),
    patina: material(0x527f7b, null, { roughness: 0.82, metalness: 0.18 }),
    water: material(0x4b9293, null, { roughness: 0.66, metalness: 0.16 }),
    sail: material(0xffffff, null, { side: THREE.DoubleSide, vertexColors: true }),
    oxblood: material(0x90452f),
    lime: material(0xe6cf9d),
    shale: material(0x795448, rockMap),
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
  };

  // Pigment follows the stitched panels of the cloth, including its curved hem.
  function wovenSail(base, ink, border, vertical = false) {
    const cols = 32, rows = 16;
    const vertices = [], colors = [];
    const shades = [base, ink, border].map(value => new THREE.Color(value));
    function point(u, v) {
      if (vertical) {
        return [u, .5-v-.13*u*u + .055*Math.sin(7*u+v*3)*u,
          (.11*Math.sin(9*u-v*2)+.08*u)*u];
      }
      const sag = Math.sin(Math.PI*u) * (0.68 + 0.32*Math.sin(Math.PI*v));
      return [u-.5, u*.25-v*.16 - .44*sag + .045*Math.sin(u*24)*Math.sin(v*Math.PI), v-.5];
    }
    for (let j=0;j<rows;j++) {
      for (let i=0;i<cols;i++) {
        const u = (i+.5)/cols, v=(j+.5)/rows;
        const edge = Math.min(j,rows-1-j);
        const stair = Math.abs((i%8)-3.5);
        const diamond = Math.abs(u-.5)*2.2 + Math.abs(v-.5);
        let pigment = 0;
        if (edge === 1 || (edge === 3 && stair<2) || (diamond>.20 && diamond<.31)) pigment = 1;
        if (edge === 0 || (edge === 2 && stair>1) || diamond<.105) pigment = 2;
        const c = shades[pigment].clone().multiplyScalar(.92+.08*Math.sin(i*.65)+.04*(j%2));
        const a=point(i/cols,j/rows), b=point((i+1)/cols,j/rows);
        const d=point(i/cols,(j+1)/rows), e=point((i+1)/cols,(j+1)/rows);
        vertices.push(...a,...d,...e,...a,...e,...b);
        for (let corner=0;corner<6;corner++) colors.push(c.r,c.g,c.b);
      }
    }
    const fabric = new THREE.BufferGeometry();
    fabric.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    fabric.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    fabric.computeVertexNormals();
    return fabric;
  }
  const indigoSail = wovenSail(0x315f67,0xdfc198,0xab6745);
  const redSail = wovenSail(0xab5538,0xf1d7a7,0x4e5150);
  const standard = wovenSail(0x99432d,0xf5d6a2,0x3d5c60,true);

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
  // Bake the fixed architecture into shared batches. Animated and interactive
  // objects keep their own hierarchy so picking and the simulation still work.
  function batchArchitecture(structure) {
    structure.updateWorldMatrix(true, true);
    const parts = [];
    structure.traverse(part => { if (part.isMesh) parts.push(part); });
    for (const part of parts) {
      const key = 'structure-' + part.geometry.id + '-' + part.material.id;
      if (!buckets.has(key)) buckets.set(key, {geometry:part.geometry, material:part.material, items:[]});
      buckets.get(key).items.push({matrix:part.matrixWorld.clone()});
      part.removeFromParent();
    }
  }
  function beam(parent, mat, a, b, thickness, depth = thickness) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mid = start.clone().lerp(end,.5), axis = end.sub(start);
    const bar = mesh(geometries.box,mat,parent,mid.x,mid.y,mid.z,thickness,axis.length(),depth);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
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
    // Pigmented dado and projecting lime cornice catch the low sun.
    const band = index%3 === 1 ? materials.patina : materials.oxblood;
    for (const side of [-1,1]) {
      mesh(geometries.box,band,house,side*(width/2+.20),.67,0,.055,1.17,depth+.35);
      mesh(geometries.box,band,house,side*(doorway+flank)/2,.67,depth/2+.21,flank,1.17,.055);
      mesh(geometries.box,materials.lime,house,side*width/2,height-.42,0,.49,.20,depth+.46);
    }
    mesh(geometries.box,band,house,0,.67,-depth/2-.21,width+.4,1.17,.055);
    mesh(geometries.box,materials.lime,house,0,height-.42,depth/2,width+.5,.20,.5);
    mesh(geometries.box,materials.lime,house,0,height-.42,-depth/2,width+.5,.20,.5);
    // Rooftop windcatchers alternate with squat copper flues and ribbed sheds.
    if (index===1 || index===4 || index===6) {
      const cx = width*.19, cz = -depth*.14, top = height+(index===1 ? 3.9 : 2.25);
      mesh(geometries.box,mat,house,cx,(height+top)/2,cz,1.72,top-height,1.62);
      for (const side of [-1,1]) {
        mesh(geometries.box,materials.dark,house,cx,top-.57,cz+side*.815,1.23,.84,.035);
        mesh(geometries.box,band,house,cx,top-.56,cz+side*.85,.16,.93,.10);
        mesh(geometries.box,materials.dark,house,cx+side*.87,top-.55,cz,.035,.8,1.10);
      }
      mesh(geometries.box,band,house,cx,top-.99,cz,1.87,.18,1.78);
      mesh(geometries.box,materials.lime,house,cx,top+.11,cz,2.12,.24,1.96);
    } else {
      const cx = width*.22, cz = depth*.24;
      mesh(geometries.cylinder,materials.rust,house,cx,height+.94,cz,.48,1.7,.48);
      mesh(geometries.cone,materials.iron,house,cx,height+1.84,cz,.77,.29,.77);
    }
    for (let rib=0;rib<6;rib++) {
      const at = -width*.41+rib*width*.094;
      const ridge = mesh(geometries.box,materials.paleMetal,house,at,height+.39,-depth*.12,
        .048,.07,depth*.76,-.08);
      ridge.position.z -= (at+width*.18)*Math.sin(-.08);
    }
    if (index === 0 || index === 3 || index === 6) {
      const canopy = mesh(index===3 ? redSail : indigoSail, materials.sail,
        house, 0, 3.38, depth / 2 + 1.9, width * 0.94, 1.3, 3.6);
      canopy.name = 'DoorAwning';
      [-width * 0.44, width * 0.44].forEach(px => {
        const at = localToWorld(px, depth / 2 + 3.55, x, z, angle);
        instance('iron-cylinder', geometries.cylinder, materials.iron,
          at.x, house.position.y + 1.62, at.z, 0.14, 3.24, 0.14);
        obstacle(at.x, at.z, 0.18);
      });
    }
    batchArchitecture(house);
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

  // The southwest gate reuses the two wall ends as its foundations. The span is
  // entirely overhead, leaving the same opening from the squad's starting camp.
  const gate = new THREE.Group();
  gate.name = 'PortiqueDesCaravanes';
  group.add(gate);
  const posts = [[-13,4,7.4],[-6,10,5.4]];
  posts.forEach(([x,z,h], side) => {
    const floor = groundHeight(x,z);
    mesh(geometries.cone,materials.adobe,gate,x,floor+1.1,z,1.1,2.2,1.1);
    mesh(geometries.box,materials.timber,gate,x,floor+h*.5,z,.32,h,.34);
    for (const lift of [2.4, h-1.1, h-.45]) {
      mesh(geometries.box,materials.patina,gate,x,floor+lift,z,.43,.28,.45);
    }
    mesh(geometries.box,materials.iron,gate,x,floor+h-.27,z,1.65,.13,.22,.67);
    if (side===0) mesh(standard,materials.sail,gate,x,floor+h-.86,z,2.95,1.8,2,.45);
  });
  const gateAnchor = [[-13,6.71,4],[-10.5,5.53,6.2],[-8.35,5.12,8],[-6,5.22,10]];
  for (let i=1;i<gateAnchor.length;i++) {
    beam(gate,materials.iron,gateAnchor[i-1],gateAnchor[i],.066);
    const [x,y,z]=gateAnchor[i-1];
    mesh(geometries.box,i%2 ? materials.oxblood : materials.patina,gate,
      x+1.05,y-.9,z+.88,.63,1.15,.055,-.7);
  }
  batchArchitecture(gate);

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
  const marketRoof = mesh(redSail, materials.sail, group, 8.5,
    groundHeight(8.5, -6) + 4.2, -6, 7.3, 2.0, 5.3);
  marketRoof.name = 'CentralShadeSail';
  [[5, -8.5,4.2], [12, -8.5,4.7], [5, -3.5,3.9], [12, -3.5,4.4]].forEach(([x, z,h]) => {
    instance('timber-cylinder', geometries.cylinder, materials.timber, x,
      groundHeight(x, z) + h/2, z, 0.18, h, 0.18);
    obstacle(x, z, 0.2);
  });
  for (let i = 0; i < 17; i++) {
    const x = i < 9 ? 3.15 + (i % 3) * 1.05 : 18 + (i % 3) * 0.9;
    const z = i < 9 ? -10.3 - Math.floor(i / 3) * 0.9 : -10 - Math.floor((i - 9) / 3) * 0.85;
    const size = 0.65 + random() * 0.3;
    instance('cargo-crates', geometries.box, materials.timber, x,
      groundHeight(x, z) + size / 2, z, size, size, size, random() * 0.13);
    obstacle(x,z,size*.55);
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
  // Counterweight and tail distinguish the pump silhouette as the wheel turns.
  const tail = new THREE.Group();
  windmill.add(tail);
  beam(tail,materials.iron,[0,8.57,0],[-2.9,8.8,-1.25],.16);
  mesh(geometries.box,materials.patina,tail,-2.7,9.05,-1.18,1.5,1.15,.14,-.4);
  beam(tail,materials.iron,[-.94,1.45,0],[.60,5.42,0],.14);
  beam(tail,materials.iron,[.94,1.45,0],[-.60,5.42,0],.14);
  batchArchitecture(tail);

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
  // A fractured stone oculus sits on the surviving northern lintel.
  const archives = new THREE.Group();
  group.add(archives);
  archives.position.set(-29.9,groundHeight(-30,-27.5)+5.84,-27.6);
  const oculus = new THREE.TorusGeometry(2.12,.37,5,12,Math.PI*1.71);
  const wheel = mesh(oculus,materials.paleAdobe,archives,0,0,0,1,1,.85);
  wheel.rotation.z=.87;
  mesh(geometries.box,materials.oxblood,archives,0,-1.21,0,3.5,.20,1.05);
  batchArchitecture(archives);
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
  // Collapsed cargo derrick and torn exhaust stacks sit within the hull footprint.
  beam(wreck,materials.iron,[-3.6,2,0],[-2.55,6.9,.25],.26);
  beam(wreck,materials.iron,[-1.45,2,0],[-2.55,6.9,.25],.25);
  beam(wreck,materials.rust,[-2.55,6.9,.25],[2.95,4.85,.65],.36);
  beam(wreck,materials.iron,[-2.55,6.48,.25],[2.82,4.85,.65],.13);
  mesh(geometries.box,materials.iron,wreck,2.88,4.42,.64,.06,.88,.06);
  for (let i=0;i<3;i++) {
    const exhaust=mesh(geometries.cylinder,materials.rust,wreck,.15+i*.9,3.92,0,.53,1.65+i*.28,.53);
    exhaust.rotation.z=-.28;
  }
  batchArchitecture(wreck);
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
  const wellShade = new THREE.Group();
  group.add(wellShade);
  for (const x of [-27.8,-24.2]) {
    mesh(geometries.box,materials.timber,wellShade,x,wellY+4.08,25,.17,.17,3.75);
    beam(wellShade,materials.timber,[x,wellY+2.95,25],[x,wellY+4.03,26.42],.13);
    beam(wellShade,materials.timber,[x,wellY+2.95,25],[x,wellY+4.03,23.58],.13);
  }
  mesh(indigoSail,materials.sail,wellShade,-26,wellY+4.1,25,4.24,1.18,3.9);
  batchArchitecture(wellShade);
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
    const base = groundHeight(x, z) - 4;
    const depth = width * (0.65 + random() * 0.35);
    instance('mesa-scree', geometries.mesa, materials.stone, x,
      base + height*.12, z, width*1.36, height*.46, depth*1.38, angle);
    instance('distant-mesa', geometries.mesa, materials.darkStone, x,
      base + height*.52, z, width, height*.91, depth, angle);
    instance('mesa-strata', geometries.mesa, materials.shale, x,
      base + height*.73, z, width*1.035, height*.075, depth*1.035, angle);
    instance('mesa-cap', geometries.mesa, materials.stone, x,
      base + height, z, width*1.02, 1.5, depth*1.03, angle);
    if (i%3===1) {
      instance('distant-mesa',geometries.mesa,materials.darkStone,x+width*.25,
        base+height*1.19,z,width*.4,height*.43,depth*.44,angle);
      instance('mesa-cap',geometries.mesa,materials.stone,x+width*.25,
        base+height*1.40,z,width*.42,1.3,depth*.46,angle);
    }
  }
  // Thin fragments and grass tufts settle along the edges of the paths.
  for (const route of trails) {
    for (let i=1;i<route.length;i++) {
      const [ax,az]=route[i-1], [bx,bz]=route[i];
      const length=Math.hypot(bx-ax,bz-az), nx=(az-bz)/length, nz=(bx-ax)/length;
      for (let grain=0; grain<length*1.4; grain++) {
        const t=random(), side=(random()<.5 ? -1 : 1)*(1.7+2.2*random());
        const x=ax+(bx-ax)*t+nx*side, z=az+(bz-az)*t+nz*side;
        const size=.09+random()*.28;
        instance('path-gravel',geometries.rock,materials.darkStone,x,groundHeight(x,z)+.023,z,
          size,.045+size*.17,size*.64,random()*6.28);
      }
    }
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
    batch.castShadow = name !== 'dry-brush' && name !== 'small-rocks' && name !== 'path-gravel';
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
