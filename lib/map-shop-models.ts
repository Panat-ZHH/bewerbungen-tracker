import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import { shopCatalog, type ShopItemType } from "./map-shop";

type CarSpec = {
  color: string;
  body: [number, number][];
  cabin: [number, number][];
  roof?: [number, number][];
  roofColor?: string;
  width?: number;
  axles?: number[];
  wheel?: number;
  hub?: string;
  lightY?: number;
};

const scooterColours: Record<string, string> = { mint: "#7cc7b2", lilac: "#b7a3d9", black: "#3a3d42", lime: "#a9d64a", cream: "#efe2c2", sky: "#8cc3e6", coral: "#ec8a78" };

export function createShopModel(type: ShopItemType, selected = false) {
  const group = new THREE.Group();
  const resources: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  const animations: ((time: number) => void)[] = [];
  function mesh(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    group.add(object); resources.push({ geometry, material });
    return object;
  }
  function box(x: number, y: number, z: number, width: number, height: number, depth: number, color: string) {
    return mesh(new THREE.BoxGeometry(width, height, depth), color, x, y, z);
  }
  function cylinder(x: number, y: number, z: number, top: number, bottom: number, height: number, color: string, sides = 12) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, sides), color, x, y, z);
  }
  /** Side profile (x = length, y = height) extruded across the car's width (z), centred. */
  function profile(points: [number, number][], width: number, color: string, z = 0) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2);
    return mesh(geometry, color, 0, 0, z);
  }
  function wheel(x: number, z: number, radius = 0.16, thickness = 0.12, hub = "#c9ccd1") {
    const tyre = cylinder(x, 0.08 + radius, z, radius, radius, thickness, "#2e3134", 10);
    const cap = cylinder(x, 0.08 + radius, z + Math.sign(z) * (thickness / 2 + 0.005), radius * 0.5, radius * 0.5, 0.02, hub, 8);
    tyre.rotation.x = Math.PI / 2; cap.rotation.x = Math.PI / 2;
    // The SVG preview has no depth buffer (painter's sort): draw the wheels facing the preview camera (+z) after the body.
    if (z > 0) { tyre.renderOrder = 1; cap.renderOrder = 2; }
  }
  /** Shared car build: lower body, glass cabin, roof, wheels and lights. Front of the car points to +x. */
  function car(spec: CarSpec) {
    const width = spec.width ?? 0.8;
    profile(spec.body, width, spec.color);
    profile(spec.cabin, width * 0.82, "#3f5563");
    if (spec.roof) profile(spec.roof, width * 0.84, spec.roofColor ?? spec.color);
    for (const x of spec.axles ?? [0.55, -0.55]) for (const z of [-1, 1]) wheel(x, z * (width / 2 + 0.03), spec.wheel ?? 0.16, 0.12, spec.hub);
    const front = Math.max(...spec.body.map(([x]) => x));
    const rear = Math.min(...spec.body.map(([x]) => x));
    for (const z of [-1, 1]) {
      box(front - 0.02, spec.lightY ?? 0.3, z * width * 0.32, 0.06, 0.06, 0.16, "#fff2b8");
      box(rear + 0.02, (spec.lightY ?? 0.3) + 0.04, z * width * 0.32, 0.06, 0.06, 0.18, "#e0524a");
    }
  }
  const size = shopCatalog[type];
  const vehicle = type.startsWith("car_") || type.startsWith("scooter_");
  box(0, 0.04, 0, size.width * 0.95, 0.08, size.depth * 0.95, selected ? "#e4c46c" : type === "road" ? "#b6ad91" : vehicle ? "#bdb7a3" : "#819d60");
  if (vehicle) {
    // Parking bay markings so vehicles read as "parked" on the meadow.
    for (const side of [-1, 1]) box(0, 0.085, side * size.depth * 0.43, size.width * 0.9, 0.01, 0.04, "#f3eedc");
  }
  if (type === "car_ferrari") {
    car({ color: "#d8433b", body: [[-0.9, 0.18], [0.9, 0.18], [0.93, 0.3], [0.55, 0.42], [-0.6, 0.46], [-0.9, 0.42]], cabin: [[0.38, 0.43], [0.06, 0.66], [-0.34, 0.66], [-0.62, 0.46]], roof: [[0.02, 0.66], [-0.3, 0.66], [-0.3, 0.68], [0.02, 0.68]] });
    for (const z of [-1, 1]) box(-0.28, 0.32, z * 0.405, 0.3, 0.1, 0.02, "#2e3134");
    box(-0.86, 0.48, 0, 0.12, 0.04, 0.7, "#b8322c");
  } else if (type === "car_lamborghini") {
    car({ color: "#8fcf3c", body: [[-0.92, 0.18], [0.95, 0.18], [0.95, 0.24], [0.2, 0.4], [-0.92, 0.44]], cabin: [[0.36, 0.37], [-0.04, 0.6], [-0.42, 0.58], [-0.78, 0.44]], wheel: 0.17, lightY: 0.24, hub: "#f08a3c" });
    for (const z of [-1, 1]) { box(0.05, 0.27, z * 0.405, 1.3, 0.04, 0.02, "#f08a3c"); box(-0.78, 0.56, z * 0.25, 0.05, 0.2, 0.05, "#2e3134"); }
    box(-0.8, 0.67, 0, 0.2, 0.04, 0.82, "#f08a3c");
  } else if (type === "car_porsche") {
    car({ color: "#c9ccd1", body: [[-0.85, 0.18], [0.85, 0.18], [0.9, 0.28], [0.8, 0.38], [0.4, 0.44], [-0.5, 0.46], [-0.82, 0.4], [-0.88, 0.3]], cabin: [[0.32, 0.44], [0.06, 0.65], [-0.22, 0.66], [-0.5, 0.52], [-0.76, 0.42]], roof: [[0.04, 0.65], [-0.2, 0.66], [-0.2, 0.68], [0.04, 0.67]], axles: [0.52, -0.52], hub: "#8d9196" });
    for (const z of [-1, 1]) cylinder(0.7, 0.42, z * 0.24, 0.08, 0.08, 0.05, "#fff2b8", 8);
    box(-0.82, 0.43, 0, 0.1, 0.04, 0.66, "#a9adb3");
  } else if (type === "car_mclaren") {
    car({ color: "#f28a2e", body: [[-0.88, 0.18], [0.88, 0.18], [0.92, 0.26], [0.45, 0.4], [-0.62, 0.46], [-0.88, 0.4]], cabin: [[0.5, 0.4], [0.18, 0.64], [-0.22, 0.64], [-0.6, 0.46]] });
    // Dihedral doors swung up: the signature look of the model, no badge needed.
    for (const z of [-1, 1]) { const door = box(0.12, 0.72, z * 0.48, 0.42, 0.04, 0.26, "#f28a2e"); door.rotation.x = z * 1.1; door.rotation.z = 0.35; }
    for (const z of [-1, 1]) box(-0.2, 0.26, z * 0.405, 0.6, 0.08, 0.02, "#2e3134");
    box(-0.84, 0.5, 0, 0.14, 0.03, 0.72, "#2e3134");
  } else if (type === "car_aston_martin") {
    car({ color: "#2f5d46", body: [[-0.9, 0.18], [0.92, 0.18], [0.94, 0.34], [0.85, 0.42], [-0.72, 0.47], [-0.92, 0.4]], cabin: [[-0.02, 0.46], [-0.26, 0.68], [-0.56, 0.67], [-0.84, 0.46]], roof: [[-0.24, 0.68], [-0.54, 0.67], [-0.54, 0.7], [-0.24, 0.7]] });
    box(0.93, 0.28, 0, 0.04, 0.1, 0.36, "#c9ccd1");
    for (const z of [-1, 1]) box(0.45, 0.34, z * 0.405, 0.16, 0.04, 0.02, "#c9ccd1");
  } else if (type === "car_bugatti") {
    car({ color: "#5b8fd6", body: [[-0.92, 0.18], [0.92, 0.18], [0.95, 0.32], [0.6, 0.46], [-0.6, 0.5], [-0.92, 0.44]], cabin: [[0.36, 0.47], [0.02, 0.7], [-0.34, 0.7], [-0.62, 0.5]], roof: [[0.0, 0.7], [-0.32, 0.7], [-0.32, 0.72], [0.0, 0.72]], roofColor: "#1d3567", wheel: 0.17, hub: "#1d3567" });
    // Two-tone: dark front section, light rear section, separated by a curved silver line.
    profile([[0.15, 0.18], [0.92, 0.18], [0.95, 0.32], [0.6, 0.46], [0.15, 0.48]], 0.82, "#1d3567");
    for (const z of [-1, 1]) for (let step = 0; step < 5; step++) { const angle = -0.9 + step * 0.45; box(0.05 + Math.cos(angle) * 0.18, 0.33 + Math.sin(angle) * 0.13, z * 0.415, 0.08, 0.03, 0.01, "#dfe3e8").rotation.z = angle + Math.PI / 2; }
    box(0.96, 0.26, 0, 0.03, 0.12, 0.14, "#c9ccd1");
    box(-0.15, 0.73, 0, 0.5, 0.04, 0.05, "#1d3567");
  } else if (type === "car_amg") {
    car({ color: "#2b2d31", body: [[-0.9, 0.18], [0.9, 0.18], [0.92, 0.4], [0.5, 0.48], [-0.9, 0.5]], cabin: [[0.25, 0.48], [-0.04, 0.7], [-0.5, 0.7], [-0.76, 0.5]], roof: [[-0.02, 0.7], [-0.48, 0.7], [-0.48, 0.72], [-0.02, 0.72]], hub: "#c3c7cc" });
    for (let bar = 0; bar < 5; bar++) box(0.925, 0.3, (bar - 2) * 0.07, 0.03, 0.14, 0.025, "#c3c7cc");
    for (const z of [-0.3, -0.2, 0.2, 0.3]) cylinder(-0.92, 0.22, z, 0.03, 0.03, 0.08, "#c3c7cc", 6).rotation.z = Math.PI / 2;
    for (const z of [-1, 1]) box(0.25, 0.47, z * 0.43, 0.08, 0.06, 0.06, "#c3c7cc");
  } else if (type === "car_audi_r8") {
    car({ color: "#f1f1ee", body: [[-0.88, 0.18], [0.9, 0.18], [0.92, 0.32], [0.5, 0.42], [-0.55, 0.46], [-0.88, 0.4]], cabin: [[0.3, 0.42], [0.0, 0.66], [-0.3, 0.66], [-0.56, 0.46]], roof: [[-0.02, 0.66], [-0.28, 0.66], [-0.28, 0.68], [-0.02, 0.68]] });
    // Contrasting side blade behind the doors.
    for (const z of [-1, 1]) box(-0.3, 0.32, z * 0.41, 0.12, 0.24, 0.02, "#2b2d31");
    box(0.915, 0.24, 0, 0.03, 0.1, 0.34, "#2b2d31");
    for (const z of [-1, 1]) box(0.86, 0.335, z * 0.26, 0.1, 0.02, 0.2, "#e8f6ff");
  } else if (type.startsWith("scooter_")) {
    const [, model, colour] = type.split("_");
    const paint = scooterColours[colour] ?? "#7cc7b2";
    if (model === "retro") {
      // Retro electric moped: leg shield, floorboard, rounded rear body, seat, round headlight.
      wheel(0.3, 0.001, 0.12, 0.08, "#e7e1cf"); wheel(-0.3, 0.001, 0.12, 0.08, "#e7e1cf");
      box(0.02, 0.24, 0, 0.36, 0.05, 0.26, "#d9d3c2");
      const rearBody = mesh(new THREE.SphereGeometry(0.2, 8, 6), paint, -0.26, 0.36, 0); rearBody.scale.set(1.25, 0.85, 0.9);
      box(-0.24, 0.52, 0, 0.32, 0.06, 0.18, "#8a5a3c");
      const shield = box(0.26, 0.48, 0, 0.07, 0.48, 0.3, paint); shield.rotation.z = 0.18;
      box(0.33, 0.23, 0, 0.18, 0.08, 0.12, paint);
      box(0.32, 0.76, 0, 0.05, 0.05, 0.42, "#c9ccd1");
      cylinder(0.37, 0.72, 0, 0.06, 0.06, 0.05, "#fff2b8", 8).rotation.z = Math.PI / 2;
      box(-0.46, 0.4, 0, 0.04, 0.05, 0.08, "#e0524a");
    } else {
      // Electric kick scooter ("Stadt-Roller") or the beefier "Sport-Roller" with fenders and wider deck.
      const sport = model === "sport";
      const radius = sport ? 0.1 : 0.08;
      wheel(0.32, 0.001, radius, sport ? 0.08 : 0.05, "#c9ccd1"); wheel(-0.32, 0.001, radius, sport ? 0.08 : 0.05, "#c9ccd1");
      box(0, 0.08 + radius + 0.03, 0, 0.62, sport ? 0.06 : 0.04, sport ? 0.18 : 0.13, sport ? "#2e3134" : "#e7e1cf");
      box(-0.02, 0.08 + radius + 0.065, 0, 0.5, 0.01, sport ? 0.14 : 0.1, paint);
      const stem = box(0.34, 0.5, 0, 0.05, 0.62, 0.05, paint); stem.rotation.z = sport ? -0.22 : -0.12;
      box(sport ? 0.4 : 0.37, 0.8, 0, 0.05, 0.05, 0.42, "#2e3134");
      for (const z of [-1, 1]) box(sport ? 0.4 : 0.37, 0.8, z * 0.2, 0.06, 0.06, 0.08, paint);
      box(0.38, 0.62, 0, 0.04, 0.05, 0.08, "#fff2b8");
      if (sport) { box(0.32, 0.3, 0, 0.2, 0.03, 0.1, paint); box(-0.32, 0.3, 0, 0.2, 0.03, 0.1, paint); }
      box(-0.32, 0.24, 0, 0.04, 0.04, 0.06, "#e0524a");
    }
  } else if (type === "road") {
    for (let tile = 0; tile < 4; tile++) box((tile % 2 - 0.5) * 0.42, 0.11, (Math.floor(tile / 2) - 0.5) * 0.42, 0.38, 0.09, 0.38, tile % 2 ? "#d8ceb0" : "#c7bea5");
  } else if (type === "flowers") {
    box(0, 0.13, 0, 0.8, 0.17, 0.8, "#95745b");
    for (let flower = 0; flower < 7; flower++) {
      const flowerX = Math.cos(flower * 2.4) * 0.25;
      const flowerZ = Math.sin(flower * 2.4) * 0.25;
      cylinder(flowerX, 0.35, flowerZ, 0.025, 0.025, 0.3, "#4e7e46", 5);
      cylinder(flowerX, 0.52, flowerZ, 0.12, 0.12, 0.08, ["#eebc63", "#d2859c", "#ddd7e8"][flower % 3], 6);
    }
  } else if (type === "tree") {
    cylinder(0, 0.55, 0, 0.08, 0.12, 1, "#86684c");
    mesh(new THREE.IcosahedronGeometry(0.52, 1), "#6e9d56", 0, 1.15, 0);
    mesh(new THREE.IcosahedronGeometry(0.3, 1), "#94b96b", -0.15, 1.42, 0.08);
  } else if (type === "bench") {
    for (const side of [-1, 1]) box(side * 0.62, 0.24, 0, 0.13, 0.4, 0.5, "#4d6255");
    for (const plank of [-0.16, 0, 0.16]) box(0, 0.48, plank, 1.65, 0.1, 0.12, "#bc9463");
    box(0, 0.77, -0.25, 1.65, 0.4, 0.1, "#bc9463");
  } else if (type === "fountain") {
    cylinder(0, 0.19, 0, 0.85, 0.9, 0.3, "#c7c3a6");
    cylinder(0, 0.37, 0, 0.71, 0.75, 0.12, "#71b9c1");
    cylinder(0, 0.7, 0, 0.12, 0.2, 0.75, "#dad3b2");
    cylinder(0, 1.05, 0, 0.43, 0.34, 0.14, "#c7c3a6");
    cylinder(0, 1.15, 0, 0.32, 0.32, 0.07, "#8bcbd0");
    cylinder(0, 1.4, 0, 0.035, 0.06, 0.45, "#b9e0db");
  } else {
    box(0, 0.11, 0, 3.7, 0.15, 3.7, "#d4c29c");
    box(-0.7, 0.9, -0.55, 0.12, 1.7, 0.12, "#65958c").rotation.z = -0.28;
    box(0.1, 0.9, -0.55, 0.12, 1.7, 0.12, "#65958c").rotation.z = 0.28;
    const wheel = new THREE.Group(); wheel.position.set(-0.3, 1.7, -0.55); group.add(wheel);
    const ring = mesh(new THREE.TorusGeometry(1.05, 0.065, 6, 24), "#dfb362", 0, 0, 0);
    wheel.add(ring);
    animations.push((time) => { wheel.rotation.z = time * 0.2; });
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke * Math.PI / 3;
      const bar = box(0, 0, 0, 0.045, 2.05, 0.045, "#e2cb98"); bar.rotation.z = angle; wheel.add(bar);
      const cabin = new THREE.Group(); cabin.position.set(Math.sin(angle) * 1.05, Math.cos(angle) * 1.05, 0); wheel.add(cabin);
      const seat = box(0, -0.17, 0, 0.34, 0.24, 0.3, ["#c77d87", "#6598af", "#8dab66"][spoke % 3]); cabin.add(seat);
      animations.push(() => { cabin.rotation.z = -wheel.rotation.z; });
    }
    box(1.05, 0.5, 0.9, 0.9, 0.75, 0.85, "#dfc99e");
    cylinder(1.05, 1.2, 0.9, 0, 0.8, 0.7, "#bc7e83", 4).rotation.y = Math.PI / 4;
    box(0, 0.23, 1.6, 1.7, 0.12, 0.35, "#92a879");
  }
  return {
    group,
    animate(time: number) { for (const animation of animations) animation(time); },
    dispose() { for (const resource of resources) { resource.geometry.dispose(); resource.material.dispose(); } },
  };
}

export function renderShopPreviews(): Partial<Record<ShopItemType, string>> {
  const result: Partial<Record<ShopItemType, string>> = {};
  const renderer = new SVGRenderer();
  try {
    renderer.setSize(480, 300);
    renderer.setPrecision(2);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#fff5dc", 0.8));
    const light = new THREE.DirectionalLight("#fff0ce", 0.9); light.position.set(-4, 8, 6); scene.add(light);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    for (const type of Object.keys(shopCatalog) as ShopItemType[]) {
      const model = createShopModel(type);
      try {
        scene.add(model.group);
        const bounds = new THREE.Box3().setFromObject(model.group);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        // Vehicles are small and long: frame them tighter so they fill the 64px thumbnail.
        const radius = Math.max(size.x, size.y, size.z) * (type.startsWith("car_") ? 0.64 : type.startsWith("scooter_") ? 0.66 : 0.78);
        camera.left = -radius * 1.6; camera.right = radius * 1.6; camera.top = radius; camera.bottom = -radius;
        camera.position.copy(center).add(new THREE.Vector3(5, 5, 7)); camera.lookAt(center); camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        result[type] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(renderer.domElement))}`;
      } finally { scene.remove(model.group); model.dispose(); }
    }
  } finally { renderer.clear(); }
  return result;
}