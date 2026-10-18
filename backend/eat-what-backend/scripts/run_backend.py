"""Portable entry point; uses the receiver's current Python, never this PC's runtime."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description='Run the multi-agent WebSocket backend')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8771)
    parser.add_argument('--check', action='store_true', help='Load the application and report readiness, without starting a server')
    args = parser.parse_args()
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    for folder in ('runtime/logs', 'runtime/tmp', 'data'):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    from server.app import app
    from server.config import settings
    from server.realtime_console import catalog
    if args.check:
        print(json.dumps({'appLoaded': app is not None, 'restaurants': len(catalog.shops),
                          'llmConfigured': settings.llm_ready, 'ttsProvider': settings.tts_provider,
                          'websocketPath': '/api/realtime', 'consolePath': '/console.html'}, ensure_ascii=False))
        return
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
