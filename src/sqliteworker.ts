import * as Comlink from 'comlink';
import { Factory } from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
// Use AccessHandlePoolVFS as it's fast OPFS, it's fine to not have concurrent connections
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS';

const log = console.log;

const sqlite = () => {
	let db: number | null = null;
	let sqlite3: SQLiteAPI | null = null;

    // Used to load an existing remote sqlite db
    // await sqlite.addStaticAssetToOPFS('<db-blob-url>', 'datatest.db');
	async function addStaticAssetToOPFS(url: string, fileName: string) {
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			const fileHash = await computeHash(blob);

			if (await fileExistsWithHash(fileName, fileHash)) {
				log(`File ${fileName} already exists with the same hash.`);
				return;
			}

			await writeFileToOPFS(fileName, blob);
			log(`Added ${fileName} to OPFS`);
		} catch (error) {
			console.error(`Error adding ${fileName} to OPFS:`, error);
		}
	}

	async function computeHash(file) {
		const buffer = await file.arrayBuffer();
		const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	async function fileExistsWithHash(fileName, hash) {
		const root = await navigator.storage.getDirectory();
		try {
			const fileHandle = await root.getFileHandle(fileName);
			const file = await fileHandle.getFile();
			const existingHash = await computeHash(file);
			return existingHash === hash;
		} catch (error) {
			// File doesn't exist
			return false;
		}
	}

	async function writeFileToOPFS(fileName, fileOrBlob) {
		const root = await navigator.storage.getDirectory();
		const fileHandle = await root.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable({ keepExistingData: false });
		await writable.write(fileOrBlob);
		await writable.close();
	}

	const preparation = async () => {
        const SQLiteEMSModule = await SQLiteESMFactory({ locateFile: () => wasmUrl });

		const sqlite = Factory(SQLiteEMSModule);
		const vfs = await AccessHandlePoolVFS.create('sq-vfs', SQLiteEMSModule);

		sqlite.vfs_register(vfs, true);

		return sqlite;
	};

	async function openDb() {
		if (!db) {
			sqlite3 = await preparation();

            db = await sqlite3.open_v2('test.db', sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE, 'sq-vfs');
		}
	}

	async function closeDb() {
		if (db) {
			sqlite3?.close(db);
		}
	}

	return {
		addStaticAssetToOPFS,
		openDb,
		closeDb,
	};
};

export type SqliteType = ReturnType<typeof sqlite>;
const sqliteInstance = sqlite();
Comlink.expose(sqliteInstance);
