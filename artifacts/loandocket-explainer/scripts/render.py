#!/usr/bin/env python3
"""Assemble the LoanDocket explainer from one recorded take and one voice set.

Inputs (all produced by the other scripts in this folder):
  work/<take>/frames, timeline.json, take.json, evidence/   record.mjs (screencast, checks, lender ZIP)
  work/cards/                                                cards.mjs  (opening, closing, section introductions)
  work/audio/<voice>/                                        narrate.sh or any tool writing the same manifest
  scripts/edit.json, narration.json, fonts/

Every input and the planned timing are validated first. The video is rendered to
work/render/<take>/final.tmp.mp4, checked again as a file, and only then moved over
loandocket-explainer.mp4 (captions.srt likewise). Nothing is published when a check fails.

Usage (from anywhere):
  python3 artifacts/loandocket-explainer/scripts/render.py [--take NAME] [--voice SET] [--check]
  --check validates and prints the planned timeline without rendering.
  --no-publish renders and validates but leaves final.tmp.mp4 in work/render/<take>/ (for rehearsals).
  --audio-from MP4 keeps that video's audio and caption streams unchanged instead of the new mix, after checking
    that its caption timing equals this render's (use it to re-render the picture without touching the sound).
    If that video has extra cues after this render's last one, its audio packets are copied unchanged up to just
    before the first extra cue, silence fills the rest, and only this render's cues are kept as captions.

The footage fills the 1920x1080 frame. Nothing is drawn over it except one brief introduction per section (a dark
lower band with the step name and one line), which fades out completely; the narration is only spoken and in the
optional caption track.
"""
import argparse
from array import array
import hashlib
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(HERE, "work")
EDIT = json.load(open(os.path.join(HERE, "scripts/edit.json")))
NARR_LIST = json.load(open(os.path.join(HERE, "narration.json")))
NARR = {n["id"]: n for n in NARR_LIST}
FPS = EDIT["fps"]
XF = EDIT["crossfade"]
SRC_SCALE = 2  # recorded at 2x the 1440x810 CSS layout
CSS_W, CSS_H = 1440, 810
# Every stage ends in BT.709 limited range, so screen clips and cards match at each crossfade.
TO709 = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
MASTER_VF = f"fps={FPS},scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p"
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
FONTS = ["public-sans-latin.woff2", "public-sans-latin-ext.woff2", "source-serif-4-latin.woff2", "source-serif-4-latin-ext.woff2"]
CARD_INPUTS = [os.path.join(HERE, "scripts/cards.mjs"), os.path.join(HERE, "scripts/edit.json")] + \
              [os.path.join(HERE, "fonts", f) for f in FONTS]
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
GAP = 0.25  # minimum silence between narration cues
TAIL = 0.3  # last narration must end this long before the video does

ap = argparse.ArgumentParser()
ap.add_argument("--take", default=EDIT["take"])
ap.add_argument("--voice", default=EDIT["voice"])
ap.add_argument("--check", action="store_true")
ap.add_argument("--no-publish", action="store_true", help="render and validate, but leave the result in work/render/<take>/")
ap.add_argument("--audio-from", help="finished MP4 whose audio and caption streams are kept unchanged")
args = ap.parse_args()
errors = []


def need(ok, msg):
    if not ok:
        errors.append(msg)
    return ok


def stop_if_errors(stage):
    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        raise SystemExit(f"{stage} failed with {len(errors)} problem(s); nothing was published.")


def inside_work(name, parent, kind):
    """A take or voice name must be one plain folder directly under its parent."""
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise SystemExit(f"Invalid {kind} name {name!r}: use 1-48 of a-z, 0-9, '-' or '_'.")
    path = os.path.realpath(os.path.join(parent, name))
    if os.path.dirname(path) != os.path.realpath(parent):
        raise SystemExit(f"{kind} {name!r} resolves outside {parent}.")
    return path


def run_bytes(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        sys.stderr.write(r.stderr.decode(errors="replace")[-4000:])
        raise SystemExit(f"failed: {' '.join(cmd[:6])} ...; nothing was published.")
    return r.stdout


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-4000:])
        raise SystemExit(f"failed: {' '.join(cmd[:6])} ...; nothing was published.")
    return r


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


TAKE = inside_work(args.take, WORK, "take")
AUDIO = inside_work(args.voice, os.path.join(WORK, "audio"), "voice set")
OUT = os.path.join(WORK, "render", args.take)  # every intermediate is specific to this take
CARDS = os.path.join(WORK, "cards")

# ── 1. Preflight: take, deal and package evidence ─────────────────────────────────────
take = {}
if need(os.path.isfile(os.path.join(TAKE, "take.json")), f"take {args.take}: no take.json (missing or incomplete take)"):
    take = json.load(open(os.path.join(TAKE, "take.json")))
    exp = EDIT["expect"]
    need(take.get("take") == args.take, f"take.json names take {take.get('take')!r}, not {args.take!r}")
    need(take.get("dealCode") == exp["dealCode"], f"take shows deal {take.get('dealCode')}, edit.json expects {exp['dealCode']}")
    need(take.get("dealName") == exp["dealName"], f"take shows {take.get('dealName')!r}, expected {exp['dealName']!r}")
    pkg = take.get("package", {})
    need(pkg.get("version") == exp["packageVersion"], f"take downloaded version {pkg.get('version')}, expected {exp['packageVersion']}")
    ev = os.path.join(TAKE, "evidence")
    zip_path = os.path.join(ev, pkg.get("zip", "-"))
    if need(os.path.isfile(zip_path), f"retained lender ZIP {pkg.get('zip')} is missing"):
        need(sha256(zip_path) == pkg.get("sha256"), "retained lender ZIP does not match the one downloaded on camera")
        need(exp["dealCode"] in os.path.basename(zip_path), "retained ZIP name does not carry the deal code")
    for f in ("zip-listing.txt", "00_Package_Report.html", "workbook-inspection.md"):
        need(os.path.isfile(os.path.join(ev, f)), f"evidence file {f} is missing")
    if os.path.isfile(os.path.join(ev, "workbook-inspection.md")):
        need("All package checks passed." in open(os.path.join(ev, "workbook-inspection.md")).read(), "the package inspection did not pass")
    if os.path.isfile(os.path.join(ev, "00_Package_Report.html")):
        heading = f"{exp['dealCode']} · {exp['dealName']} · Version {exp['packageVersion']}"
        need(heading in open(os.path.join(ev, "00_Package_Report.html"), encoding="utf-8").read(), f"report heading is not {heading!r}")

timeline, marks, T0, SRC_DUR = {}, {}, 0.0, 0.0
if need(os.path.isfile(os.path.join(TAKE, "timeline.json")), f"take {args.take}: no timeline.json"):
    timeline = json.load(open(os.path.join(TAKE, "timeline.json")))
    frames = timeline["frames"]
    need(len(frames) > 0 and len(frames) == take.get("frames", len(frames)), "frame count differs from take.json")
    missing = [f["file"] for f in frames if not os.path.isfile(os.path.join(TAKE, f["file"]))]
    need(not missing, f"{len(missing)} recorded frames are missing (first: {missing[:1]})")
    marks = {m["name"]: m["t"] for m in timeline["marks"]}
    T0 = frames[0]["t"] if frames else 0.0
    need("end" in marks, "timeline has no end marker")
    SRC_DUR = marks.get("end", T0) - T0


def mark_time(expr):
    """'s2-choose-0.4' -> seconds on the take's own timeline."""
    if expr in marks:
        return marks[expr] - T0
    m = re.fullmatch(r"(.+?)([+-])(\d+(?:\.\d+)?)", expr)
    if m and m.group(1) in marks:
        return marks[m.group(1)] - T0 + (float(m.group(3)) if m.group(2) == "+" else -float(m.group(3)))
    raise KeyError(expr)


# ── 2. Preflight: shots ───────────────────────────────────────────────────────────────
shots = []
ids = ["opening"] + [s["id"] for s in EDIT["shots"]] + ["closing"]
need(len(ids) == len(set(ids)), "shot ids are not unique")
for s in EDIT["shots"]:
    try:
        a, b = mark_time(s["from"]), mark_time(s["to"])
    except KeyError as e:
        need(False, f"shot {s['id']}: marker {e} not in take {args.take}")
        continue
    need(0 <= a < b, f"shot {s['id']}: range {a:.2f}–{b:.2f}s is empty, reversed or negative")
    need(b - a >= 0.5, f"shot {s['id']}: only {b - a:.2f}s long")
    need(b <= SRC_DUR + 1e-6, f"shot {s['id']}: ends at {b:.2f}s, after the footage ({SRC_DUR:.2f}s)")
    x, y, w = s["crop"]
    h = round(w * 1080 / 1920)
    need(w > 0 and x >= 0 and y >= 0 and x + w <= CSS_W and y + h <= CSS_H,
         f"shot {s['id']}: crop {x},{y} {w}x{h} falls outside the {CSS_W}x{CSS_H} layout")
    need(s.get("hold", 0) >= 0 and s.get("lead", 0) >= 0, f"shot {s['id']}: negative hold or lead")
    keys = []
    for mark, ky in s.get("crop_y", []):
        try:
            kt = mark_time(mark) - a
        except KeyError as e:
            need(False, f"shot {s['id']}: crop_y marker {e} not in take {args.take}")
            continue
        need(0 <= kt <= b - a, f"shot {s['id']}: crop_y key {mark} falls outside the shot")
        need(ky >= 0 and ky + h <= CSS_H, f"shot {s['id']}: crop_y {ky} puts the crop outside the layout")
        keys.append((kt, ky))
    freezes = []
    for m0, m1 in s.get("freeze", []):
        try:
            f0, f1 = mark_time(m0), mark_time(m1)
        except KeyError as e:
            need(False, f"shot {s['id']}: freeze marker {e} not in take {args.take}")
            continue
        # Clip frame n shows master frame ceil(a*FPS)+n; frames shown at f0 <= t < f1 are replaced by the one before.
        n0 = math.ceil(round(f0 * FPS, 6)) - math.ceil(round(a * FPS, 6))
        n1 = math.ceil(round(f1 * FPS, 6)) - 1 - math.ceil(round(a * FPS, 6))
        need(1 <= n0 <= n1 and f1 <= b, f"shot {s['id']}: freeze {m0}–{m1} is empty or not inside the shot")
        freezes.append((n0, n1))
    cuts = []
    for m0, m1 in s.get("cut_out", []):
        try:
            f0, f1 = mark_time(m0), mark_time(m1)
        except KeyError as e:
            need(False, f"shot {s['id']}: cut_out marker {e} not in take {args.take}")
            continue
        n0 = math.ceil(round(f0 * FPS, 6)) - math.ceil(round(a * FPS, 6))
        n1 = math.ceil(round(f1 * FPS, 6)) - 1 - math.ceil(round(a * FPS, 6))
        need(1 <= n0 <= n1 and f1 < b, f"shot {s['id']}: cut_out {m0}–{m1} is empty or not inside the shot")
        cuts.append((n0, n1))
    need(s.get("transition", "dissolve") in ("dissolve", "cut"), f"shot {s['id']}: transition must be dissolve or cut")
    if keys:
        need(all(k1[0] > k0[0] for k0, k1 in zip(keys, keys[1:])), f"shot {s['id']}: crop_y keys are not in time order")
        need(keys[-1][1] == y, f"shot {s['id']}: crop y {y} must equal the last crop_y key ({keys[-1][1]})")
    need(str(s.get("step")) in EDIT["steps"], f"shot {s['id']}: unknown step {s.get('step')}")
    shots.append({**s, "a": a, "b": b, "h": h, "keys": keys, "freezes": freezes, "cuts": cuts,
                  "planned": (round((b - a) * FPS) - sum(n1 - n0 + 1 for n0, n1 in cuts)) / FPS + s.get("hold", 0) + s.get("lead", 0)})

# ── 3. Preflight: fonts, cards, narration audio ──────────────────────────────────────
for f in FONTS:
    need(os.path.isfile(os.path.join(HERE, "fonts", f)), f"font fonts/{f} is missing")
manifest = os.path.join(CARDS, "manifest.json")
if need(os.path.isfile(manifest), "work/cards/manifest.json is missing; run cards.mjs"):
    h = hashlib.sha256()
    for f in CARD_INPUTS:
        if need(os.path.isfile(f), f"card input {os.path.relpath(f, HERE)} is missing"):
            h.update(open(f, "rb").read())
    need(json.load(open(manifest)).get("inputs") == h.hexdigest(), "cards are stale (edit.json, fonts or cards.mjs changed); run cards.mjs")
for name, spec in (("opening", EDIT["opening"]), ("closing", EDIT["closing"])):
    d = os.path.join(CARDS, name)
    n = len([f for f in os.listdir(d) if f.endswith(".png")]) if os.path.isdir(d) else 0
    need(n == round(spec["duration"] * FPS), f"card {name}: {n} frames, expected {round(spec['duration'] * FPS)}")
INTRO = EDIT["intros"]
SECTIONS = [{"id": "opening", **EDIT["opening"]}] + EDIT["shots"]
for step in EDIT["steps"]:
    need(step in INTRO["text"], f"step {step} has no introduction in edit.json intros")
    need(any(str(s["step"]) == step for s in SECTIONS), f"step {step} has no shot")
    need(os.path.isfile(os.path.join(CARDS, f"intro-{step}.png")), f"introduction overlay for step {step} is missing")

voice = {}
if need(os.path.isfile(os.path.join(AUDIO, "manifest.json")), f"voice set {args.voice}: no manifest.json"):
    voice = json.load(open(os.path.join(AUDIO, "manifest.json")))
cue_ids = [c["id"] for c in EDIT["captions"]]
need(sorted(cue_ids) == sorted(NARR), "caption cues in edit.json do not match narration.json one to one")
cues = []
for c in EDIT["captions"]:
    if not need(c["id"] in NARR, f"cue {c['id']} is not in narration.json"):
        continue
    need(c["shot"] in ids, f"cue {c['id']}: unknown shot {c['shot']}")
    need(c["at"] >= 0, f"cue {c['id']}: negative offset")
    entry = voice.get("cues", {}).get(c["id"], {})
    wav = os.path.join(AUDIO, entry.get("file", f"{c['id']}.wav"))
    if not need(os.path.isfile(wav), f"cue {c['id']}: audio {os.path.relpath(wav, HERE)} is missing"):
        continue
    need(entry.get("text_sha256") == hashlib.sha256(NARR[c["id"]]["text"].encode()).hexdigest(),
         f"cue {c['id']}: audio was generated from different text; regenerate the voice set")
    d = duration(wav)
    need(d > 0.3, f"cue {c['id']}: audio is only {d:.2f}s")
    need("overlay" not in c, f"cue {c['id']}: narration is never drawn into the picture; remove 'overlay'")
    cues.append({**c, "wav": wav, "len": d, "text": NARR[c["id"]]["caption"]})
stop_if_errors("Preflight")


# ── 4. Timing (planned now, checked again with the rendered clip lengths) ────────────
def plan(durations):
    clips, t = [], 0.0
    for i, cid in enumerate(ids):
        start = 0.0 if i == 0 else t - XF
        t = start + durations[cid]
        clips.append({"id": cid, "start": start, "end": t, "dur": durations[cid]})
    total, by = t, {c["id"]: c for c in clips}
    caps, problems = [], []
    for c in cues:
        start = by[c["shot"]]["start"] + c["at"]
        caps.append({"id": c["id"], "shot": c["shot"], "start": start, "end": start + c["len"], "text": c["text"], "wav": c["wav"]})
    caps.sort(key=lambda x: x["start"])
    for i, c in enumerate(caps):
        c["show"] = max(0.0, c["start"] - 0.15)
        c["hide"] = c["end"] + 0.4
        if i + 1 < len(caps):
            nxt = caps[i + 1]
            if nxt["start"] < c["end"] + GAP:
                problems.append(f"narration {c['id']} ends {c['end']:.2f}s but {nxt['id']} starts {nxt['start']:.2f}s")
            c["hide"] = min(c["hide"], nxt["start"] - 0.2)
        if c["hide"] <= c["show"] + 0.5 or c["hide"] < c["end"]:
            problems.append(f"caption {c['id']} would disappear before its narration ends")
    for i in range(len(caps) - 1):
        if caps[i]["hide"] > caps[i + 1]["show"]:
            problems.append(f"captions {caps[i]['id']} and {caps[i + 1]['id']} overlap")
    if caps and caps[-1]["end"] > total - TAIL:
        problems.append(f"last narration ends {caps[-1]['end']:.2f}s; the video ends {total:.2f}s")
    if caps and caps[-1]["hide"] > total:
        caps[-1]["hide"] = total
    lo, hi = EDIT["duration"]["min"], EDIT["duration"]["max"]
    if not lo <= total <= hi:
        problems.append(f"total {total:.2f}s is outside {lo}–{hi}s")
    return clips, caps, total, problems


planned = {"opening": EDIT["opening"]["duration"], "closing": EDIT["closing"]["duration"]}
planned.update({s["id"]: s["planned"] for s in shots})
clips, caps, TOTAL, problems = plan(planned)
for c in clips:
    print(f"  {c['start']:6.2f}–{c['end']:6.2f}  {c['id']}")
for c in caps:
    print(f"  voice {c['start']:6.2f}–{c['end']:6.2f}  {c['id']}  (in {c['shot']})")
print(f"planned total {TOTAL:.2f}s · take {args.take} · deal {take['dealCode']} v{take['package']['version']} · voice {args.voice}")
errors += problems
stop_if_errors("Timing check")
if args.check:
    print("Preflight passed (--check: nothing rendered).")
    raise SystemExit(0)

# ── 5. Take-specific master, rebuilt whenever its inputs change ──────────────────────
os.makedirs(OUT, exist_ok=True)
master = os.path.join(OUT, "master.mp4")
key = hashlib.sha256(json.dumps({"take": args.take, "timeline": sha256(os.path.join(TAKE, "timeline.json")),
                                 "vf": MASTER_VF, "fps": FPS}).encode()).hexdigest()
stamp = os.path.join(OUT, "master.json")
if not (os.path.isfile(master) and os.path.isfile(stamp) and json.load(open(stamp)).get("key") == key):
    frames = timeline["frames"]
    lst = os.path.join(OUT, "frames.txt")
    with open(lst, "w") as f:
        for i, fr in enumerate(frames):
            nxt = frames[i + 1]["t"] if i + 1 < len(frames) else marks["end"]
            f.write(f"file '{os.path.join(TAKE, fr['file'])}'\nduration {max(nxt - fr['t'], 0.001):.6f}\n")
        f.write(f"file '{os.path.join(TAKE, frames[-1]['file'])}'\n")
    print(f"building master for take {args.take} …")
    for p in (master, stamp):
        if os.path.exists(p):
            os.remove(p)
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", MASTER_VF,
         *TAGS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", master])
    json.dump({"key": key, "take": args.take}, open(stamp, "w"))
need(duration(master) >= SRC_DUR - 0.2, f"master is {duration(master):.2f}s, footage is {SRC_DUR:.2f}s")
stop_if_errors("Master check")

# ── 6. Clips: opening, each shot (cropped and scaled), closing ───────────────────────
os.makedirs(os.path.join(OUT, "clips"), exist_ok=True)
files = {}


def card_clip(name, spec):
    out = os.path.join(OUT, "clips", f"{name}.mp4")
    vf = f"{TO709},setsar=1"
    run(["ffmpeg", "-y", "-v", "error", "-framerate", str(FPS), "-i", os.path.join(CARDS, name, "%04d.png"),
         "-t", f"{spec['duration']}", "-vf", vf, *TAGS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", out])
    files[name] = out


card_clip("opening", EDIT["opening"])
for s in shots:
    x, y, w = s["crop"]
    ys = f"{y * SRC_SCALE}"
    if s["keys"]:
        # Vertical framing eased (smoothstep) between keys, in whole layout pixels; t is seconds into the shot.
        ys = str(s["keys"][-1][1])
        for (t0, y0), (t1, y1) in reversed(list(zip(s["keys"], s["keys"][1:]))):
            pr = f"clip((t-{t0:.4f})/{t1 - t0:.4f}\\,0\\,1)"
            ys = f"if(lt(t\\,{t1:.4f})\\,{y0}+({y1 - y0})*{pr}*{pr}*(3-2*{pr})\\,{ys})"
        ys = f"{SRC_SCALE}*floor({ys})"
    crop = f"crop={w * SRC_SCALE}:{s['h'] * SRC_SCALE}:{x * SRC_SCALE}:{ys}"
    vf = crop
    for n0, n1 in s["freezes"]:
        vf += f",split[f0][f1];[f0][f1]freezeframes=first={n0}:last={n1}:replace={n0 - 1}"
    if s["cuts"]:
        # Remove still stretches (frames n0..n1 of the shot) without changing any other frame.
        keep = "*".join(f"not(between(n\\,{n0}\\,{n1}))" for n0, n1 in s["cuts"])
        vf += f",select='{keep}',setpts=N/{FPS}/TB"
    vf += ",scale=1920:1080:flags=lanczos,setsar=1"
    if s.get("hold"):
        vf += f",tpad=stop_mode=clone:stop_duration={s['hold']}"
    if s.get("lead"):
        vf += f",tpad=start_mode=clone:start={round(s['lead'] * FPS)}"
    vf += f",fps={FPS},format=yuv420p"  # master is already BT.709 limited range
    out = os.path.join(OUT, "clips", f"shot-{s['id']}.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{s['a']:.3f}", "-t", f"{s['b'] - s['a']:.3f}", "-i", master,
         "-vf", vf, "-an", *TAGS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", out])
    files[s["id"]] = out
card_clip("closing", EDIT["closing"])

actual = {cid: duration(files[cid]) for cid in ids}
for cid in ids:
    need(abs(actual[cid] - planned[cid]) < 0.1, f"clip {cid} rendered {actual[cid]:.2f}s, planned {planned[cid]:.2f}s")
clips, caps, TOTAL, problems = plan(actual)
errors += problems
stop_if_errors("Clip check")
by_id = {c["id"]: c for c in clips}

# One brief introduction per section, when its first shot begins; not repeated for later shots of the section.
app_end = by_id[ids[-2]]["end"]
labels = []
for step in EDIT["steps"]:
    first = by_id[next(s["id"] for s in SECTIONS if str(s["step"]) == step)]
    show = first["start"] + INTRO["show"]
    labels.append({"step": step, "text": INTRO["text"][step], "png": f"intro-{step}.png", "show": show,
                   "hide": show + INTRO["seconds"]})
    need(labels[-1]["hide"] <= app_end - 0.3, f"step {step} introduction runs past the app footage")
for a, b in zip(labels, labels[1:]):
    need(a["hide"] <= b["show"], f"introductions {a['png']} and {b['png']} overlap")
stop_if_errors("Label check")


# ── 7. SRT and the final pass, to temporary files ─────────────────────────────────────
def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


srt_tmp = os.path.join(OUT, "captions.tmp.srt")
with open(srt_tmp, "w") as f:
    for i, c in enumerate(caps, 1):
        f.write(f"{i}\n{ts(c['show'])} --> {ts(c['hide'])}\n{c['text']}\n\n")

inputs, fc = [], []
for cid in ids:
    inputs += ["-i", files[cid]]
prev, acc = "0:v", actual[ids[0]]
for i in range(1, len(ids)):
    off = acc - XF
    spec = next((s for s in EDIT["shots"] if s["id"] == ids[i]), {})
    # "cut": a one-frame switch at the middle of the usual overlap, so every later time is unchanged.
    kind = "custom:expr=if(gt(P\\,0.5)\\,A\\,B)" if spec.get("transition") == "cut" else "fade"
    fc.append(f"[{prev}][{i}:v]xfade=transition={kind}:duration={XF}:offset={off:.3f}[x{i}]")
    prev, acc = f"x{i}", off + actual[ids[i]]
fc.append(f"[{prev}]format=yuv420p,setsar=1[base0]")  # overlays below are converted with the same matrix
base, n = "base0", len(ids)
overlays = [{"png": l["png"], "show": l["show"], "hide": l["hide"]} for l in labels]
for k, o in enumerate(overlays):
    d = o["hide"] - o["show"]
    inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", os.path.join(CARDS, o["png"])]
    fc.append(f"[{n}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st={max(d - 0.25, 0):.3f}:d=0.25:alpha=1,"
              f"setpts=PTS-STARTPTS+{o['show']:.3f}/TB[o{k}]")
    fc.append(f"[{base}][o{k}]overlay=0:0:format=yuv420:eof_action=pass:enable='between(t,{o['show']:.3f},{o['hide']:.3f})'[b{k}]")
    base, n = f"b{k}", n + 1
alabels = []
for c in caps:
    inputs += ["-i", c["wav"]]
    fc.append(f"[{n}:a]aresample=48000,adelay={int(c['start'] * 1000)}:all=1[a{n}]")
    alabels.append(f"[a{n}]")
    n += 1
fc.append(f"{''.join(alabels)}amix=inputs={len(alabels)}:normalize=0,apad,atrim=0:{TOTAL:.3f},"
          f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]")
tmp = os.path.join(OUT, "final.tmp.mp4")
script = os.path.join(OUT, "filter.txt")
open(script, "w").write(";\n".join(fc))
inputs += ["-i", srt_tmp]
print(f"rendering {TOTAL:.2f}s with {len(overlays)} overlays …")
run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex_script", script,
     "-map", f"[{base}]", "-map", "[aout]", "-map", f"{n}:s",
     "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS),
     "-profile:v", "high", *TAGS, "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
     "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata", "title=LoanDocket explainer",
     "-t", f"{TOTAL:.3f}", "-movflags", "+faststart", tmp])

if args.audio_from:
    def cues_of(srt_text):
        out = []
        for b in srt_text.strip().split("\n\n"):
            lines = b.strip().split("\n")
            a_, b_ = (int(x[:2]) * 3600 + int(x[3:5]) * 60 + int(x[6:8]) + int(x[9:12]) / 1000 for x in lines[1].split(" --> "))
            out.append((a_, b_, " ".join(" ".join(lines[2:]).split())))
        return out
    ref_srt = run(["ffmpeg", "-v", "error", "-i", args.audio_from, "-map", "0:s:0", "-f", "srt", "-"]).stdout
    ref_cues = cues_of(ref_srt)
    all_new = cues_of(open(srt_tmp).read())
    # Cues whose wording the source does not have are new: their audio comes from the voice set and is inserted into
    # the source's silence. The others must be the source's cues, in order.
    ref_texts = {r[2] for r in ref_cues}
    inserted = [n for n in all_new if n[2] not in ref_texts]
    new_cues = [n for n in all_new if n[2] in ref_texts]
    # Each cue is spoken from its caption's show time + 0.15 s, so equal show times mean the kept audio is in sync.
    # Hide times may differ (they follow the cue lengths of the voice that track was first made with).
    # Also allowed: the later cues all move earlier by one amount (the audio is spliced in the silence before the
    # first of them), and the source may have extra cues at the end (dropped; silence fills to the end).
    k = len(new_cues)
    need(len(ref_cues) >= k and all(r[2] == n[2] for r, n in zip(ref_cues, new_cues)),
         "--audio-from: its cue wording differs from this render's")
    j = next((i for i, (r, n) in enumerate(zip(ref_cues, new_cues)) if abs(r[0] - n[0]) >= 0.002), k)
    shift = ref_cues[j][0] - new_cues[j][0] if j < k else 0.0
    need(all(abs(ref_cues[i][0] - new_cues[i][0] - shift) < 0.002 for i in range(j, k)),
         "--audio-from: later cues do not all move by the same amount, so its audio would be out of sync")
    need(shift >= 0, "--audio-from: cues may only move earlier")
    need(not (inserted and shift), "--audio-from: a new cue and a shift of later cues cannot be combined")
    a0 = next(x for x in json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", args.audio_from]).stdout)["streams"]
              if x["codec_type"] == "audio")
    SR = int(a0["sample_rate"])
    P = 1024 / SR  # one AAC packet
    a_start = float(run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time",
                         "-read_intervals", "%+#1", "-of", "csv=p=0", args.audio_from]).stdout.split()[0].strip(","))

    def peak_db(t0, t1):
        err = run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{t0:.3f}", "-t", f"{t1 - t0:.3f}", "-i", args.audio_from,
                   "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"]).stderr
        return float(re.search(r"max_volume: (-?[\d.]+) dB", err).group(1))

    if shift:
        need(abs(shift / P - round(shift / P)) < 0.02 and abs(shift * FPS - round(shift * FPS)) < 0.02,
             f"--audio-from: a shift of {shift:.4f}s is not a whole number of video frames and audio packets (use multiples of 16 frames)")
        shift = round(shift / P) * P
        # Splice point: 0.35 s before the first moved cue would be spoken in the source, on the packet grid.
        c = a_start + math.floor((ref_cues[j][0] + 0.15 - 0.35 - shift - a_start) / P) * P
        peak = peak_db(c - 0.05, c + shift + 0.05)
        need(peak < -50, f"--audio-from: the removed stretch {c:.3f}–{c + shift:.3f}s is not silent (peak {peak} dB)")
        need(j == 0 or c >= ref_cues[j - 1][0], "--audio-from: the splice falls before the previous cue")
    dropped = ref_cues[k:]
    src_end = None
    if not dropped:
        need(abs(duration(args.audio_from) - shift - TOTAL) < 0.05,
             f"--audio-from lasts {duration(args.audio_from):.3f}s ({shift:.3f}s removed), this render {TOTAL:.3f}s")
    else:
        # Its later cues are not part of this render: keep the audio only up to just before the first of them.
        src_end = a_start + math.floor((dropped[0][0] - 0.1 - a_start) / P) * P
        need(ref_cues[k - 1][1] <= src_end and src_end - shift < TOTAL,
             f"--audio-from: no silent point between the last kept cue and {dropped[0][2][:30]!r} inside the video")

    def pcm(args_, sr=SR):
        return array("h", run_bytes(["ffmpeg", "-v", "error", *args_, "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"]))

    def rms(a):
        return math.sqrt(sum(x * x for x in a) / max(len(a), 1))

    inserts = []
    if inserted:
        src_pcm = pcm(["-i", args.audio_from, "-map", "0:a:0"])
        by_text = {c_["text"]: c_ for c_ in caps}
        for ins in inserted:
            cap = by_text[ins[2]]
            # Same gain the source applied to the nearest kept cues on each side (measured against their voice-set audio).
            gains = []
            for nb in [x for x in caps if x["text"] in ref_texts and x["start"] < cap["start"]][-1:] + \
                      [x for x in caps if x["text"] in ref_texts and x["start"] > cap["start"]][:1]:
                w = pcm(["-i", nb["wav"]])
                s0 = round(nb["start"] * SR)
                gains.append(rms(src_pcm[s0:s0 + len(w)]) / rms(w))
            gain = sum(gains) / len(gains)
            cue = pcm(["-i", cap["wav"]])
            m0 = math.floor((cap["start"] - 0.15 - a_start) / P)
            m1 = math.ceil((cap["end"] + 0.15 - a_start) / P)
            t0, t1 = a_start + m0 * P, a_start + m1 * P
            peak = peak_db(t0 - P, t1 + P)
            need(peak < -50, f"--audio-from: {ins[2][:30]!r} would be placed over sound in the source ({t0:.3f}–{t1:.3f}s, peak {peak} dB)")
            off = round((cap["start"] - (t0 + P)) * SR)  # the window's audio starts one packet in (see below)
            n = (m1 - m0) * 1024
            win = array("h", [0]) * n
            for q, x in enumerate(cue):
                if 0 <= off + q < n:
                    win[off + q] = max(-32768, min(32767, round(x * gain)))
            inserts.append({"text": ins[2], "start": cap["start"], "end": cap["end"], "m0": m0, "m1": m1, "gain_db": 20 * math.log10(gain),
                            "pcm": win, "cue": cue, "gain": gain})
    stop_if_errors("Audio source check")
    kept = tmp + ".audio.mp4"
    if shift or dropped or inserts:
        # Work on the source's own AAC frames (ADTS, one frame per packet), so every kept packet is copied as is and
        # timing stays exactly sequential: frames before the splice, the frames after the removed stretch, then
        # repeats of the source's own last silent frame until the video ends.
        src, joined = tmp + ".src.aac", tmp + ".joined.aac"
        run(["ffmpeg", "-y", "-v", "error", "-i", args.audio_from, "-map", "0:a:0", "-c", "copy", "-f", "adts", src])

        def adts_frames(path):
            data, out, pos = open(path, "rb").read(), [], 0
            while pos < len(data):
                n_ = ((data[pos + 3] & 0x03) << 11) | (data[pos + 4] << 3) | (data[pos + 5] >> 5)
                out.append(data[pos:pos + n_])
                pos += n_
            return out
        frames = adts_frames(src)
        idx = lambda t: round((t - a_start) / P)
        keep = list(range(idx(c) if shift else len(frames)))
        if shift:
            keep += list(range(idx(c + shift), len(frames)))
        if dropped:
            keep = [x for x in keep if x < idx(src_end)]
        silent = keep[-1]
        while a_start + len(keep) * P < TOTAL + P:
            keep.append(silent)
        out_frames = [frames[x] for x in keep]
        expect = [x for x in keep]  # source packet each output packet must equal; None for inserted packets
        for ins in inserts:
            # Encode the window with the source's settings. The encoder's first packet is its priming packet, which
            # stands in for output packet m0; the window's first sample is decoded from packet m0 + 1. The window
            # starts and ends in silence, as does the source on both sides.
            wraw, wenc = tmp + ".ins.pcm", tmp + ".ins.aac"
            open(wraw, "wb").write(ins["pcm"].tobytes())
            run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", wraw,
                 "-c:a", "aac", "-b:a", "192k", "-ac", str(a0["channels"]), "-f", "adts", wenc])
            seg = adts_frames(wenc)
            m0, m1 = ins["m0"], ins["m1"]
            need(len(seg) >= m1 - m0, "--audio-from: the inserted cue encoded to fewer packets than its window")
            out_frames[m0:m1] = seg[:m1 - m0]
            expect[m0:m1] = [None] * (m1 - m0)
            for x in (wraw, wenc):
                os.remove(x)
        open(joined, "wb").write(b"".join(out_frames))
        blocks = ref_srt.strip().split("\n\n")[:k]

        def ts(x):
            ms = int(round(x * 1000))
            return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
        entries = []
        for i, b in enumerate(blocks):
            lines = b.strip().split("\n")
            a_, b_ = ref_cues[i][0] - (shift if i >= j else 0), ref_cues[i][1] - (shift if i >= j else 0)
            entries.append((a_, b_, "\n".join(lines[2:])))
        for ins in inserted:
            cap = next(c_ for c_ in caps if c_["text"] == ins[2])
            entries.append((cap["show"], cap["hide"], cap["text"]))
        entries.sort()
        for e0, e1 in zip(entries, entries[1:]):
            need(e0[1] <= e1[0], f"--audio-from: captions overlap at {e1[0]:.3f}s")
        open(srt_tmp, "w").write("".join(f"{i}\n{ts(a_)} --> {ts(b_)}\n{t}\n\n" for i, (a_, b_, t) in enumerate(entries, 1)))
        # Keep the source's first packet time (its encoder priming sits before 0 and is skipped on playback).
        run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-itsoffset", f"{a_start:.6f}", "-i", joined, "-i", srt_tmp, "-i", args.audio_from,
             "-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0", "-map_metadata", "3", "-c:v", "copy", "-c:a", "copy",
             "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-t", f"{TOTAL:.3f}", "-movflags", "+faststart", kept])
        # Every copied packet must be the source's, in order and in time.
        def packets(path):
            out = run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time,data_hash",
                       "-show_data_hash", "sha256", "-of", "csv=p=0", path]).stdout
            return [tuple(x for x in l.split(",") if x) for l in out.splitlines() if l]
        sp, cp = packets(args.audio_from), packets(kept)
        want = [(a_start + n_ * P, sp[x][1] if x is not None else None) for n_, x in enumerate(expect)]
        got = [(float(t), h) for t, h in cp]
        bad = next((n_ for n_, (x, y) in enumerate(zip(want, got)) if abs(x[0] - y[0]) > 1e-4 or (x[1] is not None and x[1] != y[1])), None)
        need(bad is None and len(want) - 2 <= len(got) <= len(want),
             f"--audio-from: audio packet {bad} differs from the source packet it copies")
        if inserts:
            # Decoded: identical to the source outside each inserted window (one packet margin), and inside it the new
            # cue at its planned start (no offset) and level.
            out_pcm = pcm(["-i", kept, "-map", "0:a:0"])
            spans = [(round((a_start + (x["m0"] - 1) * P) * SR), round((a_start + (x["m1"] + 1) * P) * SR)) for x in inserts]
            s_end = min(len(src_pcm), len(out_pcm), round((src_end if dropped else TOTAL) * SR) - 2048)
            lo = 0
            for a_, b_ in spans + [(s_end, s_end)]:
                need(out_pcm[lo:a_] == src_pcm[lo:a_], f"--audio-from: decoded audio {lo / SR:.3f}–{a_ / SR:.3f}s differs from the source")
                lo = b_
            for x in inserts:
                s0 = round(x["start"] * SR)
                best = max(((sum(a_ * b_ for a_, b_ in zip(out_pcm[s0 + o:s0 + o + len(x["cue"]):4], x["cue"][::4])), o)
                            for o in range(-480, 481, 24)))
                need(best[1] == 0, f"--audio-from: inserted {x['text'][:30]!r} decodes {best[1] / SR * 1000:+.1f} ms from its planned start")
                seg_ = out_pcm[s0:s0 + len(x["cue"])]
                lvl = 20 * math.log10(rms(seg_) / rms(x["cue"]))
                need(abs(lvl - x["gain_db"]) < 0.5, f"--audio-from: inserted cue level {lvl:+.2f} dB, planned {x['gain_db']:+.2f} dB")
                print(f"inserted {x['text'][:40]!r}: {x['start']:.3f}–{x['end']:.3f}s, gain {x['gain_db']:+.2f} dB "
                      f"(as the source's neighbouring cues), packets {x['m0']}–{x['m1'] - 1} replaced; decoded level {lvl:+.2f} dB")
        for x in (src, joined):
            os.remove(x)
        stop_if_errors("Audio splice check")
        print(f"audio: {len(got)} packets, {sum(1 for e in expect[:len(got)] if e is not None)} copied unchanged from the source"
              + (f"; {shift:.4f}s of silence removed at {c:.3f}s" if shift else "")
              + (f"; source cut at {src_end:.3f}s, then its silent frame repeated; {len(dropped)} later cue(s) dropped" if dropped else ""))
    else:
        run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-i", args.audio_from, "-map", "0:v:0", "-map", "1:a:0", "-map", "1:s:0",
             "-map_metadata", "1", "-c", "copy", "-movflags", "+faststart", kept])
    os.replace(kept, tmp)
    open(srt_tmp, "w").write(run(["ffmpeg", "-v", "error", "-i", tmp, "-map", "0:s:0", "-f", "srt", "-"]).stdout)
    print(f"audio and caption streams kept from {os.path.relpath(args.audio_from)}")

# ── 8. Post-render checks on the file itself ─────────────────────────────────────────
probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", tmp]).stdout)
streams = {s["codec_type"]: s for s in probe["streams"]}
v, a = streams.get("video", {}), streams.get("audio", {})
dur = float(probe["format"]["duration"])
need(abs(dur - TOTAL) < 0.15, f"file is {dur:.2f}s, planned {TOTAL:.2f}s")
need(EDIT["duration"]["min"] <= dur <= EDIT["duration"]["max"], f"file duration {dur:.2f}s out of range")
need((v.get("codec_name"), v.get("profile"), v.get("width"), v.get("height"), v.get("r_frame_rate"))
     == ("h264", "High", 1920, 1080, f"{FPS}/1"), f"video stream is {v.get('codec_name')} {v.get('profile')} {v.get('width')}x{v.get('height')} @ {v.get('r_frame_rate')}")
need((a.get("codec_name"), a.get("sample_rate")) == ("aac", "48000"), f"audio stream is {a.get('codec_name')} {a.get('sample_rate')}")
need(float(a.get("duration", 0)) >= TOTAL - 0.15, f"audio stream is only {a.get('duration')}s")
subs = [s for s in probe["streams"] if s["codec_type"] == "subtitle"]
need(len(subs) == 1, "expected one embedded caption track")
nframes = int(run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                   "stream=nb_read_packets", "-of", "csv=p=0", tmp]).stdout.strip())
need(abs(nframes - round(TOTAL * FPS)) <= 3, f"{nframes} frames, expected about {round(TOTAL * FPS)}")
black = run(["ffmpeg", "-v", "info", "-i", tmp, "-vf", "blackdetect=d=0.1:pix_th=0.10", "-an", "-f", "null", "-"]).stderr
need("black_start" not in black, "blank (black) frames found: " + "; ".join(re.findall(r"black_start:\S+ black_end:\S+", black)))
vol = run(["ffmpeg", "-v", "info", "-i", tmp, "-vn", "-af", "volumedetect", "-f", "null", "-"]).stderr
mean = float(re.search(r"mean_volume: (-?[\d.]+) dB", vol).group(1))
need(mean > -35, f"audio is nearly silent (mean {mean} dB)")
freeze = run(["ffmpeg", "-v", "info", "-i", tmp, "-vf", "freezedetect=n=0.001:d=4", "-an", "-f", "null", "-"]).stderr
freezes = re.findall(r"freeze_start: ([\d.]+)", freeze)
stop_if_errors("Post-render check")

# ── 9. Publish ─────────────────────────────────────────────────────────────────────────
if args.no_publish:
    print(f"all checks passed; not published (--no-publish): {os.path.relpath(tmp)}, {len(freezes)} still stretches ≥4 s")
    raise SystemExit(0)
final = os.path.join(HERE, "loandocket-explainer.mp4")
os.replace(tmp, final)
os.replace(srt_tmp, os.path.join(HERE, "captions.srt"))
json.dump({"take": args.take, "voice": args.voice, "voiceTool": voice.get("tool"), "voiceName": voice.get("voice"),
           "deal": take["dealCode"], "packageVersion": take["package"]["version"], "packageSha256": take["package"]["sha256"],
           "total": TOTAL, "mp4Sha256": sha256(final),
           "clips": clips, "captions": [{k: v for k, v in c.items() if k != "wav"} for c in caps], "labels": labels},
          open(os.path.join(OUT, "timeline.json"), "w"), indent=1)
for c in clips:
    print(f"  {c['start']:6.2f}–{c['end']:6.2f}  {c['id']}")
for c in caps:
    print(f"  voice {c['start']:6.2f}–{c['end']:6.2f}  {c['id']}")
print(f"still stretches of 4 s or more (expected at holds and pauses): {', '.join(f'{float(x):.1f}s' for x in freezes) or 'none'}")
print(f"published {TOTAL:.2f}s ({nframes} frames, mean {mean} dB) -> {os.path.relpath(final)}")
