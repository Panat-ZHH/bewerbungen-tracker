"use client";

import { useCallback, useMemo, useState } from "react";

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
const STEP = 0.2;

/**
 * THE ONE PLACE where the overlay zoom buttons are wired to the camera.
 * Today the world takes `zoom` (number) and `center` (counter) props; when the camera gets a ref API (part B),
 * only this hook has to change (call ref.zoomIn() etc.). Pages just pass `camera` to <MapControls />.
 */
export function useCameraControls() {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState(0);
  const zoomIn = useCallback(() => setZoom((value) => Math.min(ZOOM_MAX, Number((value + STEP).toFixed(2)))), []);
  const zoomOut = useCallback(() => setZoom((value) => Math.max(ZOOM_MIN, Number((value - STEP).toFixed(2)))), []);
  const reset = useCallback(() => setZoom(1), []);
  const recenter = useCallback(() => { setZoom(1); setCenter((value) => value + 1); }, []);
  return useMemo(() => ({ zoom, center, setZoom, zoomIn, zoomOut, reset, recenter, canZoomIn: zoom < ZOOM_MAX, canZoomOut: zoom > ZOOM_MIN }), [zoom, center, zoomIn, zoomOut, reset, recenter]);
}

export type CameraControls = ReturnType<typeof useCameraControls>;
