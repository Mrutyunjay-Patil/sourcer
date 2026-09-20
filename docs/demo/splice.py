import sys, subprocess, glob
sp = sys.argv[1]
intro = f"{sp}/sourcer-intro/out/intro.mp4"
walk = "take2/walkthrough-cut.mp4"
fc = glob.glob("take3/*.webm")[0]
fc_keeps = [(9.5, 25.0), (37.0, 52.5)]
wA = [(0.0, 6.5)]
wB_cuts = [(43, 46), (68, 72), (84, 88), (96, 98), (116, 118.8), (121, 131)]
wB = []; pos = 8.0
for a, b in wB_cuts:
    if a > pos: wB.append((pos, a))
    pos = b
wB.append((pos, 134.2))
def sel(k): return "+".join(f"between(t,{a},{b})" for a, b in k)
fx = (f"[0:v]scale=1600:900,fps=30,format=yuv420p[i];"
      f"[1:v]select='{sel(wA)}',setpts=N/FRAME_RATE/TB,fps=30,scale=1600:900,format=yuv420p[a];"
      f"[2:v]select='{sel(fc_keeps)}',setpts=N/FRAME_RATE/TB,fps=30,scale=1600:900,format=yuv420p[f];"
      f"[1:v]select='{sel(wB)}',setpts=N/FRAME_RATE/TB,fps=30,scale=1600:900,format=yuv420p[b];"
      f"[i][a][f][b]concat=n=4:v=1:a=0[v]")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", intro, "-i", walk, "-i", fc, "-filter_complex", fx, "-map", "[v]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "take3/sourcer-submission.mp4"], check=True)
print("spliced")
