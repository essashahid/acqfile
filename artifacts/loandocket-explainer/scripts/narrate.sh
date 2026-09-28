#!/bin/sh
# TEMPORARY voice track: synthesizes each narration cue with the built-in macOS `say` voice
# (on-device; no network, account or API key). A later pass replaces this voice.
#
# Output is one "voice set" folder, independent of the recorded footage:
#   work/audio/<set>/<cueId>.wav      48 kHz mono, one file per cue in narration.json
#   work/audio/<set>/manifest.json    {tool, voice, cues: {<cueId>: {file, text_sha256, duration}}}
# render.py --voice <set> uses it and refuses a set whose text_sha256 no longer matches the
# cue's "text" in narration.json. Any other voice tool only has to write the same two things.
#
# Usage: sh artifacts/loandocket-explainer/scripts/narrate.sh   (VOICE=Samantha RATE=168 by default)
set -e
cd "$(dirname "$0")/.."
VOICE="${VOICE:-Samantha}"
RATE="${RATE:-168}"
SET="${SET:-say-$(echo "$VOICE" | tr 'A-Z' 'a-z')-$RATE}"
python3 - "$VOICE" "$RATE" "$SET" <<'PY'
import hashlib, json, os, subprocess, sys
voice, rate, name = sys.argv[1:4]
out = os.path.join("work/audio", name)
os.makedirs(out, exist_ok=True)
cues = {}
for line in json.load(open("narration.json")):
    aiff, wav = os.path.join(out, f"{line['id']}.aiff"), os.path.join(out, f"{line['id']}.wav")
    subprocess.run(["say", "-v", voice, "-r", rate, "-o", aiff, line["text"]], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", aiff, "-ar", "48000", "-ac", "1", wav], check=True)
    os.remove(aiff)
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]))
    cues[line["id"]] = {"file": f"{line['id']}.wav", "text_sha256": hashlib.sha256(line["text"].encode()).hexdigest(), "duration": round(d, 3)}
    print(f"{line['id']:>4} {d:5.2f}s  {line['text']}")
json.dump({"tool": "macOS say (temporary voice)", "voice": voice, "rate_wpm": int(rate), "cues": cues},
          open(os.path.join(out, "manifest.json"), "w"), indent=1)
print(f"voice set: {out}")
PY
