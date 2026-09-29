"""Replace only the narration of a finished explainer MP4 with another voice set. The picture is not re-rendered.

The recorded take is not needed. The picture master's video and caption streams are copied unchanged. The captions
(burned into the picture and embedded as a track) fix where each cue is spoken:
  spoken start  = caption show + 0.15 s   (render.py shows a caption 0.15 s before its narration)
  spoken end   <= caption hide, and 0.25 s before the next cue; the last ends 0.3 s before the video does.

Steps:
  1. Build <set> from <source-set> with one uniform, pitch-preserving atempo factor (48 kHz mono WAV and manifest).
  2. Check every cue against those windows. Nothing is mixed if one does not fit.
  3. Mix the cues at their starts over the full picture duration, loudness-normalize (two passes) to -16 LUFS,
     true peak -1.5 dBTP.
  4. Remux: copy the video and caption streams, encode the narration as AAC 48 kHz mono, write the candidate.
  5. Validate the candidate: format, duration, streams, loudness and true peak, video and caption streams identical
     to --reference, no key-like string or local path in the file. With --publish, the candidate then replaces
     loandocket-explainer.mp4. captions.srt is unchanged, because the caption timing is unchanged.

Usage (from the repository root):
  python3 artifacts/loandocket-explainer/scripts/replace-audio.py \
      --picture artifacts/loandocket-explainer/work/archive/loandocket-explainer-samantha-before-iapetus.mp4 \
      --source-set gemini-3.8-flash-tts-iapetus --set gemini-38-flash-tts-iapetus --tempo 1.16 [--publish]
"""
import argparse, hashlib, json, math, os, re, shutil, subprocess, sys, wave
from array import array

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(HERE, "work/audio")
REVIEW = os.path.join(HERE, "work/voice-review")
FINAL = os.path.join(HERE, "loandocket-explainer.mp4")
ARCHIVE = os.path.join(HERE, "work/archive/loandocket-explainer-samantha-before-iapetus.mp4")
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")  # the same rule render.py applies to voice-set names
RATE, LEAD, GAP, TAIL = 48000, 0.15, 0.25, 0.3
LUFS, TP, LRA = -16.0, -1.5, 11

ap = argparse.ArgumentParser()
ap.add_argument("--picture", required=True, help="finished MP4 whose video and caption streams are kept")
ap.add_argument("--reference", default=ARCHIVE, help="MP4 whose video stream the result must match")
ap.add_argument("--source-set", required=True)
ap.add_argument("--set", required=True, dest="name")
ap.add_argument("--tempo", type=float, required=True, help="one atempo factor for every cue")
ap.add_argument("--out", default=os.path.join(REVIEW, "loandocket-explainer-iapetus-candidate.mp4"))
ap.add_argument("--publish", action="store_true", help="replace loandocket-explainer.mp4 after the checks pass")
args = ap.parse_args()
if not NAME.match(args.name):
    sys.exit(f"voice set name {args.name!r} would be refused by render.py (letters, digits, - and _ only)")


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]).stdout)


def stream_hash(path, spec):
    return run(["ffmpeg", "-v", "error", "-i", path, "-map", spec, "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"]
               ).stdout.strip().split("=", 1)[-1]


def wav_info(path):
    run(["ffmpeg", "-v", "error", "-xerror", "-i", path, "-f", "null", "-"])
    with wave.open(path) as w:
        rate, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        s = array("h", w.readframes(n))
    peak = max(abs(x) for x in s)
    return {"duration": round(n / rate, 3), "sample_rate": rate, "channels": ch,
            "peak_dbfs": round(20 * math.log10(peak / 32768), 2), "clipped": sum(1 for x in s if abs(x) >= 32767)}


problems = []
narr = {c["id"]: c for c in json.load(open(os.path.join(HERE, "narration.json")))}
ids = list(narr)

# ── 1. Uniform tempo set ─────────────────────────────────────────────────────────────
src_dir, dst_dir = os.path.join(AUDIO, args.source_set), os.path.join(AUDIO, args.name)
src = json.load(open(os.path.join(src_dir, "manifest.json")))
os.makedirs(dst_dir, exist_ok=True)
out = {k: src[k] for k in ("tool", "provider", "model", "voice") if k in src}
out.update({"source_set": args.source_set, "atempo": args.tempo,
            "processing": f"ffmpeg atempo={args.tempo} (pitch-preserving), same factor for every cue; 48 kHz mono s16",
            "cues": {}})
for cid in ids:
    e = src["cues"].get(cid)
    if not e or e["text_sha256"] != hashlib.sha256(narr[cid]["text"].encode()).hexdigest():
        sys.exit(f"{cid}: missing from {args.source_set} or generated from different text")
    s_wav, d_wav = os.path.join(src_dir, e["file"]), os.path.join(dst_dir, f"{cid}.wav")
    if hashlib.sha256(open(s_wav, "rb").read()).hexdigest() != e["audio_sha256"]:
        sys.exit(f"{cid}: {e['file']} differs from its manifest hash")
    run(["ffmpeg", "-v", "error", "-y", "-i", s_wav, "-af", f"aformat=sample_fmts=flt,atempo={args.tempo}",
         "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", d_wav])
    info = wav_info(d_wav)
    if info.pop("clipped") or info["sample_rate"] != RATE or info["channels"] != 1 or info["duration"] < 0.3:
        problems.append(f"{cid}: adjusted audio is clipped, empty or not 48 kHz mono")
    out["cues"][cid] = {"file": f"{cid}.wav", "text_sha256": e["text_sha256"], **info,
                        "audio_sha256": hashlib.sha256(open(d_wav, "rb").read()).hexdigest(),
                        "source_file": e["file"], "source_duration": e["duration"], "source_audio_sha256": e["audio_sha256"]}
json.dump(out, open(os.path.join(dst_dir, "manifest.json"), "w"), indent=1)

# ── 2. Fixed windows from the picture's caption track ───────────────────────────────
pic = probe(args.picture)
VID = float(next(s for s in pic["streams"] if s["codec_type"] == "video")["duration"])
srt = run(["ffmpeg", "-v", "error", "-i", args.picture, "-map", "0:s:0", "-f", "srt", "-"]).stdout
sec = lambda t: int(t[:2]) * 3600 + int(t[3:5]) * 60 + int(t[6:8]) + int(t[9:12]) / 1000
caps = []
for block in srt.strip().split("\n\n"):
    lines = block.strip().split("\n")
    a, b = lines[1].split(" --> ")
    caps.append({"show": sec(a), "hide": sec(b), "text": " ".join(lines[2:])})
if [" ".join(c["text"].split()) for c in caps] != [" ".join(narr[i]["caption"].split()) for i in ids]:
    sys.exit("the picture's caption track does not match narration.json captions, in order")
plan = []
for i, (cid, c) in enumerate(zip(ids, caps)):
    start = c["show"] + LEAD
    end = start + out["cues"][cid]["duration"]
    limit = min(c["hide"], caps[i + 1]["show"] + LEAD - GAP) if i + 1 < len(caps) else min(c["hide"], VID - TAIL)
    plan.append({"id": cid, "start": round(start, 3), "end": round(end, 3), "limit": round(limit, 3),
                 "spare": round(limit - end, 3)})
    if end > limit + 1e-6:
        problems.append(f"{cid}: ends {end:.3f}s, limit {limit:.3f}s (over by {end - limit:.3f}s)")
print(f"atempo {args.tempo} · picture {VID:.3f}s")
for p in plan:
    print(f"  {p['id']:>4} {p['start']:7.3f}–{p['end']:7.3f}  limit {p['limit']:7.3f}  spare {p['spare']:+.3f}")
if problems:
    sys.exit("does not fit:\n  " + "\n  ".join(problems))

# ── 3. Mix and loudness-normalize ───────────────────────────────────────────────────
os.makedirs(REVIEW, exist_ok=True)
mix, narration = os.path.join(REVIEW, "mix.wav"), os.path.join(REVIEW, "narration.wav")
inputs, fc = [], []
for k, p in enumerate(plan):
    inputs += ["-i", os.path.join(dst_dir, f"{p['id']}.wav")]
    fc.append(f"[{k}:a]adelay={round(p['start'] * 1000)}:all=1[a{k}]")
fc.append("".join(f"[a{k}]" for k in range(len(plan))) + f"amix=inputs={len(plan)}:normalize=0,apad,atrim=0:{VID:.6f}[m]")
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "[m]",
     "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_f32le", mix])
m = json.loads(re.findall(r"\{[^{}]*\}", run(["ffmpeg", "-hide_banner", "-nostats", "-i", mix, "-af",
    f"loudnorm=I={LUFS}:TP={TP}:LRA={LRA}:print_format=json", "-f", "null", "-"]).stderr)[-1])
run(["ffmpeg", "-v", "error", "-y", "-i", mix, "-af",
     f"loudnorm=I={LUFS}:TP={TP}:LRA={LRA}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
     f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
     f"aresample={RATE}", "-ac", "1", "-c:a", "pcm_s16le", narration])

# ── 4. Remux ────────────────────────────────────────────────────────────────────────
tmp = args.out + ".tmp.mp4"
run(["ffmpeg", "-v", "error", "-y", "-i", args.picture, "-i", narration,
     "-map", "0:v:0", "-map", "1:a:0", "-map", "0:s:0", "-map_metadata", "0",
     "-c:v", "copy", "-c:s", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", str(RATE), "-ac", "1",
     "-movflags", "+faststart", tmp])

# ── 5. Validate ─────────────────────────────────────────────────────────────────────
res = probe(tmp)
by = {}
for s in res["streams"]:
    by.setdefault(s["codec_type"], []).append(s)
v, a, subs = by.get("video", [{}])[0], by.get("audio", [{}])[0], by.get("subtitle", [])
pv = next(s for s in pic["streams"] if s["codec_type"] == "video")
dur = float(res["format"]["duration"])
check = lambda ok, msg: ok or problems.append(msg)
check(abs(dur - float(pic["format"]["duration"])) <= 0.05, f"duration {dur:.3f}s differs from the picture's")
check(75 <= dur <= 90, f"duration {dur:.3f}s is outside 75–90 s")
check((v.get("codec_name"), v.get("profile"), v.get("width"), v.get("height"), v.get("r_frame_rate"), v.get("nb_frames"))
      == ("h264", "High", 1920, 1080, "30/1", pv["nb_frames"]), f"video stream is {v}")
check((a.get("codec_name"), a.get("sample_rate"), a.get("channels")) == ("aac", "48000", 1), "audio is not AAC 48 kHz mono")
check(float(a.get("duration", 0)) >= VID - 0.05, f"audio lasts {a.get('duration')}s of {VID:.3f}s")
check(len(by.get("audio", [])) == 1, "expected exactly one audio stream")
check(len(subs) == 1 and subs[0].get("tags", {}).get("language") == "eng", "expected one English caption track")
video_same = stream_hash(tmp, "0:v:0") == stream_hash(args.reference, "0:v:0")
subs_same = stream_hash(tmp, "0:s:0") == stream_hash(args.picture, "0:s:0")
check(video_same, "video stream differs from the reference")
check(subs_same, "caption track differs from the picture's")
r128 = run(["ffmpeg", "-hide_banner", "-nostats", "-i", tmp, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
summary = r128[r128.rfind("Summary:"):]
lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
tpk = float(re.search(r"True peak:\s+Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
check(abs(lufs - LUFS) <= 1.0, f"integrated loudness {lufs} LUFS")
check(tpk <= TP + 0.5, f"true peak {tpk} dBTP")
blob = open(tmp, "rb").read()
check(not re.search(rb"AIza[0-9A-Za-z_-]{20,}", blob), "a key-like string is in the file")
check(b"/Users/" not in blob and os.path.expanduser("~").encode() not in blob, "a local path is in the file")
report = {"picture": os.path.relpath(args.picture, HERE), "reference": os.path.relpath(args.reference, HERE),
          "voice_set": args.name, "atempo": args.tempo, "duration": dur, "video_stream_identical": video_same,
          "caption_track_identical": subs_same, "integrated_lufs": lufs, "true_peak_dbtp": tpk,
          "loudnorm_input": m, "plan": plan, "problems": problems}
json.dump(report, open(os.path.join(REVIEW, "report.json"), "w"), indent=1)
print(f"candidate {dur:.3f}s · video {v.get('codec_name')} {v.get('width')}x{v.get('height')} {v.get('r_frame_rate')} "
      f"· audio {a.get('codec_name')} {a.get('sample_rate')} Hz {a.get('channels')} ch {float(a.get('duration', 0)):.3f}s "
      f"· captions {len(subs)} ({subs[0].get('tags', {}).get('language') if subs else '-'})")
print(f"loudness {lufs} LUFS · true peak {tpk} dBTP · video stream identical to reference: {video_same} "
      f"· caption track identical: {subs_same}")
if problems:
    sys.exit("candidate failed:\n  " + "\n  ".join(problems))
os.replace(tmp, args.out)
print(f"candidate: {os.path.relpath(args.out, HERE)}")
if args.publish:
    if os.path.abspath(FINAL) == os.path.abspath(args.reference):
        sys.exit("refusing to overwrite the reference")
    shutil.copyfile(args.out, FINAL + ".tmp")
    os.replace(FINAL + ".tmp", FINAL)
    print(f"published: {os.path.relpath(FINAL, HERE)}")
