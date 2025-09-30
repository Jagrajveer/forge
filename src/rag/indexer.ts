/**
 * RAG Indexer - File chunking and metadata extraction
 * Processes codebase files and creates searchable chunks
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { RAGDatabase, type DocumentChunk } from "./db.js";
import chalk from "chalk";

export interface IndexerOptions {
  includePatterns: string[];
  excludePatterns: string[];
  chunkSize: number;
  chunkOverlap: number;
  maxFileSize: number; // in bytes
  extractMetadata: boolean;
}

export interface FileMetadata {
  language: string;
  size: number;
  lines: number;
  functions: string[];
  classes: string[];
  imports: string[];
  exports: string[];
  lastModified: number;
}

export class RAGIndexer {
  private db: RAGDatabase;
  private options: IndexerOptions;

  constructor(db: RAGDatabase, options: Partial<IndexerOptions> = {}) {
    this.db = db;
    this.options = {
      includePatterns: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx", "**/*.md", "**/*.txt", "**/*.json"],
      excludePatterns: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/coverage/**", "**/*.test.*", "**/*.spec.*"],
      chunkSize: 1000,
      chunkOverlap: 200,
      maxFileSize: 1024 * 1024, // 1MB
      extractMetadata: true,
      ...options
    };
  }

  /**
   * Index all files matching the patterns
   */
  async indexFiles(rootDir: string = process.cwd()): Promise<{
    indexedFiles: number;
    totalChunks: number;
    errors: Array<{ file: string; error: string }>;
  }> {
    console.log(chalk.blue("🔍 Scanning for files to index..."));
    
    const files = await this.findFiles(rootDir);
    console.log(chalk.green(`Found ${files.length} files to index`));

    let indexedFiles = 0;
    let totalChunks = 0;
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      try {
        const chunks = await this.indexFile(file);
        if (chunks.length > 0) {
          this.db.insertChunks(chunks);
          indexedFiles++;
          totalChunks += chunks.length;
          console.log(chalk.gray(`  ✓ ${file} (${chunks.length} chunks)`));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ file, error: errorMsg });
        console.log(chalk.red(`  ✗ ${file}: ${errorMsg}`));
      }
    }

    return { indexedFiles, totalChunks, errors };
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<Omit<DocumentChunk, "createdAt" | "updatedAt">[]> {
    const stats = fs.statSync(filePath);
    
    if (stats.size > this.options.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.options.maxFileSize})`);
    }

    const content = fs.readFileSync(filePath, "utf8");
    const metadata = this.options.extractMetadata ? this.extractMetadata(filePath, content) : {
      language: 'unknown',
      size: content.length,
      lines: content.split('\n').length,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      lastModified: Date.now()
    };
    
    const chunks = this.chunkContent(content, filePath, metadata);
    
    return chunks;
  }

  /**
   * Find all files matching the include/exclude patterns
   */
  private async findFiles(rootDir: string): Promise<string[]> {
    const allFiles: string[] = [];
    
    for (const pattern of this.options.includePatterns) {
      const files = await glob(pattern, {
        cwd: rootDir,
        absolute: true,
        ignore: this.options.excludePatterns
      });
      allFiles.push(...files);
    }

    // Remove duplicates and sort
    return [...new Set(allFiles)].sort();
  }

  /**
   * Chunk content into smaller pieces for indexing
   */
  private chunkContent(
    content: string, 
    filePath: string, 
    metadata: FileMetadata
  ): Omit<DocumentChunk, "createdAt" | "updatedAt">[] {
    const chunks: Omit<DocumentChunk, "createdAt" | "updatedAt">[] = [];
    
    // For code files, try to chunk by functions/classes
    if (this.isCodeFile(filePath)) {
      const semanticChunks = this.chunkBySemantics(content, filePath, metadata);
      if (semanticChunks.length > 0) {
        return semanticChunks;
      }
    }

    // Fallback to sliding window chunking
    const lines = content.split('\n');
    const chunkSize = this.options.chunkSize;
    const overlap = this.options.chunkOverlap;

    for (let i = 0; i < lines.length; i += chunkSize - overlap) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join('\n').trim();
      
      if (chunkContent.length === 0) continue;

      const chunk: Omit<DocumentChunk, "createdAt" | "updatedAt"> = {
        id: `${filePath}:${i}`,
        filePath,
        content: chunkContent,
        chunkIndex: Math.floor(i / (chunkSize - overlap)),
        totalChunks: Math.ceil(lines.length / (chunkSize - overlap)),
        metadata: {
          ...metadata,
          startLine: i + 1,
          endLine: Math.min(i + chunkSize, lines.length),
          chunkType: 'sliding_window'
        }
      };

      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Chunk content by semantic boundaries (functions, classes, etc.)
   */
  private chunkBySemantics(
    content: string, 
    filePath: string, 
    metadata: FileMetadata
  ): Omit<DocumentChunk, "createdAt" | "updatedAt">[] {
    const chunks: Omit<DocumentChunk, "createdAt" | "updatedAt">[] = [];
    const lines = content.split('\n');
    
    // Group functions and classes into chunks
    const semanticBlocks: Array<{ start: number; end: number; type: string; name: string }> = [];
    
    // Find function definitions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // TypeScript/JavaScript function patterns
      if (line.match(/^(export\s+)?(async\s+)?function\s+\w+/)) {
        const end = this.findBlockEnd(lines, i);
        semanticBlocks.push({
          start: i,
          end,
          type: 'function',
          name: this.extractFunctionName(line)
        });
      }
      
      // Class definitions
      if (line.match(/^(export\s+)?class\s+\w+/)) {
        const end = this.findBlockEnd(lines, i);
        semanticBlocks.push({
          start: i,
          end,
          type: 'class',
          name: this.extractClassName(line)
        });
      }
      
      // Interface definitions
      if (line.match(/^(export\s+)?interface\s+\w+/)) {
        const end = this.findBlockEnd(lines, i);
        semanticBlocks.push({
          start: i,
          end,
          type: 'interface',
          name: this.extractInterfaceName(line)
        });
      }
    }

    // Create chunks from semantic blocks
    let chunkIndex = 0;
    for (const block of semanticBlocks) {
      const blockContent = lines.slice(block.start, block.end + 1).join('\n');
      
      chunks.push({
        id: `${filePath}:${block.start}`,
        filePath,
        content: blockContent,
        chunkIndex: chunkIndex++,
        totalChunks: semanticBlocks.length,
        metadata: {
          ...metadata,
          startLine: block.start + 1,
          endLine: block.end + 1,
          chunkType: 'semantic',
          blockType: block.type,
          blockName: block.name
        }
      });
    }

    return chunks;
  }

  /**
   * Extract metadata from file content
   */
  private extractMetadata(filePath: string, content: string): FileMetadata {
    const lines = content.split('\n');
    const language = this.getLanguage(filePath);
    
    const metadata: FileMetadata = {
      language,
      size: content.length,
      lines: lines.length,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      lastModified: fs.statSync(filePath).mtime.getTime()
    };

    // Extract functions, classes, imports, exports
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Functions
      const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        metadata.functions.push(funcMatch[3]);
      }
      
      // Classes
      const classMatch = trimmed.match(/^(export\s+)?class\s+(\w+)/);
      if (classMatch) {
        metadata.classes.push(classMatch[2]);
      }
      
      // Imports
      const importMatch = trimmed.match(/^import\s+.*from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        metadata.imports.push(importMatch[1]);
      }
      
      // Exports
      const exportMatch = trimmed.match(/^export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/);
      if (exportMatch) {
        metadata.exports.push(exportMatch[1]);
      }
    }

    return metadata;
  }

  /**
   * Get programming language from file extension
   */
  private getLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.md': 'markdown',
      '.json': 'json',
      '.txt': 'text',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp'
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Check if file is a code file
   */
  private isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.hpp'].includes(ext);
  }

  /**
   * Find the end of a code block (function, class, etc.)
   */
  private findBlockEnd(lines: string[], start: number): number {
    let braceCount = 0;
    let inBlock = false;
    
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inBlock = true;
        } else if (char === '}') {
          braceCount--;
          if (inBlock && braceCount === 0) {
            return i;
          }
        }
      }
    }
    
    return lines.length - 1;
  }

  /**
   * Extract function name from function declaration
   */
  private extractFunctionName(line: string): string {
    const match = line.match(/function\s+(\w+)/);
    return match ? match[1] : 'anonymous';
  }

  /**
   * Extract class name from class declaration
   */
  private extractClassName(line: string): string {
    const match = line.match(/class\s+(\w+)/);
    return match ? match[1] : 'Anonymous';
  }

  /**
   * Extract interface name from interface declaration
   */
  private extractInterfaceName(line: string): string {
    const match = line.match(/interface\s+(\w+)/);
    return match ? match[1] : 'Anonymous';
  }

  /**
   * Re-index a specific file (delete old chunks and create new ones)
   */
  async reindexFile(filePath: string): Promise<number> {
    // Delete existing chunks
    this.db.deleteFileChunks(filePath);
    
    // Index the file again
    const chunks = await this.indexFile(filePath);
    if (chunks.length > 0) {
      this.db.insertChunks(chunks);
    }
    
    return chunks.length;
  }

  /**
   * Get indexer options
   */
  getOptions(): IndexerOptions {
    return { ...this.options };
  }

  /**
   * Update indexer options
   */
  updateOptions(newOptions: Partial<IndexerOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}
