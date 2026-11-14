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
import argparse, hashlib, json, os, socket, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid

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


MODEL_CACHE = os.path.expanduser(os.environ.get("MODEL_CACHE", "~/.cache/hey-jenna/models"))
MODEL_HOSTS = tuple(h.strip() for h in os.environ.get("MODEL_HOSTS", "web-api.ikea.com").split(",") if h.strip())
MAX_MODEL_BYTES = 40 * 1024 * 1024


def fetch_model(url):
    """Download a product's 3D model once (cached by URL). Only https, only from MODEL_HOSTS, size-limited."""
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in MODEL_HOSTS: return None
    os.makedirs(MODEL_CACHE, exist_ok=True)
    path = os.path.join(MODEL_CACHE, hashlib.sha1(url.encode()).hexdigest() + ".glb")
    if os.path.exists(path): return path
    req = urllib.request.Request(url, headers={"user-agent": "hey-jenna/0.1 (hackathon prototype; furniture matching)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_MODEL_BYTES + 1)
    if len(data) > MAX_MODEL_BYTES or data[:4] != b"glTF": return None
    with open(path + ".part", "wb") as f: f.write(data)
    os.replace(path + ".part", path)
    return path


def attach_models(layout):
    """Give each placed product with a 3D model a local file the renderer can import."""
    n = 0
    for o in layout.get("objects", []):
        url = (o.get("product") or {}).get("modelUrl")
        if not url: continue
        try:
            path = fetch_model(url)
            if path: o["model_path"] = path; n += 1
        except Exception as e:
            print(f"  model for {o['id']} unavailable: {e}")
    return n


def render(layout, workdir, blender, samples, pct):
    src, png, glb = (os.path.join(workdir, n) for n in ("layout.json", "room.png", "room.glb"))
    models = attach_models(layout)
    if models: print(f"  {models} real product models")
    json.dump(layout, open(src, "w"))
    env = dict(os.environ, SAMPLES=str(samples), PCT=str(pct))
    t = time.time()
    p = subprocess.run([blender, "-b", "-P", SCRIPT, "--", src, png, glb], env=env, capture_output=True, text=True, timeout=20 * 60)
    log = (p.stdout + p.stderr)[-4000:]
    if not os.path.exists(png):
        raise RuntimeError(f"Blender exited {p.returncode}\n{log}")
    if p.returncode != 0:
        print(f"  Blender exited {p.returncode} after saving the picture (3D model export failed); sending the picture only")
        if os.path.exists(glb): os.remove(glb)
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
