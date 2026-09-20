"""Cut the fresh walkthrough (take4) to the second narration, sentence by sentence.

For each sentence: the screen it belongs to starts exactly when the sentence
starts and runs until the next sentence starts. Footage comes from take4 at a
chosen source point; extra footage is trimmed, missing footage holds the frame.
Intro (Remotion) covers sentences 1-5, the outro title card covers the last.
"""
import json, subprocess, sys, glob, os
sp = sys.argv[1]
INTRO = f"{sp}/sourcer-intro/out/intro.mp4"
OUTRO = f"{sp}/sourcer-intro/out/outro.mp4"
WEBM = glob.glob("take4/*.webm")[0]
marks = {m["label"]: m["t"] for m in json.load(open("take4/marks.json"))}
B = json.load(open(f"{sp}/audio/beats2.json"))
beats = {b["key"]: b["t"] for b in B["beats"]}
END = B["end"] + 1.5
LAG = 0.0
def src(label, off=0.0): return max(0.0, marks[label] - LAG + off)
dur = lambda f: float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).decode().strip())
INTRO_LEN = dur(INTRO)

# sentence key -> (recording mark, offset seconds)
plan = [
    ("dashboard",  "dashboard", 0.0),
    ("suppliers",  "firecrawl searching", -3.7),
    ("candidates", "candidates ready", 0.0),
    ("track",      "tracking page", -5.5),
    ("pricewatch", "page priced", 0.0),
    ("newrequest", "new request", 0.0),
    ("lineitems",  "line items", 0.0),
    ("replyby",    "request created", -7.1),
    ("draft",      "draft ready", 3.5),
    ("send",       "sent", -2.0),
    ("greenleaf",  "greenleaf replying", -1.2),
    ("landed",     "greenleaf reply landed", 0.0),
    ("nandini",    "nandini replying", -1.5),
    ("rank",       "nandini reply landed", 9.8),
    ("po",         "purchase order", 0.0),
    ("posend",     "po sent", -3.5),
    ("orders",     "orders", 0.0),
    ("outro",      "prices again", -0.5),
]
keys = [k for k, _, _ in plan]
starts = [INTRO_LEN] + [beats[k] for k in keys[1:]] + [beats["close"]]
os.makedirs("take4/seg2", exist_ok=True)
parts = []
for i, (key, label, off) in enumerate(plan):
    want = starts[i + 1] - starts[i]
    s0 = src(label, off)
    s1 = src(*plan[i + 1][1:]) if i + 1 < len(plan) else s0 + want
    have = max(0.4, s1 - s0)
    take = min(have, want)
    hold = max(0.0, want - take)
    print(f"{key:11s} {starts[i]:6.1f}->{starts[i+1]:6.1f} want {want:5.1f} src {s0:6.1f} have {have:5.1f} {'hold %.1f' % hold if hold else 'trim'}")
    out = f"take4/seg2/{i:02d}_{key}.mp4"
    vf = "fps=30,scale=1600:900,format=yuv420p" + (f",tpad=stop_mode=clone:stop_duration={hold:.3f}" if hold > 0.01 else "")
    subprocess.run(["ffmpeg","-y","-v","error","-ss",f"{s0:.3f}","-t",f"{take:.3f}","-i",WEBM,"-vf",vf,"-an","-c:v","libx264","-preset","fast","-crf","18",out], check=True)
    parts.append(out)
with open("take4/seg2/list.txt","w") as f:
    for p in parts: f.write(f"file '{os.path.abspath(p)}'\n")
subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i","take4/seg2/list.txt","-c","copy","take4/walk2.mp4"], check=True)
outro_want = END - beats["close"]
subprocess.run(["ffmpeg","-y","-v","error","-i",INTRO,"-i","take4/walk2.mp4","-i",OUTRO,"-filter_complex",
    f"[0:v]fps=30,scale=1600:900,format=yuv420p[a];[1:v]fps=30,scale=1600:900,format=yuv420p[b];[2:v]trim=duration={outro_want:.3f},fps=30,scale=1600:900,format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0[v]",
    "-map","[v]","-c:v","libx264","-preset","medium","-crf","19","-movflags","+faststart","take4/video2-silent.mp4"], check=True)
subprocess.run(["ffmpeg","-y","-v","error","-i","take4/video2-silent.mp4","-i",f"{sp}/audio/narration2.m4a","-map","0:v","-map","1:a","-c:v","copy","-c:a","copy","-shortest","take4/sourcer-final2.mp4"], check=True)
print("intro", INTRO_LEN, "close at", beats["close"], "final", dur("take4/sourcer-final2.mp4"))
