# Contributing to Forge

Thank you for your interest in contributing to Forge! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- Git
- A code editor (VS Code recommended)

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/forge.git
   cd forge
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

### Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Run tests and linting**:
   ```bash
   npm test
   npm run lint
   ```

4. **Build and test locally**:
   ```bash
   npm run build
   npm start -- --help
   ```

5. **Commit your changes** with a clear commit message

6. **Push to your fork** and create a pull request

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Follow the existing code style and patterns
- Add proper type annotations
- Use interfaces for object shapes
- Prefer `const` over `let` when possible

### Error Handling

- Use the custom error classes from `src/core/errors.ts`
- Always wrap external API calls in try-catch blocks
- Provide meaningful error messages
- Log errors appropriately using the structured logger

### Testing

- Write tests for all new functionality
- Aim for high test coverage (>80%)
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

### Documentation

- Add JSDoc comments for public APIs
- Update README.md for user-facing changes
- Include examples in documentation
- Keep inline comments concise and helpful

## Project Structure

```
src/
├── cli.ts                 # Main CLI entry point
├── commands/              # CLI command implementations
├── config/                # Configuration management
├── core/                  # Core functionality
│   ├── agent.ts          # Main agent logic
│   ├── contracts.ts      # API contracts and validation
│   ├── errors.ts         # Error handling
│   ├── logger.ts         # Structured logging
│   ├── validation.ts     # Input validation
│   ├── tools/            # Tool implementations
│   └── __tests__/        # Core tests
├── providers/             # LLM provider implementations
├── state/                 # State management (memory, history)
├── ui/                    # User interface components
└── types/                 # TypeScript type definitions
```

## Adding New Features

### New Tools

1. Create a new file in `src/core/tools/`
2. Implement the tool function with proper error handling
3. Add it to the tools registry in `src/core/tools/registry.ts`
4. Add validation in `src/core/validation.ts`
5. Write comprehensive tests
6. Update documentation

### New Commands

1. Create a new file in `src/commands/`
2. Register the command in `src/cli.ts`
3. Add proper error handling and logging
4. Write tests
5. Update README.md

### New Providers

1. Create a new file in `src/providers/`
2. Implement the `LLM` interface
3. Add configuration options
4. Write tests
5. Update documentation

## Testing Guidelines

### Unit Tests

- Place tests in `__tests__` directories
- Use descriptive test names
- Test both success and failure cases
- Mock external dependencies

### Integration Tests

- Test complete workflows
- Use real file system operations when safe
- Test error scenarios

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test src/core/__tests__/validation.test.ts
```

## Pull Request Process

### Before Submitting

1. **Ensure tests pass**: `npm test`
2. **Check linting**: `npm run lint`
3. **Build successfully**: `npm run build`
4. **Test manually**: Try your changes with real usage
5. **Update documentation**: If needed

### Pull Request Template

When creating a pull request, please include:

- **Description**: What changes you made and why
- **Testing**: How you tested the changes
- **Breaking Changes**: Any breaking changes and migration steps
- **Screenshots**: If applicable
- **Related Issues**: Link to any related issues

### Review Process

1. **Automated checks** must pass (tests, linting, build)
2. **Code review** by maintainers
3. **Testing** by maintainers
4. **Approval** and merge

## Bug Reports

When reporting bugs, please include:

- **Description**: Clear description of the issue
- **Steps to reproduce**: Detailed steps to reproduce
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, Node.js version, Forge version
- **Logs**: Relevant log output (remove sensitive data)

## Feature Requests

When requesting features, please include:

- **Use case**: Why this feature would be useful
- **Proposed solution**: How you think it should work
- **Alternatives**: Other solutions you've considered
- **Additional context**: Any other relevant information

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Expected Behavior

- Be respectful and inclusive
- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, trolling, or inappropriate comments
- Personal attacks or political discussions
- Public or private harassment
- Publishing private information without permission
- Other unprofessional conduct

## Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Discord**: [Join our Discord server](https://discord.gg/savant-ai) for real-time chat

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a release tag
4. Publish to npm
5. Create GitHub release

## License

By contributing to Forge, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Forge! 🚀
