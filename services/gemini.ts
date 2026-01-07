
import { GoogleGenAI, Type } from "@google/genai";
import { TimelineClip, MediaAsset, SpeedRampType, ColorGrading, Scene, StoryboardItem, Caption } from "../types";

export class GeminiService {
  private static async getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private static getSpeedRampInstruction(ramp?: SpeedRampType): string {
    switch (ramp) {
      case 'slow-fast': return "Apply a 'slow-to-fast' time remapping. Start the motion slowly and accelerate rapidly towards the end for high impact.";
      case 'fast-slow': return "Apply a 'fast-to-slow' speed ramp. Start with explosive speed and ease into a cinematic slow-motion finish.";
      case 'slow-fast-slow': return "Apply a 'flow' speed ramp. Start slow, peak in speed in the middle, and ease back into slow-motion at the end.";
      case 'fast-slow-fast': return "Apply a 'burst' speed ramp. Start fast, briefly slow down for detail, and finish with a high-speed exit.";
      default: return "";
    }
  }

  static async suggestColorGrading(videoBase64: string, vibe: string): Promise<ColorGrading> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          parts: [
            { inlineData: { data: videoBase64, mimeType: 'image/png' } },
            { text: `Analyze visual vibe: '${vibe}'. Provide Lumetri params: exposure, contrast, saturation, vibrance, tint, highlights, shadows, temperature. Return JSON.` }
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });
    try {
      return JSON.parse(response.text || "{}");
    } catch (e) {
      return { exposure: 0, contrast: 50, saturation: 100, vibrance: 50, tint: 0, highlights: 0, shadows: 0, temperature: 0 };
    }
  }

  static async suggestBRoll(videoBase64: string, mimeType: string): Promise<string[]> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ parts: [{ inlineData: { data: videoBase64, mimeType } }, { text: "Suggest 2 cinematic B-roll prompts to make this viral. Return JSON array of strings." }] }],
      config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
  }

  static async generateViralCaptions(videoBase64: string, mimeType: string): Promise<Caption[]> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ parts: [{ inlineData: { data: videoBase64, mimeType } }, { text: "Generate 3-5 punchy viral captions with startTime and endTime (JSON array)." }] }],
      config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
  }

  static async analyzeScenes(videoBase64: string, mimeType: string): Promise<Scene[]> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ parts: [{ inlineData: { data: videoBase64, mimeType } }, { text: "Identify key scene changes. Return JSON: [{timestamp, description}]" }] }],
      config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
  }

  static async generateStoryboard(tracksContext: string, userPrompt: string): Promise<StoryboardItem[]> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Generate a storyboard for this video project. Vision: "${userPrompt}". Timeline Context: ${tracksContext}. Return JSON array of StoryboardItem objects.`,
      config: { responseMimeType: "application/json" }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
  }

  static async suggestAudioMix(videoContext: string, audioTrackNames: string[]): Promise<{ duckingLevels: Record<string, number> }> {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Suggest volume ducking for: ${audioTrackNames.join(', ')}. Context: ${videoContext}. Return JSON map.`,
      config: { responseMimeType: "application/json" }
    });
    try { return { duckingLevels: JSON.parse(response.text || "{}") }; } catch { return { duckingLevels: {} }; }
  }

  static async generateVideo(prompt: string, aspectRatio: '16:9' | '9:16' = '16:9', referenceImage?: { data: string, mimeType: string }, speedRamp?: SpeedRampType) {
    const ai = await this.getClient();
    const speedInstr = this.getSpeedRampInstruction(speedRamp);
    const payload: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt: `${prompt}. ${speedInstr}`,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio },
    };
    if (referenceImage) payload.image = { imageBytes: referenceImage.data, mimeType: referenceImage.mimeType };
    return await ai.models.generateVideos(payload);
  }

  static async stitchVideos(prompt: string, startImageBase64: string, endImageBase64: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const ai = await this.getClient();
    return await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `${prompt}. Seamlessly bridge frames.`,
      image: { imageBytes: startImageBase64, mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio, lastFrame: { imageBytes: endImageBase64, mimeType: 'image/png' } }
    });
  }

  static async extendVideo(prompt: string, previousVideoUri: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const ai = await this.getClient();
    return await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      video: { uri: previousVideoUri } as any,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
    });
  }

  static async replaceBackground(videoUri: string, color: string) {
    const ai = await this.getClient();
    return await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: `Replace background with solid ${color}.`,
      video: { uri: videoUri } as any,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });
  }

  static async pollOperation(operation: any): Promise<{ blobUrl: string, originalUri: string }> {
    let currentOp = operation;
    while (!currentOp.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const ai = await this.getClient();
      currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
      if (currentOp.error) throw new Error(currentOp.error.message);
    }
    const downloadLink = currentOp.response?.generatedVideos?.[0]?.video?.uri || currentOp.response?.generatedVideos?.[0]?.uri;
    const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), originalUri: downloadLink };
  }

  static async checkApiKey() {
    // @ts-ignore
    return window.aistudio && window.aistudio.hasSelectedApiKey ? await window.aistudio.hasSelectedApiKey() : !!process.env.API_KEY;
  }
  static async openApiKeySelector() {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) await window.aistudio.openSelectKey();
  }
}
