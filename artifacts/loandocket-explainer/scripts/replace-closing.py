"""Replace only the closing card of a finished explainer MP4 (after edit.json's closing lines changed), without the take.

The closing card (work/cards/closing, from cards.mjs) fills the last edit.closing.duration seconds and fades in over the
last shot. Its lines only start to appear LINE_DELAY seconds into the card (cards.mjs), after the crossfade, so:
  - every frame before the last keyframe at or before that point is copied bit-for-bit (stream copy, closed GOPs);
  - from that keyframe, the remaining crossfade frames are decoded from the picture and the rest are the new card
    frames, encoded with the picture's x264 settings; the two parts are joined without re-encoding the first;
  - the embedded caption track is kept, except cue 12, which gets narration.json's new caption and ends 0.4 s after
    the new narration (the adjusted voice-set cue), or at the end of the video.
Writes a picture MP4 (video + captions, no audio) for replace-audio.py, and checks it:
  frames before the keyframe identical to the picture (decoded frame hashes); the re-encoded frames up to the line
  reveal match the picture (PSNR); logo and disclaimer regions unchanged on the last frame; captions 1–11 unchanged.

Usage (from the repository root), after cards.mjs and narrate-gemini.py:
  python3 artifacts/loandocket-explainer/scripts/replace-closing.py --picture artifacts/loandocket-explainer/loandocket-explainer.mp4 \
      --voice-source gemini-3.8-flash-tts-iapetus --tempo 1.16
"""
import argparse, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVIEW = os.path.join(HERE, "work/voice-review")
CARD = os.path.join(HERE, "work/cards/closing")
EDIT = json.load(open(os.path.join(HERE, "scripts/edit.json")))
NARR = json.load(open(os.path.join(HERE, "narration.json")))
FPS, XF = EDIT["fps"], EDIT["crossfade"]
LINE_DELAY = 0.9  # cards.mjs: .line { animation: rise .8s ease-out .9s both }
LEAD = 0.15  # render.py shows a caption 0.15 s before its narration
TO709 = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"  # render.py
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "5.0", "-pix_fmt", "yuv420p"]

ap = argparse.ArgumentParser()
ap.add_argument("--picture", required=True)
ap.add_argument("--voice-source", required=True, help="unadjusted voice set holding the new last cue")
ap.add_argument("--tempo", type=float, required=True)
ap.add_argument("--out", default=os.path.join(REVIEW, "closing-picture.mp4"))
args = ap.parse_args()
W = os.path.join(REVIEW, "closing-work")
os.makedirs(W, exist_ok=True)
problems = []


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def frames_md5(path, first, last):
    out = run(["ffmpeg", "-v", "error", "-i", path, "-map", "0:v:0", "-vf", f"select=between(n\\,{first}\\,{last})",
               "-fps_mode", "passthrough", "-f", "framemd5", "-"]).stdout
    return [l.rsplit(",", 1)[-1].strip() for l in out.splitlines() if l and not l.startswith("#")]


def psnr(a, b, first, last, crop=""):
    sel = f"select=between(n\\,{first}\\,{last}),setpts=N/{FPS}/TB" + (f",{crop}" if crop else "")
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a, "-i", b, "-filter_complex",
               f"[0:v]{sel}[x];[1:v]{sel}[y];[x][y]psnr", "-f", "null", "-"]).stderr
    m = re.search(r"PSNR .*? min:(\S+)", err)
    return float("inf") if m.group(1) == "inf" else float(m.group(1))


# ── Where the card starts, and the splice keyframe ───────────────────────────────────
v = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                    "stream=nb_frames,r_frame_rate,duration,extradata", "-show_data", "-of", "json", args.picture]).stdout)["streams"][0]
N, VID = int(v["nb_frames"]), float(v["duration"])
if v["r_frame_rate"] != f"{FPS}/1":
    sys.exit(f"picture is {v['r_frame_rate']} fps")
C = N - round(EDIT["closing"]["duration"] * FPS)  # first closing-card frame
P = C + int(-(-XF * FPS // 1))  # first frame after the crossfade (pure card; overlays end before it)
REVEAL = C + round(LINE_DELAY * FPS)  # last frame on which the lines are still invisible
keys = [round(float(t) * FPS) for t, f in (l.split(",") for l in run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags", "-of", "csv=p=0",
     args.picture]).stdout.split()) if "K" in f]
K = max(k for k in keys if k <= REVEAL)
print(f"frames {N} · card from {C} · pure card from {P} · lines appear after {REVEAL} · splice keyframe {K}")
if K > P:
    sys.exit("no keyframe before the lines appear")

# ── Prefix (copied) and tail (decoded crossfade frames + new card frames) ────────────
prefix, tail, video = (os.path.join(W, n) for n in ("prefix.mp4", "tail.mp4", "video.mp4"))
run(["ffmpeg", "-v", "error", "-y", "-i", args.picture, "-map", "0:v:0", "-c", "copy", "-frames:v", str(K), prefix])
first_card = max(P, K) - C
chain = f"[1:v]{TO709},setsar=1[c]"
if K < P:
    chain = (f"[0:v]trim=start_frame={K}:end_frame={P},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[x];{chain};"
             f"[x][c]concat=n=2:v=1:a=0[t]")
else:
    chain += ";[c]null[t]"
run(["ffmpeg", "-v", "error", "-y", "-i", args.picture, "-framerate", str(FPS), "-start_number", str(first_card),
     "-i", os.path.join(CARD, "%04d.png"), "-filter_complex", chain, "-map", "[t]", "-frames:v", str(N - K),
     "-r", str(FPS), *TAGS, *X264, tail])
tv = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=extradata",
                     "-show_data", "-of", "json", tail]).stdout)["streams"][0]
if tv.get("extradata") != v.get("extradata"):
    sys.exit("the re-encoded tail's codec headers differ from the picture's; cannot join without re-encoding")
lst = os.path.join(W, "parts.txt")
open(lst, "w").write(f"file '{prefix}'\nfile '{tail}'\n")
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])

# ── Captions: cue 12 only ──────────────────────────────────────────────────────────
src_set = os.path.join(HERE, "work/audio", args.voice_source)
last = NARR[-1]
entry = json.load(open(os.path.join(src_set, "manifest.json")))["cues"][last["id"]]
adj = os.path.join(W, "last-cue-adjusted.wav")
run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(src_set, entry["file"]), "-af",
     f"aformat=sample_fmts=flt,atempo={args.tempo}", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", adj])
adj_dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", adj]).stdout)
old_srt = run(["ffmpeg", "-v", "error", "-i", args.picture, "-map", "0:s:0", "-f", "srt", "-"]).stdout
blocks = old_srt.strip().split("\n\n")
if len(blocks) != len(NARR):
    sys.exit("caption track does not have one block per cue")
sec = lambda t: int(t[:2]) * 3600 + int(t[3:5]) * 60 + int(t[6:8]) + int(t[9:12]) / 1000
ts = lambda x: f"{int(x // 3600):02}:{int(x // 60 % 60):02}:{int(x % 60):02},{round(x * 1000) % 1000:03}"
show = sec(blocks[-1].split("\n")[1].split(" --> ")[0])
start = show + LEAD
end = start + adj_dur
hide = min(end + 0.4, VID)
blocks[-1] = f"{len(blocks)}\n{ts(show)} --> {ts(hide)}\n{last['caption']}"
srt = os.path.join(W, "captions.srt")
open(srt, "w").write("\n\n".join(blocks) + "\n\n")
print(f"{last['id']}: adjusted {adj_dur:.3f}s · spoken {start:.3f}–{end:.3f} · caption {show:.3f}–{hide:.3f}")
if end > VID - 0.3:
    problems.append(f"{last['id']} ends {end:.3f}s, less than 0.3 s before the video ends")
run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", srt, "-i", args.picture, "-map", "0:v:0", "-map", "1:s:0",
     "-map_metadata", "2", "-c:v", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
     "-movflags", "+faststart", args.out])

# ── Checks ─────────────────────────────────────────────────────────────────────────
out = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", args.out]).stdout)
ov = next(s for s in out["streams"] if s["codec_type"] == "video")
if int(ov["nb_frames"]) != N or abs(float(ov["duration"]) - VID) > 0.02:
    problems.append(f"video has {ov['nb_frames']} frames, {ov['duration']}s")
subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", args.out, "-f", "null", "-"], check=True)
same = frames_md5(args.out, 0, K - 1) == frames_md5(args.picture, 0, K - 1)
if not same:
    problems.append(f"frames 0–{K - 1} differ from the picture")
p_trans = psnr(args.out, args.picture, K, REVEAL)
if p_trans < 45:
    problems.append(f"frames {K}–{REVEAL} (before the lines appear) differ from the picture: min PSNR {p_trans:.1f} dB")
logo = psnr(args.out, args.picture, N - 1, N - 1, "crop=1920:300:0:250")
foot = psnr(args.out, args.picture, N - 1, N - 1, "crop=1920:120:0:960")
lines = psnr(args.out, args.picture, N - 1, N - 1, "crop=1920:180:0:560")
if logo < 45 or foot < 45:
    problems.append(f"logo or disclaimer region changed (PSNR {logo:.1f} / {foot:.1f} dB)")
if lines > 35:
    problems.append(f"the closing lines did not change (PSNR {lines:.1f} dB)")
new_srt = run(["ffmpeg", "-v", "error", "-i", args.out, "-map", "0:s:0", "-f", "srt", "-"]).stdout.strip().split("\n\n")
if new_srt[:-1] != old_srt.strip().split("\n\n")[:-1]:
    problems.append("caption cues 1–11 changed")
if new_srt[-1].split("\n", 2)[2] != last["caption"]:
    problems.append("caption cue 12 is not narration.json's caption")
for n, name in ((K - 1, "before-splice"), (C + 5, "crossfade"), (N - 1, "last")):
    run(["ffmpeg", "-v", "error", "-y", "-i", args.out, "-vf", f"select=eq(n\\,{n})", "-frames:v", "1",
         os.path.join(W, f"frame-{n}-{name}.png")])
json.dump({"frames": N, "card_start": C, "splice_keyframe": K, "copied_frames_identical": same,
           "min_psnr_reencoded_before_reveal": p_trans, "last_frame_psnr": {"logo": logo, "disclaimer": foot, "lines": lines},
           "last_cue": {"id": last["id"], "adjusted": adj_dur, "start": start, "end": end, "caption_hide": hide},
           "problems": problems}, open(os.path.join(W, "report.json"), "w"), indent=1)
print(f"frames 0–{K - 1} identical: {same} · frames {K}–{REVEAL} min PSNR {p_trans:.1f} dB · "
      f"last frame PSNR logo {logo:.1f} / disclaimer {foot:.1f} / lines {lines:.1f} dB")
if problems:
    sys.exit("closing picture failed:\n  " + "\n  ".join(problems))
print(f"picture: {os.path.relpath(args.out, HERE)}")
