/**
 * Context Service - Integrates RAG and MCP for auto-context injection
 * Provides intelligent context retrieval for chat and agent interactions
 */
import { RAGDatabase } from "../rag/db.js";
import { RAGRetriever } from "../rag/retriever.js";
import { MCPClient } from "../mcp/client.js";
import chalk from "chalk";

export interface ContextOptions {
  maxChunks: number;
  minScore: number;
  includeCode: boolean;
  includeDocs: boolean;
  useMCP: boolean;
  groupByFile: boolean;
}

export interface ContextResult {
  query: string;
  ragContext: string;
  mcpTools: Array<{ name: string; description: string; server: string }>;
  mcpPrompts: Array<{ name: string; description: string; server: string }>;
  metadata: {
    ragChunks: number;
    mcpToolsCount: number;
    mcpPromptsCount: number;
    processingTimeMs: number;
  };
}

export class ContextService {
  private ragDb: RAGDatabase;
  private ragRetriever: RAGRetriever;
  private mcpClient: MCPClient;
  private options: ContextOptions;

  constructor(options: Partial<ContextOptions> = {}) {
    this.options = {
      maxChunks: 5,
      minScore: 0.3,
      includeCode: true,
      includeDocs: true,
      useMCP: true,
      groupByFile: true,
      ...options
    };

    this.ragDb = new RAGDatabase();
    this.ragRetriever = new RAGRetriever(this.ragDb, {
      topK: this.options.maxChunks,
      minScore: this.options.minScore,
      groupByFile: this.options.groupByFile
    });
    this.mcpClient = new MCPClient();
  }

  /**
   * Get intelligent context for a query
   */
  async getContext(query: string, options: Partial<ContextOptions> = {}): Promise<ContextResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };

    // Get RAG context
    const ragContext = await this.getRAGContext(query, mergedOptions);

    // Get MCP context
    const mcpTools = mergedOptions.useMCP ? await this.getMCPTools(query) : [];
    const mcpPrompts = mergedOptions.useMCP ? await this.getMCPPrompts(query) : [];

    const processingTime = Date.now() - startTime;

    return {
      query,
      ragContext,
      mcpTools,
      mcpPrompts,
      metadata: {
        ragChunks: ragContext.split('\n---\n').length - 1,
        mcpToolsCount: mcpTools.length,
        mcpPromptsCount: mcpPrompts.length,
        processingTimeMs: processingTime
      }
    };
  }

  /**
   * Get RAG context for a query
   */
  private async getRAGContext(query: string, options: ContextOptions): Promise<string> {
    try {
      const retrieval = await this.ragRetriever.retrieve(query, {
        topK: options.maxChunks,
        minScore: options.minScore,
        groupByFile: options.groupByFile
      });

      if (retrieval.results.length === 0) {
        return "No relevant context found in the codebase.";
      }

      // Format context with file information
      const contextParts: string[] = [];
      
      for (const result of retrieval.results) {
        const fileInfo = `${result.filePath} (chunk ${result.chunkIndex + 1}/${result.totalChunks})`;
        const content = result.content.trim();
        
        contextParts.push(`File: ${fileInfo}\n${content}`);
      }

      return contextParts.join('\n\n---\n\n');
    } catch (error) {
      console.warn(chalk.yellow(`RAG context retrieval failed: ${error}`));
      return "RAG context retrieval failed.";
    }
  }

  /**
   * Get relevant MCP tools for a query
   */
  private async getMCPTools(query: string): Promise<Array<{ name: string; description: string; server: string }>> {
    try {
      const tools = await this.mcpClient.getTools();
      
      // Filter tools based on query relevance
      const relevantTools = tools.filter(tool => 
        this.isToolRelevant(tool.name, tool.description, query)
      );

      return relevantTools.slice(0, 5); // Limit to top 5 tools
    } catch (error) {
      console.warn(chalk.yellow(`MCP tools retrieval failed: ${error}`));
      return [];
    }
  }

  /**
   * Get relevant MCP prompts for a query
   */
  private async getMCPPrompts(query: string): Promise<Array<{ name: string; description: string; server: string }>> {
    try {
      const prompts = await this.mcpClient.getPrompts();
      
      // Filter prompts based on query relevance
      const relevantPrompts = prompts.filter(prompt => 
        this.isPromptRelevant(prompt.name, prompt.description, query)
      );

      return relevantPrompts.slice(0, 3); // Limit to top 3 prompts
    } catch (error) {
      console.warn(chalk.yellow(`MCP prompts retrieval failed: ${error}`));
      return [];
    }
  }

  /**
   * Check if a tool is relevant to the query
   */
  private isToolRelevant(name: string, description: string, query: string): boolean {
    const queryLower = query.toLowerCase();
    const nameLower = name.toLowerCase();
    const descLower = description.toLowerCase();

    // Check for direct name matches
    if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
      return true;
    }

    // Check for description keyword matches
    const keywords = queryLower.split(/\s+/).filter(word => word.length > 2);
    const descKeywords = descLower.split(/\s+/);
    
    const matchCount = keywords.filter(keyword => 
      descKeywords.some(descKeyword => descKeyword.includes(keyword))
    ).length;

    return matchCount >= Math.min(2, keywords.length);
  }

  /**
   * Check if a prompt is relevant to the query
   */
  private isPromptRelevant(name: string, description: string, query: string): boolean {
    return this.isToolRelevant(name, description, query);
  }

  /**
   * Format context for display in chat
   */
  formatContextForDisplay(context: ContextResult): string {
    const parts: string[] = [];

    // Add RAG context
    if (context.ragContext && context.ragContext !== "No relevant context found in the codebase.") {
      parts.push(chalk.blue("📚 Codebase Context:"));
      parts.push(context.ragContext);
    }

    // Add MCP tools
    if (context.mcpTools.length > 0) {
      parts.push(chalk.green("\n🔧 Available Tools:"));
      for (const tool of context.mcpTools) {
        parts.push(`  • ${tool.name} (${tool.server}): ${tool.description}`);
      }
    }

    // Add MCP prompts
    if (context.mcpPrompts.length > 0) {
      parts.push(chalk.magenta("\n💡 Available Prompts:"));
      for (const prompt of context.mcpPrompts) {
        parts.push(`  • ${prompt.name} (${prompt.server}): ${prompt.description}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Format context for LLM consumption
   */
  formatContextForLLM(context: ContextResult): string {
    const parts: string[] = [];

    // Add RAG context
    if (context.ragContext && context.ragContext !== "No relevant context found in the codebase.") {
      parts.push("## Codebase Context\n");
      parts.push(context.ragContext);
    }

    // Add MCP tools
    if (context.mcpTools.length > 0) {
      parts.push("\n## Available Tools\n");
      for (const tool of context.mcpTools) {
        parts.push(`- **${tool.name}** (${tool.server}): ${tool.description}`);
      }
    }

    // Add MCP prompts
    if (context.mcpPrompts.length > 0) {
      parts.push("\n## Available Prompts\n");
      for (const prompt of context.mcpPrompts) {
        parts.push(`- **${prompt.name}** (${prompt.server}): ${prompt.description}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Get context statistics
   */
  async getStats(): Promise<{
    ragStats: any;
    mcpStatus: Record<string, boolean>;
    totalServers: number;
    connectedServers: number;
  }> {
    const ragStats = this.ragDb.getStats();
    const mcpStatus = this.mcpClient.getConnectionStatus();
    const totalServers = Object.keys(mcpStatus).length;
    const connectedServers = Object.values(mcpStatus).filter(Boolean).length;

    return {
      ragStats,
      mcpStatus,
      totalServers,
      connectedServers
    };
  }

  /**
   * Update context options
   */
  updateOptions(newOptions: Partial<ContextOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.ragRetriever.updateOptions({
      topK: this.options.maxChunks,
      minScore: this.options.minScore,
      groupByFile: this.options.groupByFile
    });
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.mcpClient.disconnectAll();
    this.ragDb.close();
  }
}
