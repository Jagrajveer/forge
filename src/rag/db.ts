/**
 * SQLite FTS5 database for RAG (Retrieval Augmented Generation)
 * Provides semantic search over codebase and documentation
 */
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

export interface DocumentChunk {
  id: string;
  filePath: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  id: string;
  filePath: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  metadata: Record<string, any>;
  rank: number;
  bm25_score: number;
}

export class RAGDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), ".forge", "rag.db");
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    // Enable FTS5 extension
    this.db.exec("PRAGMA journal_mode=WAL");
    
    // Create documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        file_path,
        content,
        metadata,
        content='documents',
        content_rowid='rowid'
      )
    `);

    // Create triggers to keep FTS5 in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, file_path, content, metadata)
        VALUES (new.rowid, new.file_path, new.content, new.metadata);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, file_path, content, metadata)
        VALUES('delete', old.rowid, old.file_path, old.content, old.metadata);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, file_path, content, metadata)
        VALUES('delete', old.rowid, old.file_path, old.content, old.metadata);
        INSERT INTO documents_fts(rowid, file_path, content, metadata)
        VALUES (new.rowid, new.file_path, new.content, new.metadata);
      END
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_chunk_index ON documents(chunk_index)
    `);
  }

  /**
   * Insert or update a document chunk
   */
  insertChunk(chunk: Omit<DocumentChunk, "createdAt" | "updatedAt">): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents 
      (id, file_path, content, chunk_index, total_chunks, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      chunk.id,
      chunk.filePath,
      chunk.content,
      chunk.chunkIndex,
      chunk.totalChunks,
      JSON.stringify(chunk.metadata),
      now,
      now
    );
  }

  /**
   * Insert multiple chunks in a transaction
   */
  insertChunks(chunks: Omit<DocumentChunk, "createdAt" | "updatedAt">[]): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents 
      (id, file_path, content, chunk_index, total_chunks, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((chunks: Omit<DocumentChunk, "createdAt" | "updatedAt">[]) => {
      for (const chunk of chunks) {
        stmt.run(
          chunk.id,
          chunk.filePath,
          chunk.content,
          chunk.chunkIndex,
          chunk.totalChunks,
          JSON.stringify(chunk.metadata),
          now,
          now
        );
      }
    });

    insertMany(chunks);
  }

  /**
   * Search documents using FTS5 with BM25 ranking
   */
  search(query: string, limit: number = 10, filePath?: string): SearchResult[] {
    let sql = `
      SELECT 
        d.id,
        d.file_path,
        d.content,
        d.chunk_index,
        d.total_chunks,
        d.metadata,
        bm25(documents_fts) as bm25_score,
        rank
      FROM documents_fts
      JOIN documents d ON documents_fts.rowid = d.rowid
      WHERE documents_fts MATCH ?
    `;

    const params: any[] = [query];

    if (filePath) {
      sql += ` AND d.file_path = ?`;
      params.push(filePath);
    }

    sql += ` ORDER BY bm25_score DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      content: row.content,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      metadata: JSON.parse(row.metadata),
      rank: row.rank || 0,
      bm25_score: row.bm25_score
    }));
  }

  /**
   * Search with semantic similarity (using content similarity)
   */
  searchSimilar(content: string, limit: number = 10, threshold: number = 0.7): SearchResult[] {
    // This is a simplified similarity search
    // In a real implementation, you'd use embeddings
    const sql = `
      SELECT 
        id,
        file_path,
        content,
        chunk_index,
        total_chunks,
        metadata,
        0 as bm25_score,
        0 as rank
      FROM documents
      WHERE content LIKE ?
      ORDER BY LENGTH(content) DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(`%${content}%`, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      content: row.content,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      metadata: JSON.parse(row.metadata),
      rank: 0,
      bm25_score: 0
    }));
  }

  /**
   * Get all chunks for a specific file
   */
  getFileChunks(filePath: string): DocumentChunk[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        file_path,
        content,
        chunk_index,
        total_chunks,
        metadata,
        created_at,
        updated_at
      FROM documents
      WHERE file_path = ?
      ORDER BY chunk_index
    `);

    const rows = stmt.all(filePath) as any[];

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      content: row.content,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Delete all chunks for a specific file
   */
  deleteFileChunks(filePath: string): void {
    const stmt = this.db.prepare("DELETE FROM documents WHERE file_path = ?");
    stmt.run(filePath);
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalChunks: number;
    totalFiles: number;
    totalSize: number;
    averageChunkSize: number;
  } {
    const totalChunks = this.db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number };
    const totalFiles = this.db.prepare("SELECT COUNT(DISTINCT file_path) as count FROM documents").get() as { count: number };
    const totalSize = this.db.prepare("SELECT SUM(LENGTH(content)) as size FROM documents").get() as { size: number };

    return {
      totalChunks: totalChunks.count,
      totalFiles: totalFiles.count,
      totalSize: totalSize.size || 0,
      averageChunkSize: totalChunks.count > 0 ? Math.round((totalSize.size || 0) / totalChunks.count) : 0
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.db.exec("DELETE FROM documents");
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}
