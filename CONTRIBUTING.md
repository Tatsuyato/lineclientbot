# Contributing to lineclientbot

First off, thank you for considering contributing to `lineclientbot`! It's people like you who make the open-source community such an amazing place to learn, inspire, and create.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in this project.

## How Can I Contribute?

### Reporting Bugs
If you find a bug, please check the [issues list](https://github.com/Tatsuyato/lineclientbot/issues) first to see if it has already been reported. If not, open a new issue and use our Bug Report template. Be sure to include:
- A clear description of the bug.
- Steps to reproduce.
- Your Node.js version and OS.
- Any error logs or stack traces.

### Suggesting Enhancements
We welcome ideas for new features or improvements! Please open an issue explaining:
- What problem the enhancement solves.
- What your proposed solution is.
- Any alternative solutions you've considered.

### Submitting a Pull Request (PR)
1. Fork the repository and create a new branch from `master` for your changes.
2. Clone your fork locally.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Make your code changes.
5. Ensure your changes compile and build successfully:
   ```bash
   npm run build
   ```
6. Run the tests to ensure nothing is broken:
   ```bash
   npm test
   ```
7. Commit your changes with clear, descriptive commit messages.
8. Push your branch to your fork.
9. Open a Pull Request against our `master` branch.
10. Fill out the Pull Request template.

## Development Guidelines

### Code Style
- Use clean, readable TypeScript.
- Follow existing patterns in the codebase (e.g., using ES modules, async/await).
- Document new exports, functions, and classes using JSDoc comments where helpful.

### Build Scripts
- `npm run build` - Compiles ESM, CJS, and TypeScript declaration files into `dist/`.
- `npm run clean` - Cleans the `dist/` directory.

### Testing
Tests are located in the `test/` directory. Be sure to run `npm test` before submitting any changes.

---

Thank you again for contributing!
