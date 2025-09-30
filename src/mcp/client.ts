/**
 * Model Context Protocol (MCP) Client
 * Connects to MCP servers for external tool integration
 */
// MCP SDK imports - using dynamic imports for ES module compatibility
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  server: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  server: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  server: string;
}

export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();
  private clients: Map<string, any> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), ".forge", "mcp-servers.json");
    this.loadServers();
  }

  /**
   * Load server configurations from file
   */
  private loadServers(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const servers = JSON.parse(data) as MCPServer[];
        for (const server of servers) {
          this.servers.set(server.name, server);
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to load MCP servers: ${error}`));
    }
  }

  /**
   * Save server configurations to file
   */
  private saveServers(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const servers = Array.from(this.servers.values());
      fs.writeFileSync(this.configPath, JSON.stringify(servers, null, 2));
    } catch (error) {
      console.error(chalk.red(`Failed to save MCP servers: ${error}`));
    }
  }

  /**
   * Add a new MCP server
   */
  addServer(server: MCPServer): void {
    this.servers.set(server.name, server);
    this.saveServers();
  }

  /**
   * Remove an MCP server
   */
  removeServer(name: string): boolean {
    const removed = this.servers.delete(name);
    if (removed) {
      this.saveServers();
    }
    return removed;
  }

  /**
   * Get all servers
   */
  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get a specific server
   */
  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`Server '${serverName}' is disabled`);
    }

    if (this.clients.has(serverName)) {
      return; // Already connected
    }

    try {
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env
      });

      const client = new Client(
        {
          name: "forge-mcp-client",
          version: "1.0.0"
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          }
        }
      );

      await client.connect(transport);
      this.clients.set(serverName, client);
      
      console.log(chalk.green(`✓ Connected to MCP server: ${serverName}`));
    } catch (error) {
      console.error(chalk.red(`Failed to connect to MCP server '${serverName}': ${error}`));
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      try {
        await client.close();
        this.clients.delete(serverName);
        console.log(chalk.green(`✓ Disconnected from MCP server: ${serverName}`));
      } catch (error) {
        console.error(chalk.red(`Failed to disconnect from MCP server '${serverName}': ${error}`));
      }
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.clients.keys());
    for (const serverName of serverNames) {
      await this.disconnect(serverName);
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  async getTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];

    for (const [serverName, client] of this.clients) {
      try {
        const response = await client.request({ method: "tools/list" }) as any;

        for (const tool of response.tools as any[]) {
          tools.push({
            name: tool.name,
            description: tool.description || "",
            inputSchema: tool.inputSchema,
            server: serverName
          });
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to get tools from server '${serverName}': ${error}`));
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  async getToolsFromServer(serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to server '${serverName}'`);
    }

    const response = await client.request({ method: "tools/list" }) as any;

    return response.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema,
      server: serverName
    }));
  }

  /**
   * Call a tool
   */
  async callTool(toolName: string, arguments_: Record<string, any> = {}): Promise<any> {
    // Find the tool across all servers
    for (const [serverName, client] of this.clients) {
      try {
        const tools = await this.getToolsFromServer(serverName);
        const tool = tools.find(t => t.name === toolName);
        
        if (tool) {
        const response = await client.request({
          method: "tools/call",
          params: {
            name: toolName,
            arguments: arguments_
          }
        }) as any;

          return {
            content: response.content,
            isError: response.isError,
            server: serverName
          };
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to call tool '${toolName}' on server '${serverName}': ${error}`));
      }
    }

    throw new Error(`Tool '${toolName}' not found in any connected server`);
  }

  /**
   * Get all available prompts from all connected servers
   */
  async getPrompts(): Promise<MCPPrompt[]> {
    const prompts: MCPPrompt[] = [];

    for (const [serverName, client] of this.clients) {
      try {
        const response = await client.request({ method: "prompts/list" }) as any;

        for (const prompt of response.prompts) {
          prompts.push({
            name: prompt.name,
            description: prompt.description || "",
            arguments: prompt.arguments,
            server: serverName
          });
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to get prompts from server '${serverName}': ${error}`));
      }
    }

    return prompts;
  }

  /**
   * Get a prompt
   */
  async getPrompt(promptName: string, arguments_: Record<string, any> = {}): Promise<any> {
    // Find the prompt across all servers
    for (const [serverName, client] of this.clients) {
      try {
        const prompts = await this.getPrompts();
        const prompt = prompts.find(p => p.name === promptName);
        
        if (prompt) {
          const response = await client.request({
            method: "prompts/get",
            params: {
              name: promptName,
              arguments: arguments_
            }
          }) as any;

          return {
            description: response.description,
            messages: response.messages,
            server: serverName
          };
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to get prompt '${promptName}' from server '${serverName}': ${error}`));
      }
    }

    throw new Error(`Prompt '${promptName}' not found in any connected server`);
  }

  /**
   * Get all available resources from all connected servers
   */
  async getResources(): Promise<MCPResource[]> {
    const resources: MCPResource[] = [];

    for (const [serverName, client] of this.clients) {
      try {
        const response = await client.request({ method: "resources/list" }) as any;

        for (const resource of response.resources) {
          resources.push({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
            server: serverName
          });
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to get resources from server '${serverName}': ${error}`));
      }
    }

    return resources;
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    // Find the resource across all servers
    for (const [serverName, client] of this.clients) {
      try {
        const response = await client.request({
          method: "resources/read",
          params: { uri }
        }) as any;

        return {
          contents: response.contents,
          server: serverName
        };
      } catch (error) {
        console.warn(chalk.yellow(`Failed to read resource '${uri}' from server '${serverName}': ${error}`));
      }
    }

    throw new Error(`Resource '${uri}' not found in any connected server`);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const serverName of this.servers.keys()) {
      status[serverName] = this.clients.has(serverName);
    }
    return status;
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
