/**
 * Header bar with hints and model badge
 */
import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

interface HeaderProps {
  model: string;
}

export const Header: React.FC<HeaderProps> = ({ model }) => {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text>
        <Text color="cyan" bold>💬 forge</Text>
        <Text dimColor>  /help /status /model /exit</Text>
      </Text>
      <Text>
        <Text dimColor>[</Text>
        <Text color="magenta">{model}</Text>
        <Text dimColor>]</Text>
      </Text>
    </Box>
  );
};
