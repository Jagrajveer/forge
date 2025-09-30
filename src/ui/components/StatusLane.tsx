/**
 * Shows "Now" and "Next" status summaries during streaming
 */
import React from "react";
import { Box, Text } from "ink";
import { colors, symbols } from "../theme.js";

interface StatusLaneProps {
  now: string;
  next: string;
}

export const StatusLane: React.FC<StatusLaneProps> = ({ now, next }) => {
  if (!now && !next) return null;
  
  return (
    <Box flexDirection="column">
      {now && (
        <Text>
          <Text dimColor>{symbols.thinking} Now: </Text>
          <Text color="cyan">{now}</Text>
        </Text>
      )}
      {next && (
        <Text>
          <Text dimColor>Next: </Text>
          <Text dimColor>{next}</Text>
        </Text>
      )}
    </Box>
  );
};
