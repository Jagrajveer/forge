# ⚡ Forge CLI v2 - Quick Start Guide

## One-Screen Summary

```bash
# Install & Build
npm install
npm run build

# Set API Key
export XAI_API_KEY=xai-your-key-here

# Run Diagnostics
node dist/cli-v2.js auth doctor

# Start Enhanced REPL
node dist/cli-v2.js chat

# Use Kiro Agent
node dist/cli-v2.js agent "Your coding goal here"
```

---

## 📋 Commands At A Glance

### Enhanced Chat REPL
```bash
node dist/cli-v2.js chat
node dist/cli-v2.js chat --model grok-4
```
**Features:**
- Persistent header (always visible)
- Scrollable transcript (Wheel/PgUp/PgDn)
- Smart history (Up/Down when input non-empty, Alt+Up/Down to force)
- Ghost suggestions (Tab to accept, Esc to clear)
- Sticky footer with live metrics
- Thinking lane (public summaries, no raw CoT)

**In-REPL Commands:**
- `/help` - Show commands
- `/status` - Display metrics
- `/model <name>` - Switch model
- `/exit` - Quit

---

### Auth Diagnostics
```bash
node dist/cli-v2.js auth doctor
```
**Checks:**
- ✅ XAI_API_KEY environment variable
- ✅ Network connectivity to xAI API
- ✅ Streaming chat completion
- ✅ Clock synchronization
- ✅ File system permissions
- ✅ MCP server configuration

**Output:** PASS/FAIL matrix with remediation

---

### File Operations
```bash
# Read
node dist/cli-v2.js fs read src/core/patcher.ts

# Write
node dist/cli-v2.js fs write output.txt "Hello, World!"
echo "Content" | node dist/cli-v2.js fs write output.txt --stdin

# Patch
node dist/cli-v2.js fs patch changes.patch
node dist/cli-v2.js fs patch changes.patch --interactive
git diff | node dist/cli-v2.js fs patch stdin

# Diff Summary
node dist/cli-v2.js fs diff "src/**/*.ts"
```

---

### Command Execution
```bash
# Suggest
node dist/cli-v2.js cmd suggest "Deploy to production"

# Execute
node dist/cli-v2.js cmd run "Build and test"
node dist/cli-v2.js cmd run "Deploy to production" --yes

# History
node dist/cli-v2.js cmd history
```

---

### Kiro Agent
```bash
node dist/cli-v2.js agent "Add user authentication with JWT"
node dist/cli-v2.js agent "Create a REST API for blog posts"
node dist/cli-v2.js agent "Implement dark mode toggle"
```

**Workflow:**
1. **PLAN** - Task breakdown + acceptance criteria
2. **DESIGN** - File map + interfaces + UX sketch
3. **EXECUTE** - Generate files + apply patches + suggest commands
4. **VERIFY** - Check acceptance criteria + iterate if needed

---

## 🎯 Common Workflows

### Workflow 1: Diagnose Environment
```bash
# Check everything
node dist/cli-v2.js auth doctor

# Example output:
# ✔ Environment: XAI_API_KEY              PASS
# ✔ Network: xAI API connectivity         PASS
# ✔ Streaming: Basic chat completion      PASS
# ✔ Clock: Time synchronization           PASS
# ✔ File system: .forge directory         PASS
# ✔ MCP: Server configuration             PASS
```

### Workflow 2: Interactive Coding Session
```bash
# Start REPL
node dist/cli-v2.js chat

# In REPL:
> How do I implement JWT authentication?
# [Assistant streams response with thinking lane]

> /status
# Model: grok-4-fast
# Context: 1024 tokens
# Prompt: 800 tokens
# ...

> /model grok-4
# Switched to model: grok-4

> /exit
# [Gracefully exits, restores terminal]
```

### Workflow 3: Automated Feature Implementation
```bash
# Start agent with a goal
node dist/cli-v2.js agent "Add user profile page with avatar upload"

# Agent workflow:
# 1. PLAN: Creates task list and acceptance criteria
# 2. DESIGN: Designs file structure and interfaces
# 3. EXECUTE: Generates and writes files
# 4. VERIFY: Checks if all criteria are met

# Example agent output:
# 📊 Summary
# Tasks:
#   ✔ Create profile component
#   ✔ Add avatar upload endpoint
#   ✔ Implement file storage
# Files Modified:
#   • src/components/Profile.tsx
#   • src/api/upload.ts
#   • src/services/storage.ts
```

### Workflow 4: Applying Code Changes
```bash
# Generate a patch
git diff > changes.patch

# Apply with interactive conflict resolution
node dist/cli-v2.js fs patch changes.patch --interactive

# Or from git directly
git diff | node dist/cli-v2.js fs patch stdin

# Check what was modified
node dist/cli-v2.js fs diff "src/**/*.ts"
```

### Workflow 5: Command Automation
```bash
# Get suggestions
node dist/cli-v2.js cmd suggest "Set up CI/CD pipeline"

# Review and execute
node dist/cli-v2.js cmd run "Set up CI/CD pipeline"

# Or auto-approve
node dist/cli-v2.js cmd run "Run all tests" --yes

# Check what commands were successful
node dist/cli-v2.js cmd history
```

---

## 🔧 Configuration

### Required
```bash
export XAI_API_KEY=xai-your-key-here
```

### Optional
```bash
export FORGE_MODEL=grok-4-fast         # Default model
export XAI_BASE_URL=https://api.x.ai/v1  # API base URL (auto-normalized)
```

### Storage Locations
```
.forge/
├── repl_history.txt          # Command history
├── model.json                # Current model selection
├── recipes.json              # Successful command history
└── mcp-servers.json          # MCP server configs (optional)
```

---

## 🎨 REPL Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit message |
| `Tab` | Accept ghost suggestion |
| `Esc` | Clear input |
| `Up` | Previous command (when input non-empty) |
| `Down` | Next command (when input non-empty) |
| `Alt+Up` | Force previous command |
| `Alt+Down` | Force next command |
| `PgUp` | Scroll transcript up |
| `PgDn` | Scroll transcript down |
| `Wheel` | Scroll transcript |
| `Ctrl+C` | Exit |

---

## 🐛 Troubleshooting

### Error: "XAI_API_KEY is required"
```bash
# Set your API key
export XAI_API_KEY=xai-your-key-here

# Or add to .env
echo "XAI_API_KEY=xai-your-key-here" >> .env
```

### Error: "404 Not Found"
```bash
# Check base URL includes /v1
export XAI_BASE_URL=https://api.x.ai/v1

# Run diagnostics
node dist/cli-v2.js auth doctor
```

### REPL Not Rendering Properly
```bash
# Make sure you're in a TTY
node dist/cli-v2.js chat

# Not in a TTY? Use plain mode (automatic fallback)
echo "Hello" | node dist/cli-v2.js chat
```

### Build Errors
```bash
# Install missing dependencies
npm install

# Rebuild
npm run build

# Check for errors
npm run lint
```

---

## 📊 Feature Matrix

| Feature | Status | Command |
|---------|--------|---------|
| Enhanced REPL | ✅ Ready | `node dist/cli-v2.js chat` |
| Auth Doctor | ✅ Ready | `node dist/cli-v2.js auth doctor` |
| File Operations | ✅ Ready | `node dist/cli-v2.js fs <cmd>` |
| Command Execution | ✅ Ready | `node dist/cli-v2.js cmd <cmd>` |
| Kiro Agent | ✅ Ready | `node dist/cli-v2.js agent "<goal>"` |
| MCP Client | 🚧 Planned | TBD |
| RAG Pipeline | 🚧 Planned | TBD |

---

## 🚀 Next Steps

1. **Install & Build**
   ```bash
   npm install && npm run build
   ```

2. **Set API Key**
   ```bash
   export XAI_API_KEY=xai-your-key-here
   ```

3. **Run Diagnostics**
   ```bash
   node dist/cli-v2.js auth doctor
   ```

4. **Try Enhanced REPL**
   ```bash
   node dist/cli-v2.js chat
   ```

5. **Use Kiro Agent**
   ```bash
   node dist/cli-v2.js agent "Your first coding goal"
   ```

---

## 📚 Full Documentation

- **FORGE_V2_SUMMARY.md** - Complete feature documentation
- **UPGRADE_PLAN.md** - Implementation roadmap
- **FORGE_COMMANDS_SUMMARY.md** - Detailed command reference
- **BUILD_SUCCESS.md** - Build troubleshooting

---

## ✨ What's New in v2

1. **Enhanced REPL**
   - Persistent header (never scrolls away)
   - Scrollable transcript (independent of input)
   - Smart command history
   - Ghost suggestions with Tab completion
   - Sticky footer with live metrics
   - Thinking lane with public summaries

2. **Auth Doctor**
   - Comprehensive diagnostics
   - PASS/FAIL matrix
   - Remediation suggestions
   - Non-zero exit on failure

3. **Kiro Agent**
   - PLAN → DESIGN → EXECUTE → VERIFY workflow
   - Task breakdown with acceptance criteria
   - Automatic file generation
   - Command suggestions
   - Iteration support

4. **Production Quality**
   - Zero build errors
   - Graceful degradation (non-TTY fallback)
   - Comprehensive error handling
   - Throttled renders (12 FPS)
   - Frame deduplication

---

**Ready to build amazing things with AI assistance!** 🎉

```bash
npm run build && node dist/cli-v2.js chat
```
