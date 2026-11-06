"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { MapCameraApi } from "./application-map-world";

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
const STEP = 0.2;

/**
 * THE ONE PLACE where the overlay zoom buttons are wired to the camera.
 * The world reports its zoom via `onZoomChange` (throttled) and hands over an imperative `MapCameraApi` via `onCameraApi`;
 * the buttons call that API (animated, anchored, clamped). Without an API (world not ready) they fall back to the `zoom`/`center` props.
 */
export function useCameraControls() {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState(0);
  const api = useRef<MapCameraApi | null>(null);
  const onCameraApi = useCallback((next: MapCameraApi | null) => { api.current = next; }, []);
  const zoomIn = useCallback(() => { if (api.current) api.current.zoomIn(); else setZoom((value) => Math.min(ZOOM_MAX, Number((value + STEP).toFixed(2)))); }, []);
  const zoomOut = useCallback(() => { if (api.current) api.current.zoomOut(); else setZoom((value) => Math.max(ZOOM_MIN, Number((value - STEP).toFixed(2)))); }, []);
  const reset = useCallback(() => { if (api.current) api.current.setZoom(1); else setZoom(1); }, []);
  const recenter = useCallback(() => { if (api.current) api.current.reset(); else { setZoom(1); setCenter((value) => value + 1); } }, []);
  return useMemo(() => ({ zoom, center, setZoom, onCameraApi, zoomIn, zoomOut, reset, recenter, canZoomIn: zoom < ZOOM_MAX, canZoomOut: zoom > ZOOM_MIN }), [zoom, center, onCameraApi, zoomIn, zoomOut, reset, recenter]);
}

export type CameraControls = ReturnType<typeof useCameraControls>;
