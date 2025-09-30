# Forge CLI

A powerful AI coding assistant powered by xAI Grok, designed to help developers with code analysis, generation, and automation.

## Features

- 🤖 **AI-Powered Code Assistance**: Uses xAI Grok for intelligent code analysis and generation
- 🛠️ **Tool Integration**: Built-in tools for file operations, git, command execution, and more
- 🔒 **Safety First**: Multi-level approval system with intelligent heuristics
- 📝 **Session Persistence**: Automatic logging of all interactions for audit and debugging
- 🧪 **Verification**: Built-in linting and testing integration
- ⚡ **Fast & Efficient**: Optimized for developer workflows

## Installation

### Prerequisites

- Node.js 18+ 
- Git (for version control operations)
- xAI API key or OpenRouter API key

### Install from npm

```bash
npm install -g @savant-ai/forge
```

### Install from source

```bash
git clone https://github.com/savant-ai/forge.git
cd forge
npm install
npm run build
npm link
```

## Quick Start

### 1. Authentication

Set up your API key using the built-in auth command:

```bash
# For xAI (recommended)
forge auth login

# Or set environment variables
export XAI_API_KEY="your-api-key"
export FORGE_PROVIDER="xai"
```

### 2. Basic Usage

```bash
# Interactive chat session
forge chat

# One-shot question
forge ask "explain this code" --verify lint

# Summarize changes
forge changes

# Check environment
forge env doctor
```

## Commands

### `forge chat`

Start an interactive chat session with the AI assistant.

**Options:**
- `--trace <level>`: Set reasoning visibility (`none`, `plan`, `verbose`)
- `--verify <mode>`: Enable verification (`none`, `lint`, `test`, `both`)
- `--auto`: Auto-approve all tool actions
- `--safe`: Require approval for all writes and commands

**Example:**
```bash
forge chat --trace verbose --verify both
```

### `forge ask <prompt>`

Ask a one-shot question to the AI assistant.

**Options:** Same as `forge chat`

**Example:**
```bash
forge ask "refactor this function to use async/await" --verify lint
```

### `forge changes`

Summarize code changes from your current working tree.

**Options:**
- `--trace <level>`: Set reasoning visibility

**Example:**
```bash
forge changes --trace plan
```

### `forge env doctor`

Check your environment configuration and test API connectivity.

**Example:**
```bash
forge env doctor
```

### `forge auth`

Manage authentication credentials.

**Subcommands:**
- `login`: Log in with an API key
- `logout`: Remove stored credentials
- `info`: Show current authentication status

**Example:**
```bash
forge auth login
forge auth info
```

## Configuration

Forge uses a hierarchical configuration system:

1. **Environment Variables** (highest priority)
2. **`.forge/config.json`** (project-specific)
3. **Default values** (lowest priority)

### Environment Variables

```bash
# Provider configuration
export FORGE_PROVIDER="xai"  # or "openrouter"
export XAI_API_KEY="your-xai-key"
export OPENROUTER_API_KEY="your-openrouter-key"

# Model configuration
export GROK_MODEL_ID="grok-code-fast-1"
export GROK_BASE_URL="https://api.x.ai/v1"

# Tool configuration
export FORGE_CMD_TIMEOUT_MS="300000"  # 5 minutes
export FORGE_TOOL_STDIO_LIMIT="1000000"  # 1MB

# Logging
export LOG_LEVEL="info"  # trace, debug, info, warn, error, fatal
```

### Configuration File

Create `.forge/config.json` in your project root:

```json
{
  "provider": "xai",
  "model": "grok-code-fast-1",
  "baseUrl": "https://api.x.ai/v1",
  "apiKey": "your-api-key",
  "tokensPanel": true,
  "defaultTrace": "plan",
  "render": {
    "mode": "append"
  }
}
```

## Safety & Security

Forge implements multiple safety layers:

### Approval Levels

- **`safe`**: Require approval for all file writes and command execution
- **`balanced`**: Require approval for potentially destructive operations
- **`auto`**: Automatically approve all operations (use with caution)

### Input Validation

- All file paths are validated to prevent directory traversal
- Git commands use proper argument passing to prevent injection
- File sizes are limited to prevent resource exhaustion
- API keys and sensitive data are masked in logs

### Verification

- **Linting**: Automatically runs ESLint when available
- **Testing**: Runs test suites when configured
- **Both**: Runs both linting and testing

## Tools

Forge includes several built-in tools:

### File Operations
- `open_file`: Read file contents with truncation for large files
- `write_file`: Write files with automatic directory creation
- `apply_patch`: Apply unified diff patches using git

### Git Operations
- `git commit`: Create commits with message validation
- `git create_branch`: Create new branches with name validation

### Command Execution
- `run`: Execute shell commands with timeout and output limits

## Session Logging

All interactions are automatically logged to `.forge/sessions/` for:
- **Audit trails**: Track what the AI did
- **Debugging**: Understand tool execution
- **Learning**: Improve future interactions

Logs are stored in JSONL format with timestamps and metadata.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### Common Issues

**"API key not found"**
- Run `forge auth login` to set up authentication
- Check environment variables with `forge env doctor`

**"Command execution failed"**
- Ensure you have the required tools installed (git, etc.)
- Check file permissions
- Try running with `--safe` mode for more control

**"File not found"**
- Verify file paths are correct
- Check if files exist in the current working directory
- Use relative paths from the project root

### Debug Mode

Enable debug logging for more detailed output:

```bash
export LOG_LEVEL="debug"
forge chat
```

### Getting Help

- Check the logs in `.forge/sessions/`
- Run `forge env doctor` to verify configuration
- Use `--trace verbose` for detailed AI reasoning

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Make your changes
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/savant-ai/forge/issues)
- **Discussions**: [GitHub Discussions](https://github.com/savant-ai/forge/discussions)
- **Documentation**: [GitHub Wiki](https://github.com/savant-ai/forge/wiki)

---

Made with ❤️ by the Savant AI team
