import { describe, expect, it } from "vitest";

import {
  createMaterialTeardownEvidence,
  parseTranscriptTimeline,
} from "@ka/domain";
import {
  loadTeardownPromptTemplate,
  renderTeardownPrompt,
  TEARDOWN_PROMPT_VERSION,
  TEARDOWN_SOURCE_SHA256,
  TEARDOWN_TEMPLATE_SHA256,
  TeardownPromptError,
} from "../src/materials/teardown-prompt.js";

function evidence(text = "前三秒提出问题，随后说明卖点") {
  return createMaterialTeardownEvidence({
    media: { contentSha256: "a".repeat(64), durationMs: 2_000, width: 1080, height: 1920 },
    transcript: parseTranscriptTimeline({
      durationMs: 2_000,
      source: "platform_caption",
      segments: [{ startMs: 0, endMs: 2_000, text }],
    }),
    shots: [{
      startMs: 0,
      endMs: 2_000,
      frame: { index: 0, status: "ready", artifactRef: "frames/shot-0000.jpg" },
    }],
    visualSummary: {
      hardCutCount: 0,
      visualEventCount: 0,
      averageShotLengthMs: 2_000,
      hookVisualDensity: 0,
    },
    promptVersion: TEARDOWN_PROMPT_VERSION,
    schemaVersion: "1",
  });
}

function wholeVideoEvidence() {
  return createMaterialTeardownEvidence({
    media: { contentSha256: "b".repeat(64), durationMs: 2_000, width: 1080, height: 1920 },
    transcript: parseTranscriptTimeline({
      durationMs: 2_000,
      source: "cloud_asr",
      timingPrecision: "whole_video",
      segments: [{ startMs: 0, endMs: 2_000, text: "完整视频转写文本" }],
    }),
    shots: [{
      startMs: 0,
      endMs: 2_000,
      frame: { index: 0, status: "placeholder", reason: "frame_extract_failed" },
    }],
    visualSummary: {
      hardCutCount: 0,
      visualEventCount: 0,
      averageShotLengthMs: 2_000,
      hookVisualDensity: 0,
    },
    promptVersion: TEARDOWN_PROMPT_VERSION,
    schemaVersion: "1",
  });
}

describe("teardown prompt registry", () => {
  it("loads a versioned copy bound to the owner-maintained source prompt", async () => {
    const template = await loadTeardownPromptTemplate();

    expect(template.version).toBe(TEARDOWN_PROMPT_VERSION);
    expect(template.version).toBe("teardown-v3");
    expect(template.sourceSha256).toBe(TEARDOWN_SOURCE_SHA256);
    expect(template.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(template.templateSha256).toBe(TEARDOWN_TEMPLATE_SHA256);
    expect(template.content).toContain("全片总时长");
    expect(template.content).toContain("不得臆造平台后台指标");
    expect(template.content).toContain("不是把源视频裁成多个 MP4");
    expect(template.content).toContain("semanticSections");
  });

  it("renders an explicit no-timestamp boundary for whole-video transcripts", async () => {
    const rendered = await renderTeardownPrompt({ evidence: wholeVideoEvidence() });

    expect(rendered.prompt).toContain('"timingPrecision":"whole_video"');
    expect(rendered.prompt).toContain("整段转写没有句级时间戳");
    expect(rendered.prompt).toContain("不得声称某句话出现在具体秒点");
    expect(rendered.prompt).toContain("仍要根据完整文稿输出多个 `semanticSections`");
    expect(rendered.prompt).toContain("`segments` 必须是空数组");
  });

  it("renders deterministic evidence without signed URLs or absolute frame paths", async () => {
    const first = await renderTeardownPrompt({ evidence: evidence() });
    const second = await renderTeardownPrompt({ evidence: evidence() });

    expect(second).toEqual(first);
    expect(first.prompt).toContain("transcript-0000");
    expect(first.prompt).toContain("shot-0000");
    expect(first.prompt).toContain("blocked_pending_trusted_multimodal_provider");
    expect(first.prompt).not.toContain("/private/tmp");
    expect(first.prompt).not.toContain("https://");
  });

  it("fails closed on credential-like transcript input and prompt-budget overflow", async () => {
    await expect(renderTeardownPrompt({
      evidence: evidence("访问 https://cdn.example.com/a.mp4?token=secret"),
    })).rejects.toBeInstanceOf(TeardownPromptError);

    await expect(renderTeardownPrompt({
      evidence: evidence(),
      maxPromptChars: 100,
    })).rejects.toMatchObject({ reason: "prompt_too_large" });
  });
});
