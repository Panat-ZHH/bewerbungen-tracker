"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Armchair, Bike, Car, CarFront, Coins, FerrisWheel, Flower2, LocateFixed, MapPin, Move, Package, RotateCw, Route, ShoppingCart, Sparkles, TreePine, Undo2, Waves, X, Zap, type LucideIcon } from "lucide-react";
import { buyMapItem, getMapShop, moveMapObject, placeMapItem } from "@/lib/storage";
import { applyMove, dropMessages, nudgePosition, samePosition, type DropVerdict, type MoveRecord } from "@/lib/map-drag";
import { canPlaceMapItem, findFreeMapPosition, isLockedMapObject, isMapShopSetupError, isUnknownShopItemError, placeableCatalog, SHOP_ITEM_SOON, shopBuyErrorMessage, shopCatalog, shopCategories, shopItemsByCategory, shopRarities, unavailableShopItems, villageDepth, villageObjects, type MapLayout, type MapPosition, type MapShopState, type OwnedMapItem, type PlaceableItem, type Placement, type ShopCategory, type ShopItemType } from "@/lib/map-shop";
import type { Application } from "@/types";
import { supabase } from "@/lib/supabase";
import { useStoredFlag } from "./use-stored-flag";
import styles from "@/app/map/map.module.css";

const baseIcons: Partial<Record<ShopItemType, LucideIcon>> = { road: Route, flowers: Flower2, tree: TreePine, bench: Armchair, fountain: Waves, amusement_park: FerrisWheel };
const categoryIcons: Record<ShopCategory | "Alle", LucideIcon> = { Alle: Sparkles, Deko: Flower2, Park: Waves, Autos: Car, "E-Roller": Zap };
function iconFor(type: ShopItemType): LucideIcon {
  if (baseIcons[type]) return baseIcons[type];
  if (type.startsWith("car_")) return CarFront;
  if (type.startsWith("scooter_")) return Bike;
  return Package;
}

/**
 * `watch` (parent watching a child's village, read-only): items and layouts come from family_child_village. Nothing is loaded
 * (no map_shop_state, no catalogue, no reward claim) and every write (buy, place, move, undo) is a no-op.
 */
export function useMapShop(refresh: number, applications: Application[], islandCount = 1, watch?: { items: OwnedMapItem[]; layouts: MapLayout[] }) {
  const watching = watch !== undefined;
  const [ownState, setState] = useState<MapShopState | null>(null);
  const watchItems = watch?.items, watchLayouts = watch?.layouts;
  const watchState = useMemo<MapShopState | null>(() => (watchItems && watchLayouts ? { balance: 0, earned: 0, rewardCount: 0, items: watchItems, layouts: watchLayouts } : null), [watchItems, watchLayouts]);
  const state = watching ? watchState : ownState;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hint, setHint] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const operation = useRef(0);
  const locked = useRef(false);
  const hasData = useRef(false);
  const setupUnavailable = useRef(false);
  const pendingLoad = useRef<Promise<MapShopState> | null>(null);
  const purchase = useRef<{ itemType: ShopItemType; id: string } | null>(null);
  const [lastMove, setLastMove] = useState<MoveRecord | null>(null);
  const [unavailable, setUnavailable] = useState<Set<ShopItemType>>(() => new Set());
  const [dragMessage, setDragMessage] = useState("");
  const objects = villageObjects(applications, state?.layouts ?? []);
  const allItems = [...(state?.items ?? []), ...objects];
  const maxZ = villageDepth(applications);

  useEffect(() => {
    if (watching) return;
    let active = true;
    async function load(clear = false) {
      if (locked.current || (setupUnavailable.current && !clear)) return;
      const request = ++operation.current;
      if (clear) { setupUnavailable.current = false; pendingLoad.current = null; hasData.current = false; setState(null); setSelectedId(null); setPlacement(null); setLastMove(null); setDragMessage(""); purchase.current = null; }
      if (!hasData.current) setLoading(true);
      const promise = pendingLoad.current ?? getMapShop();
      pendingLoad.current = promise;
      try {
        const next = await promise;
        if (active && request === operation.current) { hasData.current = true; setState(next); setError(""); }
      } catch (reason) {
        if (active && request === operation.current) {
          setupUnavailable.current = isMapShopSetupError(reason);
          setError(setupUnavailable.current ? "Der Laden konnte nicht geladen werden. Versuch es später nochmals." : "Der Laden konnte nicht geladen werden. Lade die Seite neu.");
        }
      } finally {
        if (pendingLoad.current === promise) pendingLoad.current = null;
        if (active && request === operation.current) setLoading(false);
      }
    }
    function onFocus() { if (document.visibilityState === "visible") void load(); }
    // Which items does the server catalogue already know? New items stay "bald erhältlich" until their migration is applied.
    // If the catalogue cannot be read we assume everything is available; map_shop_buy remains the authority.
    void Promise.resolve(supabase.from("map_shop_catalog").select("item_type")).then(({ data, error }) => { if (active && !error) setUnavailable(unavailableShopItems(data)); }, () => undefined);
    void load();
    window.addEventListener("focus", onFocus);
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") { operation.current++; locked.current = false; setBusy(false); void load(true); }
    });
    return () => { active = false; window.removeEventListener("focus", onFocus); listener.subscription.unsubscribe(); };
  }, [refresh, retry, watching]);

  /** Start placing / moving an item. `turn` rotates the ghost by quarter turns right away («Drehen» on a placed item). */
  function start(item: PlaceableItem, turn = 0) {
    if (watching || locked.current || !state || isLockedMapObject(item)) return;
    const position = item.x !== null && item.z !== null ? { x: item.x, z: item.z, rotation: (item.rotation + turn) % 4 } : findFreeMapPosition(item as Parameters<typeof findFreeMapPosition>[0], allItems, maxZ, islandCount);
    setSelectedId(item.id);
    if (!position) { setError("Auf der Baufläche ist kein freier Platz mehr."); return; }
    setError(""); setNotice(""); setHint(""); setPlacement({ item, position });
  }

  async function buy(itemType: ShopItemType) {
    if (watching || locked.current || !state || state.balance < shopCatalog[itemType].price) return;
    setHint("");
    if (unavailable.has(itemType)) { setNotice(""); setHint(SHOP_ITEM_SOON); return; }
    locked.current = true; setBusy(true); setError(""); setNotice(""); setLoading(false);
    const request = ++operation.current;
    if (purchase.current?.itemType !== itemType) purchase.current = { itemType, id: crypto.randomUUID() };
    const id = purchase.current.id;
    try {
      const next = await buyMapItem(itemType, id);
      if (request !== operation.current) return;
      setState(next); purchase.current = null;
      const item = next.items.find((candidate) => candidate.id === id);
      if (item) {
        setSelectedId(item.id);
        const position = findFreeMapPosition(item, [...next.items, ...objects], maxZ, islandCount);
        setPlacement(position ? { item, position } : null);
      }
      setNotice(`${shopCatalog[itemType].name} gekauft.`);
    } catch (reason) {
      if (request === operation.current) {
        // Unknown item on the server (catalogue migration pending): nothing was charged, mark it as "bald erhältlich".
        if (isUnknownShopItemError(reason)) { purchase.current = null; setUnavailable((current) => new Set(current).add(itemType)); setHint(shopBuyErrorMessage(reason)); }
        else setError(shopBuyErrorMessage(reason));
      }
    } finally {
      if (request === operation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function save(item: PlaceableItem, position: MapPosition | null) {
    if (watching || locked.current || !state || isLockedMapObject(item) || (position && !canPlaceMapItem(item, position, allItems, maxZ, islandCount))) return;
    locked.current = true; setBusy(true); setError(""); setNotice(""); setLoading(false);
    const request = ++operation.current;
    try {
      const next = item.itemType === "house" || item.itemType === "street" ? position ? await moveMapObject(item.id, position) : state : await placeMapItem(item.id, position);
      if (request !== operation.current) return;
      setState(next); setPlacement(null);
      setNotice(position ? `${placeableCatalog[item.itemType].name} platziert.` : `${placeableCatalog[item.itemType].name} eingelagert.`);
    } catch {
      if (request === operation.current) setError("Die Position konnte nicht gespeichert werden. Bitte prüfe den freien Platz und versuche es erneut.");
    } finally {
      if (request === operation.current) { locked.current = false; setBusy(false); }
    }
  }

  const say = setDragMessage;
  const dismissMessage = useCallback(() => setDragMessage(""), []);

  /** Drag & drop / undo: optimistic update, server confirms, any error rolls back to the previous state. */
  async function commitMove(item: PlaceableItem, from: MapPosition, to: MapPosition, undoing: boolean) {
    if (watching || locked.current || !state || isLockedMapObject(item) || !canPlaceMapItem(item, to, allItems, maxZ, islandCount)) return false;
    const previous = state;
    locked.current = true; setBusy(true); setError(""); setNotice(""); say(""); setLoading(false);
    const request = ++operation.current;
    setState(applyMove(state, item, to));
    try {
      const next = item.itemType === "house" ? await moveMapObject(item.id, to) : await placeMapItem(item.id, to);
      if (request !== operation.current) return false;
      setState(next);
      setLastMove(undoing ? null : { id: item.id, itemType: item.itemType, from, to });
      setNotice(`${placeableCatalog[item.itemType].name} ${undoing ? "zurückgesetzt" : "verschoben"}.`);
      return true;
    } catch {
      if (request === operation.current) { setState(previous); say("Speichern fehlgeschlagen – der Gegenstand ist an seinen alten Platz zurückgekehrt."); }
      return false;
    } finally {
      if (request === operation.current) { locked.current = false; setBusy(false); }
    }
  }

  function currentPosition(item: PlaceableItem): MapPosition | null { return item.x !== null && item.z !== null ? { x: item.x, z: item.z, rotation: item.rotation } : null; }

  return {
    state, loading, busy, error, notice, hint, unavailable, placement, selectedId, objects, allItems, maxZ, islandCount, lastMove, dragMessage, dismissMessage,
    buy, start, save,
    /** Drop of a drag gesture on a placed item. Returns false if rejected (the item stays where it was). */
    move(id: string, to: MapPosition) {
      const item = allItems.find((candidate) => candidate.id === id);
      const from = item && currentPosition(item);
      if (!item || !from || samePosition(from, to)) return Promise.resolve(false);
      return commitMove(item, from, to, false);
    },
    reject(verdict: DropVerdict) { say(dropMessages[verdict.reason]); },
    undo() {
      const record = lastMove;
      const item = record && allItems.find(({ id }) => id === record.id);
      if (!record || !item) return;
      if (!canPlaceMapItem(item, record.from, allItems, maxZ, islandCount)) { say("Rückgängig nicht möglich – der alte Platz ist inzwischen belegt."); return; }
      const here = currentPosition(item);
      if (here) void commitMove(item, here, record.from, true);
    },
    /** Keyboard alternative: arrow keys shift the pending placement (or start one for the selected, already placed item) by one cell. */
    nudge(key: string) {
      if (watching || locked.current) return false;
      const base = placement ? placement.position : (() => { const item = allItems.find(({ id }) => id === selectedId); return item && !isLockedMapObject(item) ? currentPosition(item) : null; })();
      const target = base && nudgePosition(base, key);
      if (!target) return false;
      if (placement) setPlacement({ ...placement, position: target });
      else { const item = allItems.find(({ id }) => id === selectedId)!; setNotice(""); say(""); setPlacement({ item, position: target }); }
      return true;
    },
    select(id: string) { if (!watching && !locked.current && !id.startsWith("street:")) { setSelectedId(id); setPlacement(null); } },
    position(position: MapPosition) { if (!locked.current) setPlacement((current) => current ? { ...current, position } : null); },
    cancel() { if (!locked.current) { setPlacement(null); say(""); } },
    clearSelection() { if (!locked.current) { setSelectedId(null); setPlacement(null); } },
    retry() { setupUnavailable.current = false; setRetry((current) => current + 1); },
  };
}

type ShopController = ReturnType<typeof useMapShop>;

/** «Verschieben» while placing: the mode is already active; hand the focus to the map so arrow keys move the item. */
function focusMap() { document.querySelector<HTMLElement>('[role="region"][aria-label="3D-Bewerbungsdorf"]')?.focus({ preventScroll: true }); }

/** Items that live on the map for good (houses, streets): they can be moved and turned, not put back into the inventory. */
function canStore(item: PlaceableItem) { return item.itemType !== "house" && item.itemType !== "street"; }

/**
 * Placement / item tools. Phones: a bottom sheet (drag handle) that replaces the tab bar, with the five actions
 * Platzieren / Drehen / Verschieben / Entfernen / Abbrechen always visible as >= 48px buttons; landscape phones: a side card;
 * from 768px: one compact row. The X/Z fields (keyboard / screen-reader alternative to tapping a tile) are always shown from
 * 768px and behind the handle («Position eingeben») on phones.
 */
export function MapPlacementTools({ shop }: { shop: ShopController }) {
  const { dragMessage, lastMove } = shop;
  const { dismissMessage } = shop;
  const [expanded, setExpanded] = useStoredFlag("placement.expanded", false);
  const grip = useRef<{ y: number; pointer: number } | null>(null);
  const swiped = useRef(false);
  useEffect(() => {
    if (!dragMessage) return;
    const timer = window.setTimeout(dismissMessage, 5000);
    return () => window.clearTimeout(timer);
  }, [dragMessage, dismissMessage]);
  const message = dragMessage ? <p role="status" className={styles.dragMessage}>{dragMessage}</p> : null;
  const undoItem = lastMove ? shop.allItems.find(({ id }) => id === lastMove.id) : null;
  const undo = lastMove && undoItem ? <button type="button" disabled={shop.busy} onClick={shop.undo} title="Letztes Verschieben rückgängig machen (Strg+Z)"><Undo2 size={15} />Rückgängig</button> : null;
  const handle = (label: string) => <button
    type="button"
    className={styles.toolsGrip}
    aria-expanded={expanded}
    aria-label={expanded ? `${label}: Positionsfelder ausblenden` : `${label}: Position eingeben`}
    title={expanded ? "Weniger anzeigen" : "Position eingeben"}
    onClick={() => { if (swiped.current) { swiped.current = false; return; } setExpanded(!expanded); }}
    onPointerDown={(event) => { swiped.current = false; grip.current = { y: event.clientY, pointer: event.pointerId }; }}
    onPointerUp={(event) => {
      const start = grip.current; grip.current = null;
      if (!start || start.pointer !== event.pointerId) return;
      const dy = event.clientY - start.y;
      if (Math.abs(dy) < 24) return; // a tap: onClick toggles
      swiped.current = true; // the click that may follow this swipe must not toggle back
      setExpanded(dy < 0);
    }}
  ><span aria-hidden /></button>;

  if (!shop.placement) {
    const item = shop.allItems.find(({ id }) => id === shop.selectedId);
    if (!item || item.x === null || isLockedMapObject(item)) return undo || message ? <div className={styles.moveToast} aria-label="Verschieben">{undo}{message}</div> : null;
    const name = placeableCatalog[item.itemType].name;
    return <div className={styles.placementTools} role="group" aria-label="Ausgewählter Gegenstand" data-map-panel="item">
      <div className={styles.toolsHead}><strong><MapPin size={16} aria-hidden />{name}</strong>{undo}</div>
      <p className={styles.toolsHint}>{canStore(item) ? "Verschieben: neuen Platz antippen. Entfernen: zurück ins Inventar." : "Verschieben: neuen Platz antippen. Oder lange drücken und ziehen."}</p>
      {message}
      <div className={styles.toolsActions} data-count="4">
        <button type="button" disabled={shop.busy} onClick={() => shop.start(item, 1)} title="Um 90 Grad drehen"><RotateCw size={18} aria-hidden /><span>Drehen</span></button>
        <button type="button" className={styles.toolsPrimary} disabled={shop.busy} onClick={() => shop.start(item)} title="Neuen Platz wählen"><Move size={18} aria-hidden /><span>Verschieben</span></button>
        <button type="button" disabled={shop.busy || !canStore(item)} onClick={() => void shop.save(item, null)} title={canStore(item) ? "Zurück ins Inventar legen" : "Häuser und Strassen bleiben im Dorf"}><Package size={18} aria-hidden /><span>Entfernen</span></button>
        <button type="button" disabled={shop.busy} onClick={shop.clearSelection} title="Auswahl schliessen"><X size={18} aria-hidden /><span>Abbrechen</span></button>
      </div>
    </div>;
  }
  const { item, position } = shop.placement;
  const current = shop.allItems.find(({ id }) => id === item.id) ?? item;
  const placed = current.x !== null;
  const valid = canPlaceMapItem(item, position, shop.allItems, shop.maxZ, shop.islandCount);
  const name = placeableCatalog[item.itemType].name;
  return <div className={styles.placementTools} role="group" aria-label="Gegenstand platzieren" data-map-panel="placement" data-expanded={expanded}>
    {handle(name)}
    <div className={styles.toolsHead}><strong><MapPin size={16} aria-hidden />{name}</strong><span className={styles.toolsMeta} aria-label={`Drehung ${position.rotation * 90} Grad`}>{position.rotation * 90}°</span></div>
    {valid ? <p className={styles.toolsHint}>Tippe auf ein Feld, um {placed ? "den Gegenstand dorthin zu verschieben" : "ihn dorthin zu setzen"}. Zwei Finger: zoomen und Karte schieben.</p> : <p role="status" className={styles.toolsInvalid}>Dieser Platz ist belegt oder ausserhalb der Baufläche.</p>}
    <div className={styles.toolsPosition}>
      <label>X<input aria-label="Position X" type="number" inputMode="numeric" enterKeyHint="done" min="-10" max="95" step="1" value={Number.isNaN(position.x) ? "" : position.x} disabled={shop.busy} onChange={(event) => shop.position({ ...position, x: event.target.valueAsNumber })} /></label>
      <label>Z<input aria-label="Position Z" type="number" inputMode="numeric" enterKeyHint="done" min="-7" max="54" step="1" value={Number.isNaN(position.z) ? "" : position.z} disabled={shop.busy} onChange={(event) => shop.position({ ...position, z: event.target.valueAsNumber })} /></label>
    </div>
    {message}
    <div className={styles.toolsActions} data-count="5">
      <button type="button" disabled={shop.busy} onClick={() => shop.position({ ...position, rotation: (position.rotation + 1) % 4 })} title="Um 90 Grad drehen"><RotateCw size={18} aria-hidden /><span>Drehen</span></button>
      <button type="button" aria-pressed="true" disabled={shop.busy} onClick={focusMap} title="Verschieben ist aktiv: neuen Platz antippen, den Gegenstand ziehen oder mit den Pfeiltasten bewegen"><Move size={18} aria-hidden /><span>Verschieben</span></button>
      <button type="button" disabled={shop.busy || !placed || !canStore(current)} onClick={() => void shop.save(current, null)} title={!placed ? "Noch nicht platziert: der Gegenstand ist im Inventar" : canStore(current) ? "Zurück ins Inventar legen" : "Häuser und Strassen bleiben im Dorf"}><Package size={18} aria-hidden /><span>Entfernen</span></button>
      <button type="button" disabled={shop.busy} onClick={shop.cancel} title={placed ? "Abbrechen: bleibt am alten Platz" : "Abbrechen: bleibt im Inventar"}><X size={18} aria-hidden /><span>Abbrechen</span></button>
      <button type="button" className={styles.placeConfirm} disabled={shop.busy || !valid} onClick={() => void shop.save(item, position)}><MapPin size={18} aria-hidden /><span>{shop.busy ? "Speichern ..." : "Platzieren"}</span></button>
    </div>
  </div>;
}

export function MapShop({ shop, compact = false }: { shop: ShopController; compact?: boolean }) {
  const [previews, setPreviews] = useState<Partial<Record<ShopItemType, string>>>({});
  const [category, setCategory] = useState<ShopCategory | "Alle">("Alle");
  useEffect(() => {
    let active = true;
    import("@/lib/map-shop-models").then(({ renderShopPreviews }) => { const result = renderShopPreviews(); if (active) setPreviews(result); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const selected = shop.state?.items.find(({ id }) => id === shop.selectedId);
  const items = shopItemsByCategory(category);
  return <section className={`${styles.shop} ${compact ? styles.shopCompact : ""}`} aria-labelledby="map-shop-title" aria-busy={shop.busy || shop.loading}>
    <header className={styles.shopHeading}><div><h2 id="map-shop-title" className={compact ? "sr-only" : undefined}>Laden</h2><p>{shop.state ? `${shop.state.rewardCount} Bewerbungen belohnt` : "Punktestand wird geladen"}</p></div><div className={styles.points} aria-label="Verfügbare Punkte"><Coins size={20} /><strong>{shop.state?.balance ?? "-"}</strong><span>Punkte</span></div></header>
    {shop.error && <div className={styles.shopError} role="alert">{shop.error}<button type="button" disabled={shop.busy || shop.loading} onClick={shop.retry}>Erneut laden</button></div>}
    <p className={styles.shopNotice} role="status">{shop.notice}</p>
    {shop.hint && <p className={styles.shopHint} role="status" data-testid="shop-hint"><Sparkles size={15} aria-hidden />{shop.hint}</p>}
    <div className={styles.shopTabs} role="group" aria-label="Kategorie">{(["Alle", ...shopCategories] as const).map((name) => {
      const Icon = categoryIcons[name];
      return <button type="button" key={name} aria-pressed={category === name} className={category === name ? styles.shopTabActive : undefined} onClick={() => setCategory(name)}><Icon size={14} />{name}<small>{shopItemsByCategory(name).length}</small></button>;
    })}</div>
    <div className={styles.shopGrid}>{items.map((item) => {
      const { type } = item;
      const Icon = iconFor(type);
      const soon = shop.unavailable.has(type);
      const affordable = shop.state !== null && shop.state.balance >= item.price;
      const rarity = shopRarities[item.rarity];
      return <article className={styles.shopItem} key={type} data-item={type}><div className={`${styles.shopArt} ${styles[`art_${type}`] ?? ""} ${styles[`artCategory_${item.category === "E-Roller" ? "scooter" : item.category === "Autos" ? "car" : "deco"}`] ?? ""}`}>{previews[type] ? <Image unoptimized src={previews[type]} alt={`${item.name}, 3D-Vorschau`} width={320} height={200} /> : <Icon size={34} strokeWidth={1.5} />}</div><h3>{item.name}</h3><span className={styles.shopMeta}><span className={styles.price}><Coins size={14} />{item.price}</span><span className={`${styles.rarity} ${styles[`rarity_${item.rarity}`]}`}>{rarity}</span></span>{soon ? <button type="button" disabled aria-label={`${item.name}: bald erhältlich`}><Sparkles size={14} />Bald</button> : <button type="button" disabled={!affordable || shop.busy || shop.loading} onClick={() => void shop.buy(type)} aria-label={`${item.name} kaufen für ${item.price} Punkte (${rarity})`}><ShoppingCart size={14} />Kaufen</button>}</article>;
    })}</div>
    <div className={styles.inventoryHeading}><h3><Package size={17} />Dein Inventar</h3><span>{shop.state?.items.length ?? 0} Gegenstände</span></div>
    {!shop.state?.items.length ? <p className={styles.inventoryEmpty}>{shop.loading ? "Inventar wird geladen ..." : "Dein Inventar ist leer."}</p> : <div className={styles.inventory}>{shop.state.items.map((item, index) => {
      const Icon = iconFor(item.itemType);
      return <button type="button" key={item.id} className={item.id === shop.selectedId ? styles.inventorySelected : ""} disabled={shop.busy} onClick={() => shop.select(item.id)} aria-pressed={item.id === shop.selectedId}><Icon size={18} /><span><strong>{shopCatalog[item.itemType]?.name ?? "Gegenstand"} #{index + 1}</strong><small>{item.x === null ? "Im Inventar" : `Platziert: ${item.x}, ${item.z}`}</small></span></button>;
    })}</div>}
    {selected && <div className={styles.inventoryActions}><strong>{shopCatalog[selected.itemType]?.name ?? "Gegenstand"}</strong><button type="button" disabled={shop.busy} onClick={() => shop.start(selected)}><LocateFixed size={15} />{selected.x === null ? "Platzieren" : "Verschieben"}</button>{selected.x !== null && <button type="button" disabled={shop.busy} onClick={() => void shop.save(selected, null)} title="Zurück ins Inventar legen"><Package size={15} />Entfernen</button>}</div>}
  </section>;
}
