/**
 * Sticky footer with live metrics and status
 */
import React from "react";
import { Box, Text } from "ink";
import type { Metrics, StatusSummary } from "../state/store.js";
import { MultiTokenBar } from "./components/TokenBar.js";
import { StatusLane } from "./components/StatusLane.js";
import { symbols } from "./theme.js";

interface FooterProps {
  model: string;
  metrics: Metrics;
  status: StatusSummary;
}

export const Footer: React.FC<FooterProps> = ({ model, metrics, status }) => {
  const contextUsed = metrics.promptTokens + metrics.outputTokens + metrics.reasoningTokens;
  const modelMax = 2_000_000; // Grok-4 context window
  
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
      {/* Metrics Line */}
      <Box justifyContent="space-between">
        <Box>
          <Text>
            <Text color="yellow">{symbols.lightning}</Text>
            <Text> </Text>
            <Text color="white">{model}</Text>
            <Text dimColor> | </Text>
            <Text dimColor>ctx </Text>
            <Text color="cyan">{contextUsed}</Text>
            <Text dimColor> | </Text>
            <Text dimColor>prompt </Text>
            <Text>{metrics.promptTokens}</Text>
            <Text dimColor> | </Text>
            <Text dimColor>out </Text>
            <Text>{metrics.outputTokens}</Text>
            <Text dimColor> | </Text>
            <Text dimColor>reason </Text>
            <Text>{metrics.reasoningTokens}</Text>
            <Text dimColor> | </Text>
            <Text>{metrics.latencyMs}ms</Text>
          </Text>
        </Box>
      </Box>
      
      {/* Bar Chart */}
      <Box>
        <MultiTokenBar
          prompt={metrics.promptTokens}
          output={metrics.outputTokens}
          reasoning={metrics.reasoningTokens}
          max={modelMax}
          width={40}
        />
      </Box>
      
      {/* Status Lane */}
      {(status.current || status.next) && (
        <Box marginTop={1}>
          <StatusLane now={status.current} next={status.next} />
        </Box>
      )}
    </Box>
  );
};
