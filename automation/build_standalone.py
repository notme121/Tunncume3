#!/usr/bin/env python3
"""Builds a 100% self-contained single-file HTML bundle (GI_CUMEDi_Standalone_App.html)
that embeds data/gi_daily_learning_data.js and data/user_sync_state.js inline so it can be hosted
with 1 drag-and-drop or shared via AirDrop/iCloud without needing external JS files.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(ROOT, "index.html")
DATA_PATH = os.path.join(ROOT, "data", "gi_daily_learning_data.js")
SYNC_PATH = os.path.join(ROOT, "data", "user_sync_state.js")
OUT_PATH = os.path.join(ROOT, "GI_CUMEDi_Standalone_App.html")


def build():
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        html = f.read()
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data_js = f.read()

    target_tag = '<script src="data/gi_daily_learning_data.js"></script>'
    inline_script = f"<script>\n{data_js}\n</script>"
    if target_tag in html:
        bundled = html.replace(target_tag, inline_script, 1)
    else:
        bundled = html

    if os.path.exists(SYNC_PATH):
        with open(SYNC_PATH, "r", encoding="utf-8") as f:
            sync_js = f.read()
        sync_target = '<script src="data/user_sync_state.js"></script>'
        sync_inline = f"<script>\n{sync_js}\n</script>"
        if sync_target in bundled:
            bundled = bundled.replace(sync_target, sync_inline, 1)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(bundled)
    print(f"✓ Built standalone app: {OUT_PATH} ({len(bundled):,} bytes)")


if __name__ == "__main__":
    build()

