#!/bin/bash

MODEL_DIR="$HOME/.cache/gguf-models"
MODEL_FILE="$MODEL_DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"

mkdir -p "$MODEL_DIR"

if [ ! -f "$MODEL_FILE" ]; then
    echo "Downloading Qwen2.5 1.5B model..."
    wget -q --show-progress -O "$MODEL_FILE" "$MODEL_URL"
    echo "Model downloaded."
else
    echo "Model already cached."
fi

if ! command -v llama-cli &> /dev/null; then
    echo "Installing llama.cpp..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq build-essential cmake
    git clone --depth 1 https://github.com/ggerganov/llama.cpp.git /tmp/llama-cpp
    cd /tmp/llama-cpp
    cmake -B build
    cmake --build build --config Release -j$(nproc)
    sudo cp build/bin/llama-cli /usr/local/bin/
    cd -
    echo "llama.cpp installed."
else
    echo "llama.cpp already installed."
fi

echo "Setup complete."
echo "Model: $MODEL_FILE"
