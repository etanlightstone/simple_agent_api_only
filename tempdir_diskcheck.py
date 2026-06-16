"""Diagnostic app: report tempfile.gettempdir() and disk space for that dir.

This mirrors how the Clinical Data Explorer backend resolves where temporary
Domino dataset / NetApp volume downloads are written:

    backend/services/download_file_metadata_cache.py
        self.temp_root = tempfile.gettempdir()
        cache_root()   -> {temp_root}/domino_api_datasets

Visit the running app in a browser to see, for the live container:
  - which TMPDIR/TEMP/TMP env vars are set
  - the effective tempfile.gettempdir() path
  - the filesystem type backing it (e.g. tmpfs vs overlay)
  - total / used / free disk space relative to that directory
"""
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI(title="Tempdir Disk Check")


def human_bytes(num: int) -> str:
    value = float(num)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB", "PiB"):
        if abs(value) < 1024.0:
            return f"{value:.2f} {unit}"
        value /= 1024.0
    return f"{value:.2f} EiB"


def find_mount_fstype(target: str):
    """Best-effort: find the fstype of the mount backing `target` via /proc/mounts."""
    try:
        resolved = os.path.realpath(target)
    except OSError:
        resolved = target

    best_mount = None
    best_fstype = None
    best_len = -1
    try:
        with open("/proc/mounts", "r", encoding="utf-8") as mounts:
            for line in mounts:
                fields = line.split()
                if len(fields) < 3:
                    continue
                mount_point, fstype = fields[1], fields[2]
                if resolved == mount_point or resolved.startswith(
                    mount_point.rstrip("/") + "/"
                ):
                    if len(mount_point) > best_len:
                        best_len = len(mount_point)
                        best_mount = mount_point
                        best_fstype = fstype
    except FileNotFoundError:
        # /proc/mounts not available (e.g. non-Linux). Leave as None.
        pass
    return best_mount, best_fstype


def collect_report() -> dict:
    tempdir = tempfile.gettempdir()
    resolved = os.path.realpath(tempdir)
    cache_root = os.path.join(tempdir, "domino_api_datasets")

    env_vars = {name: os.environ.get(name) for name in ("TMPDIR", "TEMP", "TMP")}

    usage = shutil.disk_usage(tempdir)
    mount_point, fstype = find_mount_fstype(tempdir)

    return {
        "tempfile_gettempdir": tempdir,
        "resolved_realpath": resolved,
        "download_cache_root": cache_root,
        "cache_root_exists": os.path.isdir(cache_root),
        "writable": os.access(tempdir, os.W_OK),
        "env_vars": env_vars,
        "backing_mount_point": mount_point,
        "backing_fstype": fstype,
        "disk": {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "total_human": human_bytes(usage.total),
            "used_human": human_bytes(usage.used),
            "free_human": human_bytes(usage.free),
            "percent_used": round(usage.used / usage.total * 100, 1)
            if usage.total
            else None,
        },
    }


@app.get("/api/report")
def api_report() -> JSONResponse:
    return JSONResponse(collect_report())


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    r = collect_report()
    disk = r["disk"]
    env_rows = "".join(
        f"<tr><td><code>{name}</code></td><td>{value if value is not None else '<em>(not set)</em>'}</td></tr>"
        for name, value in r["env_vars"].items()
    )
    pct = disk["percent_used"]
    bar_color = "#28A464" if (pct or 0) < 80 else "#CCB718" if (pct or 0) < 95 else "#C20A29"

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tempdir Disk Check</title>
<style>
  body {{ font-family: Inter, Helvetica, Arial, sans-serif; color: #2E2E38;
         background: #FAFAFA; margin: 0; padding: 32px; }}
  .card {{ background: #fff; border: 1px solid #E0E0E0; border-radius: 8px;
          padding: 24px; max-width: 820px; margin: 0 auto 20px; }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  .sub {{ color: #65657B; margin: 0 0 20px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  td, th {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid #EEE;
           vertical-align: top; font-size: 14px; }}
  th {{ width: 240px; color: #65657B; font-weight: 600; }}
  code {{ background: #F5F5F5; padding: 2px 6px; border-radius: 4px;
         font-size: 13px; word-break: break-all; }}
  .bar {{ height: 14px; background: #EEE; border-radius: 7px; overflow: hidden; }}
  .bar > span {{ display: block; height: 100%; width: {pct or 0}%; background: {bar_color}; }}
  .big {{ font-size: 18px; font-weight: 600; }}
</style>
</head>
<body>
  <div class="card">
    <h1>Tempfile location</h1>
    <p class="sub">Where Domino dataset / NetApp downloads get written in this container.</p>
    <table>
      <tr><th><code>tempfile.gettempdir()</code></th><td><code>{r['tempfile_gettempdir']}</code></td></tr>
      <tr><th>resolved realpath</th><td><code>{r['resolved_realpath']}</code></td></tr>
      <tr><th>download cache root</th><td><code>{r['download_cache_root']}</code></td></tr>
      <tr><th>cache root exists</th><td>{r['cache_root_exists']}</td></tr>
      <tr><th>writable</th><td>{r['writable']}</td></tr>
      <tr><th>backing mount point</th><td><code>{r['backing_mount_point']}</code></td></tr>
      <tr><th>backing filesystem type</th><td><code>{r['backing_fstype']}</code></td></tr>
    </table>
  </div>

  <div class="card">
    <h1>TMP environment variables</h1>
    <p class="sub">If any are set, they override the default <code>/tmp</code>.</p>
    <table>{env_rows}</table>
  </div>

  <div class="card">
    <h1>Disk space for that directory</h1>
    <table>
      <tr><th>Total</th><td class="big">{disk['total_human']}</td></tr>
      <tr><th>Used</th><td>{disk['used_human']} ({pct}%)</td></tr>
      <tr><th>Free</th><td class="big">{disk['free_human']}</td></tr>
    </table>
    <div style="margin-top:14px;" class="bar"><span></span></div>
    <p class="sub" style="margin-top:14px;">Raw JSON also available at <code>./api/report</code>.</p>
  </div>
</body>
</html>"""
    return HTMLResponse(html)
