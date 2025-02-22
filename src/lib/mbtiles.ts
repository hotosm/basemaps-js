import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';
import path from 'path';
import { Tile } from './tile'; // Equivalent to maptile.Tile
import { parseDSN } from './dsn'; // Assumed helper function
import { Bound } from './bound'; // Equivalent to orb.Bound

interface MbtilesMetadata {
  metadata: Record<string, string>;
  set(name: string, value: string): void;
}

interface MbtilesOutputterOptions {
  dsn: string;
  batchSize: number;
  metadata: MbtilesMetadata;
}

export class MbtilesOutputter {
  private db!: Database;
  private txn: sqlite3.Transaction | null = null;
  private hasTiles = false;
  private batchCount = 0;
  private batchSize: number;
  private metadata: MbtilesMetadata;

  constructor(options: MbtilesOutputterOptions) {
    this.batchSize = options.batchSize;
    this.metadata = options.metadata;
  }

  static async fromDSN(dsnStr: string, batchSize: number, metadata: MbtilesMetadata): Promise<MbtilesOutputter> {
    const dsnMap = parseDSN(dsnStr, ['filename']);
    if (!dsnMap.filename) throw new Error('Invalid DSN: missing filename');

    const db = await open({ filename: dsnMap.filename, driver: sqlite3.Database });
    const outputter = new MbtilesOutputter({ dsn: dsnStr, batchSize, metadata });
    outputter.db = db;
    return outputter;
  }

  async close(): Promise<void> {
    try {
      for (const [name, value] of Object.entries(this.metadata.metadata)) {
        await this.db.run('INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?);', name, value);
      }
      if (this.txn) await this.txn.commit();
      await this.db.close();
    } catch (err) {
      throw new Error(`Failed to close MBTiles: ${err}`);
    }
  }

  async createTiles(): Promise<void> {
    if (this.hasTiles) return;

    const queries = `
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS map (
        zoom_level INTEGER NOT NULL,
        tile_column INTEGER NOT NULL,
        tile_row INTEGER NOT NULL,
        tile_id TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS map_index ON map (zoom_level, tile_column, tile_row);
      CREATE TABLE IF NOT EXISTS images (
        tile_data BLOB NOT NULL,
        tile_id TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS images_id ON images (tile_id);
      CREATE TABLE IF NOT EXISTS metadata (
        name TEXT,
        value TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS name ON metadata (name);
      CREATE VIEW IF NOT EXISTS tiles AS
        SELECT map.zoom_level, map.tile_column, map.tile_row, images.tile_data
        FROM map
        JOIN images ON images.tile_id = map.tile_id;
      COMMIT;
      PRAGMA synchronous=OFF;
    `;

    await this.db.exec(queries);
    this.hasTiles = true;
  }

  async assignSpatialMetadata(bounds: Bound, minZoom: number, maxZoom: number): Promise<void> {
    const center = bounds.center();

    const metadata = {
      bounds: `${bounds.min[0]},${bounds.min[1]},${bounds.max[0]},${bounds.max[1]}`,
      center: `${center[0]},${center[1]},${minZoom}`,
      minzoom: minZoom.toString(),
      maxzoom: maxZoom.toString(),
    };

    for (const [name, value] of Object.entries(metadata)) {
      this.metadata.set(name, value);
    }
  }

  async save(tile: Tile, data: Buffer): Promise<void> {
    await this.createTiles();

    if (!this.txn) {
      this.txn = await this.db.exec('BEGIN TRANSACTION;');
    }

    const tileID = crypto.createHash('md5').update(data).digest('hex');
    const invertedY = Math.pow(2, tile.z) - 1 - tile.y;

    await this.db.run('INSERT OR REPLACE INTO images (tile_id, tile_data) VALUES (?, ?);', tileID, data);
    await this.db.run(
      'INSERT OR REPLACE INTO map (zoom_level, tile_column, tile_row, tile_id) VALUES (?, ?, ?, ?);',
      tile.z, tile.x, invertedY, tileID
    );

    this.batchCount++;

    if (this.batchCount % this.batchSize === 0 && this.txn) {
      await this.db.exec('COMMIT;');
      this.batchCount = 0;
      this.txn = null;
    }
  }
}
