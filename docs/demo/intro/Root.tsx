import React from "react";
import { Composition } from "remotion";
import { Intro, INTRO_FRAMES, Outro, OUTRO_FRAMES } from "./Intro";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={30} width={1600} height={900} />
    <Composition id="Outro" component={Outro} durationInFrames={OUTRO_FRAMES} fps={30} width={1600} height={900} />
  </>
);
