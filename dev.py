"""Maker Forge Bench dev server.

Serves the app (src/) and one project folder on this PC only, and tells the page when a drawing
changes, so it can reload that sheet by itself.

    python dev.py <project folder> [--port 8765]

Python 3.10 or newer, standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
CSP = (HERE / "deploy" / "csp.txt").read_text(encoding="utf-8").strip()

# Drawings, plus datasheet PDFs and 3D models (0.9) a project keeps next to them (never shown as sheets).
PROJECT_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".pdf": "application/pdf", ".glb": "model/gltf-binary", ".wrl": "model/vrml"}
WRL_LIMIT = 20 * 1024 * 1024  # a KiCad .wrl bigger than this isn't converted
PROJECT_FILE = "forge-project.json"
APP_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".glb": "model/gltf-binary",  # 0.9: the Maker Forge Library's 3D models
    ".md": "text/plain; charset=utf-8",  # the library's licence and README
}
APP_NAME = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]*$")
# App files are src/<name>, plus the library: src/library/<name> and src/library/models/<name>.
APP_FOLDERS = ((), ("library",), ("library", "models"))


def app_path(name: str):
    """The app file a URL path names, or None: only the folders above, each part a plain name."""
    *folders, last = name.split("/")
    if tuple(folders) not in APP_FOLDERS or not APP_NAME.match(last):
        return None
    if APP_TYPES.get(os.path.splitext(last)[1].lower()) is None:
        return None
    target = SRC.joinpath(*folders, last)
    return target if target.is_file() else None
WATCH_INTERVAL = 0.5
PING_INTERVAL = 15.0


def _skipped_folder(name: str) -> bool:
    return name.startswith(".") or name == "node_modules"


def _project_type(name: str) -> str | None:
    if name == PROJECT_FILE:
        return "application/json"
    return PROJECT_TYPES.get(os.path.splitext(name)[1].lower())


def list_files(root: Path) -> list[dict]:
    """Every drawing (and forge-project.json) under root, with paths relative to it."""
    found = []
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not _skipped_folder(d)]
        for name in files:
            if _project_type(name) is None:
                continue
            full = Path(folder) / name
            try:
                st = full.stat()
            except OSError:  # deleted while we looked
                continue
            found.append({"path": full.relative_to(root).as_posix(), "size": st.st_size, "mtime": st.st_mtime})
    found.sort(key=lambda f: f["path"].casefold())
    return found


def resolve_project_path(root: Path, url_path: str) -> Path | None:
    """The file a /project/<url_path> request may serve, or None."""
    try:
        rel = unquote(url_path, encoding="utf-8", errors="strict")
    except UnicodeDecodeError:
        return None
    if not rel or "\\" in rel or ":" in rel or rel.startswith("/"):
        return None
    parts = rel.split("/")
    if any(p in ("", ".", "..") or _skipped_folder(p) for p in parts[:-1]) or parts[-1] in ("", ".", ".."):
        return None
    if _project_type(parts[-1]) is None:
        return None
    base = root.resolve()
    target = (base / rel).resolve()
    if base not in target.parents or not target.is_file():
        return None
    return target


_converted: dict = {}  # (path, mtime) → GLB bytes


def wrl_to_glb(target: Path) -> bytes:
    """A KiCad .wrl from the project as GLB, by the library's own converter (tools/kicad3d.py)."""
    key = (str(target), target.stat().st_mtime)
    if key not in _converted:
        import importlib.util
        spec = importlib.util.spec_from_file_location("kicad3d", HERE / "tools" / "kicad3d.py")
        kicad3d = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(kicad3d)
        glb, _ = kicad3d.convert(target.read_text(encoding="utf-8", errors="replace"), None, id="project")
        _converted.clear()  # one at a time is plenty
        _converted[key] = glb
    return _converted[key]


def host_allowed(host: str | None, port: int) -> bool:
    """Only this PC's own names: stops other websites reaching the server through DNS rebinding."""
    if not host:
        return False
    return host.lower() in (f"127.0.0.1:{port}", f"localhost:{port}")


def diff_snapshots(old: dict[str, float], new: dict[str, float]) -> list[tuple[str, str]]:
    events = [("change", p) for p, m in new.items() if old.get(p) != m]
    events += [("remove", p) for p in old if p not in new]
    return sorted(events, key=lambda e: e[1])


class Watcher:
    """Looks at the project folder twice a second and hands changes to every open event stream."""

    def __init__(self, root: Path):
        self.root = root
        self.snapshot = self._take()
        self.subscribers: set[queue.Queue] = set()
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._run, name="bench-watcher", daemon=True)
        self.thread.start()

    def _take(self) -> dict[str, dict]:
        return {f["path"]: f for f in list_files(self.root)}

    def _run(self) -> None:
        while not self.stopped.wait(WATCH_INTERVAL):
            new = self._take()
            events = diff_snapshots({p: f["mtime"] for p, f in self.snapshot.items()},
                                    {p: f["mtime"] for p, f in new.items()})
            self.snapshot = new
            for kind, path in events:
                data = {"path": path, "mtime": new[path]["mtime"]} if kind == "change" else {"path": path}
                with self.lock:
                    for q in self.subscribers:
                        q.put((kind, data))

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        with self.lock:
            self.subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            self.subscribers.discard(q)

    def stop(self) -> None:
        self.stopped.set()


class BenchServer(ThreadingHTTPServer):
    daemon_threads = True
    # A page load opens ~15 connections at once. With Python's default queue of 5, Windows refuses
    # the rest whenever the server is busy for a moment, and the page's scripts fail to load.
    request_queue_size = 128

    def __init__(self, root: Path | None, port: int):
        self.root = root  # None: the app alone, like the website (0.7): no files, no events
        self.watcher = Watcher(root) if root is not None else None
        super().__init__(("127.0.0.1", port), BenchHandler)

    def server_close(self) -> None:
        if self.watcher is not None:
            self.watcher.stop()
        super().server_close()


class BenchHandler(BaseHTTPRequestHandler):
    server: BenchServer
    server_version = "MakerForgeBench/0.1"

    def log_message(self, format, *args):  # keep the terminal quiet
        pass

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _host_ok(self) -> bool:
        if host_allowed(self.headers.get("Host"), self.server.server_address[1]):
            return True
        self.send_error(403, "This server only answers this PC (127.0.0.1 or localhost).")
        return False

    def _refuse_method(self):
        if self._host_ok():
            self.send_error(405, "Only GET and HEAD are allowed.")

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _refuse_method

    def do_HEAD(self):
        self._route(head=True)

    def do_GET(self):
        self._route(head=False)

    def _route(self, head: bool) -> None:
        if not self._host_ok():
            return
        path = urlsplit(self.path).path
        if self.server.root is None and (path.startswith("/api/") or path.startswith("/project/")):
            self.send_error(404, "No project folder: open one in the page.")
            return
        if path == "/api/files":
            body = json.dumps({"root": self.server.root.name, "files": list_files(self.server.root)},
                              ensure_ascii=False).encode("utf-8")
            self._send(200, "application/json; charset=utf-8", body, head)
        elif path == "/api/events":
            if head:
                self._send(200, "text/event-stream; charset=utf-8", b"", head)
            else:
                self._events()
        elif path.startswith("/api/glb/"):
            target = resolve_project_path(self.server.root, path[len("/api/glb/"):])
            if target is None or target.suffix.lower() != ".wrl":
                self.send_error(404, "Not a .wrl in the project folder.")
                return
            if target.stat().st_size > WRL_LIMIT:
                self.send_error(413, "That .wrl is too big to convert.")
                return
            try:
                body = wrl_to_glb(target)
            except Exception:  # a .wrl the converter can't read
                self.send_error(422, "That .wrl couldn't be turned into a model.")
                return
            self._send(200, "model/gltf-binary", body, head)
        elif path.startswith("/project/"):
            target = resolve_project_path(self.server.root, path[len("/project/"):])
            if target is None:
                self.send_error(404, "Not in the project folder.")
                return
            self._send(200, _project_type(target.name), target.read_bytes(), head)
        else:
            name = path[1:] if path.startswith("/") else path
            target = app_path(name or "index.html")
            if target is None:
                self.send_error(404, "Not part of the app.")
                return
            self._send(200, APP_TYPES[target.suffix.lower()], target.read_bytes(), head)

    def _send(self, status: int, ctype: str, body: bytes, head: bool) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _events(self) -> None:
        q = self.server.watcher.subscribe()  # before the headers, so nothing after them is missed
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.end_headers()
            self.wfile.flush()
            last_write = time.monotonic()
            while not self.server.watcher.stopped.is_set():
                try:
                    kind, data = q.get(timeout=1.0)
                    chunk = f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                except queue.Empty:
                    if time.monotonic() - last_write < PING_INTERVAL:
                        continue
                    chunk = ": ping\n\n"
                self.wfile.write(chunk.encode("utf-8"))
                self.wfile.flush()
                last_write = time.monotonic()
        except (ConnectionError, OSError):
            pass  # the page went away
        finally:
            self.server.watcher.unsubscribe(q)


def make_server(root: Path | None, port: int) -> ThreadingHTTPServer:
    return BenchServer(root, port)


def main(argv: list[str] | None = None) -> int:
    # Paths can hold any character; the Windows console's default code page can't print them all.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Show a project folder's drawings in Maker Forge Bench.")
    parser.add_argument("folder", nargs="?", help="the project folder with the drawings (without one: the app alone, like the website)")
    parser.add_argument("--port", type=int, default=8765, help="0 picks a free port (default 8765)")
    args = parser.parse_args(argv)
    root = None
    if args.folder is not None:
        root = Path(args.folder).resolve()
        if not root.is_dir():
            print(f"Maker Forge Bench: {root} isn't a folder. Give dev.py the project folder.", flush=True)
            return 2
    server = make_server(root, args.port)
    what = f"serving {root}" if root is not None else "the app alone: open a project in the page"
    print(f"Maker Forge Bench: http://127.0.0.1:{server.server_address[1]}/ ({what})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
