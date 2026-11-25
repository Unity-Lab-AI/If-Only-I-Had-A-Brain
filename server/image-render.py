#!/usr/bin/env python3
"""
image-render.py — her eyes' renderer, owned by THIS project.

Renders the reference pictures she looks at, on her own card, from the SDXL
base 1.0 checkpoint kept in this repo's own models/image/ (gitignored — a
third-party checkpoint on a public remote). Started and stopped by this
project's launchers; nothing here depends on any other project's tree or
process.

⭐ SDXL, NOT SD1.5 (2026-11-24). Measured on the same 5 English-text prompts:
the old realistic-vision-v51 (SD1.5) wrote "ABAKRYY" for BAKERY, "TOP" for
STOP and scribbles elsewhere — that generation cannot spell in any language;
SDXL wrote "BAKERY", "STOP", "Hello World". Peak 5.59 GB with model CPU
offload + VAE tiling at 1024x1024 (vs 2.81 GB), 11.2 s/image. An SD1.5 file
passed as the checkpoint still loads (kind is read from the file name).

⛔ NO DEFAULT NEGATIVE PROMPT. The picture is what the request describes —
nothing is forbidden behind it. Words appear because the request asked for
them (her words in quotes); SDXL does not letter a picture nobody asked to be
lettered the way SD1.5 scribbled pseudo-text into it.

Only what the brain calls (server/brain-server/image-engine.js):
  GET  /health   -> {"ok", "loaded", "device", "checkpoint", "checkpoint_present", "busy", "kind", "writes_text"}
  POST /txt2img  {"prompt", "negative"?, "width"?, "height"?, "steps"?, "guidance"?, "seed"?}
                 ("allowText" may ride along — recorded by the brain, not used here)
                 -> image/png  (headers X-Seed, X-Seconds, X-Size)
  POST /unload   -> drops the pipeline and frees the card (the process stays)
  POST /shutdown -> exits

Behaviour the brain's pacing was measured against, kept exactly:
  - the checkpoint loads on the FIRST render, so /health answers at once and the
    card is only taken when a picture is asked for;
  - model CPU offload on CUDA (only the executing layer rides the GPU — her
    brain's donor matrices and her voice keep their room);
  - one render at a time (a lock); DPM++ multistep sampling; fp16 on CUDA;
  - the prompt is cut by the real CLIP tokenizer (CLIP reads 77 tokens and
    silently drops the rest).

    python server/image-render.py --port 5124 --checkpoint models/image/sdxl-base-1.0.safetensors
"""
import argparse
import gc
import io
import json
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CKPT = os.path.join(HERE, "..", "models", "image", "sdxl-base-1.0.safetensors")

# ⛔ NO DEFAULT NEGATIVE PROMPT (2026-11-24, operator law, stated twice). A fixed
# negative forbade whole kinds of picture behind every request — it banned
# "cartoon, anime, 3d render" on every render, so a cartoon could never be asked
# for — and naming a thing in a prompt pulls the model toward it. What the
# picture is, is the request's business: only a caller's own `negative` is sent.


def _is_xl(path):
    n = os.path.basename(path).lower()
    return "xl" in n

CKPT = DEFAULT_CKPT
DEVICE_ARG = "auto"
OFFLOAD = True

_lock = threading.Lock()
_state = {"t2i": None, "device": None}


def _log(msg):
    print(time.strftime("%H:%M:%S"), "image:", msg, flush=True)


def _device():
    if _state["device"]:
        return _state["device"]
    import torch
    dev = DEVICE_ARG
    if dev == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    _state["device"] = dev
    return dev


def _round8(n, lo=256, hi=1024):
    n = max(lo, min(hi, int(n)))
    return n - (n % 8)


def _load():
    if _state["t2i"] is not None:
        return
    import torch
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    if not os.path.exists(CKPT):
        raise FileNotFoundError("checkpoint not found: %s" % CKPT)
    dev = _device()
    t0 = time.time()
    _log("loading %s on %s%s" % (os.path.basename(CKPT), dev, " (cpu offload)" if dev == "cuda" and OFFLOAD else ""))
    dtype = torch.float16 if dev == "cuda" else torch.float32
    if _is_xl(CKPT):
        t2i = StableDiffusionXLPipeline.from_single_file(CKPT, torch_dtype=dtype)
        # tiles the VAE decode — part of the measured 5.59 GB peak at 1024x1024
        t2i.vae.enable_tiling()
    else:
        t2i = StableDiffusionPipeline.from_single_file(CKPT, torch_dtype=dtype, safety_checker=None)
    t2i.scheduler = DPMSolverMultistepScheduler.from_config(t2i.scheduler.config)
    if dev == "cuda":
        if OFFLOAD:
            t2i.enable_model_cpu_offload()
        else:
            t2i.to("cuda")
    else:
        t2i.to("cpu")
    _state["t2i"] = t2i
    _log("loaded in %.1fs" % (time.time() - t0))


def _tokens_fit(text, limit=75):
    try:
        tok = _state["t2i"].tokenizer
        ids = tok(text).input_ids
        if len(ids) <= limit + 2:
            return text
        return tok.decode(ids[1:limit + 1]).strip()
    except Exception:
        words = text.split()
        return " ".join(words[:55]) if len(words) > 55 else text


def render_txt2img(req):
    import torch
    _load()
    dev = _device()
    w = _round8(req.get("width") or (768 if dev == "cuda" else 512))
    h = _round8(req.get("height") or (768 if dev == "cuda" else 512))
    steps = max(4, min(60, int(req.get("steps") or (25 if dev == "cuda" else 12))))
    seed = req.get("seed")
    seed = int(seed) if seed not in (None, "", 0) else random.randint(1, 2 ** 31 - 1)
    gen = torch.Generator(dev).manual_seed(seed)
    guidance = float(req.get("guidance") or 6.5)
    # only the caller's own negative, never a default (see the note at the top)
    negative = str(req.get("negative") or "")
    # SDXL draws at its native 1024 (what was measured) and is scaled to the
    # size the brain asked for; SD1.5 renders the asked size directly
    xl = _is_xl(CKPT)
    rw, rh = (w, h)
    if xl:
        k = 1024.0 / max(w, h)
        rw, rh = _round8(w * k, lo=512, hi=1024), _round8(h * k, lo=512, hi=1024)
    t0 = time.time()
    if dev == "cuda":
        torch.cuda.empty_cache()
    out = _state["t2i"](prompt=_tokens_fit(str(req.get("prompt") or "")), negative_prompt=(_tokens_fit(negative) if negative else None),
                        width=rw, height=rh, num_inference_steps=steps, guidance_scale=guidance,
                        generator=gen).images[0]
    if (rw, rh) != (w, h):
        from PIL import Image
        out = out.resize((w, h), Image.LANCZOS)
    return out, seed, time.time() - t0


def unload():
    had = _state["t2i"] is not None
    # ⛔ WITH CPU OFFLOAD THE MODEL IS KEPT, ONLY THE CARD IS FREED. Offload
    # already parks every component in system RAM between renders, so dropping
    # the pipeline freed no VRAM worth having — and it never freed the RAM:
    # the offload hooks keep the old copy alive, so each unload→load cycle
    # leaked a whole SDXL (measured: 6 cycles → 58 GB private on this host).
    # One resident copy, reused for every render.
    if had and OFFLOAD and _state.get("device") == "cuda":
        try:
            _state["t2i"].maybe_free_model_hooks()
        except Exception:
            pass
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass
        _log("card freed (model stays resident in RAM)")
        return True
    _state["t2i"] = None
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    if had:
        _log("unloaded")
    return had


class Handler(BaseHTTPRequestHandler):
    server_version = "unity-image/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            return self._json({"ok": True, "loaded": _state["t2i"] is not None, "device": _state["device"] or DEVICE_ARG,
                               "checkpoint": os.path.basename(CKPT), "checkpoint_present": os.path.exists(CKPT),
                               "busy": _lock.locked(),
                               "kind": "sdxl" if _is_xl(CKPT) else "sd15",
                               "writes_text": _is_xl(CKPT)})
        self._json({"error": "unknown endpoint"}, 404)

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception as e:
            return self._json({"error": "bad json: %s" % e}, 400)
        if path == "/unload":
            with _lock:
                return self._json({"ok": True, "unloaded": unload()})
        if path == "/shutdown":
            self._json({"ok": True})
            threading.Timer(0.3, lambda: os._exit(0)).start()
            return
        if path != "/txt2img":
            return self._json({"error": "unknown endpoint"}, 404)
        if not str(req.get("prompt") or "").strip():
            return self._json({"error": "prompt is empty"}, 422)
        try:
            with _lock:
                img, seed, secs = render_txt2img(req)
        except FileNotFoundError as e:
            return self._json({"error": str(e)}, 503)
        except (KeyError, ValueError) as e:
            return self._json({"error": str(e)}, 422)
        except Exception as e:
            _log("render failed: %r" % (e,))
            return self._json({"error": "%s: %s" % (type(e).__name__, str(e)[:300])}, 500)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Seed", str(seed))
        self.send_header("X-Seconds", "%.2f" % secs)
        self.send_header("X-Size", "%dx%d" % img.size)
        self.end_headers()
        self.wfile.write(body)
        _log("txt2img %dx%d seed %d in %.1fs" % (img.size[0], img.size[1], seed, secs))
        _maybe_recycle()


def main():
    global CKPT, DEVICE_ARG, OFFLOAD
    ap = argparse.ArgumentParser(description="her eyes' renderer (this project's own)")
    ap.add_argument("--port", type=int, default=int(os.environ.get("UNITY_IMAGE_PORT", "5124")))
    ap.add_argument("--checkpoint", default=os.environ.get("UNITY_IMAGE_CHECKPOINT", DEFAULT_CKPT))
    ap.add_argument("--device", default=os.environ.get("UNITY_IMAGE_DEVICE", "auto"), choices=["auto", "cuda", "cpu"])
    ap.add_argument("--no-offload", action="store_true", help="keep the whole model on the GPU (~3 GB more VRAM)")
    a = ap.parse_args()
    CKPT, DEVICE_ARG, OFFLOAD = os.path.abspath(a.checkpoint), a.device, not a.no_offload
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    _log("serving on 127.0.0.1:%d  checkpoint=%s  present=%s" % (a.port, os.path.basename(CKPT), os.path.exists(CKPT)))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


# ⛔⛔ THE OFFLOAD RENDER LEAKS HOST RAM AND NOTHING INSIDE THE PROCESS GETS IT
# BACK. Measured 2026-11-24 on this host (512x512, 6 steps): with CPU offload,
# private memory 0 → 11.2 → 19.5 → 24.8 GB over three renders, and /unload
# freed none of it; the live renderer reached 128 GB after 27 renders. With
# offload OFF it held flat (17.34 / 17.41 / 17.42 / 17.45 GB over four) — but
# the 4070 also carries her small clusters, so the whole model cannot live on
# the card. So the process is RECYCLED: after a render, if its private memory
# is past UNITY_IMAGE_RECYCLE_GB (default 20), the worker exits with code 3 and
# this supervisor starts a fresh one (~3 s load on the next render). Any other
# exit (/shutdown, a crash) ends the supervisor too, so stop and restart
# behave as before.
def _private_gb():
    try:
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes

            class PMC(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                            ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                            ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                            ("PrivateUsage", ctypes.c_size_t)]
            c = PMC(); c.cb = ctypes.sizeof(PMC)
            # Typed handle + K32 entry point: the untyped call truncated the
            # 64-bit pseudo-handle and read 0 every time (measured).
            k = ctypes.WinDLL("kernel32")
            k.GetCurrentProcess.restype = wintypes.HANDLE
            f = k.K32GetProcessMemoryInfo
            f.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
            f.restype = wintypes.BOOL
            if not f(k.GetCurrentProcess(), ctypes.byref(c), c.cb):
                return 0.0
            return c.PrivateUsage / 1e9
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1e6
    except Exception:
        return 0.0
    return 0.0


RECYCLE_GB = float(os.environ.get("UNITY_IMAGE_RECYCLE_GB", "20") or 20)


def _maybe_recycle():
    gb = _private_gb()
    if RECYCLE_GB > 0 and gb > RECYCLE_GB:
        _log("RECYCLE — private memory %.1f GB > %.0f GB (offload leak); fresh worker on the next render" % (gb, RECYCLE_GB))
        threading.Timer(0.3, lambda: os._exit(3)).start()


def _supervise():
    import subprocess
    import sys
    env = dict(os.environ, UNITY_IMAGE_WORKER="1")
    while True:
        rc = subprocess.call([sys.executable, "-u", os.path.abspath(__file__)] + sys.argv[1:], env=env)
        if rc != 3:
            sys.exit(rc)
        time.sleep(1.0)


if __name__ == "__main__":
    if os.environ.get("UNITY_IMAGE_WORKER") == "1":
        main()
    else:
        _supervise()
