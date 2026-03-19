# Cognitree - Agent-first IDE wrapper for Qwen Code

Cognitree is a VS Code extension that provides seamless integration with the Qwen Code agent, bringing AI-powered assistance directly into your development workflow.

## Features

- **Direct Qwen Code Integration**: Communicate with the Qwen Code agent directly from VS Code
- **Streaming Responses**: Real-time agent responses with a terminal-like feel
- **Rich Markdown Support**: Code highlighting, formatted text, and clean output (ANSI stripped)
- **Context-Aware Commands**: Send selected code, entire files, or generate new code with contextual awareness
- **Interactive Panel**: Dedicated UI panel for chatting with the agent
- **Rich Context Menu**: Right-click options to send code to the agent
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Configurable Settings**: Customize the extension behavior to your needs

### Available Commands

- `Cognitree: Start` - Start the Qwen agent
- `Cognitree: Send` - Send a custom message to the agent
- `Cognitree: Stop` - Stop the Qwen agent
- `Cognitree: Open Panel` - Open the interactive panel
- `Cognitree: Show Logs` - View extension logs
- `Cognitree: Send Selection to Agent` - Send selected code to the agent
- `Cognitree: Send File to Agent` - Send the entire current file to the agent
- `Cognitree: Generate Code` - Generate code based on a description
- `Cognitree: Fix Selected Code` - Request fixes for selected code

### Context Menu Integration

Right-click in any code file to access:
- Send Selection to Agent
- Send File to Agent
- Fix Selected Code
- Generate Code

## Requirements

- VS Code version 1.109.0 or higher
- Qwen CLI installed and available in your PATH (or specify the path in settings)
- Node.js environment

## Extension Settings

This extension contributes the following settings:

* `cognitree.qwenPath`: Path to the Qwen CLI executable (default: "qwen")
* `cognitree.autoStart`: Automatically start the Qwen agent when VS Code starts (default: false)
* `cognitree.maxBufferSize`: Maximum buffer size for agent output (default: 10000)
* `cognitree.timeout`: Timeout for agent operations in milliseconds (default: 30000)

## Usage

1. Install the extension and ensure Qwen CLI is installed
2. Use `Cognitree: Start` to launch the agent
3. Use `Cognitree: Open Panel` to open the interactive panel
4. Or use context menu options to send code directly from your editor
5. Monitor activity in the logs using `Cognitree: Show Logs`

## Known Issues

- The extension requires Qwen CLI to be installed separately
- Some commands may not work if the agent is not running
- Large files may take time to process

## Release Notes

### 0.0.2

- Added streaming support for chat responses
- Implemented Markdown rendering in chat
- Improved output cleanliness by stripping ANSI codes
- Enhanced "terminal-like" experience

### 0.0.1


- Initial release with basic Qwen Code integration
- Added commands for starting, stopping, and sending messages to the agent
- Implemented configuration options
- Created interactive panel for agent communication
- Added context-aware commands for sending code selections/files
- Implemented comprehensive logging system

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
