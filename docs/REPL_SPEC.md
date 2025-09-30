# REPL Specification

## Executive Summary
A production-quality, Ink-powered REPL for the Forge CLI that delivers a visually stunning, responsive chat interface with xAI Grok integration. Zero scrolling spam, live metrics, and a beautiful "thinking" UX that respects user attention.

---

## Goals
1. **Visual Excellence**: Modern TUI with rounded borders, subtle gradients, tasteful colors
2. **Performance**: Throttled renders (≤12 FPS), deduped frames, smooth updates
3. **Clarity**: Clear separation between durable transcript and ephemeral status
4. **Transparency**: Public "Now/Next" summaries replace raw chain-of-thought dumps
5. **Reliability**: TTY-aware, graceful degradation, robust error handling

---

## UX Map

```
┌─────────────────────────────────────────────────────────────┐
│ Header: [💬 forge]  /help /status /model /exit  [grok-4]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Transcript (scrollable, durable):                           │
│   👤 You: <message>                                          │
│   🌿 Assistant: <response>                                   │
│   ℹ️  Event: <system message>                                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ ╭─ Input ───────────────────────────────────────────────╮   │
│ │ > <user types here> [ghost suggestion]__             │   │
│ ╰───────────────────────────────────────────────────────╯   │
├─────────────────────────────────────────────────────────────┤
│ Footer (live metrics + status):                             │
│ ⚡ grok-4 | ctx 1024 | prompt 800 | out 200 | reason 24 | 340ms │
│ [████████░░] Now: Analyzing request  Next: Drafting response │
└─────────────────────────────────────────────────────────────┘
```

---

## States & Transitions

### Application States
- **INIT**: Loading config, showing banner
- **IDLE**: Waiting for user input
- **STREAMING**: Assistant generating response
- **ERROR**: Displaying error, returning to IDLE

### Thinking States (During STREAMING)
- Show `Now: <current step>` and `Next: <predicted step>`
- Update in place as progress events arrive
- Never show raw reasoning tokens

---

## Metrics Tracking

### Token Usage (from xAI API)
- `prompt_tokens`: input tokens
- `completion_tokens`: output tokens
- `completion_tokens_details.reasoning_tokens`: reasoning tokens
- `total_tokens`: sum of all

### Performance
- `latency_ms`: time from request start to final token
- Render FPS: capped at 12, measured via frame timestamps

### Context Budget
- Model max: 2M tokens for grok-4-fast
- Warn at 75% utilization
- Display as percentage + bar chart

---

## Error Cases & Recovery

| Error | Handling |
|-------|----------|
| Missing XAI_API_KEY | Show clear error message, suggest setup |
| Network timeout | Retry with exponential backoff, max 3 attempts |
| 404 Not Found | Check base URL includes /v1, suggest fix |
| Rate limit | Display friendly message, wait and retry |
| Non-TTY mode | Disable ANSI, print plain JSON output |
| Narrow terminal | Wrap text, min width 40 cols |

---

## Acceptance Checklist

### Visual
- [ ] Rounded input box with gradient border
- [ ] Ghost completion suggestions (dim text)
- [ ] Smooth token bar animations
- [ ] No flickering or repeated lines
- [ ] Proper text wrapping at terminal width

### Functional
- [ ] `/help` shows commands
- [ ] `/status` shows current model + metrics
- [ ] `/model <name>` switches and persists
- [ ] `/exit` restores terminal state
- [ ] Tab accepts ghost completion
- [ ] Esc clears current input
- [ ] Double Ctrl+C exits gracefully

### Performance
- [ ] Render rate ≤12 FPS
- [ ] Frame deduplication working
- [ ] No blocking on main thread
- [ ] Memory stable over 100+ turns

### Streaming
- [ ] Text appears incrementally
- [ ] "Now/Next" summaries update live
- [ ] Token counts increment during stream
- [ ] Final usage reconciled at end

### TTY Awareness
- [ ] Alt screen buffer in TTY mode
- [ ] Plain text output in non-TTY
- [ ] No ANSI codes when piped
- [ ] Graceful degradation

---

## Success Metrics
- Zero duplicate "Context:" lines
- Input latency <50ms (keypress to render)
- Streaming latency <200ms (first token)
- Test suite passes 100%
- Smoke test completes in <5s
