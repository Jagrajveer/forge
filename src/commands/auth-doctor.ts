/**
 * forge auth doctor - Comprehensive environment diagnostics
 * Checks API keys, network, streaming, MCP endpoints, and file permissions
 */
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { chat } from "../llm/xai.js";

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
  remediation?: string;
}

export async function runAuthDoctor(): Promise<number> {
  console.log(chalk.bold.cyan("\n🔍 forge auth doctor\n"));
  console.log(chalk.dim("Running comprehensive diagnostics...\n"));

  const results: CheckResult[] = [];

  // 1. Check environment variables
  results.push(await checkEnvVars());

  // 2. Check network connectivity to xAI
  results.push(await checkNetwork());

  // 3. Test streaming
  results.push(await checkStreaming());

  // 4. Check clock skew
  results.push(await checkClockSkew());

  // 5. Check file system permissions
  results.push(await checkFileSystem());

  // 6. Check MCP endpoints (if configured)
  results.push(await checkMCP());

  // Print results
  console.log(chalk.bold("\n📊 Results:\n"));

  const columnWidth = 40;
  for (const result of results) {
    const icon =
      result.status === "PASS" ? chalk.green("✔") :
      result.status === "WARN" ? chalk.yellow("▲") :
      chalk.red("✖");

    const statusColor =
      result.status === "PASS" ? chalk.green :
      result.status === "WARN" ? chalk.yellow :
      chalk.red;

    console.log(
      `${icon} ${result.name.padEnd(columnWidth)} ${statusColor(result.status)}`
    );
    console.log(chalk.dim(`   ${result.message}`));

    if (result.remediation) {
      console.log(chalk.yellow(`   → ${result.remediation}`));
    }
    console.log("");
  }

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;

  console.log(chalk.bold("Summary:"));
  console.log(`  ${chalk.green(`${passed} passed`)} | ${chalk.red(`${failed} failed`)} | ${chalk.yellow(`${warned} warnings`)}`);
  console.log("");

  // Exit code: 0 if all passed, 1 if any failed
  return failed > 0 ? 1 : 0;
}

async function checkEnvVars(): Promise<CheckResult> {
  const key = process.env.XAI_API_KEY || process.env.GROK_API_KEY;

  if (!key) {
    return {
      name: "Environment: XAI_API_KEY",
      status: "FAIL",
      message: "API key not found in environment",
      remediation: "Set XAI_API_KEY in .env or export XAI_API_KEY=xai-...",
    };
  }

  if (!key.startsWith("xai-")) {
    return {
      name: "Environment: XAI_API_KEY",
      status: "WARN",
      message: "API key format looks unusual (expected 'xai-...')",
      remediation: "Verify your key from https://console.x.ai/",
    };
  }

  return {
    name: "Environment: XAI_API_KEY",
    status: "PASS",
    message: `Key present (${key.slice(0, 10)}...)`,
  };
}

async function checkNetwork(): Promise<CheckResult> {
  try {
    const baseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
    const url = `${baseUrl}/models`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY || process.env.GROK_API_KEY}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      const modelCount = data.data?.length || 0;
      return {
        name: "Network: xAI API connectivity",
        status: "PASS",
        message: `Connected successfully (${modelCount} models available)`,
      };
    } else {
      return {
        name: "Network: xAI API connectivity",
        status: "FAIL",
        message: `HTTP ${response.status}: ${response.statusText}`,
        remediation: "Check API key and base URL",
      };
    }
  } catch (error: any) {
    return {
      name: "Network: xAI API connectivity",
      status: "FAIL",
      message: error.message || "Network error",
      remediation: "Check internet connection and firewall settings",
    };
  }
}

async function checkStreaming(): Promise<CheckResult> {
  try {
    const response = await chat(
      [
        { role: "system", content: "You are a test assistant." },
        { role: "user", content: "Reply with: OK" },
      ],
      { model: "grok-4-fast", temperature: 0, maxTokens: 10 }
    );

    if (response.text.includes("OK") || response.text.length > 0) {
      return {
        name: "Streaming: Basic chat completion",
        status: "PASS",
        message: "Chat completion working",
      };
    } else {
      return {
        name: "Streaming: Basic chat completion",
        status: "WARN",
        message: "Unexpected response format",
      };
    }
  } catch (error: any) {
    return {
      name: "Streaming: Basic chat completion",
      status: "FAIL",
      message: error.message || "Streaming test failed",
      remediation: "Check API key and model access",
    };
  }
}

async function checkClockSkew(): Promise<CheckResult> {
  try {
    const localTime = Date.now();
    const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
    const data: any = await response.json();
    const serverTime = data.unixtime * 1000;
    const skew = Math.abs(localTime - serverTime);

    if (skew < 5000) {
      return {
        name: "Clock: Time synchronization",
        status: "PASS",
        message: `Clock skew: ${skew}ms (acceptable)`,
      };
    } else if (skew < 30000) {
      return {
        name: "Clock: Time synchronization",
        status: "WARN",
        message: `Clock skew: ${skew}ms (may cause issues)`,
        remediation: "Sync system clock with NTP",
      };
    } else {
      return {
        name: "Clock: Time synchronization",
        status: "FAIL",
        message: `Clock skew: ${skew}ms (too large)`,
        remediation: "Sync system clock immediately",
      };
    }
  } catch {
    return {
      name: "Clock: Time synchronization",
      status: "WARN",
      message: "Unable to check (network issue)",
    };
  }
}

async function checkFileSystem(): Promise<CheckResult> {
  const configDir = path.join(process.cwd(), ".forge");

  try {
    // Test write
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const testFile = path.join(configDir, ".test-write");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);

    return {
      name: "File system: .forge directory",
      status: "PASS",
      message: "Read/write permissions OK",
    };
  } catch (error: any) {
    return {
      name: "File system: .forge directory",
      status: "FAIL",
      message: `Permission denied: ${error.message}`,
      remediation: "Check directory permissions for .forge/",
    };
  }
}

async function checkMCP(): Promise<CheckResult> {
  const mcpFile = path.join(process.cwd(), ".forge", "mcp-servers.json");

  if (!fs.existsSync(mcpFile)) {
    return {
      name: "MCP: Server configuration",
      status: "PASS",
      message: "No MCP servers configured (optional)",
    };
  }

  try {
    const servers = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
    const serverCount = Object.keys(servers).length;

    // TODO: Test actual MCP endpoints when client is implemented
    return {
      name: "MCP: Server configuration",
      status: "PASS",
      message: `${serverCount} server(s) registered`,
    };
  } catch (error: any) {
    return {
      name: "MCP: Server configuration",
      status: "WARN",
      message: "Invalid MCP config file",
      remediation: "Check .forge/mcp-servers.json syntax",
    };
  }
}
