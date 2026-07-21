#!/bin/bash
set -e

MODEL_DIR="$HOME/.cache/gguf-models"
MODEL_FILE="$MODEL_DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"
LLAMA_BIN="$HOME/.cache/llama-bin/llama-cli"

mkdir -p "$MODEL_DIR"
mkdir -p "$HOME/.cache/llama-bin"

# Download model if not cached
if [ ! -f "$MODEL_FILE" ]; then
    echo "Downloading model..."
    wget -q --show-progress -O "$MODEL_FILE" "$MODEL_URL"
    echo "Model downloaded."
else
    echo "Model already cached."
fi

# Build llama.cpp if not cached
if [ ! -f "$LLAMA_BIN" ]; then
    echo "Building llama.cpp..."
    sudo apt-get install -y -qq build-essential cmake
    git clone --depth 1 https://github.com/ggerganov/llama.cpp.git /tmp/llama-cpp-build
    cd /tmp/llama-cpp-build
    cmake -B build -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=ON
    cmake --build build --config Release --target llama-cli -j$(nproc)
    cp build/bin/llama-cli "$LLAMA_BIN"
    cd -
    echo "llama.cpp built."
else
    echo "llama.cpp already cached."
fi

# Add to PATH
export PATH="$HOME/.cache/llama-bin:$PATH"
echo "$HOME/.cache/llama-bin" >> $GITHUB_PATH

echo "Setup complete."
echo "Model: $MODEL_FILE"
echo "Binary: $LLAMA_BIN"
