"""
main.py — AniTube Buzz Main Automation Entry Point
Runs article generation and any other automation tasks.
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.dirname(__file__))

def main():
    print("=" * 60)
    print("AniTube Buzz — Auto Publisher")
    print("=" * 60)

    # Run article writer
    try:
        from writer import run as run_writer
        count = run_writer(max_articles=5)
        print(f"\n[main] Writer finished. Articles generated: {count}")
    except Exception as e:
        print(f"\n[main] Writer error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n[main] All tasks complete.")

if __name__ == "__main__":
    main()
