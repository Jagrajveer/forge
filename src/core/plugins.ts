import { ToolError } from "./errors.js";
import { log } from "./logger.js";

export interface PluginTool {
  name: string;
  description: string;
  execute: (args: Record<string, any>) => Promise<any>;
  validate?: (args: Record<string, any>) => void;
  schema?: {
    required?: string[];
    properties?: Record<string, any>;
  };
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  tools: PluginTool[];
  init?: () => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private tools: Map<string, PluginTool> = new Map();
  private initialized = false;

  async registerPlugin(plugin: Plugin): Promise<void> {
    try {
      log.info("Registering plugin", { name: plugin.name, version: plugin.version });
      
      // Validate plugin
      this.validatePlugin(plugin);
      
      // Check for conflicts
      if (this.plugins.has(plugin.name)) {
        throw new Error(`Plugin '${plugin.name}' is already registered`);
      }
      
      // Check for tool name conflicts
      for (const tool of plugin.tools) {
        if (this.tools.has(tool.name)) {
          throw new Error(`Tool '${tool.name}' is already registered by another plugin`);
        }
      }
      
      // Register plugin
      this.plugins.set(plugin.name, plugin);
      
      // Register tools
      for (const tool of plugin.tools) {
        this.tools.set(tool.name, tool);
        log.debug("Registered tool", { tool: tool.name, plugin: plugin.name });
      }
      
      // Initialize plugin if it has an init function
      if (plugin.init) {
        await plugin.init();
        log.debug("Initialized plugin", { name: plugin.name });
      }
      
      log.info("Plugin registered successfully", { name: plugin.name, toolCount: plugin.tools.length });
    } catch (error) {
      log.error("Failed to register plugin", { 
        name: plugin.name, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async unregisterPlugin(pluginName: string): Promise<void> {
    try {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin '${pluginName}' is not registered`);
      }
      
      log.info("Unregistering plugin", { name: pluginName });
      
      // Cleanup plugin if it has a cleanup function
      if (plugin.cleanup) {
        await plugin.cleanup();
        log.debug("Cleaned up plugin", { name: pluginName });
      }
      
      // Remove tools
      for (const tool of plugin.tools) {
        this.tools.delete(tool.name);
        log.debug("Unregistered tool", { tool: tool.name, plugin: pluginName });
      }
      
      // Remove plugin
      this.plugins.delete(pluginName);
      
      log.info("Plugin unregistered successfully", { name: pluginName });
    } catch (error) {
      log.error("Failed to unregister plugin", { 
        name: pluginName, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new ToolError("plugin", `Tool '${toolName}' not found`, { toolName });
    }
    
    try {
      // Validate arguments if tool has validation
      if (tool.validate) {
        tool.validate(args);
      }
      
      log.debug("Executing plugin tool", { tool: toolName, args });
      
      // Execute tool
      const result = await tool.execute(args);
      
      log.debug("Plugin tool executed successfully", { tool: toolName });
      return result;
    } catch (error) {
      const forgeError = error instanceof Error ? error : new Error(String(error));
      log.error("Plugin tool execution failed", { 
        tool: toolName, 
        error: forgeError.message 
      });
      throw new ToolError("plugin", forgeError.message, { 
        tool: toolName, 
        args,
        originalError: forgeError 
      });
    }
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getPluginInfo(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getToolInfo(toolName: string): PluginTool | undefined {
    return this.tools.get(toolName);
  }

  private validatePlugin(plugin: Plugin): void {
    if (!plugin.name || typeof plugin.name !== "string") {
      throw new Error("Plugin must have a valid name");
    }
    
    if (!plugin.version || typeof plugin.version !== "string") {
      throw new Error("Plugin must have a valid version");
    }
    
    if (!plugin.description || typeof plugin.description !== "string") {
      throw new Error("Plugin must have a valid description");
    }
    
    if (!Array.isArray(plugin.tools) || plugin.tools.length === 0) {
      throw new Error("Plugin must have at least one tool");
    }
    
    for (const tool of plugin.tools) {
      this.validateTool(tool);
    }
  }

  private validateTool(tool: PluginTool): void {
    if (!tool.name || typeof tool.name !== "string") {
      throw new Error("Tool must have a valid name");
    }
    
    if (!tool.description || typeof tool.description !== "string") {
      throw new Error("Tool must have a valid description");
    }
    
    if (typeof tool.execute !== "function") {
      throw new Error("Tool must have an execute function");
    }
    
    if (tool.validate && typeof tool.validate !== "function") {
      throw new Error("Tool validate must be a function");
    }
  }
}

// Global plugin manager instance
let globalPluginManager: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager();
  }
  return globalPluginManager;
}

export function setPluginManager(manager: PluginManager): void {
  globalPluginManager = manager;
}

// Convenience functions
export async function registerPlugin(plugin: Plugin): Promise<void> {
  return getPluginManager().registerPlugin(plugin);
}

export async function unregisterPlugin(pluginName: string): Promise<void> {
  return getPluginManager().unregisterPlugin(pluginName);
}

export async function executePluginTool(toolName: string, args: Record<string, any>): Promise<any> {
  return getPluginManager().executeTool(toolName, args);
}

export function getAvailablePluginTools(): string[] {
  return getPluginManager().getAvailableTools();
}

export function getPluginInfo(pluginName: string): Plugin | undefined {
  return getPluginManager().getPluginInfo(pluginName);
}

export function getAllPlugins(): Plugin[] {
  return getPluginManager().getAllPlugins();
}

export function getToolInfo(toolName: string): PluginTool | undefined {
  return getPluginManager().getToolInfo(toolName);
}
