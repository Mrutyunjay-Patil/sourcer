# Animated intro

Remotion composition for the first 40 seconds of the demo video (the problem, told through the family provision shop).

Rebuild:

```bash
npx create-video@latest --yes --blank --no-tailwind sourcer-intro
cd sourcer-intro && npm i @remotion/transitions @remotion/google-fonts
cp ../intro/Intro.tsx ../intro/Root.tsx src/
npx remotion render Intro out/intro.mp4 --codec=h264 --crf=19
```

Then concatenate with the walkthrough recorded by `../record.mjs`.
