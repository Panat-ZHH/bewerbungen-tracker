import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";

export const mapRenderLayers = { terrain: -100, bank: -90, water: -80, shadow: -60, road: -40, grid: -20, object: 0 } as const;

export function setMapRenderLayer(object: THREE.Object3D, layer: number) {
  object.traverse((child) => { child.renderOrder = layer; });
  return object;
}

/** Highest device pixel ratio the map renders at: 2x+ screens would shade 4x the pixels for little visible gain. */
export const MAX_PIXEL_RATIO = 1.5;
export const MIN_PIXEL_RATIO = 1;

export function basePixelRatio(devicePixelRatio: number) {
  return Math.min(MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
}

/**
 * Adaptive resolution: step the pixel ratio down while frames are slow, back up after a long run of fast frames.
 * `slowFrames`/`fastFrames` are consecutive-frame counters kept by the caller (reset them when the ratio changed).
 */
export function nextPixelRatio(current: number, ceiling: number, frameMs: number, slowFrames: number, fastFrames: number) {
  if (frameMs > 26 && slowFrames >= 12 && current > MIN_PIXEL_RATIO) return Math.max(MIN_PIXEL_RATIO, current - 0.25);
  if (frameMs < 15 && fastFrames >= 180 && current < ceiling) return Math.min(ceiling, current + 0.25);
  return current;
}

/** Should a shadow map refresh be forced? Casters animate slowly, so every ~120 ms (or after the light moved / the scene changed) is plenty. */
export function shadowDue(now: number, lastUpdate: number, lightMoved: number, sceneChanged: boolean) {
  return sceneChanged || lightMoved > 3 || now - lastUpdate >= 120;
}

export function getMapWebGLContext(canvas: Pick<HTMLCanvasElement, "getContext">): WebGL2RenderingContext | null {
  try {
    const context = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
    return context && !context.isContextLost() ? context : null;
  } catch {
    return null;
  }
}

export function createMapRenderer() {
  const canvas = document.createElement("canvas");
  const context = getMapWebGLContext(canvas);
  const webgl = context ? new THREE.WebGLRenderer({ canvas, context, antialias: true, preserveDrawingBuffer: true }) : null;
  const svg = webgl ? null : new SVGRenderer();
  if (webgl) {
    webgl.setPixelRatio(basePixelRatio(window.devicePixelRatio));
    // Shadows are refreshed on demand (see shadowDue): rendering the shadow map every frame doubles the cost of a pan.
    webgl.shadowMap.autoUpdate = false;
    webgl.shadowMap.needsUpdate = true;
    webgl.shadowMap.enabled = true;
    webgl.shadowMap.type = THREE.PCFShadowMap;
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.15;
  } else {
    svg!.setQuality("high");
    svg!.setPrecision(3);
  }
  const domElement = webgl?.domElement ?? svg!.domElement;
  domElement.dataset.mapRenderer = webgl ? "webgl" : "svg";
  let frame = 0;
  let size = { width: 0, height: 0 };
  return {
    domElement,
    isWebGL: webgl !== null,
    get pixelRatio() { return webgl ? webgl.getPixelRatio() : 1; },
    setPixelRatio(ratio: number) { if (!webgl || Math.abs(webgl.getPixelRatio() - ratio) < 0.01) return; webgl.setPixelRatio(ratio); if (size.width) webgl.setSize(size.width, size.height); },
    /** Ask for a shadow map refresh on the next render (no-op for the SVG fallback). */
    refreshShadows() { if (webgl) webgl.shadowMap.needsUpdate = true; },
    setSize(width: number, height: number) { size = { width, height }; if (webgl) webgl.setSize(width, height); else svg!.setSize(width, height); },
    render(scene: THREE.Scene, camera: THREE.Camera) { if (webgl) webgl.render(scene, camera); else svg!.render(scene, camera); },
    setAnimationLoop(callback: ((milliseconds: number) => void) | null) {
      cancelAnimationFrame(frame);
      if (webgl) { webgl.setAnimationLoop(callback); return; }
      if (!callback) return;
      let previous = -Infinity;
      function tick(time: number) {
        if (time - previous >= 50) { previous = time; callback!(time); }
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    },
    dispose() {
      cancelAnimationFrame(frame);
      webgl?.setAnimationLoop(null);
      webgl?.dispose();
      webgl?.forceContextLoss();
      svg?.clear();
    },
  };
}