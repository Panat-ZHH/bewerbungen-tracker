import * as THREE from "three";

export function villageWalkingRoutes(streets: { x: number | null; z: number | null }[], limit = 4) {
  const cells = new Map(streets.filter((cell) => cell.x !== null && cell.z !== null).map((cell) => [`${cell.x}:${cell.z}`, { x: cell.x!, z: cell.z! }]));
  const used = new Set<string>();
  const routes: THREE.Vector3[][] = [];
  for (const [key, start] of cells) {
    if (routes.length >= limit) break;
    if (used.has(key)) continue;
    const route = [new THREE.Vector3(start.x + 0.5, 0.35, start.z + 0.5)];
    let current = start;
    const visited = new Set([key]);
    for (let step = 0; step < 10; step++) {
      const next = [[current.x, current.z + 1], [current.x + 1, current.z], [current.x, current.z - 1], [current.x - 1, current.z]].map(([x, z]) => cells.get(`${x}:${z}`)).find((candidate) => candidate && !visited.has(`${candidate.x}:${candidate.z}`));
      if (!next) break;
      const nextKey = `${next.x}:${next.z}`;
      visited.add(nextKey); current = next;
      route.push(new THREE.Vector3(next.x + 0.5, 0.35, next.z + 0.5));
    }
    if (route.length < 3) continue;
    visited.forEach((cell) => used.add(cell)); routes.push(route);
  }
  return routes;
}

export function createMapVillager({ working = false, color = "#63869b", route = [], phase = 0 }: { working?: boolean; color?: string; route?: THREE.Vector3[]; phase?: number } = {}) {
  const group = new THREE.Group();
  group.name = working ? "builder" : "villager";
  const body = new THREE.Group(); body.name = "body"; group.add(body);
  const resources: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
  function part(parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, shade: string) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: shade, roughness: 0.85, flatShading: true });
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); object.castShadow = true;
    parent.add(object); resources.push({ geometry, material }); return object;
  }
  function joint(name: string, x: number, y: number) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(x, y, 0); body.add(pivot); return pivot;
  }
  const leftLeg = joint("leftLeg", -0.105, 0.48);
  const rightLeg = joint("rightLeg", 0.105, 0.48);
  for (const leg of [leftLeg, rightLeg]) {
    part(leg, 0, -0.18, 0, 0.145, 0.34, 0.16, "#465967");
    part(leg, 0, -0.39, 0.045, 0.17, 0.12, 0.25, "#473e35");
  }
  part(body, 0, 0.67, 0, 0.37, 0.4, 0.25, working ? "#d8a34e" : color);
  part(body, 0, 0.49, 0, 0.38, 0.06, 0.27, "#75624c");
  const leftArm = joint("leftArm", -0.255, 0.83);
  const rightArm = joint("rightArm", 0.255, 0.83);
  for (const arm of [leftArm, rightArm]) {
    part(arm, 0, -0.12, 0, 0.13, 0.23, 0.16, working ? "#d8a34e" : color);
    part(arm, 0, -0.29, 0, 0.12, 0.15, 0.13, "#e5b58c");
  }
  part(body, 0, 1.02, 0, 0.28, 0.28, 0.27, "#e5b58c");
  part(body, 0, 1.18, -0.025, 0.3, 0.1, 0.29, working ? "#edc56b" : "#65503f");
  part(body, 0, 1.13, 0.14, 0.34, 0.055, 0.14, working ? "#edc56b" : "#65503f");
  for (const side of [-1, 1]) part(body, side * 0.065, 1.04, 0.143, 0.035, 0.04, 0.025, "#3e4242");
  if (working) {
    part(rightArm, 0, -0.39, 0.1, 0.055, 0.3, 0.055, "#8d704f");
    part(rightArm, 0, -0.52, 0.1, 0.32, 0.13, 0.16, "#74838b");
    part(body, -0.1, 0.69, 0.14, 0.055, 0.36, 0.035, "#f3d9a1");
    part(body, 0.1, 0.69, 0.14, 0.055, 0.36, 0.035, "#f3d9a1");
  } else part(body, 0, 0.7, -0.19, 0.28, 0.3, 0.12, "#a88860");

  const mixer = new THREE.AnimationMixer(group);
  const times = [0, 0.21, 0.42, 0.63, 0.84];
  const tracks = working ? [
    new THREE.NumberKeyframeTrack("rightArm.rotation[x]", [0, 0.3, 0.5, 0.7, 1], [-0.3, -1.7, -1.9, 0.25, -0.3]),
    new THREE.NumberKeyframeTrack("leftArm.rotation[x]", [0, 0.5, 1], [-0.25, -0.45, -0.25]),
    new THREE.NumberKeyframeTrack("body.rotation[x]", [0, 0.5, 0.7, 1], [0, -0.08, 0.1, 0]),
  ] : [
    new THREE.NumberKeyframeTrack("leftLeg.rotation[x]", times, [0, 0.62, 0, -0.62, 0]),
    new THREE.NumberKeyframeTrack("rightLeg.rotation[x]", times, [0, -0.62, 0, 0.62, 0]),
    new THREE.NumberKeyframeTrack("leftArm.rotation[x]", times, [0, -0.48, 0, 0.48, 0]),
    new THREE.NumberKeyframeTrack("rightArm.rotation[x]", times, [0, 0.48, 0, -0.48, 0]),
    new THREE.NumberKeyframeTrack("body.position[y]", times, [0.015, 0.055, 0.015, 0.055, 0.015]),
    new THREE.NumberKeyframeTrack("body.rotation[z]", times, [0, 0.035, 0, -0.035, 0]),
  ];
  const action = mixer.clipAction(new THREE.AnimationClip(working ? "hammer" : "walk", working ? 1 : 0.84, tracks));
  action.play();
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let index = 1; index < route.length; index++) path.add(new THREE.LineCurve3(route[index - 1], route[index]));
  const length = path.getLength();
  const tangent = new THREE.Vector3();
  const point = new THREE.Vector3();
  function animate(seconds: number) {
    const time = seconds + phase;
    mixer.setTime(time);
    if (!working && length > 0) {
      const progress = (time * 0.8) % (length * 2);
      const forward = progress <= length;
      const fraction = Math.max(0.00001, Math.min(0.99999, (forward ? progress : length * 2 - progress) / length));
      path.getPointAt(fraction, point); group.position.copy(point);
      path.getTangentAt(fraction, tangent);
      group.rotation.y = Math.atan2(tangent.x, tangent.z) + (forward ? 0 : Math.PI);
    }
  }
  animate(0);
  return {
    group, animate,
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(group); for (const resource of resources) { resource.geometry.dispose(); resource.material.dispose(); } },
  };
}