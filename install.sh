#!/usr/bin/env sh
set -e

# Vertz Runtime Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/vertz-dev/vertz/main/install.sh | sh

REPO="vertz-dev/vertz"
INSTALL_DIR="${VTZ_INSTALL_DIR:-$HOME/.vtz/bin}"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux)  PLATFORM="linux" ;;
  *)
    echo "Error: Unsupported operating system: $OS"
    echo "Supported: macOS (darwin), Linux"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_SUFFIX="x64" ;;
  aarch64|arm64) ARCH_SUFFIX="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    echo "Supported: x86_64/amd64, aarch64/arm64"
    exit 1
    ;;
esac

BINARY_NAME="vtz-${PLATFORM}-${ARCH_SUFFIX}"

# Determine version (latest release or specified)
VERSION="${VTZ_VERSION:-latest}"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BINARY_NAME}"
fi

echo "Installing vtz for ${PLATFORM}-${ARCH_SUFFIX}..."
echo "  From: $DOWNLOAD_URL"
echo "  To:   $INSTALL_DIR/vtz"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download binary
if command -v curl > /dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/vtz"
elif command -v wget > /dev/null 2>&1; then
  wget -qO "$INSTALL_DIR/vtz" "$DOWNLOAD_URL"
else
  echo "Error: curl or wget is required"
  exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/vtz"

# Create vertz alias
ln -sf "$INSTALL_DIR/vtz" "$INSTALL_DIR/vertz"

# Verify
"$INSTALL_DIR/vtz" --version 2>/dev/null || true

echo ""
echo "✅ vtz installed to $INSTALL_DIR/vtz"
echo ""

# Add to PATH if not already there
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    
    # Try to detect and update shell profile
    SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "")
    PROFILE=""
    case "$SHELL_NAME" in
      zsh)  PROFILE="$HOME/.zshrc" ;;
      bash)
        if [ -f "$HOME/.bashrc" ]; then
          PROFILE="$HOME/.bashrc"
        elif [ -f "$HOME/.bash_profile" ]; then
          PROFILE="$HOME/.bash_profile"
        fi
        ;;
    esac

    if [ -n "$PROFILE" ] && [ -f "$PROFILE" ]; then
      if ! grep -q "$INSTALL_DIR" "$PROFILE" 2>/dev/null; then
        echo "# vtz" >> "$PROFILE"
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$PROFILE"
        echo "Added to $PROFILE. Restart your shell or run:"
        echo "  source $PROFILE"
      fi
    fi
    ;;
esac
