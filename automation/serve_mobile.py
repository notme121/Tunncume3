#!/usr/bin/env python3
"""
CU-MEDi GI 2026 — Local Mobile, iPad & Mac Real-Time Sync Web Server
Usage:
    python3 automation/serve_mobile.py
    python3 automation/serve_mobile.py 8080

Enables instant local access AND real-time 2-way synchronization (checked classes,
Anki flashcard ratings, MCQ answers/flags/strikethroughs, class notes, transcripts,
and annotated histology/anatomy photos) across Mac, iPhone, and iPad Pro 11".
"""

import sys
import os
import json
import time
import socket
import http.server
import socketserver
from urllib.parse import urlparse, parse_qs
from pathlib import Path

DEFAULT_PORT = 8080
ROOT_DIR = Path(__file__).resolve().parent.parent
SYNC_JSON_PATH = ROOT_DIR / "data" / "user_sync_state.json"
SYNC_JS_PATH = ROOT_DIR / "data" / "user_sync_state.js"


def load_sync_state():
    if SYNC_JSON_PATH.exists():
        try:
            with open(SYNC_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "updatedAt": 0,
        "checkedSessions": [],
        "recallRatings": {},
        "recallSchedule": {},
        "mcqUserAnswers": {},
        "mcqFlaggedIds": [],
        "mcqStrikethroughs": {},
        "sessionNotes": {},
        "sessionTranscripts": {},
        "customSessionSlots": {},
        "photos": {}
    }


def save_sync_state(state):
    SYNC_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Deduplicate renderedDataUrl when identical to baseDataUrl or when annotations are empty
    photos = state.get("photos")
    if isinstance(photos, dict):
        for p in photos.values():
            if isinstance(p, dict):
                anns = p.get("annotations", [])
                if (not anns or p.get("renderedDataUrl") == p.get("baseDataUrl")) and p.get("baseDataUrl"):
                    p.pop("renderedDataUrl", None)
    with open(SYNC_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    # Also write a JS wrapper so file:// and static cloud hosting can load it even without fetch
    light_state = dict(state)
    with open(SYNC_JS_PATH, "w", encoding="utf-8") as f:
        f.write("window.__GI_DISK_SYNC_STATE = " + json.dumps(light_state, ensure_ascii=False) + ";\n")


def merge_sync_states(existing, incoming):
    """Smart non-destructive merge so a fresh device never wipes existing Mac progress,
    while explicit updates from any device propagate everywhere."""
    mode = incoming.get("mode", "merge")  # 'merge' (initial connect) or 'push' (explicit user action)
    merged = dict(existing)

    if mode == "push":
        # Direct action from a device that has already synced
        for key in [
            "checkedSessions",
            "recallRatings",
            "recallSchedule",
            "mcqUserAnswers",
            "mcqFlaggedIds",
            "mcqStrikethroughs",
            "sessionNotes",
            "sessionTranscripts",
            "customSessionSlots",
        ]:
            if key in incoming and incoming[key] is not None:
                merged[key] = incoming[key]
        # Merge photos by key & updatedAt
        inc_photos = incoming.get("photos")
        if isinstance(inc_photos, dict):
            cur_photos = dict(merged.get("photos") or {})
            for pk, pval in inc_photos.items():
                if pval is None:
                    cur_photos.pop(pk, None)
                else:
                    cur_photos[pk] = pval
            merged["photos"] = cur_photos
    else:
        # Union / non-destructive merge on initial handshake
        ex_checked = set(existing.get("checkedSessions") or [])
        in_checked = set(incoming.get("checkedSessions") or [])
        merged["checkedSessions"] = sorted(list(ex_checked.union(in_checked)))

        ex_flags = set(existing.get("mcqFlaggedIds") or [])
        in_flags = set(incoming.get("mcqFlaggedIds") or [])
        merged["mcqFlaggedIds"] = sorted(list(ex_flags.union(in_flags)))

        for dict_key in ["recallRatings", "recallSchedule", "mcqUserAnswers", "mcqStrikethroughs", "customSessionSlots"]:
            d = dict(existing.get(dict_key) or {})
            for k, v in (incoming.get(dict_key) or {}).items():
                if v is not None and v != "":
                    d[k] = v
            merged[dict_key] = d

        for text_key in ["sessionNotes", "sessionTranscripts"]:
            d = dict(existing.get(text_key) or {})
            for k, v in (incoming.get(text_key) or {}).items():
                if isinstance(v, str) and v.strip():
                    # Keep longer or newer non-empty note during initial merge
                    if not d.get(k) or len(v) >= len(d.get(k, "")):
                        d[k] = v
            merged[text_key] = d

        cur_photos = dict(existing.get("photos") or {})
        for pk, pval in (incoming.get("photos") or {}).items():
            if isinstance(pval, dict):
                old_p = cur_photos.get(pk)
                if not old_p or (pval.get("updatedAt", 0) >= old_p.get("updatedAt", 0)):
                    cur_photos[pk] = pval
        merged["photos"] = cur_photos

    merged["updatedAt"] = int(time.time() * 1000)
    return merged


class GISyncHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/sync":
            state = load_sync_state()
            qs = parse_qs(parsed.query)
            since = int(qs.get("since", ["0"])[0] or 0)
            include_photos = qs.get("photos", ["1"])[0] != "0"

            if since > 0 and state.get("updatedAt", 0) <= since:
                payload = {"changed": False, "updatedAt": state.get("updatedAt", 0)}
            else:
                payload = dict(state)
                payload["changed"] = True
                if not include_photos:
                    payload.pop("photos", None)

            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/sync":
            length = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                incoming = json.loads(raw)
            except Exception:
                incoming = {}

            existing = load_sync_state()
            merged = merge_sync_states(existing, incoming)
            save_sync_state(merged)

            resp = dict(merged)
            resp["changed"] = True
            body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Suppress noisy polling logs for /api/sync?since=...
        if len(args) > 0 and isinstance(args[0], str) and "/api/sync?since=" in args[0]:
            return
        super().log_message(format, *args)


def get_local_ip():
    """Detect the local Wi-Fi / LAN / Hotspot IP address of this Mac."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        if ip != '127.0.0.1':
            return ip
    except Exception:
        pass
    finally:
        s.close()

    try:
        import subprocess
        out = subprocess.check_output(['ifconfig']).decode('utf-8')
        for line in out.splitlines():
            line = line.strip()
            if line.startswith('inet ') and not line.startswith('inet 127.'):
                return line.split()[1]
    except Exception:
        pass

    return '127.0.0.1'


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    os.chdir(ROOT_DIR)

    # Ensure initial sync state files exist
    if not SYNC_JSON_PATH.exists():
        save_sync_state(load_sync_state())

    ip = get_local_ip()

    print("\n" + "=" * 68)
    print("  🏥 CU-MEDi GI 2026 — MULTI-DEVICE REAL-TIME SYNC SERVER")
    print("=" * 68)
    print(f"\n  📱 Open on iPhone / iPad Pro 11\":")
    print(f"     👉  http://{ip}:{port}/")
    print(f"\n  💻 Open on this Mac (synced with iPhone & iPad):")
    print(f"     👉  http://localhost:{port}/")
    print("\n  🔄 Real-Time 2-Way Sync Active:")
    print("     • Checked lectures, Anki flashcard ratings, MCQ answers,")
    print("       notes, and photos automatically sync across Mac, iPhone & iPad!")
    print("=" * 68)
    print(f"Serving files from: {ROOT_DIR}")
    print("Keep this window open while syncing, or press Ctrl+C to stop.\n")

    try:
        with ThreadedTCPServer(("0.0.0.0", port), GISyncHTTPRequestHandler) as httpd:
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped. Happy studying!\n")
    except OSError as e:
        if e.errno == 48:
            print(f"✅ Sync Server is ALREADY running in the background on port {port}!")
            print(f"👉 On iPhone/iPad, open Safari to: http://{ip}:{port}/")
            print(f"👉 On Mac, open: http://localhost:{port}/\n")
            try:
                while True:
                    time.sleep(3600)
            except KeyboardInterrupt:
                print("\nClosed status window.\n")
        else:
            raise


if __name__ == '__main__':
    main()
