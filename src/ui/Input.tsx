/**
 * Beautiful input field with ghost completion
 */
import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { colors, borders } from "./theme.js";

interface InputProps {
  value: string;
  ghost: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onTab?: () => void;
  onEscape?: () => void;
}

export const Input: React.FC<InputProps> = ({
  value,
  ghost,
  placeholder = "Type your message...",
  onChange,
  onSubmit,
  onTab,
  onEscape,
}) => {
  const showGhost = ghost && ghost.startsWith(value) && value.length > 0;
  const ghostText = showGhost ? ghost.slice(value.length) : "";

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color="cyan" bold>{">"} </Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={true}
      />
      {ghostText && <Text dimColor>{ghostText}</Text>}
    </Box>
  );
};
