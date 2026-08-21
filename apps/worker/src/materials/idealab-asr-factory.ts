import { createHash } from "node:crypto";

import type { CloudAsrPort } from "@ka/domain";

import type { IdeaLabAsrConfig } from "../config.js";
import {
  IdeaLabAsrTransport,
  type IdeaLabAsrObservation,
} from "./idealab-asr-transport.js";
import {
  NodeMediaProcessRunner,
  type MediaProcessRunner,
} from "./media-process-runner.js";
import { FfmpegWavAudioExtractor } from "./wav-audio-extractor.js";
import { WholeTextCloudAsrAdapter } from "./whole-text-cloud-asr.js";

const PROFILE_DESCRIPTOR =
  "idealab-audio|whisper|wav-pcm-s16le-16000hz-mono|response-json|whole-video|v1";

export const IDEALAB_ASR_PROFILE_VERSION = createHash("sha256")
  .update(PROFILE_DESCRIPTOR)
  .digest("hex");

export function createIdeaLabWholeTextAsr(options: {
  readonly config: IdeaLabAsrConfig;
  readonly runner?: MediaProcessRunner;
  readonly fetchFn?: typeof fetch;
  readonly onObservation?: (event: IdeaLabAsrObservation) => void;
}): CloudAsrPort {
  const extractor = new FfmpegWavAudioExtractor({
    runner: options.runner ?? new NodeMediaProcessRunner(),
    maxWavBytes: options.config.maxWavBytes,
  });
  const transport = new IdeaLabAsrTransport({
    extractor,
    endpoint: options.config.endpoint,
    apiKey: options.config.apiKey,
    maxWavBytes: options.config.maxWavBytes,
    maxResponseBytes: options.config.maxResponseBytes,
    minTimeoutMs: options.config.minTimeoutMs,
    maxTimeoutMs: options.config.maxTimeoutMs,
    timeoutMultiplier: options.config.timeoutMultiplier,
    ...(options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn }),
    ...(options.onObservation === undefined
      ? {}
      : { onObservation: options.onObservation }),
  });
  return new WholeTextCloudAsrAdapter({
    transport,
    providerId: "idealab-audio",
    model: "whisper",
    profileVersion: IDEALAB_ASR_PROFILE_VERSION,
  });
}
