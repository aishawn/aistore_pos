import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type SavedResponse = { status: number; body: Record<string, unknown> };
export type RfqReservation = { state: "NEW" | "PENDING" | "CONFLICT" } | { state: "DONE"; response: SavedResponse };

/** Reservations are durable and never expire: a timeout must not create a second RFQ. */
export class RfqJournal {
  private readonly path: string;
  constructor(path: string) { this.path = path; }

  private open() {
    mkdirSync(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path, { timeout: 5000 });
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
    db.exec(`CREATE TABLE IF NOT EXISTS rfq_request (
      scope TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
      response TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (scope, request_id)
    )`);
    return db;
  }

  reserve(scope: string, requestId: string, digest: string): RfqReservation {
    const db = this.open();
    try {
      const inserted = db.prepare("INSERT OR IGNORE INTO rfq_request(scope, request_id, digest) VALUES (?, ?, ?)").run(scope, requestId, digest);
      if (Number(inserted.changes) === 1) return { state: "NEW" };
      const row = db.prepare("SELECT digest, response FROM rfq_request WHERE scope=? AND request_id=?").get(scope, requestId);
      if (!row || row.digest !== digest) return { state: "CONFLICT" };
      return row.response ? { state: "DONE", response: JSON.parse(String(row.response)) as SavedResponse } : { state: "PENDING" };
    } finally { db.close(); }
  }

  complete(scope: string, requestId: string, digest: string, response: SavedResponse) {
    const db = this.open();
    try {
      const result = db.prepare("UPDATE rfq_request SET response=? WHERE scope=? AND request_id=? AND digest=? AND response IS NULL")
        .run(JSON.stringify(response), scope, requestId, digest);
      if (Number(result.changes) !== 1) throw new Error("RFQ request receipt could not be saved");
    } finally { db.close(); }
  }
}
