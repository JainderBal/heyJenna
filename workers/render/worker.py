#!/usr/bin/env python3
"""hey jenna render worker.

Loop: ask the API for the next render job -> run Blender on its layout -> upload the
PNG (+ .glb 3D model) -> mark it done (or failed). Talks to the API over HTTP with the
shared WORKER_TOKEN; it never touches the database. Standard library only.

    python3 workers/render/worker.py --env-file apps/api/.env          # keep working
    python3 workers/render/worker.py --env-file apps/api/.env --once   # one job, then exit

Env: API_URL (default http://localhost:3000), WORKER_TOKEN (required),
     BLENDER_BIN, SAMPLES (default 128), PCT (resolution %, default 100), POLL_SECONDS (3)
"""
import argparse, json, os, socket, subprocess, sys, tempfile, time, urllib.error, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "blender", "render_layout.py")
DEFAULT_BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender" if sys.platform == "darwin" else "blender"


def load_env_file(path):
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            if v and k not in os.environ: os.environ[k] = v


class Api:
    def __init__(self, base, token):
        self.base, self.token = base.rstrip("/"), token

    def _send(self, path, body=b"", content_type="application/json"):
        req = urllib.request.Request(self.base + path, data=body, method="POST",
                                     headers={"x-worker-token": self.token, "content-type": content_type})
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"null")

    def post_json(self, path, data):
        return self._send(path, json.dumps(data).encode())

    def post_files(self, path, files):
        """files: {field: (filename, bytes, content type)} sent as multipart/form-data."""
        b = uuid.uuid4().hex; parts = []
        for field, (name, data, ctype) in files.items():
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b"\r\n")
        return self._send(path, b"".join(parts) + f"--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}")


def render(layout, workdir, blender, samples, pct):
    src, png, glb = (os.path.join(workdir, n) for n in ("layout.json", "room.png", "room.glb"))
    json.dump(layout, open(src, "w"))
    env = dict(os.environ, SAMPLES=str(samples), PCT=str(pct))
    t = time.time()
    p = subprocess.run([blender, "-b", "-P", SCRIPT, "--", src, png, glb], env=env, capture_output=True, text=True, timeout=20 * 60)
    log = (p.stdout + p.stderr)[-4000:]
    if p.returncode != 0 or not os.path.exists(png):
        raise RuntimeError(f"Blender exited {p.returncode}\n{log}")
    print(f"  rendered in {time.time() - t:.0f}s")
    return png, (glb if os.path.exists(glb) else None)


def work_one(api, worker_id, blender, samples, pct):
    """Returns False when the queue was empty."""
    claimed = api.post_json("/internal/render-jobs/claim", {"workerId": worker_id})
    job = claimed and claimed.get("job")
    if not job: return False
    jid = job["id"]
    print(f"job {jid} (layout {job['layoutId']}, attempt {job['attempts']})")
    try:
        with tempfile.TemporaryDirectory(prefix="hj-render-") as d:
            png, glb = render(claimed["layout"], d, blender, samples, pct)
            files = {"image": ("room.png", open(png, "rb").read(), "image/png")}
            if glb: files["model"] = ("room.glb", open(glb, "rb").read(), "model/gltf-binary")
            api.post_files(f"/internal/render-jobs/{jid}/complete", files)
        print(f"  done {jid}")
    except Exception as e:  # report and keep going
        print(f"  failed {jid}: {str(e).splitlines()[0]}")
        try: api.post_json(f"/internal/render-jobs/{jid}/fail", {"error": str(e)[:5000]})
        except Exception as e2: print("  could not report failure:", e2)
    return True


def main():
    ap = argparse.ArgumentParser(description="hey jenna render worker")
    ap.add_argument("--env-file"); ap.add_argument("--once", action="store_true", help="exit when the queue is empty")
    a = ap.parse_args()
    if a.env_file: load_env_file(a.env_file)
    token = os.environ.get("WORKER_TOKEN") or sys.exit("WORKER_TOKEN is not set")
    api = Api(os.environ.get("API_URL", f"http://localhost:{os.environ.get('PORT', '3000')}"), token)
    blender = os.environ.get("BLENDER_BIN", DEFAULT_BLENDER)
    samples, pct = int(os.environ.get("SAMPLES", 128)), int(os.environ.get("PCT", 100))
    poll = float(os.environ.get("POLL_SECONDS", 3))
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    print(f"render worker {worker_id} → {api.base} (blender {blender}, {samples} samples, {pct}%)")
    while True:
        try:
            busy = work_one(api, worker_id, blender, samples, pct)
        except urllib.error.URLError as e:
            print("API unreachable:", e); busy = False
        if not busy:
            if a.once: return
            time.sleep(poll)


if __name__ == "__main__":
    main()
