"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Armchair, Coins, FerrisWheel, Flower2, LocateFixed, MapPin, Package, RotateCw, Route, ShoppingCart, TreePine, Waves, X } from "lucide-react";
import { buyMapItem, getMapShop, moveMapObject, placeMapItem } from "@/lib/storage";
import { canPlaceMapItem, findFreeMapPosition, isMapShopSetupError, placeableCatalog, shopCatalog, villageDepth, villageObjects, type MapPosition, type MapShopState, type PlaceableItem, type Placement, type ShopItemType } from "@/lib/map-shop";
import type { Application } from "@/types";
import { supabase } from "@/lib/supabase";
import styles from "@/app/map/map.module.css";

const icons = { road: Route, flowers: Flower2, tree: TreePine, bench: Armchair, fountain: Waves, amusement_park: FerrisWheel };

export function useMapShop(refresh: number, applications: Application[]) {
  const [state, setState] = useState<MapShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const operation = useRef(0);
  const locked = useRef(false);
  const hasData = useRef(false);
  const setupUnavailable = useRef(false);
  const pendingLoad = useRef<Promise<MapShopState> | null>(null);
  const purchase = useRef<{ itemType: ShopItemType; id: string } | null>(null);
  const objects = villageObjects(applications, state?.layouts ?? []);
  const allItems = [...(state?.items ?? []), ...objects];
  const maxZ = villageDepth(applications);

  useEffect(() => {
    let active = true;
    async function load(clear = false) {
      if (locked.current || (setupUnavailable.current && !clear)) return;
      const request = ++operation.current;
      if (clear) { setupUnavailable.current = false; pendingLoad.current = null; hasData.current = false; setState(null); setSelectedId(null); setPlacement(null); purchase.current = null; }
      if (!hasData.current) setLoading(true);
      const promise = pendingLoad.current ?? getMapShop();
      pendingLoad.current = promise;
      try {
        const next = await promise;
        if (active && request === operation.current) { hasData.current = true; setState(next); setError(""); }
      } catch (reason) {
        if (active && request === operation.current) {
          setupUnavailable.current = isMapShopSetupError(reason);
          setError(setupUnavailable.current ? "Der Shop ist noch nicht eingerichtet. Das aktualisierte Supabase-Schema muss zuerst eingespielt werden." : "Der Shop konnte nicht geladen werden.");
        }
      } finally {
        if (pendingLoad.current === promise) pendingLoad.current = null;
        if (active && request === operation.current) setLoading(false);
      }
    }
    function onFocus() { if (document.visibilityState === "visible") void load(); }
    void load();
    window.addEventListener("focus", onFocus);
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") { operation.current++; locked.current = false; setBusy(false); void load(true); }
    });
    return () => { active = false; window.removeEventListener("focus", onFocus); listener.subscription.unsubscribe(); };
  }, [refresh, retry]);

  function start(item: PlaceableItem) {
    if (locked.current || !state) return;
    const position = item.x !== null && item.z !== null ? { x: item.x, z: item.z, rotation: item.rotation } : findFreeMapPosition(item as Parameters<typeof findFreeMapPosition>[0], allItems, maxZ);
    setSelectedId(item.id);
    if (!position) { setError("Auf der Baufläche ist kein freier Platz mehr."); return; }
    setError(""); setNotice(""); setPlacement({ item, position });
  }

  async function buy(itemType: ShopItemType) {
    if (locked.current || !state || state.balance < shopCatalog[itemType].price) return;
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
        const position = findFreeMapPosition(item, [...next.items, ...objects], maxZ);
        setPlacement(position ? { item, position } : null);
      }
      setNotice(`${shopCatalog[itemType].name} gekauft.`);
    } catch (reason) {
      if (request === operation.current) setError(reason instanceof Error && reason.message.includes("INSUFFICIENT_POINTS") ? "Du hast nicht genügend Punkte. Bitte aktualisiere den Shop." : "Der Kauf konnte nicht bestätigt werden. Bitte versuche es erneut.");
    } finally {
      if (request === operation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function save(item: PlaceableItem, position: MapPosition | null) {
    if (locked.current || !state || (position && !canPlaceMapItem(item, position, allItems, maxZ))) return;
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

  return {
    state, loading, busy, error, notice, placement, selectedId, objects, allItems, maxZ,
    buy, start, save,
    select(id: string) { if (!locked.current) { setSelectedId(id); setPlacement(null); } },
    position(position: MapPosition) { if (!locked.current) setPlacement((current) => current ? { ...current, position } : null); },
    cancel() { if (!locked.current) setPlacement(null); },
    clearSelection() { if (!locked.current) { setSelectedId(null); setPlacement(null); } },
    retry() { setupUnavailable.current = false; setRetry((current) => current + 1); },
  };
}

type ShopController = ReturnType<typeof useMapShop>;

export function MapPlacementTools({ shop }: { shop: ShopController }) {
  if (!shop.placement) {
    const item = shop.allItems.find(({ id }) => id === shop.selectedId);
    if (!item || item.x === null) return null;
    return <div className={styles.placementTools} aria-label="Ausgewählter Gegenstand"><strong>{placeableCatalog[item.itemType].name}</strong><button type="button" disabled={shop.busy} onClick={() => shop.start(item)}><LocateFixed size={15} />Verschieben</button>{item.itemType !== "house" && item.itemType !== "street" && <button type="button" disabled={shop.busy} onClick={() => void shop.save(item, null)}><Package size={15} />Einlagern</button>}<button type="button" title="Auswahl schließen" aria-label="Auswahl schließen" disabled={shop.busy} onClick={shop.clearSelection}><X size={17} /></button></div>;
  }
  const { item, position } = shop.placement;
  const valid = canPlaceMapItem(item, position, shop.allItems, shop.maxZ);
  return <div className={styles.placementTools} aria-label="Gegenstand platzieren">
    <strong><MapPin size={16} />{placeableCatalog[item.itemType].name}</strong>
    <label>X<input aria-label="Position X" type="number" min="-10" max="32" step="1" value={Number.isNaN(position.x) ? "" : position.x} disabled={shop.busy} onChange={(event) => shop.position({ ...position, x: event.target.valueAsNumber })} /></label>
    <label>Z<input aria-label="Position Z" type="number" min="-7" max={shop.maxZ - 1} step="1" value={Number.isNaN(position.z) ? "" : position.z} disabled={shop.busy} onChange={(event) => shop.position({ ...position, z: event.target.valueAsNumber })} /></label>
    <button type="button" title="Um 90 Grad drehen" aria-label="Um 90 Grad drehen" disabled={shop.busy} onClick={() => shop.position({ ...position, rotation: (position.rotation + 1) % 4 })}><RotateCw size={17} /></button>
    <span>{position.rotation * 90}°</span>
    <button type="button" className={styles.placeConfirm} disabled={shop.busy || !valid} onClick={() => void shop.save(item, position)}><MapPin size={15} />{shop.busy ? "Speichern ..." : "Platzieren"}</button>
    <button type="button" title="Platzierung abbrechen" aria-label="Platzierung abbrechen" disabled={shop.busy} onClick={shop.cancel}><X size={17} /></button>
    {!valid && <p role="status">Dieser Platz ist belegt oder außerhalb der Baufläche.</p>}
  </div>;
}

export function MapShop({ shop, compact = false }: { shop: ShopController; compact?: boolean }) {
  const [previews, setPreviews] = useState<Partial<Record<ShopItemType, string>>>({});
  useEffect(() => {
    let active = true;
    import("@/lib/map-shop-models").then(({ renderShopPreviews }) => { const result = renderShopPreviews(); if (active) setPreviews(result); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const selected = shop.state?.items.find(({ id }) => id === shop.selectedId);
  return <section className={`${styles.shop} ${compact ? styles.shopCompact : ""}`} aria-labelledby="map-shop-title" aria-busy={shop.busy || shop.loading}>
    <header className={styles.shopHeading}><div><h2 id="map-shop-title" className={compact ? "sr-only" : undefined}>Shop</h2><p>{shop.state ? `${shop.state.rewardCount} Bewerbungen belohnt` : "Punktestand wird geladen"}</p></div><div className={styles.points} aria-label="Verfügbare Punkte"><Coins size={20} /><strong>{shop.state?.balance ?? "-"}</strong><span>Punkte</span></div></header>
    {shop.error && <div className={styles.shopError} role="alert">{shop.error}<button type="button" disabled={shop.busy || shop.loading} onClick={shop.retry}>Erneut laden</button></div>}
    <p className={styles.shopNotice} role="status">{shop.notice}</p>
    <div className={styles.shopGrid}>{(Object.entries(shopCatalog) as [ShopItemType, typeof shopCatalog[ShopItemType]][]).map(([type, item]) => {
      const Icon = icons[type];
      const affordable = shop.state !== null && shop.state.balance >= item.price;
      return <article className={styles.shopItem} key={type}><div className={`${styles.shopArt} ${styles[`art_${type}`]}`}>{previews[type] ? <Image unoptimized src={previews[type]} alt={`${item.name}, 3D-Vorschau`} width={320} height={200} /> : <Icon size={34} strokeWidth={1.5} />}</div><h3>{item.name}</h3><span className={styles.price}><Coins size={14} />{item.price}</span><button type="button" disabled={!affordable || shop.busy || shop.loading} onClick={() => void shop.buy(type)} aria-label={`${item.name} kaufen für ${item.price} Punkte`}><ShoppingCart size={14} />Kaufen</button></article>;
    })}</div>
    <div className={styles.inventoryHeading}><h3><Package size={17} />Dein Inventar</h3><span>{shop.state?.items.length ?? 0} Gegenstände</span></div>
    {!shop.state?.items.length ? <p className={styles.inventoryEmpty}>{shop.loading ? "Inventar wird geladen ..." : "Dein Inventar ist leer."}</p> : <div className={styles.inventory}>{shop.state.items.map((item, index) => {
      const Icon = icons[item.itemType];
      return <button type="button" key={item.id} className={item.id === shop.selectedId ? styles.inventorySelected : ""} disabled={shop.busy} onClick={() => shop.select(item.id)} aria-pressed={item.id === shop.selectedId}><Icon size={18} /><span><strong>{shopCatalog[item.itemType].name} #{index + 1}</strong><small>{item.x === null ? "Im Inventar" : `Platziert: ${item.x}, ${item.z}`}</small></span></button>;
    })}</div>}
    {selected && <div className={styles.inventoryActions}><strong>{shopCatalog[selected.itemType].name}</strong><button type="button" disabled={shop.busy} onClick={() => shop.start(selected)}><LocateFixed size={15} />{selected.x === null ? "Platzieren" : "Verschieben"}</button>{selected.x !== null && <button type="button" disabled={shop.busy} onClick={() => void shop.save(selected, null)}><Package size={15} />Einlagern</button>}</div>}
  </section>;
}