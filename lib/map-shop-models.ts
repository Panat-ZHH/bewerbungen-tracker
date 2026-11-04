import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import { shopCatalog, type ShopItemType } from "./map-shop";

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
  const size = shopCatalog[type];
  box(0, 0.04, 0, size.width * 0.95, 0.08, size.depth * 0.95, selected ? "#e4c46c" : type === "road" ? "#b6ad91" : "#819d60");
  if (type === "road") {
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
        const radius = Math.max(size.x, size.y, size.z) * 0.78;
        camera.left = -radius * 1.6; camera.right = radius * 1.6; camera.top = radius; camera.bottom = -radius;
        camera.position.copy(center).add(new THREE.Vector3(5, 5, 7)); camera.lookAt(center); camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        result[type] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(renderer.domElement))}`;
      } finally { scene.remove(model.group); model.dispose(); }
    }
  } finally { renderer.clear(); }
  return result;
}