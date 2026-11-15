-- Shop v2: sports cars (2x1) and e-scooters (1x1) for the village shop.
-- Purely additive: inserts new catalogue rows only. Existing rows, wallets and inventories stay untouched.
-- Prices and footprints must match shopCatalog in lib/map-shop.ts (checked by tests/map-shop-v2.test.mjs).
insert into public.map_shop_catalog (item_type, price, width, depth) values
  ('scooter_city_mint', 60, 1, 1),
  ('scooter_city_lilac', 60, 1, 1),
  ('scooter_sport_black', 120, 1, 1),
  ('scooter_sport_lime', 120, 1, 1),
  ('scooter_retro_cream', 220, 1, 1),
  ('scooter_retro_sky', 220, 1, 1),
  ('scooter_retro_coral', 240, 1, 1),
  ('car_porsche', 400, 2, 1),
  ('car_audi_r8', 450, 2, 1),
  ('car_amg', 550, 2, 1),
  ('car_mclaren', 900, 2, 1),
  ('car_aston_martin', 1100, 2, 1),
  ('car_ferrari', 1600, 2, 1),
  ('car_lamborghini', 1900, 2, 1),
  ('car_bugatti', 2800, 2, 1)
on conflict (item_type) do nothing;
