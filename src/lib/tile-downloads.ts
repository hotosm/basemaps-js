import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

export interface Tile {
  x: number;
  y: number;
  z: number;
}

export interface TileRequest {
  tile: Tile;
  url: string;
}

export interface TileResponse {
  tile: Tile;
  data: Buffer;
  elapsed: number;
}

export class HTTPError extends Error {
  constructor(public code: number, public status: string) {
    super(status);
  }
}

const httpUserAgent = 'ts-tilepacks/1.0';

export class XYZJobGenerator {
  private httpClient: AxiosInstance;

  constructor(
    private urlTemplate: string,
    private bounds: { minX: number; minY: number; maxX: number; maxY: number },
    private zooms: number[],
    private invertedY = false,
    private ensureGzip = false,
    timeout = 10000
  ) {
    this.httpClient = axios.create({
      timeout,
      headers: { 'User-Agent': httpUserAgent, 'Accept-Encoding': 'gzip' },
    });
  }

  private async doHTTPWithRetry(url: string, retries = 30): Promise<AxiosResponse<Buffer>> {
    let delay = 500;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.httpClient.get(url, { responseType: 'arraybuffer' });
        if (response.status === 200) return response;
        if (response.status < 500 || response.status >= 600) throw new HTTPError(response.status, response.statusText);
      } catch (err) {
        if (i === retries - 1) throw err;
      }

      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * 2, 30000);
    }

    throw new Error(`Exceeded retries for URL: ${url}`);
  }

  async createWorker() {
    return async (jobs: AsyncIterable<TileRequest>, results: AsyncGenerator<TileResponse>) => {
      for await (const request of jobs) {
        const start = Date.now();

        try {
          const response = await this.doHTTPWithRetry(request.url);
          let data = response.data;

          if (this.ensureGzip && response.headers['content-encoding'] !== 'gzip') {
            data = await gzip(data);
          }

          yield { tile: request.tile, data, elapsed: (Date.now() - start) / 1000 };
        } catch (err) {
          console.error(`Error fetching tile ${request.url}:`, err);
        }
      }
    };
  }

  *createJobs(): Generator<TileRequest> {
    for (const z of this.zooms) {
      for (let x = this.bounds.minX; x <= this.bounds.maxX; x++) {
        for (let y = this.bounds.minY; y <= this.bounds.maxY; y++) {
          const tileY = this.invertedY ? (1 << z) - 1 - y : y;
          const url = this.urlTemplate.replace('{x}', `${x}`).replace('{y}', `${tileY}`).replace('{z}', `${z}`);
          yield { tile: { x, y: tileY, z }, url };
        }
      }
    }
  }
}
