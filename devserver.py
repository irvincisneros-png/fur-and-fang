# Local dev server with caching disabled (ES modules otherwise stick in the browser cache).
import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
class S(http.server.ThreadingHTTPServer):
    request_queue_size = 256  # the browser opens dozens of module requests at once; the default backlog (5) resets some
S(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8500), H).serve_forever()
