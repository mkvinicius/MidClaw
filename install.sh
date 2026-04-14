#!/usr/bin/env bash
# MidClaw — One-shot install script
# Usage: bash install.sh

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

banner() {
  echo -e "${CYAN}"
  echo "  ███╗   ███╗██╗██████╗  ██████╗██╗      █████╗ ██╗    ██╗"
  echo "  ████╗ ████║██║██╔══██╗██╔════╝██║     ██╔══██╗██║    ██║"
  echo "  ██╔████╔██║██║██║  ██║██║     ██║     ███████║██║ █╗ ██║"
  echo "  ██║╚██╔╝██║██║██║  ██║██║     ██║     ██╔══██║██║███╗██║"
  echo "  ██║ ╚═╝ ██║██║██████╔╝╚██████╗███████╗██║  ██║╚███╔███╔╝"
  echo "  ╚═╝     ╚═╝╚═╝╚═════╝  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ "
  echo -e "${RESET}"
  echo -e "${BOLD}AI Security Agent — Living Associative Memory${RESET}"
  echo ""
}

check_deps() {
  local missing=()

  command -v node >/dev/null 2>&1 || missing+=("node (>=22)")
  command -v npm  >/dev/null 2>&1 || missing+=("npm")
  command -v python3 >/dev/null 2>&1 || missing+=("python3 (>=3.11)")

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Missing dependencies:${RESET}"
    for dep in "${missing[@]}"; do
      echo "  - $dep"
    done
    exit 1
  fi

  # Check Node version
  NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 22 ? 1 : 0)" 2>&1 || echo "old")
  if [[ "$NODE_VER" == "old" ]]; then
    echo -e "${RED}Node.js 22+ required. Current: $(node -v)${RESET}"
    exit 1
  fi

  # Check uv
  if ! command -v uv >/dev/null 2>&1; then
    echo -e "${CYAN}Installing uv (Python package manager)...${RESET}"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
  fi
}

install_ts() {
  echo -e "${CYAN}Installing TypeScript dependencies...${RESET}"
  npm install
  echo -e "${GREEN}✓ TypeScript ready${RESET}"
}

install_py() {
  echo -e "${CYAN}Installing Python dependencies...${RESET}"
  uv sync
  echo -e "${GREEN}✓ Python ready${RESET}"
}

setup_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env from .env.example${RESET}"
    echo -e "${CYAN}  Edit .env and add your API keys before running.${RESET}"
  else
    echo -e "${GREEN}✓ .env already exists${RESET}"
  fi
}

build_ts() {
  echo -e "${CYAN}Building TypeScript...${RESET}"
  npm run build
  echo -e "${GREEN}✓ Build complete${RESET}"
}

run_tests() {
  echo -e "${CYAN}Running vault tests...${RESET}"
  npm run vault:test && echo -e "${GREEN}✓ Vault tests passed${RESET}" || echo -e "${RED}✗ Vault tests failed${RESET}"
}

print_next() {
  echo ""
  echo -e "${BOLD}MidClaw is ready!${RESET}"
  echo ""
  echo "Quick start:"
  echo "  1. Edit .env and add your API key"
  echo "  2. npm run dev          — start CLI"
  echo "  3. midclaw vault:seed   — seed with example data"
  echo "  4. midclaw status       — check system status"
  echo "  5. python brain/bridge.py  — start Brain Bridge API (port 7432)"
  echo ""
  echo "Commands:"
  echo "  midclaw vault:search <query>    Search the vault"
  echo "  midclaw vault:list              List all notes"
  echo "  midclaw vault:context <query>   WikiRAG context for LLM"
  echo "  midclaw vault:dream             Run memory consolidation"
  echo "  midclaw guard                   Security hooks demo"
  echo "  midclaw status                  System status"
  echo ""
  echo "Simulation:"
  echo "  python -c \"import asyncio; from sim.runner import run_simulation, SimulationConfig; r=asyncio.run(run_simulation(SimulationConfig(scenario='Ransomware attack on hospital', target_environment='Windows corporate network', actor='generic-ransomware'))); print(r.to_markdown())\""
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

banner
check_deps
install_ts
install_py
setup_env
build_ts
run_tests
print_next
