#!/usr/bin/env bash
# Sets up the toolchain people use to build 3D models with OpenAI's GPT-6 Astra:
#   Blender + the "MCP for Blender" add-on + Codex CLI (or ChatGPT/Claude Desktop) + ffmpeg.
# Works on macOS (Homebrew) and Debian/Ubuntu Linux. Re-runnable; skips what is already installed.
set -euo pipefail

WORKDIR="${ASTRA_WORKDIR:-$HOME/astra-3d}"
OS="$(uname -s)"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------- 1. uv (needed for `uvx blender-mcp`) ----------
if have uv; then
  say "uv already installed ($(uv --version))"
else
  say "Installing uv (official installer, NOT pip)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# ---------- 2. Blender, ffmpeg, Node ----------
case "$OS" in
  Darwin)
    if ! have brew; then
      warn "Homebrew not found. Install it from https://brew.sh then re-run this script."
      exit 1
    fi
    if [ -d "/Applications/Blender.app" ]; then
      say "Blender already installed"
    else
      say "Installing Blender"; brew install --cask blender
    fi
    have ffmpeg || { say "Installing ffmpeg"; brew install ffmpeg; }
    have node   || { say "Installing Node.js"; brew install node; }
    ;;
  Linux)
    if have apt-get; then
      say "Installing ffmpeg + build basics via apt"
      sudo apt-get update -qq
      sudo apt-get install -y -qq ffmpeg curl git
      if have blender; then
        say "Blender already installed"
      elif have snap; then
        say "Installing Blender via snap"; sudo snap install blender --classic
      else
        warn "Install Blender 4.x from https://www.blender.org/download/ and put it on your PATH."
      fi
    else
      warn "Non-apt Linux: install Blender 4.x, ffmpeg, and Node.js 20+ with your package manager."
    fi
    if ! have node; then
      say "Installing Node.js 22 via nvm"
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
      # shellcheck disable=SC1090
      . "$HOME/.nvm/nvm.sh" && nvm install 22
    fi
    ;;
  *)
    warn "Windows: run the PowerShell steps in docs/ASTRA_3D_SETUP.md instead."
    exit 1
    ;;
esac

# ---------- 3. Codex CLI (how most people drive Astra from the terminal) ----------
if have codex; then
  say "Codex CLI already installed ($(codex --version 2>/dev/null || echo present))"
else
  say "Installing OpenAI Codex CLI"
  npm install -g @openai/codex
fi

# ---------- 4. MCP for Blender add-on + register it with Codex ----------
say "Installing the MCP for Blender add-on into Blender's user add-ons folder"
uvx blender-mcp install-addon

if have codex; then
  say "Registering the Blender MCP server with Codex"
  codex mcp add blender -- uvx blender-mcp 2>/dev/null || warn "Already registered, or edit ~/.codex/config.toml (see docs)."
fi

# ---------- 5. Reusable 3D skills people share on X ----------
mkdir -p "$WORKDIR"
if [ -d "$WORKDIR/gpt_3d_skill/.git" ]; then
  say "gpt_3d_skill already cloned; pulling latest"
  git -C "$WORKDIR/gpt_3d_skill" pull --ff-only || true
else
  say "Cloning the community GPT 3D skill into $WORKDIR"
  git clone --depth 1 https://github.com/grapeot/gpt_3d_skill "$WORKDIR/gpt_3d_skill"
fi

cat <<NEXT

===========================================================================
Done. Remaining steps that need you (they cannot be scripted):

 1. Sign in:            codex login        (needs a ChatGPT Plus/Pro/Team/Enterprise account
                                            that has GPT-6 Astra; it is rolling out to paid tiers)
 2. Open Blender  ->  Edit > Preferences > Add-ons  ->  enable "Interface: MCP for Blender"
 3. In the 3D viewport press N  ->  "MCP for Blender" tab  ->  "Connect to Claude"
    (the button name is historical; it works for Codex/ChatGPT too)
 4. In a terminal:      cd $WORKDIR && codex -m gpt-6-astra
    then prompt, e.g.:  "Using the Blender MCP server, build a low-poly modern house
                         surrounded by pine trees, add a three-point light rig, and
                         export it as house.glb"

Full guide: docs/ASTRA_3D_SETUP.md
===========================================================================
NEXT
