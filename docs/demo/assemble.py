"""Cut the fresh walkthrough to the narration timeline.

Each narration beat (from audio/beats.json) is paired with a recording mark
(take4/marks.json). For every beat the video segment starts at its mark and
must last until the next beat starts. If the recording has more footage than
that window, the tail is trimmed; if it has less, the last frame is held.
Then intro + walkthrough are concatenated and the cleaned narration is muxed.
"""
import json, subprocess, sys, glob, os
sp = sys.argv[1]
INTRO = f"{sp}/sourcer-intro/out/intro.mp4"
WEBM = glob.glob("take4/*.webm")[0]
marks = {m["label"]: m["t"] for m in json.load(open("take4/marks.json"))}
beats = {b["key"]: b["t"] for b in json.load(open(f"{sp}/audio/beats.json"))["beats"]}
beats["rank"] = beats.get("rank") or 144.9
END = json.load(open(f"{sp}/audio/beats.json"))["end"] + 1.5   # hold 1.5s after last word
INTRO_LEN = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",INTRO]).decode().strip())
# Recording lag: marks are taken from script time; the video starts ~2.5s later.
LAG = 2.5
def src(label, offset=0.0): return max(0.0, marks[label] - LAG + offset)

# (narration key, recording mark, offset into that mark)
plan = [
    ("dashboard",  "dashboard", 0.0),
    ("suppliers",  "suppliers page", 0.0),
    ("candidates", "candidates ready", 0.0),
    ("pricewatch", "tracking page", -3.0),
    ("newrequest", "new request", -1.5),
    ("lineitems",  "line items", 0.0),
    ("replyby",    "eggs fixed", 1.0),
    ("draft",      "draft ready", 0.0),
    ("send",       "sent", -1.5),
    ("greenleaf",  "greenleaf replying", -1.2),
    ("landed",     "greenleaf reply landed", 5.8),
    ("nandini",    "nandini replying", -1.2),
    ("rank",       "ranked cards", -1.0),
    ("po",         "purchase order", 0.0),
    ("posend",     "po sent", -3.5),
    ("orders",     "orders", -0.5),
    ("close",      "prices again", -0.5),
    ("thanks",     "end", -0.5),
]
# Walkthrough must start exactly when the intro ends; the first beat is stretched back to there.
timeline = [(k, beats[k]) for k, _, _ in plan] + [("_end", END)]
segs = []
for i, (key, label, off) in enumerate(plan):
    start_t = INTRO_LEN if i == 0 else timeline[i][1]
    end_t = timeline[i + 1][1]
    want = end_t - start_t
    s0 = src(label, off)
    # available footage until the next mark's source start (plus a little slack)
    nxt = plan[i + 1] if i + 1 < len(plan) else None
    s1 = src(nxt[1], nxt[2]) if nxt else s0 + want
    have = max(0.5, s1 - s0)
    segs.append((key, s0, have, want))
    print(f"{key:11s} narration {start_t:6.1f}->{end_t:6.1f} ({want:5.1f}s)  source {s0:6.1f} have {have:5.1f}s  {'TRIM' if have>want else 'HOLD' if have<want else ''}")

os.makedirs("take4/seg", exist_ok=True)
parts = []
for i, (key, s0, have, want) in enumerate(segs):
    out = f"take4/seg/{i:02d}_{key}.mp4"
    take = min(have, want)
    vf = f"fps=30,scale=1600:900,format=yuv420p"
    if want > take:
        vf += f",tpad=stop_mode=clone:stop_duration={want - take:.3f}"
    subprocess.run(["ffmpeg","-y","-v","error","-ss",f"{s0:.3f}","-t",f"{take:.3f}","-i",WEBM,"-vf",vf,"-an",
                    "-c:v","libx264","-preset","fast","-crf","18",out], check=True)
    parts.append(out)
with open("take4/seg/list.txt","w") as f:
    for p in parts: f.write(f"file '{os.path.abspath(p)}'\n")
subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i","take4/seg/list.txt","-c","copy","take4/walkthrough.mp4"], check=True)
# intro + walkthrough, then narration
subprocess.run(["ffmpeg","-y","-v","error","-i",INTRO,"-i","take4/walkthrough.mp4","-filter_complex",
                "[0:v]fps=30,scale=1600:900,format=yuv420p[a];[1:v]fps=30,scale=1600:900,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]",
                "-map","[v]","-c:v","libx264","-preset","medium","-crf","19","-movflags","+faststart","take4/video-silent.mp4"], check=True)
subprocess.run(["ffmpeg","-y","-v","error","-i","take4/video-silent.mp4","-i",f"{sp}/audio/narration-clean.m4a",
                "-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","take4/sourcer-final.mp4"], check=True)
d = subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0","take4/sourcer-final.mp4"]).decode().strip()
print("final duration", d, "intro", INTRO_LEN)
