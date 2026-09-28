#!/usr/bin/env python3
"""Assemble the LoanDocket explainer from one recorded take and one voice set.

Inputs (all produced by the other scripts in this folder):
  work/<take>/frames, timeline.json, take.json, evidence/   record.mjs (screencast, checks, lender ZIP)
  work/cards/                                                cards.mjs  (opening, closing, overlays)
  work/audio/<voice>/                                        narrate.sh or any tool writing the same manifest
  scripts/edit.json, narration.json, fonts/

Every input and the planned timing are validated first. The video is rendered to
work/render/<take>/final.tmp.mp4, checked again as a file, and only then moved over
loandocket-explainer.mp4 (captions.srt likewise). Nothing is published when a check fails.

Usage (from anywhere):
  python3 artifacts/loandocket-explainer/scripts/render.py [--take NAME] [--voice SET] [--check]
  --check validates and prints the planned timeline without rendering.
  --no-publish renders and validates but leaves final.tmp.mp4 in work/render/<take>/ (for rehearsals).
"""
import argparse
import hashlib
import json
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
APP_H = 920  # app footage height; a caption band fills the rest of the 1080 frame
BAND = "0x14202B"  # app ink colour
PAD = f"pad=1920:1080:0:0:color={BAND}"
# Every stage ends in BT.709 limited range, so screen clips and cards match at each crossfade.
TO709 = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
MASTER_VF = f"fps={FPS},scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p"
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
FONTS = ["public-sans-latin.woff2", "public-sans-latin-ext.woff2", "source-serif-4-latin.woff2", "source-serif-4-latin-ext.woff2"]
CARD_INPUTS = [os.path.join(HERE, "scripts/cards.mjs"), os.path.join(HERE, "scripts/edit.json"),
               os.path.join(HERE, "narration.json")] + [os.path.join(HERE, "fonts", f) for f in FONTS]
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
GAP = 0.25  # minimum silence between narration cues
TAIL = 0.3  # last narration must end this long before the video does

ap = argparse.ArgumentParser()
ap.add_argument("--take", default=EDIT["take"])
ap.add_argument("--voice", default=EDIT["voice"])
ap.add_argument("--check", action="store_true")
ap.add_argument("--no-publish", action="store_true", help="render and validate, but leave the result in work/render/<take>/")
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
    h = round(w * APP_H / 1920)
    need(w > 0 and x >= 0 and y >= 0 and x + w <= CSS_W and y + h <= CSS_H,
         f"shot {s['id']}: crop {x},{y} {w}x{h} falls outside the {CSS_W}x{CSS_H} layout")
    need(s.get("hold", 0) >= 0, f"shot {s['id']}: negative hold")
    need(str(s.get("step")) in EDIT["steps"], f"shot {s['id']}: unknown step {s.get('step')}")
    shots.append({**s, "a": a, "b": b, "h": h, "planned": round((b - a) * FPS) / FPS + s.get("hold", 0)})

# ── 3. Preflight: fonts, cards, narration audio ──────────────────────────────────────
for f in FONTS:
    need(os.path.isfile(os.path.join(HERE, "fonts", f)), f"font fonts/{f} is missing")
manifest = os.path.join(CARDS, "manifest.json")
if need(os.path.isfile(manifest), "work/cards/manifest.json is missing; run cards.mjs"):
    h = hashlib.sha256()
    for f in CARD_INPUTS:
        if need(os.path.isfile(f), f"card input {os.path.relpath(f, HERE)} is missing"):
            h.update(open(f, "rb").read())
    need(json.load(open(manifest)).get("inputs") == h.hexdigest(), "cards are stale (edit.json, narration.json, fonts or cards.mjs changed); run cards.mjs")
for name, spec in (("opening", EDIT["opening"]), ("closing", EDIT["closing"])):
    d = os.path.join(CARDS, name)
    n = len([f for f in os.listdir(d) if f.endswith(".png")]) if os.path.isdir(d) else 0
    need(n == round(spec["duration"] * FPS), f"card {name}: {n} frames, expected {round(spec['duration'] * FPS)}")
need(os.path.isfile(os.path.join(CARDS, "disclosure.png")), "disclosure overlay is missing")
for s in [{"id": "opening", **EDIT["opening"]}] + EDIT["shots"]:
    if s.get("label"):
        need(os.path.isfile(os.path.join(CARDS, f"label-{s['id']}.png")), f"label overlay for {s['id']} is missing")
need(" ".join(EDIT["closing"]["lines"]) == NARR["n12"]["caption"], "closing card lines differ from the closing narration caption")

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
    if c.get("overlay", True):
        need(os.path.isfile(os.path.join(CARDS, f"cap-{c['id']}.png")), f"caption overlay for {c['id']} is missing")
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
        caps.append({"id": c["id"], "shot": c["shot"], "start": start, "end": start + c["len"], "text": c["text"],
                     "overlay": c.get("overlay", True), "wav": c["wav"]})
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


def card_clip(name, spec, banded):
    out = os.path.join(OUT, "clips", f"{name}.mp4")
    vf = f"{TO709}," + (PAD + "," if banded else "") + "setsar=1"
    run(["ffmpeg", "-y", "-v", "error", "-framerate", str(FPS), "-i", os.path.join(CARDS, name, "%04d.png"),
         "-t", f"{spec['duration']}", "-vf", vf, *TAGS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", out])
    files[name] = out


card_clip("opening", EDIT["opening"], banded=True)
for s in shots:
    x, y, w = s["crop"]
    crop = f"crop={w * SRC_SCALE}:{s['h'] * SRC_SCALE}:{x * SRC_SCALE}:{y * SRC_SCALE}"
    vf = f"{crop},scale=1920:{APP_H}:flags=lanczos,{PAD},setsar=1"
    if s.get("hold"):
        vf += f",tpad=stop_mode=clone:stop_duration={s['hold']}"
    vf += f",fps={FPS},format=yuv420p"  # master is already BT.709 limited range
    out = os.path.join(OUT, "clips", f"shot-{s['id']}.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{s['a']:.3f}", "-t", f"{s['b'] - s['a']:.3f}", "-i", master,
         "-vf", vf, "-an", *TAGS, "-c:v", "libx264", "-preset", "fast", "-crf", "12", out])
    files[s["id"]] = out
card_clip("closing", EDIT["closing"], banded=False)

actual = {cid: duration(files[cid]) for cid in ids}
for cid in ids:
    need(abs(actual[cid] - planned[cid]) < 0.1, f"clip {cid} rendered {actual[cid]:.2f}s, planned {planned[cid]:.2f}s")
clips, caps, TOTAL, problems = plan(actual)
errors += problems
stop_if_errors("Clip check")
by_id = {c["id"]: c for c in clips}

# Labels: merge consecutive shots that share one label.
labels = []
for c in clips:
    spec = EDIT["opening"] if c["id"] == "opening" else next((s for s in EDIT["shots"] if s["id"] == c["id"]), {})
    if not spec.get("label"):
        continue
    if labels and labels[-1]["text"] == spec["label"] and abs(labels[-1]["end"] - c["start"] - XF) < 0.05:
        labels[-1]["end"] = c["end"]
    else:
        labels.append({"text": spec["label"], "png": f"label-{c['id']}.png", "start": c["start"], "end": c["end"]})
for l in labels:
    l["show"], l["hide"] = l["start"] + 0.35, l["end"] - 0.25
app_end = by_id[ids[-2]]["end"]


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
    fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
    prev, acc = f"x{i}", off + actual[ids[i]]
fc.append(f"[{prev}]format=yuv420p,setsar=1[base0]")  # overlays below are converted with the same matrix
base, n = "base0", len(ids)
overlays = [{"png": "disclosure.png", "show": 0.3, "hide": app_end - 0.3}]
overlays += [{"png": l["png"], "show": l["show"], "hide": l["hide"]} for l in labels]
# A cue with "overlay": false is spoken and in the SRT, but its words are already on the card.
overlays += [{"png": f"cap-{c['id']}.png", "show": c["show"], "hide": c["hide"]} for c in caps if c["overlay"]]
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
