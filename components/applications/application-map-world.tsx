"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildingStages, createApplicationMap } from "@/lib/application-map";
import { statusLabels } from "@/lib/utils";
import type { Application } from "@/types";
import styles from "@/app/map/map.module.css";

type WorldProps = {
  applications: Application[];
  visibleIds: string[];
  selectedId: string | null;
  night: boolean;
  zoom: number;
  center: number;
  onSelect: (id: string) => void;
};

export default function ApplicationMapWorld({ applications, visibleIds, selectedId, night, zoom, center, onSelect }: WorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof createWorld> | null>(null);
  const select = useRef(onSelect);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      world.current = createWorld(host.current, labels.current, (id) => select.current(id));
    } catch {
      queueMicrotask(() => setUnavailable(true));
    }
    return () => { world.current?.dispose(); world.current = null; };
  }, []);
  useEffect(() => { world.current?.populate(applications, visibleIds, selectedId); }, [applications, visibleIds, selectedId]);
  useEffect(() => { world.current?.lighting(night); }, [night]);
  useEffect(() => { world.current?.zoom(zoom); }, [zoom]);
  useEffect(() => { world.current?.center(); }, [center]);

  return (
    <>
      <div ref={host} className={styles.canvasHost} role="region" aria-label="3D-Bewerbungsdorf">
        <div ref={labels} className={styles.worldLabels}>
          {applications.filter(({ id }) => visibleIds.includes(id)).map((application) => (
            <button type="button" data-building={application.id} key={application.id} className={`${styles.worldLabel} ${selectedId === application.id ? styles.selectedLabel : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(application.id)} aria-label={`${application.company}: ${statusLabels[application.status]}. Gebäudedetails öffnen`}>
              <strong>{application.company}</strong><span>{statusLabels[application.status]}</span>
            </button>
          ))}
        </div>
      </div>
      {unavailable && <p className={styles.empty} role="status">Die 3D-Ansicht ist in diesem Browser nicht verfügbar. Deine Bewerbungen findest du unten.</p>}
      <details className={styles.accessibleBuildings}>
        <summary>Bewerbungen ({visibleIds.length})</summary>
        <div>{applications.filter(({ id }) => visibleIds.includes(id)).map((application) => <button key={application.id} type="button" onClick={() => onSelect(application.id)}><strong>{application.company}</strong><span>{statusLabels[application.status]}</span></button>)}</div>
      </details>
    </>
  );
}

function createWorld(host: HTMLDivElement, labels: HTMLDivElement, onSelect: (id: string) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9fba8b");
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 200);
  camera.position.set(24, 30, 34);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minZoom = 0.4;
  controls.maxZoom = 2.4;
  controls.minPolarAngle = Math.PI / 6;
  controls.maxPolarAngle = Math.PI / 2.6;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.update();

  const ambient = new THREE.HemisphereLight("#fff5dc", "#658754", 2.6);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight("#fff0ce", 3.2);
  sunlight.position.set(-12, 24, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -28;
  sunlight.shadow.camera.right = 28;
  sunlight.shadow.camera.top = 28;
  sunlight.shadow.camera.bottom = -28;
  sunlight.shadow.normalBias = 0.04;
  scene.add(sunlight, sunlight.target);
  const root = new THREE.Group();
  scene.add(root);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const animations: ((time: number) => void)[] = [];
  const anchors = new Map<string, THREE.Vector3>();
  const buildings: THREE.Object3D[] = [];
  const windowMaterial = new THREE.MeshStandardMaterial({ color: "#acd7d2", roughness: 0.4, emissive: "#f6bd51", emissiveIntensity: 0.1 });
  let boardDepth = 23;
  let motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
    return materials.get(color)!;
  }

  function mesh(parent: THREE.Object3D, shape: string, geometry: () => THREE.BufferGeometry, color: string | THREE.Material, x: number, y: number, z: number) {
    if (!geometries.has(shape)) geometries.set(shape, geometry());
    const object = new THREE.Mesh(geometries.get(shape)!, typeof color === "string" ? material(color) : color);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, color: string | THREE.Material) {
    return mesh(parent, `box-${width}-${height}-${depth}`, () => new THREE.BoxGeometry(width, height, depth), color, x, y, z);
  }

  function cylinder(parent: THREE.Object3D, x: number, y: number, z: number, top: number, bottom: number, height: number, color: string, sides = 8) {
    return mesh(parent, `cylinder-${top}-${bottom}-${height}-${sides}`, () => new THREE.CylinderGeometry(top, bottom, height, sides), color, x, y, z);
  }

  function tree(x: number, z: number, size = 1, pine = false) {
    const group = new THREE.Group();
    group.position.set(x, 0.05, z);
    group.scale.setScalar(size);
    root.add(group);
    cylinder(group, 0, 0.55, 0, 0.12, 0.2, 1.1, "#715342");
    if (pine) {
      for (let layer = 0; layer < 3; layer++) cylinder(group, 0, 1 + layer * 0.5, 0, 0, 0.8 - layer * 0.15, 1.25, ["#2f694c", "#3e8152", "#5c985b"][layer], 7);
    } else {
      mesh(group, "crown", () => new THREE.IcosahedronGeometry(0.9, 1), "#589345", 0, 1.6, 0);
      mesh(group, "crown", () => new THREE.IcosahedronGeometry(0.9, 1), "#75ac4d", -0.3, 1.85, 0.1).scale.setScalar(0.7);
    }
  }

  function worker(parent: THREE.Object3D, x: number, z: number, working = false) {
    const person = new THREE.Group();
    parent.add(person);
    person.position.set(x, 0.16, z);
    box(person, -0.09, 0.12, 0, 0.11, 0.25, 0.13, "#3e5265");
    box(person, 0.09, 0.12, 0, 0.11, 0.25, 0.13, "#3e5265");
    box(person, 0, 0.37, 0, 0.31, 0.3, 0.21, working ? "#e2a04b" : "#b36e76");
    box(person, 0, 0.64, 0, 0.22, 0.22, 0.22, "#e7b891");
    cylinder(person, 0, 0.77, 0, 0.15, 0.18, 0.08, working ? "#f5cb59" : "#6e523b");
    const arm = box(person, 0.24, 0.4, 0, 0.13, 0.32, 0.13, "#e7b891");
    if (working) {
      box(arm, 0, -0.25, 0, 0.07, 0.24, 0.07, "#6a5949");
      box(arm, 0, -0.36, 0, 0.28, 0.12, 0.15, "#65777e");
    }
    animations.push((time) => {
      arm.rotation.x = working ? Math.sin(time * 4 + x) * 0.8 : Math.sin(time * 3) * 0.2;
      if (!working) person.position.z = z + Math.sin(time * 0.3 + x) * 0.75;
    });
  }

  function roof(parent: THREE.Object3D, height: number, color: string) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.35, 0);
    shape.lineTo(0, 1.05);
    shape.lineTo(1.35, 0);
    shape.closePath();
    const object = mesh(parent, "pitched-roof", () => new THREE.ExtrudeGeometry(shape, { depth: 2.75, bevelEnabled: false }), color, 0, height, -1.375);
    box(parent, 0, height + 1.03, 0, 0.15, 0.14, 2.85, "#e7be80");
    for (let row = 1; row < 5; row++) {
      for (const side of [-1, 1]) {
        const tile = box(parent, side * (1.35 - row * 0.25), height + row * 0.195, 0, 0.045, 0.055, 2.78, color);
        tile.rotation.z = side * -0.66;
      }
    }
    object.castShadow = true;
  }

  function building(application: Application, x: number, z: number, selected: boolean) {
    const stage = buildingStages[application.status];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.applicationId = application.id;
    root.add(group);
    buildings.push(group);
    const closed = application.status === "rejected" || application.status === "withdrawn";
    const variant = application.id.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
    const roofColor = closed ? "#777e78" : ["#c47452", "#5682a3", "#6c9b82"][variant];
    const floors = stage.floors;
    const height = 0.95 + floors * 0.7;
    box(group, 0, 0.12, 0, 4.3, 0.24, 4.2, selected ? "#e8c878" : "#91a36b");
    box(group, 0, 0.27, 0, 3.25, 0.2, 3.2, "#b8b59b");
    for (const side of [-1, 1]) {
      for (let post = -1; post <= 1; post++) box(group, side * 1.92, 0.48, post * 1.2, 0.13, 0.62, 0.13, "#dfc99e");
      box(group, side * 1.92, 0.57, 0, 0.1, 0.12, 2.6, "#c2a780");
    }
    if (floors > 0) {
      box(group, 0, height / 2 + 0.35, 0, 2.35, height, 2.3, closed ? "#9ba58f" : "#e3ce9f");
      box(group, 0, 0.55, 0, 2.45, 0.28, 2.4, stage.color);
      for (const cornerX of [-1.12, 1.12]) for (const cornerZ of [-1.08, 1.08]) box(group, cornerX, height / 2 + 0.35, cornerZ, 0.16, height, 0.16, "#a49373");
      for (let floor = 0; floor < floors; floor++) {
        const level = 1.05 + floor * 0.72;
        box(group, 0, level + 0.32, 0, 2.46, 0.1, 2.41, stage.color);
        for (const windowX of [-0.66, 0.66]) {
          box(group, windowX, level, 1.17, 0.58, 0.53, 0.08, "#7b7162");
          box(group, windowX, level + 0.02, 1.22, 0.4, 0.36, 0.04, closed ? material("#5b6d6c") : windowMaterial);
          box(group, windowX, level + 0.02, 1.26, 0.04, 0.36, 0.03, "#f4dfb8");
          box(group, windowX, level - 0.03, 1.26, 0.4, 0.035, 0.03, "#f4dfb8");
          if (closed) box(group, windowX, level, 1.28, 0.62, 0.1, 0.06, "#a28b67").rotation.z = 0.45;
        }
        for (const windowZ of [-0.6, 0.6]) box(group, 1.2, level, windowZ, 0.06, 0.4, 0.4, closed ? material("#5b6d6c") : windowMaterial);
      }
      box(group, 0, 0.87, 1.22, 0.48, 0.9, 0.12, "#6a5142");
      cylinder(group, 0.13, 0.9, 1.3, 0.035, 0.035, 0.06, "#e6bb57").rotation.x = Math.PI / 2;
      box(group, 0, 0.35, 1.5, 0.9, 0.2, 0.55, "#e4d6b3");
    }
    if (stage.workers) {
      for (const frameX of [-1.4, 1.4]) for (const frameZ of [-1.4, 1.4]) box(group, frameX, 1.2, frameZ, 0.12, 2.1, 0.12, "#a17a4d");
      for (const level of [0.85, 1.8]) for (const side of [-1, 1]) {
        box(group, 0, level, side * 1.4, 3, 0.12, 0.12, "#c9a46c");
        box(group, side * 1.4, level, 0, 0.12, 0.12, 3, "#c9a46c");
      }
      box(group, -1.8, 1.95, -0.6, 0.18, 3.6, 0.18, "#e1b54f");
      box(group, -0.2, 3.7, -0.6, 3.6, 0.16, 0.16, "#e1b54f");
      const hook = box(group, 1.2, 3.1, -0.6, 0.035, 1.1, 0.035, "#596567");
      animations.push((time) => { hook.position.y = 3.05 + Math.sin(time) * 0.12; });
      for (let brick = 0; brick < 4; brick++) box(group, 1.4 + (brick % 2) * 0.3, 0.48 + Math.floor(brick / 2) * 0.2, 1.4, 0.28, 0.18, 0.4, "#be825e");
      worker(group, -1.4, 1.4, true);
      worker(group, 1.5, -0.7, true);
    } else {
      roof(group, height + 0.32, roofColor);
      box(group, 0.7, height + 1.15, -0.55, 0.3, 0.9, 0.35, "#a1927c");
      if (application.status === "final_interview" || application.status === "offer") {
        cylinder(group, -0.8, height + 0.4, -0.8, 0.48, 0.5, 1.7, "#d8c99e");
        cylinder(group, -0.8, height + 1.55, -0.8, 0, 0.72, 0.8, roofColor);
      }
      if (application.status === "offer") {
        cylinder(group, 0, height + 1.9, 0, 0.04, 0.04, 1.5, "#e9dcba");
        const flag = box(group, 0.4, height + 2.4, 0, 0.75, 0.4, 0.035, "#f4c450");
        animations.push((time) => { flag.rotation.y = Math.sin(time * 2) * 0.18; });
      }
      if (!closed) worker(group, -1.5, 1.5);
    }
    anchors.set(application.id, new THREE.Vector3(x, 0.25, z + 2.6));
  }

  function populate(applications: Application[], visibleIds: string[], selectedId: string | null) {
    root.clear();
    animations.length = 0;
    buildings.length = 0;
    anchors.clear();
    const map = createApplicationMap(applications);
    boardDepth = Math.max(23, map.height / 48);
    const centerZ = boardDepth / 2 - 7;
    box(root, 0, -0.65, centerZ, 34, 1.3, boardDepth + 5, "#777958");
    box(root, 0, -0.08, centerZ, 34, 0.45, boardDepth + 5, "#7da85b");
    box(root, -12, 0.13, centerZ, 3.7, 0.12, boardDepth + 5, "#b7b17d");
    box(root, -12, 0.21, centerZ, 2.8, 0.12, boardDepth + 5, "#51a5af");
    const water = box(root, -12, 0.29, centerZ, 1.8, 0.015, boardDepth + 4, "#72bfc2");
    animations.push((time) => { water.position.x = -12 + Math.sin(time * 0.8) * 0.08; });
    box(root, -3.2, 0.17, centerZ, 0.85, 0.16, boardDepth + 1.5, "#c9b995");
    const rows = Math.max(1, Math.ceil(applications.length / 3));
    for (let row = 0; row < rows; row++) {
      const street = 3.5 + row * 7.5;
      box(root, 0, 0.18, street, 29, 0.16, 0.85, "#c9b995");
      box(root, -12, 0.42, street, 4, 0.2, 1.2, "#a98356");
      for (let plank = 0; plank < 13; plank++) box(root, -13.8 + plank * 0.3, 0.54, street, 0.22, 0.06, 1.15, "#d1b27b");
      for (const side of [-1, 1]) {
        box(root, -12, 0.9, street + side * 0.6, 4.2, 0.12, 0.1, "#b19768");
        for (const post of [-13.9, -12, -10.1]) box(root, post, 0.7, street + side * 0.6, 0.15, 0.9, 0.15, "#b19768");
      }
      for (const side of [-1, 1]) {
        cylinder(root, side * 5, 0.75, street - 0.7, 0.06, 0.09, 1.3, "#5a6552");
        box(root, side * 5, 1.52, street - 0.7, 0.28, 0.35, 0.28, windowMaterial);
        cylinder(root, side * 5, 1.77, street - 0.7, 0, 0.25, 0.22, "#53664e", 4);
      }
      worker(root, 1.2, street + 0.7);
    }
    for (let row = 0; row < Math.ceil((boardDepth + 3) / 2); row++) {
      const forestZ = -7.5 + row * 2;
      for (const forestX of [-15.6, -8.8, 15.4]) {
        if (forestX === -8.8 && row % 3 !== 0) continue;
        tree(forestX + Math.sin(row * 2) * 0.45, forestZ, 0.8 + (row % 3) * 0.15, row % 2 === 0);
      }
    }
    for (let hill = 0; hill < 18; hill++) {
      const rock = mesh(root, "rock", () => new THREE.DodecahedronGeometry(1, 0), hill % 2 ? "#8c9a7c" : "#a5ad8f", -15 + hill * 1.8, 0.55, -8.7);
      rock.scale.set(1.2, 0.7 + (hill % 3) * 0.3, 1.1);
    }
    cylinder(root, -3.2, 0.3, -4.7, 1.4, 1.5, 0.3, "#b7b69a");
    cylinder(root, -3.2, 0.56, -4.7, 0.95, 1.0, 0.3, "#6aaeb2");
    cylinder(root, -3.2, 0.9, -4.7, 0.15, 0.2, 0.8, "#d5d4b8");
    cylinder(root, -3.2, 1.3, -4.7, 0.6, 0.5, 0.16, "#d5d4b8");
    for (const { application, x, y } of map.plots) {
      const positionX = (x - 700) / 48;
      const positionZ = (y - 270) / 48;
      box(root, positionX, 0.17, positionZ + 2.6, 0.5, 0.12, 2.5, "#c9b995");
      if (visibleIds.includes(application.id)) building(application, positionX, positionZ, application.id === selectedId);
    }
    for (const plot of map.plots) {
      const positionX = (plot.x - 700) / 48;
      const positionZ = (plot.y - 270) / 48;
      tree(positionX + 2.4, positionZ - 2, 0.65, true);
      for (let flower = 0; flower < 3; flower++) {
        cylinder(root, positionX - 2.1 + flower * 0.2, 0.3, positionZ - 1.8, 0.06, 0.06, 0.3, "#557847", 5);
        cylinder(root, positionX - 2.1 + flower * 0.2, 0.49, positionZ - 1.8, 0.12, 0.1, 0.08, flower % 2 ? "#e9bb70" : "#c97e89", 6);
      }
    }
  }

  function center() {
    controls.target.set(0, 0, Math.min(3, boardDepth / 4));
    camera.position.copy(controls.target).add(new THREE.Vector3(24, 30, 34));
    controls.update();
  }

  const observer = new ResizeObserver(() => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const vertical = width < 640 ? 13 : 11;
    camera.left = -vertical * width / height;
    camera.right = vertical * width / height;
    camera.top = vertical;
    camera.bottom = -vertical;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  observer.observe(host);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = { x: 0, y: 0 };
  function pointerDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY }; }
  function pointerUp(event: PointerEvent) {
    if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6 || (event.target as HTMLElement).closest("button")) return;
    const bounds = host.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(buildings, true)[0];
    if (hit) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.applicationId) object = object.parent;
      if (object?.userData.applicationId) onSelect(object.userData.applicationId as string);
    }
  }
  host.addEventListener("pointerdown", pointerDown);
  host.addEventListener("pointerup", pointerUp);
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  function preferenceChanged() { motion = !preference.matches; }
  preference.addEventListener("change", preferenceChanged);
  const projection = new THREE.Vector3();
  renderer.setAnimationLoop((milliseconds) => {
    controls.update();
    if (motion) for (const animate of animations) animate(milliseconds / 1000);
    renderer.render(scene, camera);
    for (const element of labels.querySelectorAll<HTMLButtonElement>("[data-building]")) {
      const anchor = anchors.get(element.dataset.building!);
      if (!anchor) { element.style.visibility = "hidden"; continue; }
      projection.copy(anchor).project(camera);
      const visible = projection.z >= -1 && projection.z <= 1 && Math.abs(projection.x) < 1.15 && Math.abs(projection.y) < 1.15;
      element.style.visibility = visible ? "visible" : "hidden";
      element.style.transform = `translate(-50%, -50%) translate(${(projection.x + 1) / 2 * host.clientWidth}px, ${(-projection.y + 1) / 2 * host.clientHeight}px)`;
    }
  });

  return {
    populate,
    center,
    zoom(value: number) { camera.zoom = value; camera.updateProjectionMatrix(); },
    lighting(night: boolean) {
      scene.background = new THREE.Color(night ? "#314957" : "#9fba8b");
      ambient.intensity = night ? 1.1 : 2.6;
      ambient.color.set(night ? "#a3bbdf" : "#fff5dc");
      sunlight.intensity = night ? 0.7 : 3.2;
      windowMaterial.emissiveIntensity = night ? 1.5 : 0.1;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      host.removeEventListener("pointerdown", pointerDown);
      host.removeEventListener("pointerup", pointerUp);
      preference.removeEventListener("change", preferenceChanged);
      for (const geometry of geometries.values()) geometry.dispose();
      for (const item of materials.values()) item.dispose();
      windowMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}