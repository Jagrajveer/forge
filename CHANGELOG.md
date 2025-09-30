# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive input validation system
- Structured logging with Pino
- Session persistence and history tracking
- Comprehensive test suite with Vitest
- Security improvements for git operations
- Error handling and recovery system
- Documentation and contributing guidelines

### Changed
- Agent execution is now enabled by default
- Improved error messages and user feedback
- Enhanced security for file operations
- Better validation for all user inputs

### Fixed
- Critical execution bug that prevented tool actions
- Git command injection vulnerability
- Type safety issues throughout codebase
- Missing error boundaries and recovery

### Security
- Fixed git command injection vulnerability
- Added input validation for all user inputs
- Implemented proper argument passing for shell commands
- Added file path validation to prevent directory traversal

## [0.1.0] - 2024-01-XX

### Added
- Initial release of Forge CLI
- Basic AI agent with Grok integration
- Core tools: file operations, git, command execution
- Interactive chat and oneshot modes
- Configuration management
- Basic safety mechanisms
- OpenRouter and xAI provider support

### Features
- Interactive chat sessions with AI assistant
- One-shot question answering
- Code change summarization
- File reading and writing
- Git operations (commit, branch creation)
- Command execution with safety controls
- Environment diagnostics
- Authentication management

### Tools
- `open_file`: Read file contents
- `write_file`: Write files with directory creation
- `apply_patch`: Apply unified diff patches
- `run`: Execute shell commands
- `git`: Git operations (commit, create branch)

### Safety
- Multi-level approval system (safe/balanced/auto)
- Command execution safety checks
- File operation approval
- Input validation

### Configuration
- Environment variable support
- JSON configuration files
- Provider selection (xAI, OpenRouter)
- Model configuration
- Logging configuration
