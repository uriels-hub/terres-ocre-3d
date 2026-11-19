import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCameraController } from '../dist/js/camera.js';

function rig({ aspect = 16 / 10, ...options } = {}) {
  const camera = new THREE.PerspectiveCamera(43, aspect, 0.2, 650);
  const controller = createCameraController(THREE, camera, {
    initialTarget: { x: 0, z: 0 }, initialYaw: 0, initialPitch: 0.7,
    initialDistance: 32, ...options,
  });
  return { camera, controller };
}

function settle(controller, seconds = 4) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) controller.update(1 / 60);
}

function vector(value) { return new THREE.Vector3(value.x, value.y, value.z); }
function near(actual, expected, tolerance = 1e-7, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`);
}
function samePosition(actual, expected, tolerance = 1e-7) {
  assert.ok(vector(actual).distanceTo(vector(expected)) <= tolerance,
    `positions differ: ${JSON.stringify(actual)} / ${JSON.stringify(expected)}`);
}
function project(camera, point) {
  camera.updateMatrixWorld(true);
  return vector(point).project(camera);
}
function assertFiniteState(controller) {
  const state = controller.getState();
  const values = [state.yaw, state.pitch, state.distance, state.heading,
    ...Object.values(state.target), ...Object.values(state.position),
    state.goal.yaw, state.goal.pitch, state.goal.distance, ...Object.values(state.goal.target)];
  assert.ok(values.every(Number.isFinite), 'camera state must remain finite');
}

test('multiple full turns return to the same real camera position and projected view', () => {
  const { camera, controller } = rig({ initialYaw: 0.72 });
  const before = controller.getState();
  const landmark = { x: 4, y: 1.5, z: -3 };
  const projectedBefore = project(camera, landmark);
  for (const turn of [Math.PI * 2, -Math.PI * 8, Math.PI * 14]) {
    controller.rotate(turn);
    settle(controller);
    samePosition(controller.getState().position, before.position);
    samePosition(project(camera, landmark), projectedBefore);
  }
});

test('crossing the pi seam follows the short visible arc', () => {
  const { controller } = rig({ initialYaw: Math.PI - 0.03 });
  const before = controller.getState();
  controller.rotate(0.06);
  for (let frame = 0; frame < 30; frame++) {
    controller.update(1 / 60);
    const state = controller.getState();
    const initialOffset = vector(before.position).sub(vector(before.target));
    const offset = vector(state.position).sub(vector(state.target));
    assert.ok(initialOffset.angleTo(offset) < 0.061, 'orbit took the long way around the target');
    assert.ok(state.position.z < state.target.z, 'camera crossed the opposite hemisphere');
  }
  settle(controller);
  assert.ok(controller.getState().position.x < 0);
  assertFiniteState(controller);
});

test('pitch, zoom and target bounds remain finite under extreme and invalid input', () => {
  const { controller } = rig();
  controller.rotate(10000, 10000);
  controller.zoom(1e100);
  controller.setTarget(1e9, -1e9);
  settle(controller);
  let state = controller.getState();
  near(state.pitch, 1.43); near(state.distance, 130);
  near(state.target.x, 74); near(state.target.z, -74);
  controller.rotate(0, -10000);
  controller.zoom(1e-100);
  settle(controller);
  state = controller.getState();
  near(state.pitch, 0.18); near(state.distance, 10);
  const goal = state.goal;
  controller.rotate(NaN, Infinity);
  controller.zoom(0); controller.zoom(-1); controller.zoom(Infinity); controller.zoom(NaN);
  controller.pan(NaN, 1); controller.panScreen(1, Infinity); controller.setTarget(NaN, 0);
  controller.update(NaN); controller.update(-1); controller.update(Infinity);
  assert.deepEqual(controller.getState().goal, goal);
  assertFiniteState(controller);
});

test('zoom changes the view distance while retaining the ground target', () => {
  const { camera, controller } = rig();
  controller.setTarget(12, -9); settle(controller);
  const before = controller.getState();
  const beforeDistance = camera.position.distanceTo(vector(before.target));
  controller.zoom(0.55); settle(controller);
  const after = controller.getState();
  samePosition(after.target, before.target);
  assert.ok(camera.position.distanceTo(vector(after.target)) < beforeDistance);
  const targetOnScreen = project(camera, after.target);
  near(targetOnScreen.x, 0); near(targetOnScreen.y, 0);
});

test('screen pan follows actual camera axes after cardinal rotations', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { camera, controller } = rig();
    controller.rotate(yaw); settle(controller);
    camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0; right.normalize();
    const upOnGround = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    upOnGround.y = 0; upOnGround.normalize();
    let before = vector(controller.getState().target);
    controller.panScreen(60, 0); settle(controller);
    let movement = vector(controller.getState().target).sub(before); movement.y = 0;
    assert.ok(movement.dot(right) < -0.5, 'horizontal drag moved in the wrong screen direction');
    near(movement.dot(upOnGround), 0, 1e-6, 'horizontal pan orthogonality');
    before = vector(controller.getState().target);
    controller.panScreen(0, 60); settle(controller);
    movement = vector(controller.getState().target).sub(before); movement.y = 0;
    assert.ok(movement.dot(upOnGround) > 0.5, 'vertical drag moved in the wrong screen direction');
    near(movement.dot(right), 0, 1e-6, 'vertical pan orthogonality');
  }
});

for (const [name, aspect] of [['desktop', 1440 / 900], ['portrait', 390 / 844]]) {
  test(`focus frames all three positions in the ${name} viewport`, () => {
    const { camera, controller } = rig({ aspect, initialYaw: 0.72 });
    const points = [{ x: -9, y: 1.5, z: -8 }, { x: 10, y: 1.5, z: 3 }, { x: 0, y: 1.5, z: 10 }];
    controller.focus(points); settle(controller);
    for (const point of points) {
      const screen = project(camera, point);
      assert.ok(Math.abs(screen.x) < 0.9 && Math.abs(screen.y) < 0.9 && screen.z > -1 && screen.z < 1,
        `focused point falls outside the visible viewport: ${JSON.stringify(screen)}`);
    }
  });
}

test('following advances with a moving subject and remains comparable at different frame rates', () => {
  function follow(fps) {
    const { controller } = rig();
    controller.setFollowing(true);
    for (let frame = 1; frame <= fps * 2; frame++) {
      const time = frame / fps;
      controller.update(1 / fps, { x: 5 * time, z: -2 * time });
    }
    return controller.getState();
  }
  const slow = follow(30), fast = follow(120);
  assert.ok(slow.following && fast.following);
  assert.ok(Math.hypot(fast.target.x - 10, fast.target.z + 4) < 0.6, 'subject tracking lags excessively');
  assert.ok(vector(slow.target).distanceTo(vector(fast.target)) < 0.1, 'tracking depends excessively on frame rate');
});

test('rotation and zoom preserve following while manual pan and target changes release it', () => {
  const { controller } = rig();
  controller.setFollowing(true); controller.update(0.1, { x: 10, z: 2 });
  controller.rotate(0.5, 0.1); controller.zoom(0.8);
  assert.equal(controller.getState().following, true);
  controller.update(0.1, { x: 14, z: 3 });
  assert.equal(controller.getState().goal.target.x, 14);
  controller.pan(1, -1);
  assert.equal(controller.getState().following, false);
  const target = controller.getState().goal.target;
  controller.update(0.1, { x: 60, z: 60 });
  assert.deepEqual(controller.getState().goal.target, target);
  controller.setFollowing(true); controller.setTarget(-3, 4);
  assert.equal(controller.getState().following, false);
});

test('reset restores the initial physical view and disables following', () => {
  const { controller } = rig({ initialYaw: 0.3, initialTarget: { x: 2, z: -4 } });
  const initial = controller.getState();
  controller.rotate(2, 0.3); controller.zoom(2); controller.pan(20, -15);
  controller.setFollowing(true); controller.update(0.25, { x: 30, z: 30 });
  controller.reset({ immediate: true }); controller.update(0);
  const after = controller.getState();
  assert.equal(after.following, false);
  assert.deepEqual(after.goal, initial.goal);
  samePosition(after.target, initial.target);
  samePosition(after.position, initial.position);
});

test('invalid restoration does not damage the current camera state', () => {
  const { camera, controller } = rig();
  controller.pan(8, -5); controller.rotate(0.8); settle(controller);
  const valid = controller.getState();
  for (const invalid of [null, {}, { ...valid, target: null }, { ...valid, yaw: NaN },
    { ...valid, pitch: Infinity }, { ...valid, distance: '30' },
    { ...valid, target: { x: 1, z: undefined } }]) {
    assert.equal(controller.restore(invalid), false);
    assert.deepEqual(controller.getState(), valid);
    samePosition(camera.position, valid.position);
  }
});

test('state snapshots cannot mutate the live target, goal or camera position', () => {
  const { controller } = rig();
  const before = controller.getState(), copy = controller.getState();
  copy.target.x = 10000; copy.position.z = 10000;
  copy.goal.target.z = 10000; copy.goal.yaw = 10000;
  assert.deepEqual(controller.getState(), before);
});

test('low-angle view clears a hill between the target and camera, not just under the camera', () => {
  const groundHeight = (_x, z) => 7 * Math.exp(-(((z - 12) / 4) ** 2));
  const { controller } = rig({ groundHeight, initialPitch: 0.18, initialDistance: 35 });
  const state = controller.getState();
  assert.ok(state.position.y > 14, 'intermediate hill did not lift the camera');
  for (let sample = 0; sample <= 1500; sample++) {
    const t = sample / 1500;
    const x = state.target.x + (state.position.x - state.target.x) * t;
    const z = state.target.z + (state.position.z - state.target.z) * t;
    const y = state.target.y + (state.position.y - state.target.y) * t;
    assert.ok(y - groundHeight(x, z) >= 0.45,
      `view enters the intermediate terrain at t=${t.toFixed(4)}`);
  }
});
