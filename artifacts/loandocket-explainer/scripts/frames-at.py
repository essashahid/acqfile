"""Print the captured frame on screen at given marker offsets: frames-at.py <takeDir> mark[+sec] ..."""
import json, sys, bisect
take = sys.argv[1]
tl = json.load(open(f"{take}/timeline.json"))
marks = {m["name"]: m["t"] for m in tl["marks"]}
ts = [f["t"] for f in tl["frames"]]
for arg in sys.argv[2:]:
    name, _, off = arg.partition("+")
    t = marks[name] + float(off or 0)
    i = max(0, bisect.bisect_right(ts, t) - 1)
    print(arg, f"{take}/{tl['frames'][i]['file']}")
