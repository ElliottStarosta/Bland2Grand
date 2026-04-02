#!/usr/bin/env python3
"""
Bland2Grand dev server
  - Serves index.html, styles.css, main.js, tasks.json as static files
  - POST /save  { tasks: [...] }  → writes tasks.json to disk
  - GET  /ping                    → health check

Run:  python3 server.py
Then open:  http://localhost:5500 (or PORT override)
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

# Default 5500 — override: set PORT=8080 or run via run-dev.bat
PORT      = int(os.environ.get('PORT', '5500'))
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
TASKS_FILE = os.path.join(BASE_DIR, 'tasks.json')

MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.ico':  'image/x-icon',
}

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    # ── GET ──────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/' or path == '':
            path = '/index.html'

        if path == '/ping':
            self._send_json(200, {'ok': True})
            return

        file_path = os.path.join(BASE_DIR, path.lstrip('/'))
        if not os.path.isfile(file_path):
            self._send_json(404, {'error': 'not found'})
            return

        ext  = os.path.splitext(file_path)[1]
        mime = MIME.get(ext, 'application/octet-stream')
        with open(file_path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', len(data))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    # ── POST ─────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/save':
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            try:
                payload = json.loads(body)
                # Validate: must have a "tasks" key that is a list
                if 'tasks' not in payload or not isinstance(payload['tasks'], list):
                    self._send_json(400, {'error': 'payload must have tasks array'})
                    return

                # Read existing tasks.json to preserve top-level metadata
                with open(TASKS_FILE, 'r', encoding='utf-8') as f:
                    existing = json.load(f)

                existing['tasks'] = payload['tasks']

                with open(TASKS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(existing, f, indent=2, ensure_ascii=False)

                print(f"  ✓ tasks.json saved ({len(payload['tasks'])} tasks)")
                self._send_json(200, {'ok': True, 'count': len(payload['tasks'])})

            except Exception as e:
                print(f"  ✗ save error: {e}")
                self._send_json(500, {'error': str(e)})
        else:
            self._send_json(404, {'error': 'not found'})

    def _send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(data))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    server = HTTPServer(('', PORT), Handler)
    print(f"\n  Bland2Grand server running → http://localhost:{PORT}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")