# Hurá do Vinařic

Vinařice u Kladna jako 3D otevřený svět v prohlížeči (Three.js), postavený z otevřených dat OpenStreetMap,
RÚIAN a ČÚZK. Samostatná hra vycházející z Hrej Hradec.

## Spuštění

```bash
python3 tools/serve.py 8643
```

Pak otevři <http://localhost:8643>.

## Co ve hře je

- ~3 900 budov podle skutečných půdorysů, počet podlaží z RÚIAN, šikmé střechy (sedlové i valbové) s barvou krytiny z ortofota
- náměstí ve Vinařicích (start), hornický skanzen Mayrau s ocelovou těžní věží a cihlovými budovami, věznice Vinařice,
  Vinařická hora s lomy a vyhlídkou (413 m n. m.), hornické kolonie, Švermov, Hnidousy, Motyčín
- autobusové linky PID 330, 565 a 602 po skutečných trasách se skutečnými zastávkami, dá se nastoupit a vystoupit
- krádež aut, policie s hledaností 1–5 ★ (při 4 ★ a víc tě zatčení odveze do věznice Vinařice), vrtulník záchranky
  s přistávací plochou u dolu Mayrau, taxi zakázky, den a noc, počasí, minimapa, velká mapa (M), teleport (T)

## Data (vše ve `tools/`)

Herní svět = čtverec ±1600 m kolem náměstí (50.17585 N, 14.09106 E).

1. `python3 -I tools/fetch_osm.py tools/_osm`: Overpass dotazy (budovy, ulice, voda, zeleň, zastávky, autobusové relace, náměstí a parkoviště).
2. `python3 -I tools/build_data.py tools/_osm/main.json tools/_osm/routes.json data/vinarice.json tools/_osm/areas.json`
3. `python3 -I tools/build_terrain.py data/terrain.bin tools/_osm/dmr5g_cache.tif`: ČÚZK DMR 5G, mřížka 2 m (potřebuje Pillow).
4. `python3 -I tools/build_ortho.py tools/_osm/ortho_cache data/ortho`: ortofoto ČÚZK z18 (~0,4 m/px), 2×2 díly `hi` (4096 px) a `lo` (2048 px).

V OSM nejsou u vinařických budov výšky, jen podlaží z RÚIAN: výška = podlaží × 3 m + sokl, obytné a veřejné domy
mají navíc šikmou střechu. Data © přispěvatelé OpenStreetMap (ODbL), ortofoto a DMR 5G © ČÚZK.

## Modely

- `assets/cars/`: Kenney Car Kit (CC0)
- `assets/chars/`: Quaternius Ultimate Animated Character Pack (CC0)
