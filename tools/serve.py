"""Lokální vývojový server bez cache (python3 tools/serve.py [port] [složka])."""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8643
    root = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCache, directory=root)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
