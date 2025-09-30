# Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Entry                            │
│  src/cli.ts: detect TTY, load env, spawn Ink or plain mode  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼─────┐                  ┌─────▼──────┐
    │ Ink Mode │                  │ Plain Mode │
    │ (TTY)    │                  │ (Non-TTY)  │
    └────┬─────┘                  └─────┬──────┘
         │                               │
         │                               │
    ┌────▼──────────────────────────────▼────┐
    │          State Store                   │
    │  src/state/store.ts                    │
    │  - transcript[]                        │
    │  - currentInput                        │
    │  - metrics                             │
    │  - statusSummary {current, next}       │
    └────┬───────────────────────────────────┘
         │
         │
    ┌────▼──────────────────────────────────┐
    │      xAI Grok Client                  │
    │  src/llm/xai.ts                       │
    │  - chatStream(messages, opts)         │
    │  - yields {delta, usage, summary}     │
    └────┬──────────────────────────────────┘
         │
         │ SSE
    ┌────▼──────────────────────────────────┐
    │   api.x.ai/v1/chat/completions        │
    └───────────────────────────────────────┘
```

## Ink Component Tree

```
<App>
  ├─ <Header model={model} />
  ├─ <Transcript messages={transcript} />
  ├─ <Input
  │    value={input}
  │    ghost={ghostSuggestion}
  │    onChange={...}
  │    onSubmit={...}
  │  />
  └─ <Footer
       metrics={metrics}
       status={statusSummary}
     >
       ├─ <TokenBar ... />
       └─ <StatusLane now={...} next={...} />
     </Footer>
</App>
```

---

## Data Flow

### 1. User Input
```
User types → Input component
  → update store.currentInput
  → request ghost completion (debounced)
  → render update (throttled)
```

### 2. Submit Message
```
User presses Enter → Input.onSubmit
  → add user message to transcript
  → clear input
  → call xai.chatStream(messages)
  → enter STREAMING state
```

### 3. Streaming Response
```
xai.chatStream yields chunks:
  for await (chunk of stream) {
    if (chunk.delta) {
      → append to assistant message in transcript
      → increment output tokens
    }
    if (chunk.summary) {
      → update statusSummary.current/next
    }
    if (chunk.usage) {
      → update final metrics
    }
    → throttled render (max 12 FPS)
  }
  → return to IDLE state
```

### 4. Status Updates
```
During streaming:
  - Footer shows "Now/Next" summaries
  - Token bars animate incrementally
  - Latency counter updates
  
After completion:
  - Final usage reconciled
  - Status cleared
  - Ready for next input
```

---

## Streaming Lifecycle

### Phase 1: Request
1. Build message array from transcript + new user input
2. Call `xai.chatStream(messages, { model, stream: true })`
3. Show "Now: Initializing..."

### Phase 2: First Token
4. First delta arrives (TTFT measured)
5. Create new assistant message in transcript
6. Update "Now: Generating response"

### Phase 3: Streaming
7. For each chunk:
   - Append content delta
   - Update token counters
   - Update status summaries if present
   - Throttle render (dedupe frames)

### Phase 4: Completion
8. Stream ends (SSE `[DONE]` or closed)
9. Reconcile final usage
10. Clear "Now/Next" status
11. Return to IDLE

### Error Recovery
- Timeout: cancel stream, show error, return to IDLE
- Network error: retry logic, show warning
- Parse error: log, skip chunk, continue

---

## State Management

### Store Shape
```typescript
interface Store {
  // Durable
  transcript: Message[];
  model: string;
  
  // Ephemeral
  currentInput: string;
  ghostSuggestion: string;
  
  // Metrics
  metrics: {
    promptTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  
  // Status
  statusSummary: {
    current: string; // "Now: ..."
    next: string;    // "Next: ..."
  };
  
  // Runtime
  isStreaming: boolean;
  error: string | null;
}
```

### Events
- `INPUT_CHANGED`
- `MESSAGE_SUBMITTED`
- `STREAM_STARTED`
- `DELTA_RECEIVED`
- `SUMMARY_UPDATED`
- `STREAM_COMPLETED`
- `ERROR_OCCURRED`

### Selectors
- `getTranscript()`
- `getCurrentMetrics()`
- `getStatusSummary()`
- `isReady()`

---

## Rendering Strategy

### Throttling
- Use `useEffect` + `requestAnimationFrame` pattern
- Target 12 FPS (83ms per frame)
- Batch state updates

### Deduplication
- Hash current frame props
- Skip render if hash unchanged
- Works at component level (Header, Footer, etc.)

### Layout
- Flexbox via Ink's `<Box>`
- Header: fixed height
- Transcript: flex-grow, scrollable
- Input: fixed height (3 lines)
- Footer: fixed height (2 lines)

---

## TTY Detection & Fallback

### TTY Mode (process.stdout.isTTY === true)
- Use Ink with alt screen buffer
- Full ANSI colors and styling
- Live updates and animations

### Non-TTY Mode (piped/redirected)
- Skip Ink rendering
- Print plain text output
- JSON usage at end
- No escape codes

### Implementation
```typescript
if (process.stdout.isTTY) {
  render(<App />);
} else {
  // Plain mode: line-by-line output
  await plainModeChat(prompt);
}
```

---

## Dependencies

### Core
- `ink` (^4.0.0): React-for-CLI
- `ink-text-input` (^5.0.0): Input field
- `react` (^18.0.0): Required by Ink

### Utilities
- `chalk` (^5.3.0): Colors (already installed)
- `undici` (^6.19.8): Fetch polyfill (already installed)
- `dotenv` (^16.6.1): Env loading (already installed)

### Dev
- `@types/react` (^18.0.0)
- Existing TS/test setup

---

## Testing Strategy

### Unit Tests
- State store mutations
- xAI client parsing
- Component prop handling

### Integration Tests
- Full stream lifecycle
- Error recovery
- TTY detection

### E2E Smoke Test
- Spawn CLI in subprocess
- Send prompt via stdin
- Assert output contains expected patterns
- Verify metrics present
