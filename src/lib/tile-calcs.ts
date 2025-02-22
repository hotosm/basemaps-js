const WEB_MERCATOR_LAT_LIMIT = 85.05112877980659;

export type Zoom = number;

export interface Point {
  x: number;
  y: number;
}

export interface Bound {
  min: Point;
  max: Point;
}

export interface Tile {
  x: number;
  y: number;
  z: Zoom;
}

export type GenerateBoxesConsumerFunc = (
  ll: Tile,
  ur: Tile,
  z: Zoom
) => void;

export interface GenerateRangesOptions {
  bounds: Bound;
  zooms: Zoom[];
  consumerFunc: GenerateBoxesConsumerFunc;
}

export type GenerateTilesConsumerFunc = (tile: Tile) => void;

export interface GenerateTilesOptions {
  bounds: Bound;
  zooms: Zoom[];
  consumerFunc: GenerateTilesConsumerFunc;
  invertedY?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lngLatToTile(lng: number, lat: number, zoom: Zoom): Tile {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y, z: zoom };
}

export function generateTileRanges(opts: GenerateRangesOptions): void {
  const { bounds, zooms, consumerFunc } = opts;
  
  const boxes: Bound[] =
    bounds.min.x > bounds.max.x
      ? [
          { min: { x: -180.0, y: bounds.min.y }, max: bounds.max },
          { min: bounds.min, max: { x: 180.0, y: bounds.max.y } },
        ]
      : [bounds];

  boxes.forEach((box) => {
    const clampedBox: Bound = {
      min: {
        x: clamp(box.min.x, -180.0, 180.0),
        y: clamp(box.min.y, -WEB_MERCATOR_LAT_LIMIT, WEB_MERCATOR_LAT_LIMIT),
      },
      max: {
        x: clamp(box.max.x, -180.0, 180.0 - 1e-8),
        y: clamp(box.max.y, -WEB_MERCATOR_LAT_LIMIT, WEB_MERCATOR_LAT_LIMIT),
      },
    };

    zooms.forEach((z) => {
      const minTile = lngLatToTile(clampedBox.min.x, clampedBox.min.y, z);
      const maxTile = lngLatToTile(clampedBox.max.x, clampedBox.max.y, z);

      // Flip Y (XYZ tiling scheme adjustment)
      consumerFunc({ ...minTile, y: maxTile.y }, { ...maxTile, y: minTile.y }, z);
    });
  });
}

export function generateTiles(opts: GenerateTilesOptions): void {
  generateTileRanges({
    bounds: opts.bounds,
    zooms: opts.zooms,
    consumerFunc: (minTile, maxTile, z) => {
      for (let x = minTile.x; x <= maxTile.x; x++) {
        for (let y = minTile.y; y <= maxTile.y; y++) {
          const tileY = opts.invertedY ? Math.pow(2, z) - 1 - y : y;
          opts.consumerFunc({ x, y: tileY, z });
        }
      }
    },
  });
}
