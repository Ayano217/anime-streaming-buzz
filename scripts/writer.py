def call_llama(prompt, max_tokens=700):
    # Try multiple possible binary locations
    llama_paths = [
        os.path.expanduser("~/.cache/llama-bin/llama-cli"),
        "/usr/local/bin/llama-cli",
        "llama-cli",
    ]

    llama_bin = None
    for path in llama_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            llama_bin = path
            break
        elif path == "llama-cli":
            import shutil
            if shutil.which("llama-cli"):
                llama_bin = "llama-cli"
                break

    if not llama_bin:
        print("llama-cli not found in any expected location")
        return None

    if not os.path.exists(MODEL_PATH):
        print(f"Model not found: {MODEL_PATH}")
        return None

    try:
        print(f"Running: {llama_bin}")

        full_prompt = (
            "<|im_start|>system\n"
            "You are an expert anime journalist. "
            "Write clear, useful, SEO-friendly anime articles in markdown. "
            "Do not invent facts. "
            "Write engaging content that helps fans understand the topic.<|im_end|>\n"
            "<|im_start|>user\n"
            f"{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )

        result = subprocess.run(
            [
                llama_bin,
                "-m", MODEL_PATH,
                "-p", full_prompt,
                "-c", "2048",
                "-n", str(max_tokens),
                "-t", "2",
                "--temp", "0.6",
                "--top-p", "0.9",
                "--repeat-penalty", "1.08",
                "--no-display-prompt",
                "-ngl", "0"
            ],
            capture_output=True,
            text=True,
            timeout=180
        )

        output = result.stdout.strip()

        if "<|im_end|>" in output:
            output = output.split("<|im_end|>")[0].strip()

        if output and len(output) > 150:
            print(f"Model output: {len(output)} chars")
            return output

        if result.stderr:
            print(f"Model stderr: {result.stderr[:200]}")

    except subprocess.TimeoutExpired:
        print("Model timeout after 3 minutes")
    except Exception as e:
        print(f"Model error: {e}")

    return None
