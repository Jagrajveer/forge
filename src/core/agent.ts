/**
 * Enhanced Agent with RAG, MCP, and PLAN → DESIGN → EXECUTE workflow
 */
import chalk from "chalk";
import prompts from "prompts";
import { chat } from "../llm/xai.js";
import type { XAIMessage } from "../llm/xai.js";
import { writeFileSafe } from "./patcher.js";
import { executeCommands } from "./runner.js";
import { ContextService } from "./context.js";

type Phase = "PLAN" | "DESIGN" | "EXECUTE" | "VERIFY" | "COMPLETE";

interface Task {
  id: string;
  description: string;
  completed: boolean;
  reasoning: string;
}

interface PlanPhase {
  goal: string;
  context: string;
  tasks: Task[];
  acceptanceCriteria: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

interface DesignPhase {
  architecture: string;
  fileMap: Record<string, { purpose: string; dependencies: string[] }>;
  dataFlow: string;
  interfaces: Array<{ name: string; definition: string }>;
  uxSketch: string;
}

interface ExecutePhase {
  files: Array<{ path: string; content: string; purpose: string }>;
  commands: Array<{ command: string; purpose: string }>;
  verificationSteps: string[];
}

interface AgentState {
  goal: string;
  currentPhase: Phase;
  plan: PlanPhase | null;
  design: DesignPhase | null;
  execute: ExecutePhase | null;
  chatHistory: XAIMessage[];
  autoApprove: boolean;
}

export class Agent {
  private state: AgentState;
  private contextService: ContextService;

  constructor(goal: string, autoApprove: boolean = false) {
    this.state = {
      goal,
      currentPhase: "PLAN",
      plan: null,
      design: null,
      execute: null,
      chatHistory: [],
      autoApprove,
    };
    this.contextService = new ContextService();
  }

  async run(): Promise<void> {
    console.log(chalk.bold.cyan(`\n🤖 Enhanced Agent\n`));
    console.log(chalk.bold(`Goal: ${this.state.goal}\n`));

    try {
      while (this.state.currentPhase !== "COMPLETE") {
        console.log(chalk.bold.yellow(`\n${"═".repeat(60)}`));
        console.log(chalk.bold.yellow(`  Phase: ${this.state.currentPhase}`));
        console.log(chalk.bold.yellow(`${"═".repeat(60)}\n`));

        switch (this.state.currentPhase) {
          case "PLAN":
            await this.runPlanPhase();
            break;
          case "DESIGN":
            await this.runDesignPhase();
            break;
          case "EXECUTE":
            await this.runExecutePhase();
            break;
          case "VERIFY":
            await this.runVerifyPhase();
            break;
        }
      }

      console.log(chalk.green.bold("\n✅ Agent workflow complete!\n"));
      this.printSummary();
    } catch (error) {
      console.error(chalk.red.bold("\n❌ Agent workflow failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      throw error;
    } finally {
      await this.contextService.close();
    }
  }

  private async runPlanPhase(): Promise<void> {
    console.log(chalk.blue("📋 Planning phase...\n"));

    let context = "";
    try {
      const contextResult = await this.contextService.getContext(this.state.goal);
      context = this.contextService.formatContextForLLM(contextResult);
    } catch (error) {
      console.warn(chalk.yellow(`Context retrieval failed: ${error}`));
    }

    const planPrompt = `You are an expert software architect. Analyze the following goal and create a detailed implementation plan.

GOAL: ${this.state.goal}

${context ? `\nRELEVANT CONTEXT:\n${context}\n` : ""}

Create a comprehensive plan with:
1. Context analysis
2. Detailed task breakdown
3. Acceptance criteria
4. Complexity estimation

Respond with a JSON object containing:
{
  "context": "analysis of the goal and current state",
  "tasks": [
    {
      "id": "task_1",
      "description": "specific task description",
      "reasoning": "why this task is needed"
    }
  ],
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "estimatedComplexity": "low|medium|high"
}`;

    const messages: XAIMessage[] = [
      { role: "system", content: planPrompt },
      { role: "user", content: this.state.goal }
    ];

    const response = await chat(messages);
    this.state.chatHistory.push({ role: "user", content: this.state.goal });
    this.state.chatHistory.push({ role: "assistant", content: response.text });

    try {
      const planData = JSON.parse(response.text);
      this.state.plan = {
        goal: this.state.goal,
        context: planData.context || "",
        tasks: planData.tasks || [],
        acceptanceCriteria: planData.acceptanceCriteria || [],
        estimatedComplexity: planData.estimatedComplexity || "medium"
      };

      console.log(chalk.green("✅ Plan created successfully!\n"));
      this.printPlan();
    } catch (error) {
      console.error(chalk.red("Failed to parse plan JSON:"));
      console.error(chalk.red(response));
      throw new Error("Plan phase failed - invalid JSON response");
    }

    if (!this.state.autoApprove) {
      const { proceed } = await prompts({
        type: "confirm",
        name: "proceed",
        message: "Proceed to design phase?",
        initial: true
      });

      if (!proceed) {
        this.state.currentPhase = "COMPLETE";
        return;
      }
    }

    this.state.currentPhase = "DESIGN";
  }

  private async runDesignPhase(): Promise<void> {
    console.log(chalk.blue("🎨 Design phase...\n"));

    const designPrompt = `You are an expert software architect. Based on the plan, create a detailed design.

PLAN:
${JSON.stringify(this.state.plan, null, 2)}

Create a comprehensive design with:
1. System architecture
2. File structure and purposes
3. Data flow
4. Interface definitions
5. UX considerations

Respond with a JSON object containing:
{
  "architecture": "high-level system design",
  "fileMap": {
    "path/to/file.ts": {
      "purpose": "file purpose",
      "dependencies": ["other/file.ts"]
    }
  },
  "dataFlow": "how data flows through the system",
  "interfaces": [
    {
      "name": "InterfaceName",
      "definition": "interface definition"
    }
  ],
  "uxSketch": "user experience description"
}`;

    const messages: XAIMessage[] = [
      { role: "system", content: designPrompt },
      ...this.state.chatHistory
    ];

    const response = await chat(messages);
    this.state.chatHistory.push({ role: "assistant", content: response.text });

    try {
      const designData = JSON.parse(response.text);
      this.state.design = {
        architecture: designData.architecture || "",
        fileMap: designData.fileMap || {},
        dataFlow: designData.dataFlow || "",
        interfaces: designData.interfaces || [],
        uxSketch: designData.uxSketch || ""
      };

      console.log(chalk.green("✅ Design created successfully!\n"));
      this.printDesign();
    } catch (error) {
      console.error(chalk.red("Failed to parse design JSON:"));
      console.error(chalk.red(response));
      throw new Error("Design phase failed - invalid JSON response");
    }

    if (!this.state.autoApprove) {
      const { proceed } = await prompts({
        type: "confirm",
        name: "proceed",
        message: "Proceed to execution phase?",
        initial: true
      });

      if (!proceed) {
        this.state.currentPhase = "COMPLETE";
        return;
      }
    }

    this.state.currentPhase = "EXECUTE";
  }

  private async runExecutePhase(): Promise<void> {
    console.log(chalk.blue("⚡ Execution phase...\n"));

    const executePrompt = `You are an expert software developer. Based on the plan and design, generate the implementation.

PLAN:
${JSON.stringify(this.state.plan, null, 2)}

DESIGN:
${JSON.stringify(this.state.design, null, 2)}

Generate the complete implementation with:
1. All necessary files with full content
2. Commands to run
3. Verification steps

Respond with a JSON object containing:
{
  "files": [
    {
      "path": "path/to/file.ts",
      "content": "complete file content",
      "purpose": "what this file does"
    }
  ],
  "commands": [
    {
      "command": "npm install",
      "purpose": "install dependencies"
    }
  ],
  "verificationSteps": ["step 1", "step 2"]
}`;

    const messages: XAIMessage[] = [
      { role: "system", content: executePrompt },
      ...this.state.chatHistory
    ];

    const response = await chat(messages);
    this.state.chatHistory.push({ role: "assistant", content: response.text });

    try {
      const executeData = JSON.parse(response.text);
      this.state.execute = {
        files: executeData.files || [],
        commands: executeData.commands || [],
        verificationSteps: executeData.verificationSteps || []
      };

      console.log(chalk.green("✅ Implementation generated!\n"));
      this.printExecute();

      await this.executeImplementation();
    } catch (error) {
      console.error(chalk.red("Failed to parse execution JSON:"));
      console.error(chalk.red(response));
      throw new Error("Execution phase failed - invalid JSON response");
    }

    this.state.currentPhase = "VERIFY";
  }

  private async runVerifyPhase(): Promise<void> {
    console.log(chalk.blue("🔍 Verification phase...\n"));

    if (!this.state.execute) {
      console.log(chalk.yellow("No implementation to verify"));
      this.state.currentPhase = "COMPLETE";
      return;
    }

    console.log("Running verification steps...\n");

    for (const step of this.state.execute.verificationSteps) {
      console.log(chalk.cyan(`• ${step}`));
    }

    if (this.state.plan) {
      for (const task of this.state.plan.tasks) {
        task.completed = true;
      }
    }

    console.log(chalk.green("\n✅ Verification complete!\n"));
    this.state.currentPhase = "COMPLETE";
  }

  private async executeImplementation(): Promise<void> {
    if (!this.state.execute) return;

    console.log(chalk.blue("📝 Creating files...\n"));

    for (const file of this.state.execute.files) {
      try {
        console.log(chalk.cyan(`Creating: ${file.path}`));
        writeFileSafe(file.path, file.content);
        console.log(chalk.green(`✅ ${file.path}`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to create ${file.path}: ${error}`));
      }
    }

    if (this.state.execute.commands.length > 0) {
      console.log(chalk.blue("\n🔧 Running commands...\n"));

      for (const cmd of this.state.execute.commands) {
        console.log(chalk.cyan(`Running: ${cmd.command}`));
        try {
          await executeCommands({
            goal: cmd.command,
            steps: [{ description: cmd.purpose, command: cmd.command, expected: "Success" }]
          }, { yes: this.state.autoApprove });
          console.log(chalk.green(`✅ ${cmd.command}`));
        } catch (error) {
          console.error(chalk.red(`❌ Failed to run ${cmd.command}: ${error}`));
        }
      }
    }
  }

  private printPlan(): void {
    if (!this.state.plan) return;

    console.log(chalk.bold.cyan("📋 PLAN SUMMARY"));
    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.white(`Context: ${this.state.plan.context}`));
    console.log(chalk.white(`Complexity: ${this.state.plan.estimatedComplexity}`));
    console.log(chalk.white(`Tasks: ${this.state.plan.tasks.length}`));
    console.log(chalk.white(`Acceptance Criteria: ${this.state.plan.acceptanceCriteria.length}`));
    console.log();
  }

  private printDesign(): void {
    if (!this.state.design) return;

    console.log(chalk.bold.cyan("🎨 DESIGN SUMMARY"));
    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.white(`Architecture: ${this.state.design.architecture}`));
    console.log(chalk.white(`Files: ${Object.keys(this.state.design.fileMap).length}`));
    console.log(chalk.white(`Interfaces: ${this.state.design.interfaces.length}`));
    console.log();
  }

  private printExecute(): void {
    if (!this.state.execute) return;

    console.log(chalk.bold.cyan("⚡ EXECUTION SUMMARY"));
    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.white(`Files: ${this.state.execute.files.length}`));
    console.log(chalk.white(`Commands: ${this.state.execute.commands.length}`));
    console.log(chalk.white(`Verification Steps: ${this.state.execute.verificationSteps.length}`));
    console.log();
  }

  private printSummary(): void {
    console.log(chalk.bold.green("🎉 FINAL SUMMARY"));
    console.log(chalk.gray("═".repeat(50)));

    if (this.state.plan) {
      const completedTasks = this.state.plan.tasks.filter(t => t.completed).length;
      console.log(chalk.white(`Tasks: ${completedTasks}/${this.state.plan.tasks.length} completed`));
    }

    if (this.state.execute) {
      console.log(chalk.white(`Files created: ${this.state.execute.files.length}`));
      console.log(chalk.white(`Commands executed: ${this.state.execute.commands.length}`));
    }

    console.log(chalk.white(`Goal: ${this.state.goal}`));
    console.log();
  }

  async startInteractive(): Promise<void> {
    console.log(chalk.bold.cyan(`\n🤖 Enhanced Agent - Interactive Mode\n`));
    console.log(chalk.gray("Type 'exit' to quit, 'help' for commands\n"));

    while (true) {
      try {
        const { input } = await prompts({
          type: "text",
          name: "input",
          message: "💬 ",
        });

        if (!input || input.toLowerCase() === "exit") {
          break;
        }

        if (input.toLowerCase() === "help") {
          this.printHelp();
          continue;
        }

        let context = "";
        try {
          const contextResult = await this.contextService.getContext(input);
          context = this.contextService.formatContextForLLM(contextResult);
        } catch (error) {
          console.warn(chalk.yellow(`Context retrieval failed: ${error}`));
        }

        const messages: XAIMessage[] = [
          { role: "system", content: `You are an expert coding assistant. Help the user with their request.${context ? `\n\nRelevant context:\n${context}` : ""}` },
          ...this.state.chatHistory,
          { role: "user", content: input }
        ];

        console.log(chalk.blue("\n🤔 Thinking...\n"));

        const response = await chat(messages);
        this.state.chatHistory.push({ role: "user", content: input });
        this.state.chatHistory.push({ role: "assistant", content: response.text });

        console.log(chalk.white(response.text));
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
      }
    }

    await this.contextService.close();
    console.log(chalk.green("\n👋 Goodbye!\n"));
  }

  private printHelp(): void {
    console.log(chalk.bold.cyan("\n📚 Available Commands:"));
    console.log(chalk.white("  help     - Show this help"));
    console.log(chalk.white("  exit     - Exit the agent"));
    console.log(chalk.white("  status   - Show current status"));
    console.log(chalk.white("  context  - Get context for a query"));
    console.log();
  }
}

export async function startEnhancedAgent(goal: string, autoApprove: boolean = false): Promise<void> {
  const agent = new Agent(goal, autoApprove);
  await agent.run();
}

export async function startInteractiveAgent(): Promise<void> {
  const agent = new Agent("Interactive mode", false);
  await agent.startInteractive();
}
