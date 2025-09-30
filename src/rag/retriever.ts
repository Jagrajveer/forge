/**
 * RAG Retriever - BM25 ranking and top-k retrieval
 * Provides semantic search and context retrieval for RAG
 */
import { RAGDatabase, type SearchResult, type DocumentChunk } from "./db.js";

export interface RetrievalOptions {
  topK: number;
  minScore: number;
  includeMetadata: boolean;
  groupByFile: boolean;
  maxChunksPerFile: number;
}

export interface RetrievalContext {
  query: string;
  results: SearchResult[];
  totalResults: number;
  processingTimeMs: number;
  metadata: {
    queryType: 'semantic' | 'keyword' | 'hybrid';
    searchScope: 'all' | 'code' | 'docs';
    filters: Record<string, any>;
  };
}

export interface ContextChunk {
  content: string;
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
  metadata: Record<string, any>;
  context: string; // surrounding context
}

export class RAGRetriever {
  private db: RAGDatabase;
  private options: RetrievalOptions;

  constructor(db: RAGDatabase, options: Partial<RetrievalOptions> = {}) {
    this.db = db;
    this.options = {
      topK: 10,
      minScore: 0.1,
      includeMetadata: true,
      groupByFile: false,
      maxChunksPerFile: 3,
      ...options
    };
  }

  /**
   * Retrieve relevant chunks for a query
   */
  async retrieve(query: string, options: Partial<RetrievalOptions> = {}): Promise<RetrievalContext> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    
    // Determine query type and search scope
    const queryType = this.detectQueryType(query);
    const searchScope = this.detectSearchScope(query);
    
    // Perform search
    let results: SearchResult[];
    
    if (queryType === 'semantic') {
      results = await this.semanticSearch(query, mergedOptions);
    } else if (queryType === 'keyword') {
      results = await this.keywordSearch(query, mergedOptions);
    } else {
      // Hybrid search
      const semanticResults = await this.semanticSearch(query, { ...mergedOptions, topK: Math.ceil(mergedOptions.topK / 2) });
      const keywordResults = await this.keywordSearch(query, { ...mergedOptions, topK: Math.ceil(mergedOptions.topK / 2) });
      results = this.mergeSearchResults(semanticResults, keywordResults, mergedOptions.topK);
    }

    // Apply filters
    results = this.applyFilters(results, searchScope);
    
    // Group by file if requested
    if (mergedOptions.groupByFile) {
      results = this.groupByFile(results, mergedOptions.maxChunksPerFile);
    }

    // Filter by minimum score
    results = results.filter(result => result.bm25_score >= mergedOptions.minScore);

    const processingTime = Date.now() - startTime;

    return {
      query,
      results,
      totalResults: results.length,
      processingTimeMs: processingTime,
      metadata: {
        queryType,
        searchScope,
        filters: {
          minScore: mergedOptions.minScore,
          groupByFile: mergedOptions.groupByFile,
          maxChunksPerFile: mergedOptions.maxChunksPerFile
        }
      }
    };
  }

  /**
   * Get context chunks with surrounding context
   */
  async getContextChunks(query: string, options: Partial<RetrievalOptions> = {}): Promise<ContextChunk[]> {
    const retrieval = await this.retrieve(query, options);
    
    const contextChunks: ContextChunk[] = [];
    
    for (const result of retrieval.results) {
      // Get surrounding chunks for better context
      const fileChunks = this.db.getFileChunks(result.filePath);
      const surroundingChunks = this.getSurroundingChunks(fileChunks, result.chunkIndex, 1);
      
      const contextChunk: ContextChunk = {
        content: result.content,
        filePath: result.filePath,
        chunkIndex: result.chunkIndex,
        totalChunks: result.totalChunks,
        score: result.bm25_score,
        metadata: result.metadata,
        context: surroundingChunks.map(chunk => chunk.content).join('\n\n')
      };
      
      contextChunks.push(contextChunk);
    }
    
    return contextChunks;
  }

  /**
   * Search for similar content
   */
  async findSimilar(content: string, options: Partial<RetrievalOptions> = {}): Promise<RetrievalContext> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    
    const results = this.db.searchSimilar(content, mergedOptions.topK);
    
    const processingTime = Date.now() - startTime;
    
    return {
      query: content,
      results,
      totalResults: results.length,
      processingTimeMs: processingTime,
      metadata: {
        queryType: 'semantic',
        searchScope: 'all',
        filters: mergedOptions
      }
    };
  }

  /**
   * Search by file path pattern
   */
  async searchByFilePattern(pattern: string, options: Partial<RetrievalOptions> = {}): Promise<RetrievalContext> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    
    // Use LIKE pattern matching for file paths
    const results = this.db.search(`file_path:${pattern}`, mergedOptions.topK);
    
    const processingTime = Date.now() - startTime;
    
    return {
      query: pattern,
      results,
      totalResults: results.length,
      processingTimeMs: processingTime,
      metadata: {
        queryType: 'keyword',
        searchScope: 'all',
        filters: { ...mergedOptions, filePattern: pattern }
      }
    };
  }

  /**
   * Get chunks for a specific file
   */
  async getFileChunks(filePath: string): Promise<DocumentChunk[]> {
    return this.db.getFileChunks(filePath);
  }

  /**
   * Perform semantic search using FTS5
   */
  private async semanticSearch(query: string, options: RetrievalOptions): Promise<SearchResult[]> {
    // Enhance query for better semantic matching
    const enhancedQuery = this.enhanceQueryForSemantics(query);
    return this.db.search(enhancedQuery, options.topK);
  }

  /**
   * Perform keyword search using FTS5
   */
  private async keywordSearch(query: string, options: RetrievalOptions): Promise<SearchResult[]> {
    // Use exact keyword matching
    const keywordQuery = this.enhanceQueryForKeywords(query);
    return this.db.search(keywordQuery, options.topK);
  }

  /**
   * Detect query type based on content
   */
  private detectQueryType(query: string): 'semantic' | 'keyword' | 'hybrid' {
    const lowerQuery = query.toLowerCase();
    
    // Check for semantic indicators
    const semanticIndicators = ['how', 'what', 'why', 'when', 'where', 'explain', 'describe', 'understand'];
    const hasSemantic = semanticIndicators.some(indicator => lowerQuery.includes(indicator));
    
    // Check for keyword indicators
    const keywordIndicators = ['function', 'class', 'interface', 'import', 'export', 'const', 'let', 'var'];
    const hasKeywords = keywordIndicators.some(indicator => lowerQuery.includes(indicator));
    
    if (hasSemantic && hasKeywords) return 'hybrid';
    if (hasSemantic) return 'semantic';
    if (hasKeywords) return 'keyword';
    
    // Default to semantic for natural language queries
    return query.length > 20 ? 'semantic' : 'keyword';
  }

  /**
   * Detect search scope based on query
   */
  private detectSearchScope(query: string): 'all' | 'code' | 'docs' {
    const lowerQuery = query.toLowerCase();
    
    const codeIndicators = ['function', 'class', 'interface', 'import', 'export', 'const', 'let', 'var', 'typescript', 'javascript'];
    const docsIndicators = ['readme', 'documentation', 'guide', 'tutorial', 'example', 'usage'];
    
    const hasCodeIndicators = codeIndicators.some(indicator => lowerQuery.includes(indicator));
    const hasDocsIndicators = docsIndicators.some(indicator => lowerQuery.includes(indicator));
    
    if (hasCodeIndicators && !hasDocsIndicators) return 'code';
    if (hasDocsIndicators && !hasCodeIndicators) return 'docs';
    
    return 'all';
  }

  /**
   * Enhance query for semantic search
   */
  private enhanceQueryForSemantics(query: string): string {
    // Add synonyms and related terms
    const synonyms: Record<string, string[]> = {
      'function': ['method', 'procedure', 'routine'],
      'class': ['type', 'object', 'interface'],
      'error': ['exception', 'fault', 'issue', 'problem'],
      'data': ['information', 'content', 'payload'],
      'config': ['configuration', 'settings', 'options'],
      'api': ['endpoint', 'service', 'interface']
    };
    
    let enhancedQuery = query;
    
    for (const [term, synonymsList] of Object.entries(synonyms)) {
      if (query.toLowerCase().includes(term)) {
        enhancedQuery += ` OR ${synonymsList.join(' OR ')}`;
      }
    }
    
    return enhancedQuery;
  }

  /**
   * Enhance query for keyword search
   */
  private enhanceQueryForKeywords(query: string): string {
    // Use exact phrase matching for keywords
    const words = query.split(/\s+/).filter(word => word.length > 2);
    return words.map(word => `"${word}"`).join(' AND ');
  }

  /**
   * Merge search results from different search types
   */
  private mergeSearchResults(
    semanticResults: SearchResult[], 
    keywordResults: SearchResult[], 
    topK: number
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();
    
    // Add semantic results with higher weight
    for (const result of semanticResults) {
      merged.set(result.id, { ...result, bm25_score: result.bm25_score * 1.2 });
    }
    
    // Add keyword results
    for (const result of keywordResults) {
      const existing = merged.get(result.id);
      if (existing) {
        // Combine scores
        existing.bm25_score = Math.max(existing.bm25_score, result.bm25_score);
      } else {
        merged.set(result.id, result);
      }
    }
    
    // Sort by score and return top K
    return Array.from(merged.values())
      .sort((a, b) => b.bm25_score - a.bm25_score)
      .slice(0, topK);
  }

  /**
   * Apply filters to search results
   */
  private applyFilters(results: SearchResult[], scope: 'all' | 'code' | 'docs'): SearchResult[] {
    if (scope === 'all') return results;
    
    return results.filter(result => {
      const filePath = result.filePath.toLowerCase();
      const isCodeFile = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c'].some(ext => 
        filePath.endsWith(ext)
      );
      const isDocFile = ['.md', '.txt', '.rst', '.adoc'].some(ext => 
        filePath.endsWith(ext)
      );
      
      if (scope === 'code') return isCodeFile;
      if (scope === 'docs') return isDocFile;
      
      return true;
    });
  }

  /**
   * Group results by file
   */
  private groupByFile(results: SearchResult[], maxChunksPerFile: number): SearchResult[] {
    const fileGroups = new Map<string, SearchResult[]>();
    
    for (const result of results) {
      if (!fileGroups.has(result.filePath)) {
        fileGroups.set(result.filePath, []);
      }
      fileGroups.get(result.filePath)!.push(result);
    }
    
    const grouped: SearchResult[] = [];
    
    for (const [filePath, fileResults] of fileGroups) {
      const sorted = fileResults.sort((a, b) => a.chunkIndex - b.chunkIndex);
      grouped.push(...sorted.slice(0, maxChunksPerFile));
    }
    
    return grouped.sort((a, b) => b.bm25_score - a.bm25_score);
  }

  /**
   * Get surrounding chunks for context
   */
  private getSurroundingChunks(
    fileChunks: DocumentChunk[], 
    centerIndex: number, 
    contextRadius: number
  ): DocumentChunk[] {
    const startIndex = Math.max(0, centerIndex - contextRadius);
    const endIndex = Math.min(fileChunks.length - 1, centerIndex + contextRadius);
    
    return fileChunks.slice(startIndex, endIndex + 1);
  }

  /**
   * Get retrieval options
   */
  getOptions(): RetrievalOptions {
    return { ...this.options };
  }

  /**
   * Update retrieval options
   */
  updateOptions(newOptions: Partial<RetrievalOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}
