/**
 * Smoke test for the Ink REPL
 * Spawns CLI and asserts basic functionality
 */
import { spawn } from "node:child_process";
import * as path from "node:path";

async function smoke() {
  console.log("🧪 Running smoke test...\n");

  const cliPath = path.join(process.cwd(), "dist", "cli-ink.js");
  
  return new Promise<void>((resolve, reject) => {
    const proc = spawn("node", [cliPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0", // Disable colors for easier parsing
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    // Send a test prompt after a brief delay
    setTimeout(() => {
      proc.stdin?.write("Hello\n");
    }, 1000);

    // Exit after 5 seconds
    setTimeout(() => {
      proc.stdin?.write("/exit\n");
    }, 5000);

    proc.on("close", (code) => {
      console.log("📊 Test Results:");
      console.log(`Exit code: ${code}`);
      console.log(`\nStdout length: ${stdout.length} chars`);
      console.log(`Stderr length: ${stderr.length} chars`);

      // Basic assertions
      const checks = [
        { name: "Process exited cleanly", pass: code === 0 || code === null },
        { name: "Output generated", pass: stdout.length > 0 },
        { name: "No critical errors", pass: !stderr.includes("Error:") || stderr.length === 0 },
      ];

      let allPassed = true;
      checks.forEach((check) => {
        const icon = check.pass ? "✅" : "❌";
        console.log(`${icon} ${check.name}`);
        if (!check.pass) allPassed = false;
      });

      if (allPassed) {
        console.log("\n✨ Smoke test PASSED\n");
        resolve();
      } else {
        console.log("\n💥 Smoke test FAILED\n");
        console.log("Stdout:", stdout.slice(0, 500));
        console.log("Stderr:", stderr.slice(0, 500));
        reject(new Error("Smoke test failed"));
      }
    });

    proc.on("error", (err) => {
      console.error("Failed to spawn process:", err);
      reject(err);
    });
  });
}

smoke()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
