import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";

export const mapRenderLayers = { terrain: -100, bank: -90, water: -80, shadow: -60, road: -40, grid: -20, object: 0 } as const;

export function setMapRenderLayer(object: THREE.Object3D, layer: number) {
  object.traverse((child) => { child.renderOrder = layer; });
  return object;
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
    webgl.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
  return {
    domElement,
    isWebGL: webgl !== null,
    setSize(width: number, height: number) { if (webgl) webgl.setSize(width, height); else svg!.setSize(width, height); },
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