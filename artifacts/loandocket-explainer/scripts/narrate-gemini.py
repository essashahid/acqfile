"""Voice set from the Gemini API text-to-speech models: one 48 kHz mono WAV per cue in narration.json.

Writes the same two things narrate.sh does, so render.py and replace-audio.py accept the set:
  work/audio/<set>/<cueId>.wav      48 kHz mono 16-bit, leading and trailing silence trimmed
  work/audio/<set>/manifest.json    {tool, provider, model, voice, cues: {<cueId>: {file, text_sha256, duration, ...}}}

The key comes from GEMINI_API_KEY in the environment, else from .env.local at the repository root.
It is sent only in the x-goog-api-key request header and is never printed or written.
Standard library plus ffmpeg/ffprobe; no other dependency.

Usage (from the repository root):
  python3 artifacts/loandocket-explainer/scripts/narrate-gemini.py --model gemini-3.8-flash-tts --voice Iapetus \
      --set gemini-3.8-flash-tts-iapetus [--only n5,n8] [--note "Use a slightly quicker, still natural pace."]
--only regenerates just those cues and keeps the rest of an existing manifest. --note is added to the direction
for the cues generated in that run and recorded in the manifest.
--split n8 regenerates only that cue, one sentence per request with a short direction (at most two requests per
sentence, no network retries), and joins the sentences with about 0.2 s of silence. Used for n8, which the model
otherwise spoke twice.
"""
import argparse, base64, hashlib, json, math, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave
from array import array

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(HERE))
RATE = 48000

DIRECTION = (
    "Read this as a clear, restrained and professional software explainer. Sound natural, calm and confident. "
    "Use an unhurried but concise pace. Avoid theatrical delivery, sales excitement, news-anchor delivery and "
    "exaggerated emphasis. Keep the same voice, pacing and vocal character across every cue. "
    "Respect sentence-ending pauses."
)
SPLIT_DIRECTION = ("Professional software explainer. Natural, clear and restrained. "
                   "Speak the supplied sentence exactly once. Do not repeat it.")
JOIN_GAP = 0.05  # inserted between sentences; with the 0.1 s kept after one and 0.05 s before the next, about 0.2 s
# Pronunciation guidance, added only to cues whose text matches.
GUIDES = [
    (r"Loan ?Docket", "the product name Loan Docket is two distinct words."),
    (r"\bKiel\b", "Kiel sounds like Keel."),
    (r"McDermott", "McDermott sounds like Mick-DER-mott, stressed on the second syllable."),
    (r"\b2025\b", "2025 is twenty twenty-five."),
    (r"one million", 'Say each amount exactly as written: "one million, fifty thousand dollars" is '
                     '"one million fifty thousand dollars", and "one million" is "one million".'),
]

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--voice", required=True)
ap.add_argument("--set", required=True, dest="name")
ap.add_argument("--only", default="", help="comma-separated cue ids to (re)generate")
ap.add_argument("--note", default="", help="extra direction for the cues generated in this run")
ap.add_argument("--split", default="", help="regenerate this one cue sentence by sentence")
ap.add_argument("--max-attempts", type=int, default=0,
                help="cap on requests per cue, network retries included (default: four takes, with retries)")
args = ap.parse_args()


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    env = os.path.join(ROOT, ".env.local")
    if not key and os.path.isfile(env):
        for line in open(env):
            if line.strip().startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("GEMINI_API_KEY is not set in the environment or .env.local; refusing to run.")
    return key


KEY = api_key()


def fail(msg: str):
    sys.exit(msg.replace(KEY, "[redacted]"))


class Reject(Exception):
    """A generated clip that must not be used (clipped, empty, wrong format)."""


def prompt(text: str, style: str = "") -> str:
    # Director's notes with the transcript last. The model sometimes speaks the notes as well (this model
    # rejects a system instruction); the length checks in the main loop catch that.
    guides = [g for pattern, g in GUIDES if re.search(pattern, text)]
    notes = [f"Style: {style}"] if style else [f"Style: {DIRECTION}" + (f" {args.note}" if args.note else "")]
    notes += [f"Pronunciation: {g}" for g in guides]
    if not style:
        notes.append("Speak only the transcript, exactly as written. Never speak these notes.")
    return ("# AUDIO PROFILE: Voiceover for a short software explainer video\n"
            "### DIRECTOR'S NOTES\n" + "\n".join(notes) + f"\n#### TRANSCRIPT\n{text}")


def synthesize(text: str, style: str = ""):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}:generateContent"
    body = json.dumps({"contents": [{"parts": [{"text": prompt(text, style)}]}], "generationConfig": {
        "responseModalities": ["AUDIO"],
        "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": args.voice}}}}}).encode()
    req = urllib.request.Request(url, data=body, headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    tries = 1 if args.split or args.max_attempts else 4  # --split and --max-attempts count every request
    for attempt in range(tries):
        try:
            data = json.load(urllib.request.urlopen(req, timeout=300))
            break
        except urllib.error.HTTPError as exc:
            msg = exc.read().decode(errors="replace")[:400]
            if exc.code != 429 and exc.code < 500:
                fail(f"HTTP {exc.code}: {msg}")
        except (urllib.error.URLError, TimeoutError) as exc:
            msg = str(exc)
        print(f"  retrying after: {msg[:120]}".replace(KEY, "[redacted]"), file=sys.stderr)
        time.sleep(10 * (attempt + 1))
    else:
        fail(f"no response after {tries} attempt(s)")
    for cand in data.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), inline.get("mimeType", ""), data.get("usageMetadata", {})
    fail(f"no audio returned (finishReason {[c.get('finishReason') for c in data.get('candidates') or []]})")


def to_wav48(raw: bytes, mime: str, out: str):
    """Save the response as a WAV (it may already be one), then convert to 48 kHz mono and trim the silence."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        src = tmp.name
    if raw[:4] == b"RIFF":  # audio/wav: a complete WAV file
        open(src, "wb").write(raw)
    else:  # audio/L16;rate=...: raw 16-bit mono PCM
        m = re.search(r"rate=(\d+)", mime)
        with wave.open(src, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(m.group(1)) if m else 24000); w.writeframes(raw)
    with wave.open(src) as w:  # full-scale samples in the model's own output are real clipping
        pcm = array("h", w.readframes(w.getnframes())) if w.getsampwidth() == 2 else array("h")
    clipped = sum(1 for s in pcm if s >= 32767 or s <= -32767)
    if clipped:
        raise Reject(f"{out}: the model's audio has {clipped} clipped samples")
    # Resample in float with 1 dB of headroom so resampling overshoot cannot clip; the mix is loudness-normalized later.
    trim = "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af",
                    f"aformat=sample_fmts=flt,{trim},areverse,{trim.replace('0.05', '0.1')},areverse,"
                    f"aresample={RATE},volume=-1dB", "-ac", "1", "-c:a", "pcm_s16le", out], check=True)
    os.remove(src)


def check(path: str) -> dict:
    """Decode the file and fail on anything but a non-empty, unclipped 48 kHz mono WAV."""
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", path],
                                      capture_output=True, text=True, check=True).stdout)["streams"][0]
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", path, "-f", "null", "-"], check=True)
    with wave.open(path) as w:
        rate, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        samples = array("h", w.readframes(n))
    if (int(probe["sample_rate"]), probe["channels"], rate, ch) != (RATE, 1, RATE, 1):
        raise Reject(f"{path}: not 48 kHz mono")
    if n < RATE * 0.3:
        raise Reject(f"{path}: empty or shorter than 0.3 s")
    peak = max(abs(s) for s in samples)
    clipped = sum(1 for s in samples if s >= 32767 or s <= -32767)
    if clipped:
        raise Reject(f"{path}: {clipped} clipped samples")
    return {"duration": round(n / rate, 3), "sample_rate": rate, "channels": ch,
            "peak_dbfs": round(20 * math.log10(peak / 32768), 2)}


def split_cue(cue: dict, wav: str) -> dict:
    """Generate each sentence separately, reject repeats, spoken notes, omissions and bad audio, then join them."""
    sentences = re.split(r"(?<=[.!?])\s+", cue["text"])
    if len(sentences) < 2 or " ".join(sentences) != cue["text"]:
        fail(f"{cue['id']}: cannot split into sentences that rejoin to the exact text")
    parts = []
    for i, text in enumerate(sentences, 1):
        pwav = wav[:-4] + f".part{i}.wav"
        words = len(text.split())
        lo, hi = words * 60 / 220, words * 60 / 110 + 0.6  # outside this: omitted words, or a repeat / spoken notes
        for attempt in (1, 2):
            raw, mime, usage = synthesize(text, SPLIT_DIRECTION)
            try:
                to_wav48(raw, mime, pwav)
                info = check(pwav)
                if not lo <= info["duration"] <= hi:
                    raise Reject(f"{info['duration']:.2f}s is outside {lo:.1f}–{hi:.1f}s for {words} words")
                break
            except Reject as exc:
                print(f"{cue['id']} sentence {i} attempt {attempt} rejected: {exc}", file=sys.stderr)
        else:
            fail(f"{cue['id']}: sentence {i} failed twice; stopping without further requests")
        print(f"{cue['id']} sentence {i}: {info['duration']:.2f}s (attempt {attempt})  {text}")
        parts.append({"file": os.path.basename(pwav), "text": text, "attempts": attempt, **info,
                      "response_mime": mime, "usage": usage})
    inputs, chain = [], []
    for i, p in enumerate(parts):
        inputs += ["-i", os.path.join(os.path.dirname(wav), p["file"])]
        chain.append(f"[{i}:a]")
        if i + 1 < len(parts):
            chain.append(f"[g{i}]")
    gaps = [f"anullsrc=r={RATE}:cl=mono,atrim=0:{JOIN_GAP}[g{i}]" for i in range(len(parts) - 1)]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
                    ";".join(gaps + [f"{''.join(chain)}concat=n={len(chain)}:v=0:a=1"]),
                    "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", wav], check=True)
    info = check(wav)
    return {**info, "response_mime": parts[0]["response_mime"], "direction": SPLIT_DIRECTION,
            "note": f"generated one sentence at a time and joined with about 0.2 s of silence", "parts": parts,
            "usage": {"promptTokenCount": sum(p["usage"].get("promptTokenCount", 0) for p in parts),
                      "candidatesTokenCount": sum(p["usage"].get("candidatesTokenCount", 0) for p in parts)}}


cues = json.load(open(os.path.join(HERE, "narration.json")))
only = {args.split} if args.split else {c for c in args.only.split(",") if c}
if only - {c["id"] for c in cues}:
    sys.exit(f"unknown cue ids: {sorted(only - {c['id'] for c in cues})}")
out = os.path.join(HERE, "work/audio", args.name)
os.makedirs(out, exist_ok=True)
mpath = os.path.join(out, "manifest.json")
manifest = json.load(open(mpath)) if only and os.path.isfile(mpath) else {"cues": {}}
for cid in only:  # a cue being regenerated is not valid until it succeeds
    manifest["cues"].pop(cid, None)
if manifest.get("model", args.model) != args.model or manifest.get("voice", args.voice) != args.voice:
    sys.exit("the existing manifest is for a different model or voice; use another --set")
manifest.update({"tool": "Gemini API text-to-speech (narrate-gemini.py)", "provider": "Gemini API",
                 "model": args.model, "voice": args.voice, "direction": DIRECTION})
for cue in cues:
    if only and cue["id"] not in only:
        continue
    wav = os.path.join(out, f"{cue['id']}.wav")
    if cue["id"] == args.split:
        entry = split_cue(cue, wav)
    else:
        # Slower than about 90 words a minute means the model also spoke the notes: try again, up to four times.
        limit = len(cue["text"].split()) * 60 / 90 + 1.0
        attempts = args.max_attempts or 4
        for attempt in range(1, attempts + 1):
            raw, mime, usage = synthesize(cue["text"])
            try:
                to_wav48(raw, mime, wav)
                info = check(wav)
            except Reject as exc:
                fail(str(exc))
            if info["duration"] <= limit:
                break
            print(f"{cue['id']:>4} {info['duration']:5.2f}s is longer than {limit:.1f}s (attempt {attempt})", file=sys.stderr)
        else:
            fail(f"{cue['id']}: audio is too long for its text {attempts} times; the model is speaking the direction")
        entry = {**info, "response_mime": mime, "note": args.note or None, "usage": usage}
    info = entry
    manifest["cues"][cue["id"]] = {
        "file": f"{cue['id']}.wav", "text_sha256": hashlib.sha256(cue["text"].encode()).hexdigest(), **entry,
        "audio_sha256": hashlib.sha256(open(wav, "rb").read()).hexdigest()}
    json.dump(manifest, open(mpath, "w"), indent=1)  # after every cue, so a later failure keeps finished cues
    print(f"{cue['id']:>4} {info['duration']:5.2f}s  peak {info['peak_dbfs']:6.2f} dBFS  {cue['text']}")
missing = [c["id"] for c in cues if c["id"] not in manifest["cues"] or not os.path.isfile(os.path.join(out, f"{c['id']}.wav"))]
if missing:
    fail(f"cues missing from the set: {missing}")
json.dump(manifest, open(mpath, "w"), indent=1)
print(f"voice set: {os.path.relpath(out, ROOT)}")
