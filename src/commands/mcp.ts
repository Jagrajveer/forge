/**
 * MCP CLI commands for Model Context Protocol integration
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import { MCPClient, type MCPServer } from "../mcp/client.js";

export function registerMCPCommands(program: Command) {
  const mcpCmd = program.command("mcp").description("Model Context Protocol operations");

  // Add server command
  mcpCmd
    .command("add <name>")
    .description("Add a new MCP server")
    .option("-c, --command <command>", "Command to run the server")
    .option("-a, --args <args...>", "Command arguments")
    .option("-e, --env <env>", "Environment variables (JSON format)")
    .option("--enable", "Enable the server immediately", true)
    .action(async (name, opts) => {
      if (!opts.command) {
        console.error(chalk.red("Error: --command is required"));
        process.exit(1);
      }

      const server: MCPServer = {
        name,
        command: opts.command,
        args: opts.args || [],
        env: opts.env ? JSON.parse(opts.env) : undefined,
        enabled: opts.enable
      };

      const client = new MCPClient();
      client.addServer(server);

      console.log(chalk.green(`✓ Added MCP server: ${name}`));
      console.log(chalk.gray(`  Command: ${server.command} ${server.args.join(" ")}`));
      if (server.env) {
        console.log(chalk.gray(`  Environment: ${JSON.stringify(server.env)}`));
      }
    });

  // Remove server command
  mcpCmd
    .command("remove <name>")
    .description("Remove an MCP server")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name, opts) => {
      if (!opts.yes) {
        const response = await prompts({
          type: "confirm",
          name: "value",
          message: `Are you sure you want to remove the MCP server '${name}'?`,
          initial: false
        });

        if (!response.value) {
          console.log(chalk.yellow("Operation cancelled"));
          return;
        }
      }

      const client = new MCPClient();
      const removed = client.removeServer(name);

      if (removed) {
        console.log(chalk.green(`✓ Removed MCP server: ${name}`));
      } else {
        console.log(chalk.red(`✗ Server '${name}' not found`));
        process.exit(1);
      }
    });

  // List servers command
  mcpCmd
    .command("list")
    .description("List all MCP servers")
    .option("-s, --status", "Show connection status")
    .action(async (opts) => {
      const client = new MCPClient();
      const servers = client.getServers();

      if (servers.length === 0) {
        console.log(chalk.yellow("No MCP servers configured"));
        return;
      }

      console.log(chalk.blue("MCP Servers:"));
      console.log(chalk.gray("=" .repeat(50)));

      for (const server of servers) {
        const status = opts.status ? client.isConnected(server.name) : undefined;
        const statusText = status !== undefined 
          ? (status ? chalk.green("✓ Connected") : chalk.red("✗ Disconnected"))
          : "";

        console.log(chalk.cyan(`${server.name}${statusText ? ` (${statusText})` : ""}`));
        console.log(chalk.gray(`  Command: ${server.command} ${server.args.join(" ")}`));
        console.log(chalk.gray(`  Enabled: ${server.enabled ? "Yes" : "No"}`));
        if (server.env) {
          console.log(chalk.gray(`  Environment: ${JSON.stringify(server.env)}`));
        }
        console.log();
      }
    });

  // Connect command
  mcpCmd
    .command("connect <name>")
    .description("Connect to an MCP server")
    .action(async (name) => {
      const spinner = ora(`Connecting to MCP server '${name}'...`).start();
      
      try {
        const client = new MCPClient();
        await client.connect(name);
        spinner.succeed(`Connected to MCP server: ${name}`);
      } catch (error) {
        spinner.fail(`Failed to connect to MCP server '${name}'`);
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Disconnect command
  mcpCmd
    .command("disconnect <name>")
    .description("Disconnect from an MCP server")
    .action(async (name) => {
      const spinner = ora(`Disconnecting from MCP server '${name}'...`).start();
      
      try {
        const client = new MCPClient();
        await client.disconnect(name);
        spinner.succeed(`Disconnected from MCP server: ${name}`);
      } catch (error) {
        spinner.fail(`Failed to disconnect from MCP server '${name}'`);
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Connect all command
  mcpCmd
    .command("connect-all")
    .description("Connect to all enabled MCP servers")
    .action(async () => {
      const client = new MCPClient();
      const servers = client.getServers().filter(s => s.enabled);

      if (servers.length === 0) {
        console.log(chalk.yellow("No enabled MCP servers found"));
        return;
      }

      console.log(chalk.blue(`Connecting to ${servers.length} MCP servers...`));

      for (const server of servers) {
        try {
          await client.connect(server.name);
        } catch (error) {
          console.log(chalk.red(`✗ Failed to connect to ${server.name}: ${error}`));
        }
      }
    });

  // Disconnect all command
  mcpCmd
    .command("disconnect-all")
    .description("Disconnect from all MCP servers")
    .action(async () => {
      const client = new MCPClient();
      await client.disconnectAll();
      console.log(chalk.green("Disconnected from all MCP servers"));
    });

  // Tools command
  mcpCmd
    .command("tools")
    .description("List available tools from all connected servers")
    .option("-s, --server <name>", "Show tools from specific server only")
    .action(async (opts) => {
      const spinner = ora("Fetching tools...").start();
      
      try {
        const client = new MCPClient();
        
        if (opts.server) {
          if (!client.isConnected(opts.server)) {
            spinner.fail(`Not connected to server '${opts.server}'`);
            console.log(chalk.yellow(`Run 'forge mcp connect ${opts.server}' first`));
            process.exit(1);
          }

          const tools = await client.getToolsFromServer(opts.server);
          spinner.succeed(`Found ${tools.length} tools from server '${opts.server}'`);

          if (tools.length === 0) {
            console.log(chalk.yellow("No tools available"));
            return;
          }

          console.log(chalk.blue(`\nTools from ${opts.server}:`));
          for (const tool of tools) {
            console.log(chalk.cyan(`  ${tool.name}`));
            console.log(chalk.gray(`    ${tool.description}`));
            console.log();
          }
        } else {
          const tools = await client.getTools();
          spinner.succeed(`Found ${tools.length} tools from all servers`);

          if (tools.length === 0) {
            console.log(chalk.yellow("No tools available. Make sure servers are connected."));
            return;
          }

          // Group tools by server
          const toolsByServer = tools.reduce((acc, tool) => {
            if (!acc[tool.server]) acc[tool.server] = [];
            acc[tool.server].push(tool);
            return acc;
          }, {} as Record<string, typeof tools>);

          for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
            console.log(chalk.blue(`\nTools from ${serverName}:`));
            for (const tool of serverTools) {
              console.log(chalk.cyan(`  ${tool.name}`));
              console.log(chalk.gray(`    ${tool.description}`));
              console.log();
            }
          }
        }
      } catch (error) {
        spinner.fail("Failed to fetch tools");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Call tool command
  mcpCmd
    .command("call <tool>")
    .description("Call an MCP tool")
    .option("-a, --args <args>", "Tool arguments (JSON format)", "{}")
    .action(async (tool, opts) => {
      const spinner = ora(`Calling tool '${tool}'...`).start();
      
      try {
        const client = new MCPClient();
        const args = JSON.parse(opts.args);
        
        const result = await client.callTool(tool, args);
        
        spinner.succeed(`Tool '${tool}' executed successfully`);
        
        console.log(chalk.blue("\nTool Result:"));
        console.log(chalk.gray("=" .repeat(40)));
        
        if (result.isError) {
          console.log(chalk.red("Error:"));
        }
        
        for (const content of result.content) {
          if (content.type === "text") {
            console.log(content.text);
          } else if (content.type === "image") {
            console.log(chalk.blue(`[Image: ${content.data}]`));
          } else {
            console.log(JSON.stringify(content, null, 2));
          }
        }
        
        console.log(chalk.gray(`\nServer: ${result.server}`));
      } catch (error) {
        spinner.fail(`Failed to call tool '${tool}'`);
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Prompts command
  mcpCmd
    .command("prompts")
    .description("List available prompts from all connected servers")
    .option("-s, --server <name>", "Show prompts from specific server only")
    .action(async (opts) => {
      const spinner = ora("Fetching prompts...").start();
      
      try {
        const client = new MCPClient();
        const prompts = await client.getPrompts();
        
        spinner.succeed(`Found ${prompts.length} prompts from all servers`);

        if (prompts.length === 0) {
          console.log(chalk.yellow("No prompts available. Make sure servers are connected."));
          return;
        }

        // Group prompts by server
        const promptsByServer = prompts.reduce((acc, prompt) => {
          if (!acc[prompt.server]) acc[prompt.server] = [];
          acc[prompt.server].push(prompt);
          return acc;
        }, {} as Record<string, typeof prompts>);

        for (const [serverName, serverPrompts] of Object.entries(promptsByServer)) {
          console.log(chalk.blue(`\nPrompts from ${serverName}:`));
          for (const prompt of serverPrompts) {
            console.log(chalk.cyan(`  ${prompt.name}`));
            console.log(chalk.gray(`    ${prompt.description}`));
            if (prompt.arguments && prompt.arguments.length > 0) {
              console.log(chalk.gray(`    Arguments: ${prompt.arguments.map(a => a.name).join(", ")}`));
            }
            console.log();
          }
        }
      } catch (error) {
        spinner.fail("Failed to fetch prompts");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Resources command
  mcpCmd
    .command("resources")
    .description("List available resources from all connected servers")
    .action(async () => {
      const spinner = ora("Fetching resources...").start();
      
      try {
        const client = new MCPClient();
        const resources = await client.getResources();
        
        spinner.succeed(`Found ${resources.length} resources from all servers`);

        if (resources.length === 0) {
          console.log(chalk.yellow("No resources available. Make sure servers are connected."));
          return;
        }

        // Group resources by server
        const resourcesByServer = resources.reduce((acc, resource) => {
          if (!acc[resource.server]) acc[resource.server] = [];
          acc[resource.server].push(resource);
          return acc;
        }, {} as Record<string, typeof resources>);

        for (const [serverName, serverResources] of Object.entries(resourcesByServer)) {
          console.log(chalk.blue(`\nResources from ${serverName}:`));
          for (const resource of serverResources) {
            console.log(chalk.cyan(`  ${resource.name}`));
            console.log(chalk.gray(`    URI: ${resource.uri}`));
            if (resource.description) {
              console.log(chalk.gray(`    Description: ${resource.description}`));
            }
            if (resource.mimeType) {
              console.log(chalk.gray(`    MIME Type: ${resource.mimeType}`));
            }
            console.log();
          }
        }
      } catch (error) {
        spinner.fail("Failed to fetch resources");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Status command
  mcpCmd
    .command("status")
    .description("Show connection status for all servers")
    .action(async () => {
      const client = new MCPClient();
      const status = client.getConnectionStatus();
      const servers = client.getServers();

      console.log(chalk.blue("MCP Server Status:"));
      console.log(chalk.gray("=" .repeat(40)));

      if (servers.length === 0) {
        console.log(chalk.yellow("No MCP servers configured"));
        return;
      }

      for (const server of servers) {
        const isConnected = status[server.name];
        const statusText = isConnected ? chalk.green("✓ Connected") : chalk.red("✗ Disconnected");
        const enabledText = server.enabled ? "" : chalk.gray(" (disabled)");
        
        console.log(`${chalk.cyan(server.name)}: ${statusText}${enabledText}`);
      }
    });
}
