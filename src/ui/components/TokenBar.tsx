/**
 * Tiny ASCII bar chart for token visualization
 */
import React from "react";
import { Text } from "ink";
import { colors } from "../theme.js";

interface TokenBarProps {
  value: number;
  max: number;
  width?: number;
  color?: typeof colors.primary;
}

export const TokenBar: React.FC<TokenBarProps> = ({ 
  value, 
  max, 
  width = 10,
  color = colors.primary 
}) => {
  const percentage = max > 0 ? Math.min(1, value / max) : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  
  const bar = "█".repeat(filled) + "░".repeat(empty);
  
  const coloredBar = color ? color(bar) : bar;
  return <Text>{coloredBar}</Text>;
};

interface MultiTokenBarProps {
  prompt: number;
  output: number;
  reasoning: number;
  max: number;
  width?: number;
}

export const MultiTokenBar: React.FC<MultiTokenBarProps> = ({
  prompt,
  output,
  reasoning,
  max,
  width = 30,
}) => {
  const total = prompt + output + reasoning;
  const percentage = max > 0 ? Math.min(1, total / max) : 0;
  const totalFilled = Math.round(percentage * width);
  
  // Proportional split
  const promptWidth = total > 0 ? Math.round((prompt / total) * totalFilled) : 0;
  const outputWidth = total > 0 ? Math.round((output / total) * totalFilled) : 0;
  const reasoningWidth = totalFilled - promptWidth - outputWidth;
  const emptyWidth = width - totalFilled;
  
  return (
    <Text>
      <Text color="blue">{"█".repeat(promptWidth)}</Text>
      <Text color="green">{"█".repeat(outputWidth)}</Text>
      <Text color="magenta">{"█".repeat(reasoningWidth)}</Text>
      <Text dimColor>{"░".repeat(emptyWidth)}</Text>
    </Text>
  );
};
