"""Serve the extracted browser playtest and open its versioned URL."""
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sys
from urllib.request import urlopen
import webbrowser


DIST = Path(__file__).resolve().parents[1] / "dist"
HOST = "127.0.0.1"
PORTS = (8000, 8012)


class PlaytestServer(ThreadingHTTPServer):
    allow_reuse_address = sys.platform != "win32"


def main():
    config = (DIST / "src" / "config.js").read_text(encoding="utf-8")
    version = re.search(r"export const VERSION = '([0-9.]+)'", config)[1]
    prefix = f"/playtest-{version}/"
    index = (DIST / "index.html").read_bytes()

    class PlaytestHandler(SimpleHTTPRequestHandler):
        def translate_path(self, path):
            if path.startswith(prefix):
                path = "/" + path[len(prefix):]
            return super().translate_path(path)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    for port in PORTS:
        url = f"http://{HOST}:{port}{prefix}"
        try:
            server = PlaytestServer((HOST, port), partial(PlaytestHandler, directory=DIST))
        except OSError as error:
            if error.errno not in (errno.EADDRINUSE, 10013, 10048):
                raise
            # A second launch can reuse a server that is already serving this playtest.
            try:
                with urlopen(url, timeout=1) as response:
                    if response.read(len(index) + 1) == index:
                        print(f"Number Extraction v{version} is already running: {url}", flush=True)
                        webbrowser.open(url)
                        return
            except OSError:
                pass
            continue

        with server:
            print(f"Number Extraction v{version}: {url}", flush=True)
            if port != PORTS[0]:
                print("Port 8000 is in use. This alternate address has separate browser save data.", flush=True)
            print("Keep this window open while playing. Press Ctrl+C to stop.", flush=True)
            webbrowser.open(url)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
        return

    raise SystemExit("Ports 8000 and 8012 are in use. Close an older game server and try again.")


if __name__ == "__main__":
    main()
