# BookForge

<div align="center">
  <img src="assets/logo.png" alt="BookForge Logo" width="200" />
  
  **Generate complete books using AI, right from your desktop**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)]()
  [![Electron](https://img.shields.io/badge/Electron-28+-blue)]()
  [![Next.js](https://img.shields.io/badge/Next.js-14+-black)]()
</div>

## Overview

BookForge is a powerful desktop application that enables users to generate complete books using various AI providers. Whether you're an author, educator, content creator, or just someone with a story to tell, BookForge makes it easy to transform your ideas into well-structured books.

### Key Features

- 🤖 **Multi-Provider Support**: Works with Groq, Claude, OpenAI, Gemini, and Ollama
- 💰 **Token Tracking**: Real-time token counting and cost estimation
- 📚 **Smart Generation**: Two-phase generation for structure and content
- 🎨 **Customizable Output**: Multiple export formats (Markdown, HTML, PDF)
- 🖥️ **Cross-Platform**: Native desktop app for Windows, macOS, and Linux
- 🔒 **Secure**: Your API keys are encrypted and stored locally
- 🎯 **User-Friendly**: Designed for non-technical users
- ⚡ **Fast**: Streaming generation with real-time preview

## Installation

### Download Pre-built Binaries

Visit the [Releases](https://github.com/yourusername/bookforge/releases) page to download the latest version for your platform:

- **Windows**: Download the `.exe` installer
- **macOS**: Download the `.dmg` file
- **Linux**: Download the `.AppImage` or use the Snap package

### Install via Package Managers

```bash
# macOS (Homebrew)
brew install --cask bookforge

# Linux (Snap)
sudo snap install bookforge

# Linux (Flatpak)
flatpak install flathub com.bookforge.BookForge
```

## Quick Start

1. **Launch BookForge** from your applications menu
2. **Configure your AI provider** in Settings
3. **Enter your book topic** and any additional instructions
4. **Choose your provider and model**
5. **Click Generate** and watch your book come to life!
6. **Export** in your preferred format

## Configuration

### Setting up API Keys

1. Open **Settings** from the sidebar
2. Select your preferred AI provider
3. Enter your API key (keys are encrypted locally)
4. Configure model preferences and endpoints

### Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| Groq | Llama 3.3, Mixtral | Fast inference, good for quick generation |
| Claude | Claude 3 Opus/Sonnet | High-quality output, great for creative writing |
| OpenAI | GPT-4, GPT-3.5 | Versatile, good balance of speed and quality |
| Gemini | Gemini Pro | Google's latest models |
| Ollama | Local models | Run models locally, no API key needed |

## Usage Examples

### Basic Book Generation
```
Topic: "Introduction to Machine Learning"
Style: Educational
Length: Medium (10 chapters)
```

### Advanced Options
- **Writing Style**: Academic, Casual, Professional, Creative
- **Complexity**: Beginner, Intermediate, Advanced, Expert
- **Audience**: General, Technical, Young Adult, Children
- **Length**: Short (5 chapters), Medium (10 chapters), Long (20+ chapters)

## Export Formats

### Markdown
- Clean, portable format
- Compatible with Pandoc, Quarto, and other tools
- Includes front matter metadata

### HTML
- Responsive design with multiple themes
- Print-friendly CSS
- Syntax highlighting for code blocks

### PDF
- Professional formatting
- Customizable headers/footers
- Table of contents with page numbers

## Development

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- Git

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/yourusername/bookforge.git
cd bookforge

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

### Project Structure
```
bookforge/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # Next.js frontend
│   ├── shared/        # Shared types and utilities
│   └── preload/       # Electron preload scripts
├── resources/         # Application resources
└── dist/             # Build output
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/) and [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)

## Support

- 📧 Email: support@bookforge.app
- 💬 Discord: [Join our community](https://discord.gg/bookforge)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/bookforge/issues)
- 📖 Documentation: [docs.bookforge.app](https://docs.bookforge.app)

## Roadmap

- [ ] Collaboration features
- [ ] Image generation integration
- [ ] Advanced templates
- [ ] Cloud sync
- [ ] Mobile companion app
- [ ] Publishing platform integration

---

<div align="center">
  Made with ❤️ by the BookForge Team
</div>