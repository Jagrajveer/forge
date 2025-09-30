import ora from "ora";
import chalk from "chalk";
import type { SpinnerName } from "cli-spinners";

export class AnimationManager {
  private spinner: any = null;
  private isActive = false;

  startSpinner(text: string, spinnerType: SpinnerName = "dots") {
    if (this.isActive) {
      this.stopSpinner();
    }
    
    this.spinner = ora({
      text: chalk.cyan(text),
      spinner: spinnerType,
      color: "cyan",
    }).start();
    
    this.isActive = true;
  }

  updateSpinner(text: string) {
    if (this.spinner && this.isActive) {
      this.spinner.text = chalk.cyan(text);
    }
  }

  stopSpinner() {
    if (this.spinner && this.isActive) {
      this.spinner.stop();
      this.isActive = false;
    }
  }

  succeed(text: string) {
    if (this.spinner && this.isActive) {
      this.spinner.succeed(chalk.green(text));
      this.isActive = false;
    }
  }

  fail(text: string) {
    if (this.spinner && this.isActive) {
      this.spinner.fail(chalk.red(text));
      this.isActive = false;
    }
  }

  warn(text: string) {
    if (this.spinner && this.isActive) {
      this.spinner.warn(chalk.yellow(text));
      this.isActive = false;
    }
  }

  info(text: string) {
    if (this.spinner && this.isActive) {
      this.spinner.info(chalk.blue(text));
      this.isActive = false;
    }
  }
}

// Global animation manager instance
export const animationManager = new AnimationManager();

// Convenience functions
export function startThinkingAnimation() {
  animationManager.startSpinner("💭 Thinking...", "dots");
}

export function startProcessingAnimation() {
  animationManager.startSpinner("⚡ Processing...", "bouncingBar");
}

export function startLoadingAnimation(text: string) {
  animationManager.startSpinner(text, "dots");
}

export function updateAnimation(text: string) {
  animationManager.updateSpinner(text);
}

export function stopAnimation() {
  animationManager.stopSpinner();
}

export function succeedAnimation(text: string) {
  animationManager.succeed(text);
}

export function failAnimation(text: string) {
  animationManager.fail(text);
}

export function warnAnimation(text: string) {
  animationManager.warn(text);
}

export function infoAnimation(text: string) {
  animationManager.info(text);
}

// Extended named helpers for specific phases
export function startVerifyingAnimation() {
  animationManager.startSpinner("🔎 Verifying...", "dots");
}

export function startApplyPatchAnimation() {
  animationManager.startSpinner("🩹 Applying patch...", "dots");
}

export function startRunTestsAnimation() {
  animationManager.startSpinner("🧪 Running tests...", "dots");
}

// Fancy animations
export function startThinkingPulse() {
  animationManager.startSpinner("💭 Thinking...", "dots2");
}

export function startLightning() {
  animationManager.startSpinner("⚡⚡⚡", "line" as any);
}