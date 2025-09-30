import { Command } from "commander";
import prompts from "prompts";
import * as path from "node:path";
import { 
  registerPlugin, 
  unregisterPlugin, 
  getAllPlugins, 
  getAvailablePluginTools,
  getToolInfo,
  type Plugin 
} from "../core/plugins.js";
import { log } from "../core/logger.js";

export function registerPluginCommands(program: Command) {
  const pluginCmd = program.command("plugins").description("Plugin management");

  pluginCmd
    .command("list")
    .description("List all registered plugins and their tools")
    .action(async () => {
      try {
        const plugins = getAllPlugins();
        const tools = getAvailablePluginTools();
        
        console.log("## Registered Plugins");
        if (plugins.length === 0) {
          console.log("No plugins registered.");
          return;
        }
        
        for (const plugin of plugins) {
          console.log(`\n### ${plugin.name} v${plugin.version}`);
          console.log(`Description: ${plugin.description}`);
          console.log("Tools:");
          
          const pluginTools = tools.filter(tool => {
            const toolInfo = getToolInfo(tool);
            return toolInfo && plugin.tools.includes(toolInfo);
          });
          
          for (const toolName of pluginTools) {
            const toolInfo = getToolInfo(toolName);
            if (toolInfo) {
              console.log(`  - ${toolName}: ${toolInfo.description}`);
            }
          }
        }
        
        log.info("Listed plugins", { pluginCount: plugins.length, toolCount: tools.length });
      } catch (error) {
        log.error("Failed to list plugins", { error: error instanceof Error ? error.message : String(error) });
        console.error("Failed to list plugins:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  pluginCmd
    .command("info <plugin>")
    .description("Show detailed information about a plugin")
    .action(async (pluginName: string) => {
      try {
        const plugins = getAllPlugins();
        const plugin = plugins.find(p => p.name === pluginName);
        
        if (!plugin) {
          console.error(`Plugin '${pluginName}' not found.`);
          process.exit(1);
        }
        
        console.log(`## ${plugin.name} v${plugin.version}`);
        console.log(`Description: ${plugin.description}`);
        console.log(`Tools: ${plugin.tools.length}`);
        
        for (const tool of plugin.tools) {
          console.log(`\n### ${tool.name}`);
          console.log(`Description: ${tool.description}`);
          if (tool.schema) {
            console.log("Schema:", JSON.stringify(tool.schema, null, 2));
          }
        }
        
        log.info("Showed plugin info", { plugin: pluginName });
      } catch (error) {
        log.error("Failed to show plugin info", { 
          plugin: pluginName, 
          error: error instanceof Error ? error.message : String(error) 
        });
        console.error("Failed to show plugin info:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  pluginCmd
    .command("register")
    .description("Register a new plugin interactively")
    .option("--file <path>", "Load plugin from file")
    .action(async (opts: { file?: string }) => {
      try {
        let plugin: Plugin;
        
        if (opts.file) {
          // Load plugin from file
          const pluginModule = await import(path.resolve(opts.file));
          plugin = pluginModule.default || pluginModule;
        } else {
          // Interactive plugin creation
          const answers = await prompts([
            {
              type: "text",
              name: "name",
              message: "Plugin name:",
              validate: (value: string) => value.trim().length > 0 || "Name is required"
            },
            {
              type: "text",
              name: "version",
              message: "Plugin version:",
              initial: "1.0.0",
              validate: (value: string) => value.trim().length > 0 || "Version is required"
            },
            {
              type: "text",
              name: "description",
              message: "Plugin description:",
              validate: (value: string) => value.trim().length > 0 || "Description is required"
            }
          ]);
          
          if (!answers.name || !answers.version || !answers.description) {
            console.error("Plugin registration cancelled.");
            process.exit(1);
          }
          
          // For now, create a simple plugin with no tools
          // In a real implementation, you'd want more sophisticated plugin creation
          plugin = {
            name: answers.name,
            version: answers.version,
            description: answers.description,
            tools: []
          };
        }
        
        await registerPlugin(plugin);
        console.log(`✅ Plugin '${plugin.name}' registered successfully.`);
        
        log.info("Registered plugin", { name: plugin.name, version: plugin.version });
      } catch (error) {
        log.error("Failed to register plugin", { error: error instanceof Error ? error.message : String(error) });
        console.error("Failed to register plugin:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  pluginCmd
    .command("unregister <plugin>")
    .description("Unregister a plugin")
    .action(async (pluginName: string) => {
      try {
        const { confirmed } = await prompts({
          type: "confirm",
          name: "confirmed",
          message: `Are you sure you want to unregister plugin '${pluginName}'?`,
          initial: false
        });
        
        if (!confirmed) {
          console.log("Plugin unregistration cancelled.");
          return;
        }
        
        await unregisterPlugin(pluginName);
        console.log(`✅ Plugin '${pluginName}' unregistered successfully.`);
        
        log.info("Unregistered plugin", { name: pluginName });
      } catch (error) {
        log.error("Failed to unregister plugin", { 
          plugin: pluginName, 
          error: error instanceof Error ? error.message : String(error) 
        });
        console.error("Failed to unregister plugin:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  pluginCmd
    .command("tools")
    .description("List all available tools (built-in and plugin)")
    .action(async () => {
      try {
        const pluginTools = getAvailablePluginTools();
        
        console.log("## Available Tools");
        console.log("\n### Built-in Tools");
        console.log("- open_file: Read file contents");
        console.log("- write_file: Write files");
        console.log("- apply_patch: Apply unified diff patches");
        console.log("- run: Execute shell commands");
        console.log("- git: Git operations (commit, create_branch)");
        console.log("- npm: NPM operations (install, run, list, outdated)");
        console.log("- docker: Docker operations (build, run, ps, stop, remove)");
        console.log("- search: Search operations (files, find)");
        
        if (pluginTools.length > 0) {
          console.log("\n### Plugin Tools");
          for (const toolName of pluginTools) {
            const toolInfo = getToolInfo(toolName);
            if (toolInfo) {
              console.log(`- ${toolName}: ${toolInfo.description}`);
            }
          }
        } else {
          console.log("\n### Plugin Tools");
          console.log("No plugin tools registered.");
        }
        
        log.info("Listed all tools", { pluginToolCount: pluginTools.length });
      } catch (error) {
        log.error("Failed to list tools", { error: error instanceof Error ? error.message : String(error) });
        console.error("Failed to list tools:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
