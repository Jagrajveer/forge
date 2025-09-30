/**
 * Durable message transcript
 */
import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../state/store.js";
import { colors, symbols } from "./theme.js";

interface TranscriptProps {
  messages: Message[];
}

export const Transcript: React.FC<TranscriptProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text dimColor>Start a conversation...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {messages.map((msg, idx) => (
        <Box key={idx} flexDirection="column" marginBottom={1}>
          <Text>
            {msg.role === "user" && (
              <>
                <Text color="blue" bold>{symbols.user} You: </Text>
              </>
            )}
            {msg.role === "assistant" && (
              <>
                <Text color="green" bold>{symbols.assistant} Assistant: </Text>
              </>
            )}
            {msg.role === "system" && (
              <>
                <Text dimColor>{symbols.system} System: </Text>
              </>
            )}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
    </Box>
  );
};
