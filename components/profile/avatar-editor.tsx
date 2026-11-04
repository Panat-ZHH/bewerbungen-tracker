"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Minus, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { useMyAvatar } from "@/components/ui/use-avatars";
import { AVATAR_ACCEPT, AVATAR_MAX_ZOOM, AVATAR_MIN_ZOOM, baseScale, clampOffset, clampZoom, sourceRect, validateAvatarFile, type Point } from "@/lib/avatar";
import { loadImage, renderAvatar } from "@/lib/avatar-image";
import { removeAvatar, uploadAvatar } from "@/lib/avatar-storage";

const KEY_STEP = 12;

/** Profile picture card: choose/take a photo, crop with zoom, save or remove. */
export function AvatarEditor({ name }: { name: string }) {
  const current = useMyAvatar();
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointer: number; start: Point; origin: Point } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState(280);
  const [busy, setBusy] = useState<"" | "decode" | "save" | "remove">("");
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");

  const size = useMemo(() => (image ? { width: image.naturalWidth, height: image.naturalHeight } : null), [image]);
  const closeEditor = useCallback(() => { setImage((previous) => { if (previous) URL.revokeObjectURL(previous.src); return null; }); setDialogError(""); }, []);

  useEffect(() => { if (image && frameRef.current) setViewport(frameRef.current.clientWidth || 280); }, [image]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!image || !size || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = sourceRect(size, viewport, zoom, offset);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, rect.sx, rect.sy, rect.side, rect.side, 0, 0, canvas.width, canvas.height);
  }, [image, size, viewport, zoom, offset]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    const check = validateAvatarFile(file);
    if (!check.ok) { setError(check.message); return; }
    setBusy("decode");
    try {
      const decoded = await loadImage(file);
      setZoom(1); setOffset({ x: 0, y: 0 }); setImage(decoded);
    } catch { setError("Dieses Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei."); }
    finally { setBusy(""); }
  }

  function applyZoom(next: number) {
    if (!size) return;
    const value = clampZoom(next);
    setZoom(value);
    setOffset((previous) => clampOffset(previous, size, viewport, value));
  }
  function move(delta: Point) { if (size) setOffset((previous) => clampOffset({ x: previous.x + delta.x, y: previous.y + delta.y }, size, viewport, zoom)); }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: offset };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId || !size) return;
    setOffset(clampOffset({ x: state.origin.x + event.clientX - state.start.x, y: state.origin.y + event.clientY - state.start.y }, size, viewport, zoom));
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: { x: -KEY_STEP, y: 0 }, ArrowRight: { x: KEY_STEP, y: 0 }, ArrowUp: { x: 0, y: -KEY_STEP }, ArrowDown: { x: 0, y: KEY_STEP } }[event.key];
    if (step) { event.preventDefault(); move(step); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); applyZoom(zoom + 0.2); }
    else if (event.key === "-") { event.preventDefault(); applyZoom(zoom - 0.2); }
  }

  async function save() {
    if (!image) return;
    setBusy("save"); setDialogError("");
    try {
      const blob = await renderAvatar(image, viewport, zoom, offset);
      await uploadAvatar(blob);
      closeEditor();
      setNotice("Dein Profilbild wurde gespeichert.");
    } catch { setDialogError("Das Profilbild konnte nicht gespeichert werden. Prüfe deine Verbindung und versuche es noch einmal."); }
    finally { setBusy(""); }
  }

  async function remove() {
    if (!window.confirm("Profilbild wirklich entfernen? Stattdessen werden deine Initialen angezeigt.")) return;
    setBusy("remove"); setError(""); setNotice("");
    try { await removeAvatar(); setNotice("Dein Profilbild wurde entfernt."); }
    catch { setError("Das Profilbild konnte nicht entfernt werden. Bitte versuche es noch einmal."); }
    finally { setBusy(""); }
  }

  const scale = size ? baseScale(size, viewport) * zoom : 1;
  const shown = size ? { width: size.width * scale, height: size.height * scale } : { width: 0, height: 0 };

  return (
    <section aria-labelledby="avatar-title" className="mb-5 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--raised)] p-5 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:p-6">
      <Avatar name={name} src={current} size="xl" className="self-start" />
      <div className="min-w-0 flex-1">
        <h2 id="avatar-title" className="text-heading">Profilbild</h2>
        <p className="mt-1 text-small text-muted">PNG, JPEG oder WebP bis 5 MB. Du kannst den Ausschnitt gleich anpassen.</p>
        {error && <StatusMessage tone="danger" className="mt-3">{error}</StatusMessage>}
        {notice && <StatusMessage tone="success" className="mt-3">{notice}</StatusMessage>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" loading={busy === "decode"} icon={<ImagePlus size={16} />} onClick={() => pickRef.current?.click()}>Profilbild ändern</Button>
          <Button type="button" variant="secondary" className="hidden pointer-coarse:inline-flex" disabled={Boolean(busy)} icon={<Camera size={16} />} onClick={() => cameraRef.current?.click()}>Foto aufnehmen</Button>
          {current && <Button type="button" variant="ghost" loading={busy === "remove"} icon={<Trash2 size={16} />} onClick={remove}>Entfernen</Button>}
        </div>
        <input ref={pickRef} type="file" accept={AVATAR_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Bilddatei wählen" data-testid="avatar-file" onChange={onPick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-label="Foto aufnehmen" onChange={onPick} />
      </div>

      <Modal
        open={Boolean(image)}
        onClose={() => { if (busy !== "save") closeEditor(); }}
        title="Profilbild zuschneiden"
        description="Ziehe das Bild in Position und stelle den Zoom ein."
        footer={<>
          <Button type="button" variant="secondary" disabled={busy === "save"} onClick={closeEditor}>Abbrechen</Button>
          <Button type="button" loading={busy === "save"} onClick={save}>{busy === "save" ? "Speichert …" : "Speichern"}</Button>
        </>}
      >
        {dialogError && <StatusMessage tone="danger" className="mb-3">{dialogError}</StatusMessage>}
        <div
          ref={frameRef}
          role="application"
          tabIndex={0}
          aria-label="Bildausschnitt. Mit Pfeiltasten verschieben, mit Plus und Minus zoomen."
          data-testid="avatar-crop"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={onKeyDown}
          className="relative mx-auto aspect-square w-full max-w-[280px] cursor-grab touch-none select-none overflow-hidden rounded-[var(--radius-lg)] bg-black active:cursor-grabbing"
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.src} alt="" draggable={false} width={Math.round(shown.width)} height={Math.round(shown.height)} className="pointer-events-none absolute max-w-none" style={{ maxWidth: "none", width: shown.width, height: shown.height, left: viewport / 2 - shown.width / 2 + offset.x, top: viewport / 2 - shown.height / 2 + offset.y }} />
          )}
          <div className="pointer-events-none absolute inset-[6%] rounded-full shadow-[0_0_0_999px_rgba(0,0,0,.55)] ring-2 ring-white/80" aria-hidden />
        </div>
        <div className="mx-auto mt-4 flex max-w-[280px] items-center gap-2">
          <button type="button" aria-label="Verkleinern" onClick={() => applyZoom(zoom - 0.2)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--hover)]"><Minus size={18} /></button>
          <input type="range" aria-label="Zoom" min={AVATAR_MIN_ZOOM} max={AVATAR_MAX_ZOOM} step={0.01} value={zoom} onChange={(event) => applyZoom(Number(event.target.value))} className="h-11 min-w-0 flex-1 accent-[var(--brand)]" />
          <button type="button" aria-label="Vergrößern" onClick={() => applyZoom(zoom + 0.2)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--hover)]"><Plus size={18} /></button>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 text-small text-muted"><canvas ref={previewRef} width={64} height={64} aria-label="Vorschau" role="img" className="h-16 w-16 rounded-full bg-[var(--hover)] ring-2 ring-[var(--solid)]" />Vorschau</div>
      </Modal>
    </section>
  );
}
