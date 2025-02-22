# basemaps-js

Generate mbtiles and pmtiles directly in the browser.

The goal:
- Generate raster basemaps from a TMS URL, without a server required.
- Insert tiles into WASM-based SQLite for mbtiles.
- Convert mbtiles --> pmtiles.
- Entirely replace the proposed https://github.com/hotosm/basemaps-api

> Note at attempt was first made to build go-tilepacks to WASI and
> load directly in a browser.
>
> This approach was abandoned for two reasons:
>
> - No networking capability in WASI!
> - SQLite filesystem writing fails.
