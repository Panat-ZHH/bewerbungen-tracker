#!/bin/sh
# Converts the raw 2x captures of scripts/marketing-shots.mjs into the optimised WebP files used on the public pages.
# Desktop: 1600 px wide, mobile (manifest narrow screenshot): native 780 px; WebP quality 80. Needs ImageMagick + cwebp.
# Usage: sh scripts/marketing-images.sh <raw dir>
set -e
RAW=${1:-"$HOME/Projects/bewerbungen-tracker-wt/seo-shots/raw"}
TMP=$(mktemp -d)
web() { magick "$RAW/$1.png" -resize "$3x>" -strip "$TMP/x.png" && cwebp -quiet -q 80 -m 6 "$TMP/x.png" -o "$2"; }
for t in light dark; do
  web "dashboard-$t" "public/landing/04-dashboard-$t.webp" 1600
  web "search-$t" "public/landing/05-search-$t.webp" 1600
  web "teacher-$t" "public/landing/24-teacher-dashboard-$t.webp" 1600
  web "familie-$t" "public/landing/familie-overview-$t.webp" 1600
  web "dorf-$t" "public/guide/dorf-$t.webp" 1600
done
web "m-search-light" "public/icons/screenshot-narrow.webp" 800
rm -r "$TMP"
