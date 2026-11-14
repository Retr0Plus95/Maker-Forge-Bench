"""Tests for dev.py, the local server. Run: python -m unittest discover -s tests/python -v"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

import dev  # noqa: E402


class DevServerTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "Fume Extractör test"
        for rel in ["docs/a.svg", "docs/Ö-kort.svg", "images/b.PNG", "notes.txt",
                    ".git/x.svg", "node_modules/y.svg", "forge-project.json"]:
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
        (self.tmp / "secret.svg").write_text("secret", encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestFunctions(DevServerTestCase):
    def test_list_files_filters_and_sorts(self):
        self.assertEqual([f["path"] for f in dev.list_files(self.root)],
                         ["docs/a.svg", "docs/Ö-kort.svg", "forge-project.json", "images/b.PNG"])

    def test_list_files_gives_size_and_mtime(self):
        first = dev.list_files(self.root)[0]
        self.assertEqual(first["size"], (self.root / "docs" / "a.svg").stat().st_size)
        self.assertIsInstance(first["mtime"], float)

    def test_resolve_refuses_outside_and_unlisted(self):
        for bad in ["../secret.svg", "%2e%2e/secret.svg", "docs/%2e%2e/%2e%2e/secret.svg",
                    "C:/Windows/win.ini", "%5C..%5Csecret.svg", "notes.txt", "missing.svg"]:
            self.assertIsNone(dev.resolve_project_path(self.root, bad), bad)

    def test_resolve_decodes_names(self):
        self.assertEqual(dev.resolve_project_path(self.root, "docs/%C3%96-kort.svg"),
                         (self.root / "docs" / "Ö-kort.svg").resolve())

    def test_host_allowed(self):
        self.assertTrue(dev.host_allowed("127.0.0.1:8765", 8765))
        self.assertTrue(dev.host_allowed("localhost:8765", 8765))
        for bad in [None, "", "evil.example:8765", "127.0.0.1:9999", "127.0.0.1.evil.example:8765"]:
            self.assertFalse(dev.host_allowed(bad, 8765), bad)

    def test_waiting_queue_holds_a_page_load(self):
        # While the server is busy (sending a big drawing, watching the folder) new connections wait
        # in its queue. Python's default queue holds 5, and Windows refuses the rest: a browser test
        # caught module requests failing with ERR_CONNECTION_REFUSED. Simulate a busy moment by not
        # accepting at all, and send a page-load-sized burst.
        import select
        import socket
        server = dev.make_server(self.root, 0)
        port = server.server_address[1]
        socks = []
        try:
            for _ in range(30):
                s = socket.socket()
                s.setblocking(False)
                s.connect_ex(("127.0.0.1", port))
                socks.append(s)
            refused = 0
            pending = list(socks)
            deadline = time.time() + 3
            while pending and time.time() < deadline:
                _, writable, errored = select.select([], pending, pending, 0.2)
                for s in set(writable) | set(errored):
                    if s.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR) != 0:
                        refused += 1
                    pending.remove(s)
            self.assertEqual(refused, 0, f"{refused} of 30 waiting connections refused")
            self.assertEqual(pending, [], "some connections never completed")
        finally:
            for s in socks:
                s.close()
            server.server_close()

    def test_diff_snapshots(self):
        self.assertEqual(dev.diff_snapshots({"a.svg": 1.0, "b.svg": 1.0}, {"a.svg": 2.0, "c.svg": 1.0}),
                         [("change", "a.svg"), ("remove", "b.svg"), ("change", "c.svg")])


class TestLiveServer(DevServerTestCase):
    def setUp(self):
        super().setUp()
        self.server = dev.make_server(self.root, 0)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def request(self, method, path, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Host": host} if host is not None else {}
        conn.request(method, path, headers=headers)
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp, body

    def test_file_list_with_csp(self):
        resp, body = self.request("GET", "/api/files")
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(body)["root"], "Fume Extractör test")
        csp = (REPO / "deploy" / "csp.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(resp.getheader("Content-Security-Policy"), csp)
        self.assertEqual(resp.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(resp.getheader("Cache-Control"), "no-store")

    def test_wrong_host_refused(self):
        resp, _ = self.request("GET", "/api/files", host="evil.example")
        self.assertEqual(resp.status, 403)

    def test_post_refused(self):
        resp, _ = self.request("POST", "/api/files")
        self.assertEqual(resp.status, 405)

    def test_project_file_with_odd_name(self):
        resp, body = self.request("GET", "/project/docs/%C3%96-kort.svg")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "image/svg+xml")
        self.assertIn(b"<svg", body)

    def test_many_requests_at_once_are_all_served(self):
        # A page load opens ~15 connections at once. Python's default queue of 5 waiting
        # connections made Windows refuse or delay some of them, so pages sometimes stalled.
        results = []

        def fetch():
            try:
                resp, _ = self.request("GET", "/api/files")
                results.append(resp.status)
            except OSError as error:
                results.append(repr(error))

        threads = [threading.Thread(target=fetch) for _ in range(60)]
        start = time.time()
        for t in threads:
            t.start()
        for t in threads:
            t.join(10)
        self.assertEqual(results.count(200), 60, [r for r in results if r != 200][:3])
        self.assertLess(time.time() - start, 5)

    def test_a_burst_of_connections_is_not_refused(self):
        # Caught in a browser test: a page's module requests got ERR_CONNECTION_REFUSED, so the app
        # never started. Windows refuses connections once the server's waiting queue is full.
        import select
        import socket
        socks = []
        for _ in range(60):
            s = socket.socket()
            s.setblocking(False)
            s.connect_ex(("127.0.0.1", self.port))
            socks.append(s)
        refused = 0
        deadline = time.time() + 5
        pending = list(socks)
        while pending and time.time() < deadline:
            # On Windows a refused connect shows up in the error list, not the writable one.
            _, writable, errored = select.select([], pending, pending, 0.5)
            for s in set(writable) | set(errored):
                if s.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR) != 0:
                    refused += 1
                pending.remove(s)
        for s in socks:
            s.close()
        self.assertEqual(refused, 0, f"{refused} of 60 connections refused")
        self.assertEqual(pending, [], "some connections never completed")

    def test_datasheet_pdf_served(self):
        pdf = self.root / "docs" / "ds" / "x.pdf"
        pdf.parent.mkdir(parents=True, exist_ok=True)
        pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")
        resp, body = self.request("GET", "/project/docs/ds/x.pdf")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "application/pdf")
        self.assertTrue(body.startswith(b"%PDF"))

    def test_font_served(self):
        resp, body = self.request("GET", "/atkinson-hyperlegible-latin-400-normal.woff2")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "font/woff2")
        self.assertEqual(body[:4], b"wOF2")

    def test_project_file_outside_refused(self):
        resp, _ = self.request("GET", "/project/%2e%2e/secret.svg")
        self.assertEqual(resp.status, 404)

    def test_change_event(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request("GET", "/api/events")
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        self.assertTrue(resp.getheader("Content-Type").startswith("text/event-stream"))
        target = self.root / "docs" / "a.svg"
        later = time.time() + 5
        os.utime(target, (later, later))
        deadline = time.time() + 3
        event = None
        while time.time() < deadline:
            line = resp.fp.readline().decode("utf-8").rstrip("\r\n")
            if line.startswith("event: "):
                event = line[len("event: "):]
            elif line.startswith("data: ") and event == "change":
                self.assertEqual(json.loads(line[len("data: "):])["path"], "docs/a.svg")
                break
        else:
            self.fail("no change event within 3 s")
        conn.close()


class TestAppAlone(unittest.TestCase):
    """dev.py without a folder serves the app alone, as the website will (0.7)."""

    def setUp(self):
        self.server = dev.make_server(None, 0)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def get(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp, body

    def test_the_page_but_no_files(self):
        resp, body = self.get("/")
        self.assertEqual(resp.status, 200)
        self.assertIn(b"Maker Forge Bench", body)
        for path in ("/api/files", "/api/events", "/project/forge-project.json"):
            resp, _ = self.get(path)
            self.assertEqual(resp.status, 404, path)


if __name__ == "__main__":
    unittest.main()
