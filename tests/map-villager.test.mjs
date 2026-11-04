import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createMapVillager, villageWalkingRoutes } from "../lib/map-villager.ts";

test("villagers walk with opposite legs and arms, vertical body movement and path travel", () => {
  const villager = createMapVillager({ route: [new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0, 0.2, 3)] });
  try {
    villager.animate(0.21);
    const left = villager.group.getObjectByName("leftLeg");
    const right = villager.group.getObjectByName("rightLeg");
    assert.ok(left.rotation.x > 0.5 && right.rotation.x < -0.5);
    assert.ok(villager.group.getObjectByName("leftArm").rotation.x < -0.4);
    assert.ok(villager.group.getObjectByName("body").position.y > 0.04);
    assert.ok(villager.group.position.z > 0.15);
    villager.animate(0.63);
    assert.ok(left.rotation.x < -0.5 && right.rotation.x > 0.5);
    villager.animate(4.5);
    assert.ok(Math.abs(villager.group.rotation.y - Math.PI) < 0.001);
  } finally { villager.dispose(); }
});

test("builders hammer in place and animation poses are deterministic", () => {
  const builder = createMapVillager({ working: true });
  try {
    builder.animate(0.5);
    assert.ok(builder.group.getObjectByName("rightArm").rotation.x < -1.8);
    assert.equal(builder.group.position.length(), 0);
    builder.animate(0.7);
    assert.ok(builder.group.getObjectByName("rightArm").rotation.x > 0.2);
    builder.animate(0.5);
    assert.ok(builder.group.getObjectByName("rightArm").rotation.x < -1.8);
  } finally { builder.dispose(); }
});

test("walking routes stay on connected street cells and never cross gaps", () => {
  const streets = [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }, { x: 1, z: 2 }, { x: 10, z: 0 }, { x: null, z: null }];
  const routes = villageWalkingRoutes(streets);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].length, 4);
  for (let index = 1; index < routes[0].length; index++) assert.equal(routes[0][index].distanceTo(routes[0][index - 1]), 1);
});