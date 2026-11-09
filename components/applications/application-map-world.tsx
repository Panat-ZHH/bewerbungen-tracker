"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildingStages, createApplicationMap } from "@/lib/application-map";
import { statusLabels } from "@/lib/utils";
import { canPlaceMapItem, isLockedMapObject, itemFootprint, villageDepth, villageObjects, type MapLayout, type MapPosition, type OwnedMapItem, type PlaceableItem, type Placement } from "@/lib/map-shop";
import { lockedDrag, noopHandler } from "@/lib/map-readonly";
import { evaluateDrop, grabOffset, LONG_PRESS_MS, MOUSE_DRAG_THRESHOLD, nudgeKeys, samePosition, snapDragPosition, TOUCH_CANCEL_THRESHOLD, type DragApi, type DropVerdict } from "@/lib/map-drag";
import { createShopModel } from "@/lib/map-shop-models";
import { basePixelRatio, createMapRenderer, mapRenderLayers, nextPixelRatio, setMapRenderLayer, shadowDue } from "@/lib/map-renderer";
import { BOUNDS_MARGIN, CAMERA_OFFSET, cameraRects, createCameraController, ZOOM_MAX, ZOOM_MIN } from "@/lib/map-camera";
import { attachCameraInput } from "@/components/applications/map-camera-input";
import { buildIslands, revealProgress, type IslandParts } from "@/lib/island-scenery";
import { islandConfig } from "@/lib/islands";
import { createMapVillager, villageWalkingRoutes } from "@/lib/map-villager";
import type { Application } from "@/types";
import styles from "@/app/map/map.module.css";

type WorldProps = {
  applications: Application[];
  visibleIds: string[];
  selectedId: string | null;
  night: boolean;
  zoom: number;
  center: number;
  onZoomChange?: (zoom: number) => void;
  onSelect: (id: string) => void;
  shopItems: OwnedMapItem[];
  layouts: MapLayout[];
  selectedShopItemId: string | null;
  placement: Placement | null;
  onSelectShopItem: (id: string) => void;
  onPlacePosition: (position: MapPosition) => void;
  drag: DragApi;
  islandCount?: number;
  islandFocus?: { no: number; reveal: boolean; key: number } | null;
  /** Friend view: nothing can be selected, placed, dragged or changed; only camera pan/zoom works. Overrides all handler props. */
  readOnly?: boolean;
  /** Receives the imperative camera controls once the 3D world exists (null again when it is torn down). */
  onCameraApi?: (api: MapCameraApi | null) => void;
};

/** Imperative camera controls for toolbars. All moves are animated (instant with prefers-reduced-motion) and clamped to the islands. */
export type MapCameraApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Absolute zoom level (0.4 - 2.4), about the view centre. */
  setZoom: (zoom: number) => void;
  /** Back to zoom 100 % and the village centre. */
  reset: () => void;
  /** Move the ground point (grid cells) to the view centre, optionally zooming. */
  focusOn: (x: number, z: number, zoom?: number) => void;
  getState: () => { x: number; z: number; zoom: number };
};

/** Read-only mode overrides every mutating handler, so the inner world can never place, drag or select anything. */
export default function ApplicationMapWorld(props: WorldProps) {
  return <World {...(props.readOnly ? { ...props, onSelect: noopHandler, onSelectShopItem: noopHandler, onPlacePosition: noopHandler, drag: lockedDrag, placement: null, selectedShopItemId: null, selectedId: null } : props)} />;
}

function World({ applications, visibleIds, selectedId, night, zoom, center, onZoomChange, onCameraApi, onSelect, shopItems, layouts, selectedShopItemId, placement, onSelectShopItem, onPlacePosition, drag, islandCount = 1, islandFocus = null, readOnly = false }: WorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof createWorld> | null>(null);
  const select = useRef(onSelect);
  const selectShopItem = useRef(onSelectShopItem);
  const placePosition = useRef(onPlacePosition);
  const dragApi = useRef(drag);
  const zoomChange = useRef(onZoomChange);
  const cameraApi = useRef(onCameraApi);
  const placementId = placement?.item.id ?? null;
  const previousPlacementId = useRef<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => { select.current = onSelect; zoomChange.current = onZoomChange; cameraApi.current = onCameraApi; }, [onSelect, onZoomChange, onCameraApi]);
  useEffect(() => { dragApi.current = drag; world.current?.setDragEnabled(drag.enabled); }, [drag]);
  useEffect(() => { selectShopItem.current = onSelectShopItem; placePosition.current = onPlacePosition; }, [onSelectShopItem, onPlacePosition]);
  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      world.current = createWorld(host.current, labels.current, (id) => select.current(id), (id) => selectShopItem.current(id), (position) => placePosition.current(position), () => dragApi.current, (value) => zoomChange.current?.(value));
      world.current.setDragEnabled(dragApi.current.enabled);
      cameraApi.current?.(world.current.api);
    } catch {
      queueMicrotask(() => setUnavailable(true));
    }
    return () => { cameraApi.current?.(null); world.current?.dispose(); world.current = null; };
  }, []);
  useEffect(() => { world.current?.populate(applications, visibleIds, selectedId, layouts, islandCount); }, [applications, visibleIds, selectedId, layouts, placementId, islandCount]);
  useEffect(() => { if (islandFocus) world.current?.focusIsland(islandFocus.no, islandFocus.reveal); }, [islandFocus]);
  useEffect(() => { world.current?.lighting(night); }, [night]);
  useEffect(() => { world.current?.zoom(zoom); }, [zoom]);
  useEffect(() => { world.current?.center(); }, [center]);
  useEffect(() => {
    world.current?.setShop(shopItems, selectedShopItemId, placement, applications, layouts, islandCount);
    if (placement && previousPlacementId.current !== placement.item.id) {
      world.current?.focusConstruction(placement.position);
      host.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
    previousPlacementId.current = placement?.item.id ?? null;
  }, [shopItems, selectedShopItemId, placement, applications, layouts, islandCount]);

  return (
    <>
      <div ref={host} className={styles.canvasHost} role="region" tabIndex={0} aria-label="3D-Bewerbungsdorf" aria-describedby="map-drag-help" onKeyDown={(event) => {
        if (readOnly || event.target !== event.currentTarget) return;
        const api = dragApi.current;
        if (nudgeKeys[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) { if (api.nudge(event.key)) event.preventDefault(); }
        else if (event.key === "Enter" && placement) { event.preventDefault(); api.confirm(); }
        else if (event.key === "Escape" && placement) { event.preventDefault(); api.cancel(); }
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); api.undo(); }
      }}>
        <div ref={labels} className={styles.worldLabels}>
          {applications.filter(({ id }) => visibleIds.includes(id)).map((application) => (
            readOnly ? (
              <span data-building={application.id} key={application.id} className={`${styles.worldLabel} ${styles.readOnlyLabel}`}>
                <strong>{application.company}</strong><span>{statusLabels[application.status]}</span>
              </span>
            ) : (
            <button type="button" data-building={application.id} key={application.id} className={`${styles.worldLabel} ${selectedId === application.id ? styles.selectedLabel : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(application.id)} aria-label={`${application.company}: ${statusLabels[application.status]}. Gebäudedetails öffnen`}>
              <strong>{application.company}</strong><span>{statusLabels[application.status]}</span>
            </button>
            )
          ))}
        </div>
      </div>
      <p id="map-drag-help" className={styles.dragHint}>{readOnly ? "Nur ansehen: Ziehen bewegt die Kamera, Zoom mit Mausrad oder zwei Fingern. Hier kann nichts verändert werden." : "Gegenstände und Häuser per Ziehen verschieben (Touch: kurz gedrückt halten, dann ziehen). Tastatur: Karte fokussieren, Gegenstand auswählen, Pfeiltasten verschieben, Enter platzieren, Esc abbrechen, Strg+Z rückgängig. Strassen sind fest."}</p>
      {unavailable && <p className={`${styles.empty} ${styles.unavailable}`} role="status">Die 3D-Ansicht ist in diesem Browser nicht verfügbar. Deine Bewerbungen findest du in der Suche.</p>}
    </>
  );
}

function createWorld(host: HTMLDivElement, labels: HTMLDivElement, onSelect: (id: string) => void, onSelectShopItem: (id: string) => void, onPlacePosition: (position: MapPosition) => void, getDrag: () => DragApi, onZoomChange: (zoom: number) => void) {
  const renderer = createMapRenderer();
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b9c9ae");
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 200);
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motion = !preference.matches;
  // Camera = pure state machine (lib/map-camera.ts); three's camera is only a copy of its state. Sizes/rects are cached, never read per frame.
  let size = { width: host.clientWidth || 800, height: host.clientHeight || 600 };
  const controller = createCameraController({ x: 0, z: 1, zoom: 1 }, { view: size, rects: cameraRects(1), reducedMotion: !motion });
  const cameraTarget = new THREE.Vector3();
  let cameraDirty = true;
  /** Copy controller state into the three.js camera (position keeps the fixed isometric offset, rotation never changes). */
  function syncCamera() {
    const { x, z, zoom } = controller.state;
    cameraTarget.set(x, 0, z);
    camera.position.set(x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, z + CAMERA_OFFSET.z);
    if (camera.zoom !== zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
    cameraDirty = false;
  }
  syncCamera();
  const input = attachCameraInput({ host, controller, dragState: (id) => (session && session.pointerId === id ? (session.active ? "active" : "pending") : "none") });
  // Zoom is reported to React throttled (it re-renders the whole page); the value we reported last is ignored when it comes back as the `zoom` prop.
  let lastReportAt = 0;
  let lastReportedZoom = 1;
  // The page may deliver a stale echo of an earlier report after a newer one went out (slow render): remember what we sent in the last seconds.
  const recentReports: { value: number; at: number }[] = [];
  function reportZoom(now: number, force: boolean) {
    const zoom = Number(controller.state.zoom.toFixed(2));
    if (zoom === lastReportedZoom || (!force && now - lastReportAt < 120)) return;
    lastReportedZoom = zoom; lastReportAt = now; stats.zoomChange++;
    recentReports.push({ value: zoom, at: now }); while (recentReports.length > 16 || (recentReports.length && now - recentReports[0].at > 2000)) recentReports.shift();
    onZoomChange(zoom);
  }

  const ambient = new THREE.HemisphereLight("#fff5dc", "#658754", 2.6);
  scene.add(ambient);
  const fallbackFill = new THREE.AmbientLight("#fff5dc", renderer.isWebGL ? 0 : 0.45);
  scene.add(fallbackFill);
  const sunlight = new THREE.DirectionalLight("#fff0ce", renderer.isWebGL ? 3.2 : 0.65);
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
  const shopRoot = new THREE.Group();
  const previewRoot = new THREE.Group();
  scene.add(shopRoot, previewRoot);
  const constructionGrid = new THREE.GridHelper(8, 8, "#98a782", "#a9b895");
  setMapRenderLayer(constructionGrid, mapRenderLayers.grid);
  constructionGrid.visible = false;
  scene.add(constructionGrid);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const animations: ((time: number) => void)[] = [];
  const villagers: ReturnType<typeof createMapVillager>[] = [];
  const stats = { populate: 0, setShop: 0, shopRebuild: 0, zoomChange: 0, frames: 0, camera: 0 };
  const anchors = new Map<string, THREE.Vector3>();
  const buildings: THREE.Object3D[] = [];
  const shopObjects: THREE.Object3D[] = [];
  const shopAnimations: ((time: number) => void)[] = [];
  const shopModels: ReturnType<typeof createShopModel>[] = [];
  const previewMaterial = new THREE.MeshStandardMaterial({ color: "#87bd6d", transparent: true, opacity: 0.65, roughness: 0.8 });
  let activePlacement: Placement | null = null;
  const windowMaterial = new THREE.MeshStandardMaterial({ color: "#acd7d2", roughness: 0.4, emissive: "#f6bd51", emissiveIntensity: 0.1 });
  let boardDepth = 23;
  let islandParts = new Map<number, IslandParts>();
  let revealing: { no: number; start: number } | null = null;

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
    const subdivide = !renderer.isWebGL && width > 1 && height > 1 && depth > 1;
    return mesh(parent, `box-${width}-${height}-${depth}`, () => new THREE.BoxGeometry(width, height, depth, subdivide ? Math.ceil(width * 2) : 1, subdivide ? Math.ceil(height * 2) : 1, subdivide ? Math.ceil(depth * 2) : 1), color, x, y, z);
  }

  function cylinder(parent: THREE.Object3D, x: number, y: number, z: number, top: number, bottom: number, height: number, color: string, sides = 8) {
    return mesh(parent, `cylinder-${top}-${bottom}-${height}-${sides}`, () => new THREE.CylinderGeometry(top, bottom, height, sides), color, x, y, z);
  }

  function tree(x: number, z: number, size = 1, pine = false) {
    const group = new THREE.Group();
    group.position.set(x, 0.05, z);
    group.scale.setScalar(size);
    root.add(group);
    const shadow = cylinder(root, x + 0.18, 0.155, z + 0.2, size * 0.8, size * 0.8, 0.008, "#6e8d55", 12);
    shadow.scale.z = 0.65; setMapRenderLayer(shadow, mapRenderLayers.shadow);
    cylinder(group, 0, 0.55, 0, 0.12, 0.2, 1.1, "#715342");
    if (pine) {
      for (let layer = 0; layer < 3; layer++) cylinder(group, 0, 1 + layer * 0.5, 0, 0, 0.8 - layer * 0.15, 1.25, ["#2f694c", "#3e8152", "#5c985b"][layer], 7);
    } else {
      mesh(group, "crown", () => new THREE.IcosahedronGeometry(0.9, 1), "#589345", 0, 1.6, 0);
      mesh(group, "crown", () => new THREE.IcosahedronGeometry(0.9, 1), "#75ac4d", -0.3, 1.85, 0.1).scale.setScalar(0.7);
    }
    animations.push((time) => { group.rotation.z = Math.sin(time * 0.65 + x + z) * 0.012; });
  }

  function worker(parent: THREE.Object3D, x: number, z: number, working = false) {
    const villager = createMapVillager({ working, phase: Math.abs(x * 0.7 + z * 0.3), color: "#a47b82", route: working ? [] : [new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x, 0.3, z + 0.8)] });
    if (working) villager.group.position.set(x, 0.28, z);
    villager.group.scale.setScalar(1.05);
    villagers.push(villager); parent.add(villager.group); animations.push(villager.animate);
  }

  function roof(parent: THREE.Object3D, height: number, color: string) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.35, 0);
    shape.lineTo(0, 1.05);
    shape.lineTo(1.35, 0);
    shape.closePath();
    const object = mesh(parent, "pitched-roof", () => new THREE.ExtrudeGeometry(shape, { depth: 2.75, steps: renderer.isWebGL ? 1 : 8, bevelEnabled: false }), color, 0, height, -1.375);
    box(parent, 0, height + 1.03, 0, 0.15, 0.14, 2.85, "#e7be80");
    for (let row = 1; renderer.isWebGL && row < 5; row++) {
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
    const roofColor = closed ? "#777e78" : ["#b86e54", "#597d9a", "#667d87"][variant];
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
      for (const cornerX of [-1.17, 1.17]) for (const cornerZ of [-1.13, 1.13]) {
        box(group, cornerX, 0.64, cornerZ, 0.22, 0.18, 0.22, "#d8d0b6");
        box(group, cornerX, 0.85, cornerZ, 0.19, 0.18, 0.19, "#c9c4ad");
      }
      if (!stage.workers) {
        box(group, 0, 1.48, 1.45, 0.94, 0.12, 0.7, roofColor);
        for (const side of [-1, 1]) box(group, side * 0.4, 0.95, 1.66, 0.07, 0.95, 0.07, "#987f60");
        for (const side of [-1, 1]) {
          box(group, side * 0.66, 0.84, 1.35, 0.53, 0.16, 0.26, "#9e7b5c");
          box(group, side * 0.66, 0.97, 1.35, 0.48, 0.13, 0.23, closed ? "#7d8a65" : "#86a061");
          if (!closed) for (let flower = 0; flower < 3; flower++) cylinder(group, side * 0.66 - 0.15 + flower * 0.15, 1.06, 1.36, 0.06, 0.06, 0.07, flower % 2 ? "#d69292" : "#ebcd84", 6);
        }
      }
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
      if (application.status === "final_interview" || application.status === "offer" || application.status === "contract_signed") {
        cylinder(group, -0.8, height + 0.4, -0.8, 0.48, 0.5, 1.7, "#d8c99e");
        cylinder(group, -0.8, height + 1.55, -0.8, 0, 0.72, 0.8, roofColor);
      }
      if (application.status === "offer" || application.status === "contract_signed") {
        cylinder(group, 0, height + 1.9, 0, 0.04, 0.04, 1.5, "#e9dcba");
        const flag = box(group, 0.4, height + 2.4, 0, 0.75, 0.4, 0.035, "#f4c450");
        animations.push((time) => { flag.rotation.y = Math.sin(time * 2) * 0.18; });
      }
      if (!closed) worker(group, -1.5, 1.5);
    }
    anchors.set(application.id, new THREE.Vector3(x, 0.25, z + 2.6));
  }

  function populate(applications: Application[], visibleIds: string[], selectedId: string | null, layouts: MapLayout[], islandCount = 1) {
    stats.populate++; sceneChanged = true; labelsDirty = true;
    for (const villager of villagers) villager.dispose();
    villagers.length = 0;
    root.clear();
    animations.length = 0;
    buildings.length = 0;
    anchors.clear();
    const map = createApplicationMap(applications);
    boardDepth = Math.max(23, map.height / 48);
    liveIslands = islandCount; controller.setRects(cameraRects(islandCount, villageDepth(applications)));
    const centerZ = boardDepth / 2 - 7;
    setMapRenderLayer(box(root, 0, -0.65, centerZ, 34, 1.3, boardDepth + 8, "#8d8a6e"), mapRenderLayers.terrain);
    setMapRenderLayer(box(root, 0, -0.08, centerZ, 34, 0.45, boardDepth + 8, "#84a66b"), mapRenderLayers.terrain + 1);
    setMapRenderLayer(box(root, 25, -0.65, 7, 16, 1.3, 26, "#8d8a6e"), mapRenderLayers.terrain);
    setMapRenderLayer(box(root, 25, -0.08, 7, 16, 0.45, 26, "#84a66b"), mapRenderLayers.terrain + 1);
    for (let patch = 0; patch < 24; patch++) {
      const patchX = -8.5 + (patch * 7.7) % 40;
      const patchZ = -5 + (patch * 5.3) % Math.max(12, Math.min(23, boardDepth - 3));
      const meadow = mesh(root, `meadow-${patch % 3}`, () => new THREE.CircleGeometry(1.7 + (patch % 3) * 0.5, 9), ["#7fa166", "#8aab71", "#90ae75"][patch % 3], patchX, 0.151, patchZ);
      meadow.rotation.x = -Math.PI / 2; meadow.scale.y = 0.65;
      setMapRenderLayer(meadow, mapRenderLayers.terrain + 2);
    }
    for (let tuft = 0; tuft < (renderer.isWebGL ? 100 : 38); tuft++) {
      const tuftX = -9 + (tuft * 5.71) % 41;
      const tuftZ = -6 + (tuft * 3.37) % Math.max(12, Math.min(24, boardDepth - 2));
      for (const side of [-1, 1]) {
        const blade = mesh(root, "grass-blade", () => new THREE.PlaneGeometry(0.09, 0.2), "#6e9559", tuftX + side * 0.06, 0.23, tuftZ);
        blade.rotation.y = side * 0.6; blade.rotation.z = side * 0.25;
        setMapRenderLayer(blade, mapRenderLayers.terrain + 3);
      }
    }
    setMapRenderLayer(box(root, 17.4, 0.18, 3.5, 1.8, 0.16, 0.85, "#c9b995"), mapRenderLayers.road);
    setMapRenderLayer(box(root, -12, 0.13, centerZ, 3.7, 0.12, boardDepth + 5, "#b7b17d"), mapRenderLayers.bank);
    setMapRenderLayer(box(root, -12, 0.21, centerZ, 2.8, 0.12, boardDepth + 5, "#51a5af"), mapRenderLayers.water);
    const water = box(root, -12, 0.29, centerZ, 1.8, 0.015, boardDepth + 4, "#72bfc2");
    setMapRenderLayer(water, mapRenderLayers.water + 1);
    animations.push((time) => { water.position.x = -12 + Math.sin(time * 0.8) * 0.08; });
    for (let shore = 0; shore < Math.ceil(boardDepth / 2.4); shore++) {
      const shoreZ = -6.5 + shore * 2.4;
      for (const side of [-1, 1]) {
        const stone = mesh(root, "shore-stone", () => new THREE.DodecahedronGeometry(0.28, 0), shore % 2 ? "#a5ad91" : "#b8b99a", -12 + side * 1.65, 0.26, shoreZ + side * 0.2);
        stone.scale.set(1.1, 0.55, 0.8);
        if (shore % 2 === 0) {
          for (let reed = 0; reed < 3; reed++) {
            const stem = cylinder(root, -12 + side * 1.5 + reed * 0.07, 0.4 + reed * 0.04, shoreZ + 0.45, 0.018, 0.018, 0.45 + reed * 0.08, "#78915a", 4);
            stem.rotation.z = side * (0.1 + reed * 0.04);
          }
        }
      }
      const ripple = box(root, -12 + (shore % 2 ? -0.5 : 0.3), 0.305, shoreZ, 0.55, 0.012, 0.055, "#b2d8ca");
      setMapRenderLayer(ripple, mapRenderLayers.water + 2);
      animations.push((time) => { ripple.position.z = shoreZ + Math.sin(time * 0.6 + shore) * 0.18; });
    }
    const rows = Math.max(1, Math.ceil(applications.length / 3));
    for (let row = 0; row < rows; row++) {
      const street = 3.5 + row * 7.5;
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
    setMapRenderLayer(cylinder(root, -3.2, 0.18, -4.7, 1.7, 1.75, 0.08, "#d0c6a9", 16), mapRenderLayers.road);
    cylinder(root, -3.2, 0.3, -4.7, 1.4, 1.5, 0.3, "#b7b69a");
    cylinder(root, -3.2, 0.56, -4.7, 0.95, 1.0, 0.3, "#6aaeb2");
    cylinder(root, -3.2, 0.9, -4.7, 0.15, 0.2, 0.8, "#d5d4b8");
    cylinder(root, -3.2, 1.3, -4.7, 0.6, 0.5, 0.16, "#d5d4b8");
    cylinder(root, -3.2, 1.41, -4.7, 0.47, 0.47, 0.05, "#8fc5c3", 12);
    const jet = cylinder(root, -3.2, 1.65, -4.7, 0.035, 0.07, 0.45, "#c1dfd5", 6);
    animations.push((time) => { jet.scale.y = 1 + Math.sin(time * 2.8) * 0.15; });
    for (const house of villageObjects(applications, layouts).filter((item) => item.itemType === "house")) {
      const application = applications.find(({ id }) => id === house.applicationId)!;
      if (visibleIds.includes(application.id)) {
        const shadow = cylinder(root, house.x! + 2.65, 0.155, house.z! + 2.8, 2.45, 2.45, 0.01, "#647c4d", 16);
        shadow.scale.z = 0.85;
        setMapRenderLayer(shadow, mapRenderLayers.shadow);
        building(application, house.x! + 2.5, house.z! + 2.5, application.id === selectedId);
        buildings[buildings.length - 1].rotation.y = -house.rotation * Math.PI / 2;
      }
    }
    for (const house of villageObjects(applications, layouts).filter((item) => item.itemType === "house")) {
      const positionX = house.x! + 2.5;
      const positionZ = house.z! + 2.5;
      tree(positionX + 2.4, positionZ - 2, 0.65, true);
      for (let flower = 0; flower < 3; flower++) {
        cylinder(root, positionX - 2.1 + flower * 0.2, 0.3, positionZ - 1.8, 0.06, 0.06, 0.3, "#557847", 5);
        cylinder(root, positionX - 2.1 + flower * 0.2, 0.49, positionZ - 1.8, 0.12, 0.1, 0.08, flower % 2 ? "#e9bb70" : "#c97e89", 6);
      }
    }
    islandParts = buildIslands({ box, cylinder, tree }, root, islandCount);
    if (revealing) { const parts = islandParts.get(revealing.no); if (!parts) revealing = null; }
    const routes = villageWalkingRoutes(villageObjects(applications, layouts).filter((item) => item.itemType === "street"), renderer.isWebGL ? 5 : 3);
    routes.forEach((route, index) => {
      const villager = createMapVillager({ route, phase: index * 1.3, color: ["#618da0", "#b27b79", "#8d9366", "#a98c5d"][index % 4] });
      villager.group.scale.setScalar(1.1); villagers.push(villager); root.add(villager.group); animations.push(villager.animate);
    });
    syncDrag();
  }

  let sceneChanged = true;
  let labelsDirty = true;
  const previewModels: ReturnType<typeof createShopModel>[] = [];
  let shopKey: { items: OwnedMapItem[]; selectedId: string | null; applications: Application[]; layouts: MapLayout[]; islandCount: number; movingId: string | null } | null = null;
  let shopItemsCache: PlaceableItem[] = [];

  function disposePreview() {
    for (const model of previewModels) model.dispose();
    previewModels.length = 0; previewRoot.clear();
  }

  /** The static shop models (everything except the item being placed). Rebuilt only when the inventory/layout/selection really changed. */
  function rebuildShop(items: OwnedMapItem[], selectedId: string | null, movingId: string | null, applications: Application[], layouts: MapLayout[]) {
    stats.shopRebuild++;
    for (const model of shopModels) model.dispose();
    shopModels.length = 0; shopRoot.clear(); shopObjects.length = 0; shopAnimations.length = 0;
    shopItemsCache = [...items, ...villageObjects(applications, layouts)];
    for (const item of shopItemsCache) {
      if (item.itemType === "house" || item.id === movingId) continue;
      if (item.x === null || item.z === null || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
      const model = createShopModel(item.itemType === "street" ? "road" : item.itemType, item.id === selectedId);
      shopModels.push(model);
      shopAnimations.push(model.animate);
      const footprint = itemFootprint(item.itemType, item.rotation);
      model.group.position.set(item.x + footprint.width / 2, 0.19, item.z + footprint.depth / 2);
      model.group.rotation.y = -item.rotation * Math.PI / 2; model.group.userData.shopItemId = item.id;
      shopRoot.add(model.group);
      setMapRenderLayer(model.group, item.itemType === "road" || item.itemType === "street" ? mapRenderLayers.road : mapRenderLayers.object);
      if (item.itemType !== "street") shopObjects.push(model.group);
    }
  }

  function setShop(items: OwnedMapItem[], selectedId: string | null, placement: Placement | null, applications: Application[], layouts: MapLayout[], islandCount = 1) {
    stats.setShop++;
    activePlacement = placement;
    const movingId = placement?.item.id ?? null;
    // Hovering/clicking while placing only changes `placement.position`: keep the scene, update the ghost.
    if (!shopKey || shopKey.items !== items || shopKey.selectedId !== selectedId || shopKey.applications !== applications || shopKey.layouts !== layouts || shopKey.movingId !== movingId) {
      shopKey = { items, selectedId, applications, layouts, islandCount, movingId };
      rebuildShop(items, selectedId, movingId, applications, layouts);
      sceneChanged = true;
    }
    constructionGrid.visible = placement !== null;
    if (placement) {
      const size = itemFootprint(placement.item.itemType, placement.position.rotation);
      constructionGrid.scale.set((size.width + 2) / 8, 1, (size.depth + 2) / 8);
      constructionGrid.position.set(placement.position.x + size.width / 2, 0.2, placement.position.z + size.depth / 2);
    }
    const allItems = shopItemsCache;
    liveItems = allItems; liveDepth = villageDepth(applications); liveIslands = islandCount;
    const valid = !placement || canPlaceMapItem(placement.item, placement.position, allItems, liveDepth, islandCount);
    previewMaterial.color.set(valid ? "#90c978" : "#d5827d");
    disposePreview();
    const moving = placement ? allItems.find((item) => item.id === placement.item.id) : undefined;
    if (placement && moving) {
      const position = placement.position;
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) { syncDrag(); return; }
      if (moving.itemType === "house") {
        const house = buildings.find((object) => object.userData.applicationId === moving.applicationId);
        if (house) {
          house.position.set(position.x + 2.5, 0, position.z + 2.5); house.rotation.y = -position.rotation * Math.PI / 2;
          house.traverse((object) => { if (object instanceof THREE.Mesh) object.material = previewMaterial; });
          anchors.set(moving.applicationId!, new THREE.Vector3(position.x + 2.5, 0.25, position.z + 5.1));
        }
      } else {
        const model = createShopModel(moving.itemType === "street" ? "road" : moving.itemType, moving.id === selectedId);
        previewModels.push(model);
        const footprint = itemFootprint(moving.itemType, position.rotation);
        model.group.position.set(position.x + footprint.width / 2, 0.19, position.z + footprint.depth / 2);
        model.group.rotation.y = -position.rotation * Math.PI / 2; model.group.userData.shopItemId = moving.id;
        previewRoot.add(model.group);
        setMapRenderLayer(model.group, moving.itemType === "road" || moving.itemType === "street" ? mapRenderLayers.road : mapRenderLayers.object);
        model.group.traverse((object) => { if (object instanceof THREE.Mesh) { object.material = previewMaterial; object.castShadow = false; } });
      }
    }
    labelsDirty = true; sceneChanged = true;
    syncDrag();
  }

  let firstCenter = true;
  function center() {
    const focus = buildings.slice(0, 3);
    const point = { x: focus.length ? focus.reduce((sum, object) => sum + object.position.x, 0) / focus.length : -3.2, z: focus.length ? focus.reduce((sum, object) => sum + object.position.z, 0) / focus.length + 1 : 0 };
    if (firstCenter) { firstCenter = false; controller.set(point); cameraDirty = true; } else controller.focusOn(point);
  }

  let hostRect = host.getBoundingClientRect();
  const refreshRect = () => { hostRect = host.getBoundingClientRect(); input.refreshRect(); };
  let pixelRatio = renderer.pixelRatio;
  const ratioCeiling = basePixelRatio(window.devicePixelRatio);
  const observer = new ResizeObserver(() => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    size = { width, height };
    const vertical = width < 640 ? 10.5 : 9.5;
    camera.left = -vertical * width / height;
    camera.right = vertical * width / height;
    camera.top = vertical;
    camera.bottom = -vertical;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    controller.setView(size);
    refreshRect();
    cameraDirty = true; labelsDirty = true;
  });
  observer.observe(host);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
  let down = { x: 0, y: 0 };

  const touches = new Set<number>();
  let multiTouch = false;

  // ---- Drag & drop of placed items (mouse: press + move; touch: long-press, then move) ----
  type DragSession = { item: PlaceableItem; from: MapPosition; grab: { x: number; z: number }; pointerId: number; start: { x: number; y: number }; touch: boolean; active: boolean; timer: number; position: MapPosition; verdict: DropVerdict; source: THREE.Object3D | null; ghost: THREE.Object3D | null; hidden: boolean };
  // Ghost and footprint ignore the depth buffer and render last, so a rejected spot stays visible even behind a house.
  const dragMaterial = new THREE.MeshStandardMaterial({ color: "#58b043", transparent: true, opacity: 0.72, roughness: 0.8, depthWrite: false, depthTest: false });
  const footprintMaterial = new THREE.MeshBasicMaterial({ color: "#58b043", transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: "#58b043", depthTest: false });
  const footprint = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), footprintMaterial);
  footprint.add(new THREE.LineSegments(new THREE.EdgesGeometry(footprint.geometry), outlineMaterial));
  footprint.visible = false;
  footprint.traverse((object) => { object.renderOrder = 9; });
  scene.add(footprint);
  let liveItems: PlaceableItem[] = [];
  let liveDepth = 20;
  let liveIslands = 1;
  let dragEnabled = false;
  let session: DragSession | null = null;
  let justDragged = false;
  let lastHover = 0;

  function groundPoint(event: PointerEvent) {
    const bounds = hostRect;
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    if (cameraDirty) syncCamera();
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  }

  function ownerId(object: THREE.Object3D | null) {
    while (object && !object.userData.applicationId && !object.userData.shopItemId) object = object.parent;
    return object ? (object.userData.applicationId ? `house:${object.userData.applicationId as string}` : (object.userData.shopItemId as string)) : null;
  }

  function findSource(item: PlaceableItem) {
    const groups = item.itemType === "house" ? buildings : [...previewRoot.children, ...shopRoot.children];
    return groups.find((object) => (item.itemType === "house" ? `house:${object.userData.applicationId as string}` : object.userData.shopItemId) === item.id) ?? null;
  }

  /** What is under the pointer and may be dragged? Streets/bridges are never returned. */
  function pickMovable(event: PointerEvent) {
    const point = groundPoint(event);
    if (!point) return null;
    if (activePlacement) {
      const { item, position } = activePlacement;
      const size = itemFootprint(item.itemType, position.rotation);
      const cellX = Math.floor(point.x), cellZ = Math.floor(point.z);
      const inside = cellX >= position.x && cellX < position.x + size.width && cellZ >= position.z && cellZ < position.z + size.depth;
      const hit = raycaster.intersectObjects([...buildings, ...previewRoot.children], true)[0];
      if (!inside && (!hit || ownerId(hit.object) !== item.id)) return null;
      return { item, from: position, point };
    }
    const hit = raycaster.intersectObjects([...buildings, ...shopObjects], true)[0];
    const id = (hit ? ownerId(hit.object) : null) ?? decorationAt(point)?.id;
    const item = id ? liveItems.find((candidate) => candidate.id === id) : undefined;
    if (!item || item.x === null || item.z === null || isLockedMapObject(item)) return null;
    return { item, from: { x: item.x, z: item.z, rotation: item.rotation }, point };
  }

  /** Small decorations are hard to hit with the ray alone (thin trunks, flat flower beds): fall back to the grid cell under the pointer. */
  function decorationAt(point: THREE.Vector3) {
    const cellX = Math.floor(point.x), cellZ = Math.floor(point.z);
    return liveItems.find((item) => {
      if (item.itemType === "house" || isLockedMapObject(item) || item.x === null || item.z === null) return false;
      const size = itemFootprint(item.itemType, item.rotation);
      return cellX >= item.x && cellX < item.x + size.width && cellZ >= item.z && cellZ < item.z + size.depth;
    });
  }

  /** The world is rebuilt on every React render; a drag in progress keeps going and just re-attaches to the rebuilt object. */
  function syncDrag() {
    const current = session;
    if (!current) return;
    if (!liveItems.some(({ id }) => id === current.item.id)) { cancelDrag(); return; }
    if (!current.active) return;
    current.source = findSource(current.item);
    if (current.hidden && current.source) current.source.visible = false;
    if (current.ghost && current.source) current.ghost.position.set(current.source.position.x + current.position.x - current.from.x, current.source.position.y, current.source.position.z + current.position.z - current.from.z);
  }

  function arm() {
    if (!session || session.active) return;
    const current = session;
    current.active = true;
    current.source = findSource(current.item);
    if (current.source) {
      const ghost = current.source.clone(true);
      ghost.userData = {};
      ghost.traverse((object) => { object.renderOrder = 10; if (object instanceof THREE.Mesh) { object.material = dragMaterial; object.castShadow = false; object.receiveShadow = false; } });
      scene.add(ghost);
      current.ghost = ghost;
      if (activePlacement) { current.source.visible = false; current.hidden = true; }
    }
    const size = itemFootprint(current.item.itemType, current.from.rotation);
    footprint.scale.set(size.width, 1, size.depth);
    footprint.visible = true;
    place(current, current.from);
    host.style.cursor = "grabbing";
    if (current.touch) navigator.vibrate?.(12);
  }

  function place(current: DragSession, position: MapPosition) {
    current.position = position;
    current.verdict = evaluateDrop(current.item, position, liveItems, liveDepth, liveIslands);
    const color = current.verdict.valid ? "#58b043" : "#e0443e";
    dragMaterial.color.set(color); footprintMaterial.color.set(color); outlineMaterial.color.set(color);
    const size = itemFootprint(current.item.itemType, position.rotation);
    footprint.position.set(position.x + size.width / 2, 0.22, position.z + size.depth / 2);
    if (current.ghost && current.source) current.ghost.position.set(current.source.position.x + position.x - current.from.x, current.source.position.y, current.source.position.z + position.z - current.from.z);
    host.dataset.dragState = current.verdict.valid ? "valid" : "invalid";
    host.dataset.dragCell = `${position.x},${position.z}`;
  }

  function endSession() {
    const current = session;
    if (!current) return;
    session = null;
    window.clearTimeout(current.timer);
    window.removeEventListener("keydown", dragKeyDown, true);
    footprint.visible = false;
    if (current.ghost) { scene.remove(current.ghost); current.ghost = null; }
    if (current.hidden && current.source) current.source.visible = true;
    host.style.cursor = "";
    delete host.dataset.dragState; delete host.dataset.dragCell;
    try { if (host.hasPointerCapture(current.pointerId)) host.releasePointerCapture(current.pointerId); } catch { /* pointer already gone */ }
  }

  function cancelDrag() { endSession(); }
  function dragKeyDown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelDrag(); } }

  function drop() {
    const current = session;
    if (!current || !current.active) { endSession(); return false; }
    const { item, position, verdict, from } = current;
    endSession();
    if (samePosition(position, from)) return true;
    if (!verdict.valid) { getDrag().reject(verdict); return true; }
    if (activePlacement) onPlacePosition(position); else getDrag().move(item.id, position);
    return true;
  }

  function pointerDown(event: PointerEvent) {
    if (!touches.size) refreshRect();
    down = { x: event.clientX, y: event.clientY };
    if (event.pointerType === "touch") { touches.add(event.pointerId); if (touches.size > 1) multiTouch = true; }
    if (session && event.pointerId !== session.pointerId) { cancelDrag(); return; }
    if (event.button !== 0 || !event.isPrimary || !dragEnabled || session || (event.target as HTMLElement).closest("button")) return;
    const pick = pickMovable(event);
    if (!pick) return;
    const touch = event.pointerType !== "mouse";
    session = { item: pick.item, from: pick.from, grab: grabOffset(pick.point, pick.from), pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, touch, active: false, timer: 0, position: pick.from, verdict: { valid: true, reason: "ok" }, source: null, ghost: null, hidden: false };
    window.addEventListener("keydown", dragKeyDown, true);
    if (touch) session.timer = window.setTimeout(arm, LONG_PRESS_MS);
    else { event.stopPropagation(); try { host.setPointerCapture(event.pointerId); } catch { /* ignore */ } }
  }

  function pointerMove(event: PointerEvent) {
    const current = session;
    if (!current) {
      if (event.pointerType !== "mouse" || event.buttons !== 0 || !dragEnabled || event.timeStamp - lastHover < 60) return;
      lastHover = event.timeStamp;
      host.style.cursor = pickMovable(event) ? "move" : "";
      return;
    }
    if (event.pointerId !== current.pointerId) return;
    if (!current.active) {
      const moved = Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y);
      if (current.touch) { if (moved > TOUCH_CANCEL_THRESHOLD) endSession(); } // finger moved before the long-press: the map pans as usual
      else if (moved > MOUSE_DRAG_THRESHOLD) arm();
      if (!current.active) return;
    }
    event.preventDefault();
    const point = groundPoint(event);
    if (!point) return;
    const position = snapDragPosition(point, current.grab, current.from.rotation);
    if (!samePosition(position, current.position)) place(current, position);
  }

  function pointerEnd(event: PointerEvent) {
    touches.delete(event.pointerId);
    if (!touches.size) queueMicrotask(() => { if (!touches.size) multiTouch = false; });
  }

  function pointerUp(event: PointerEvent) {
    const gesture = multiTouch;
    pointerEnd(event);
    const cameraGesture = input.takeTapBlock(event.pointerId);
    if (session && event.pointerId === session.pointerId) {
      const active = session.active;
      drop();
      if (active) { justDragged = true; window.setTimeout(() => { justDragged = false; }, 0); return; }
    }
    if (gesture || cameraGesture || justDragged || event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > (event.pointerType === "touch" ? 12 : 6) || (event.target as HTMLElement).closest("button")) return;
    const bounds = hostRect;
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    if (activePlacement) {
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2), new THREE.Vector3());
      if (point) {
        const size = itemFootprint(activePlacement.item.itemType, activePlacement.position.rotation);
        onPlacePosition({ x: Math.floor(point.x - size.width / 2 + 0.5), z: Math.floor(point.z - size.depth / 2 + 0.5), rotation: activePlacement.position.rotation });
      }
      return;
    }
    const hit = raycaster.intersectObjects([...buildings, ...shopObjects], true)[0];
    if (hit) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.applicationId && !object.userData.shopItemId) object = object.parent;
      if (object?.userData.applicationId) onSelect(object.userData.applicationId as string);
      if (object?.userData.shopItemId) onSelectShopItem(object.userData.shopItemId as string);
    } else {
      const point = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
      const decoration = point && decorationAt(point);
      if (decoration) onSelectShopItem(decoration.id);
    }
  }
  function pointerCancel(event: PointerEvent) { pointerEnd(event); if (session && event.pointerId === session.pointerId) cancelDrag(); }
  function contextMenu(event: Event) { if (session?.touch) event.preventDefault(); }
  host.addEventListener("pointerdown", pointerDown, true);
  host.addEventListener("pointermove", pointerMove);
  host.addEventListener("pointerup", pointerUp);
  host.addEventListener("pointercancel", pointerCancel);
  host.addEventListener("contextmenu", contextMenu);
  function preferenceChanged() { motion = !preference.matches; controller.setReducedMotion(!motion); }
  preference.addEventListener("change", preferenceChanged);

  // ---- labels: cached element list, positions recomputed only when the camera or the scene changed ----
  const projection = new THREE.Vector3();
  let labelElements: HTMLElement[] = [];
  const collectLabels = () => { labelElements = [...labels.querySelectorAll<HTMLElement>("[data-building]")]; labelsDirty = true; };
  collectLabels();
  const labelObserver = new MutationObserver(collectLabels);
  labelObserver.observe(labels, { childList: true });
  function updateLabels() {
    labelsDirty = false;
    // Labels grow/shrink gently with zoom, never below 1 so text stays >= 10px.
    const labelScale = Math.min(1.25, Math.max(1, Math.sqrt(camera.zoom))).toFixed(2);
    const { width, height } = size;
    for (const element of labelElements) {
      const anchor = anchors.get(element.dataset.building!);
      if (!anchor) { element.style.visibility = "hidden"; continue; }
      projection.copy(anchor).project(camera);
      const visible = projection.z >= -1 && projection.z <= 1 && Math.abs(projection.x) < 1.15 && Math.abs(projection.y) < 1.15;
      element.style.visibility = visible ? "visible" : "hidden";
      element.style.transform = `translate(-50%, -50%) translate(${(projection.x + 1) / 2 * width}px, ${(-projection.y + 1) / 2 * height}px) scale(${labelScale})`;
    }
  }

  // ---- render loop: camera step, throttled shadows, adaptive resolution, paused while hidden / off screen ----
  let syncedState = controller.state;
  let lastFrame = performance.now(), lastRender = 0, lastShadow = 0, shadowX = 0, shadowZ = 0;
  let averageFrame = 16, slowFrames = 0, fastFrames = 0;
  function frame(milliseconds: number) {
    const now = performance.now();
    const dt = Math.min(500, now - lastFrame); lastFrame = now; // the camera maths is exact for any dt, so slow devices do not play animations in slow motion
    controller.step(dt, now);
    const interacting = controller.moving || session !== null || revealing !== null;
    if (controller.state !== syncedState) cameraDirty = true;
    // At rest ~30 fps is plenty for villagers and water and saves battery.
    if (!interacting && !cameraDirty && !sceneChanged && !labelsDirty && now - lastRender < 33) return;
    lastRender = now; stats.frames++;
    if (interacting) {
      averageFrame = averageFrame * 0.9 + dt * 0.1;
      slowFrames = averageFrame > 26 ? slowFrames + 1 : 0; fastFrames = averageFrame < 15 ? fastFrames + 1 : 0;
      const ratio = nextPixelRatio(pixelRatio, ratioCeiling, averageFrame, slowFrames, fastFrames);
      if (ratio !== pixelRatio) { pixelRatio = ratio; renderer.setPixelRatio(ratio); slowFrames = 0; fastFrames = 0; }
    }
    if (revealing) {
      const parts = islandParts.get(revealing.no);
      if (!parts || !revealProgress(parts, motion ? now - revealing.start : 1e6)) revealing = null;
      sceneChanged = true;
    }
    const moved = cameraDirty;
    if (cameraDirty) { syncCamera(); syncedState = controller.state; }
    const { x: targetX, z: targetZ } = controller.state;
    sunlight.target.position.set(targetX, 0, targetZ);
    sunlight.position.set(targetX - 12, 24, targetZ + 8);
    sunlight.target.updateMatrixWorld();
    if (motion) { const seconds = milliseconds / 1000; for (const animate of animations) animate(seconds); for (const animate of shopAnimations) animate(seconds); }
    if (shadowDue(now, lastShadow, Math.hypot(targetX - shadowX, targetZ - shadowZ), sceneChanged)) { renderer.refreshShadows(); lastShadow = now; shadowX = targetX; shadowZ = targetZ; }
    sceneChanged = false;
    renderer.render(scene, camera);
    if (moved || labelsDirty) updateLabels();
    reportZoom(now, !controller.moving);
  }
  let pageVisible = document.visibilityState === "visible";
  let onScreen = true;
  let running = false;
  function updateRunning() {
    const should = pageVisible && onScreen;
    if (should === running) return;
    running = should;
    if (should) { lastFrame = performance.now(); sceneChanged = true; renderer.setAnimationLoop(frame); } else renderer.setAnimationLoop(null);
  }
  function visibilityChanged() { pageVisible = document.visibilityState === "visible"; if (!pageVisible) cancelDrag(); updateRunning(); }
  document.addEventListener("visibilitychange", visibilityChanged);
  const intersection = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; updateRunning(); }, { rootMargin: "120px" });
  intersection?.observe(host);
  updateRunning();

  // Test hook (read-only): camera state, projection of ground/house points and counters for scripts/map-interaction-e2e.mjs.
  const freshCamera = () => { if (controller.state !== syncedState) { syncCamera(); syncedState = controller.state; } };
  Object.defineProperty(host, "__map", { value: {
    stats,
    camera: () => ({ ...controller.state }),
    mode: () => controller.mode,
    project: (x: number, z: number) => { freshCamera(); const r = host.getBoundingClientRect(); const v = new THREE.Vector3(x, 0, z).project(camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (-v.y + 1) / 2 * r.height }; },
    ground: (clientX: number, clientY: number) => { freshCamera(); const r = host.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera); const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); return p ? { x: p.x, z: p.z } : null; },
    house: (id: string) => { const b = buildings.find((o) => o.userData.applicationId === id); return b ? { x: b.position.x, z: b.position.z } : null; },
    pixelRatio: () => renderer.pixelRatio,
    bounds: () => ({ rects: controller.rects, margin: BOUNDS_MARGIN }),
    movableAt: (clientX: number, clientY: number) => { freshCamera(); hostRect = host.getBoundingClientRect(); return pickMovable({ clientX, clientY } as PointerEvent) !== null; },
  }, configurable: true });

  const api: MapCameraApi = {
    zoomIn() { controller.zoomTo(Math.round((controller.goal.zoom + 0.2) * 100) / 100); },
    zoomOut() { controller.zoomTo(Math.round((controller.goal.zoom - 0.2) * 100) / 100); },
    setZoom(value: number) { controller.zoomTo(value); },
    reset() { controller.zoomTo(1); center(); },
    focusOn(x: number, z: number, zoom?: number) { controller.focusOn({ x, z }, zoom); },
    getState() { return { ...controller.state }; },
  };

  return {
    api,
    populate,
    setShop,
    setDragEnabled(value: boolean) { dragEnabled = value; if (!value) cancelDrag(); },
    center,
    focusConstruction(position: MapPosition) { controller.focusOn({ x: position.x + 1, z: position.z + 1 }); },
    focusIsland(no: number, reveal: boolean) {
      const focus = islandConfig(no)?.focus;
      if (!focus) return;
      if (reveal) revealing = { no, start: performance.now() };
      controller.setRects(cameraRects(Math.max(liveIslands, no), liveDepth));
      controller.flyTo({ x: focus.x, z: focus.z }, performance.now());
    },
    /** `zoom` prop from the toolbar. Values we reported ourselves come back as props and must not restart the animation. */
    zoom(value: number) {
      const now = performance.now();
      if (Math.abs(lastReportedZoom - value) < 0.006 || Math.abs(controller.goal.zoom - value) < 0.005 || recentReports.some((report) => now - report.at < 2000 && Math.abs(report.value - value) < 0.006)) return;
      controller.zoomTo(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)));
    },
    lighting(night: boolean) {
      scene.background = new THREE.Color(night ? "#314957" : "#b9c9ae");
      ambient.intensity = night ? 1.1 : 2.6;
      ambient.color.set(night ? "#a3bbdf" : "#fff5dc");
      sunlight.intensity = renderer.isWebGL ? night ? 0.7 : 3.2 : night ? 0.35 : 0.65;
      fallbackFill.intensity = renderer.isWebGL ? 0 : night ? 0.3 : 0.45;
      windowMaterial.emissiveIntensity = night ? 1.5 : 0.1;
    },
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      observer.disconnect(); labelObserver.disconnect(); intersection?.disconnect();
      input.dispose();
      cancelDrag();
      disposePreview();
      host.removeEventListener("pointerdown", pointerDown, true);
      host.removeEventListener("pointermove", pointerMove);
      host.removeEventListener("pointerup", pointerUp);
      host.removeEventListener("pointercancel", pointerCancel);
      host.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("visibilitychange", visibilityChanged);
      dragMaterial.dispose(); footprintMaterial.dispose(); outlineMaterial.dispose(); footprint.geometry.dispose();
      preference.removeEventListener("change", preferenceChanged);
      for (const geometry of geometries.values()) geometry.dispose();
      for (const item of materials.values()) item.dispose();
      windowMaterial.dispose();
      for (const model of shopModels) model.dispose();
      for (const villager of villagers) villager.dispose();
      previewMaterial.dispose();
      delete (host as unknown as Record<string, unknown>).__map;
      constructionGrid.geometry.dispose();
      for (const item of Array.isArray(constructionGrid.material) ? constructionGrid.material : [constructionGrid.material]) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}