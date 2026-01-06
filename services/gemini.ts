
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private static async getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  static async generateVideo(prompt: string, aspectRatio: '16:9' | '9:16' = '16:9', referenceImage?: { data: string, mimeType: string }) {
    const ai = await this.getClient();
    const config: any = {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio,
    };

    const payload: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      config,
    };

    if (referenceImage) {
      payload.image = {
        imageBytes: referenceImage.data,
        mimeType: referenceImage.mimeType,
      };
    }

    return await ai.models.generateVideos(payload);
  }

  /**
   * Stitches two segments using a starting frame from clip A and an ending frame from clip B.
   */
  static async stitchVideos(prompt: string, startImageBase64: string, endImageBase64: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const ai = await this.getClient();
    const payload: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      image: {
        imageBytes: startImageBase64,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio,
        lastFrame: {
          imageBytes: endImageBase64,
          mimeType: 'image/png',
        }
      }
    };

    return await ai.models.generateVideos(payload);
  }

  static async extendVideo(prompt: string, previousVideoUri: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const ai = await this.getClient();
    return await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: `${prompt}. Seamlessly continue the motion and story from the end of the previous clip.`,
      video: { uri: previousVideoUri } as any,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio,
      }
    });
  }

  /**
   * AI-powered Background Removal/Replacement for video.
   * Uses video-to-video generation to mask the subject and replace the background.
   */
  static async replaceBackground(videoUri: string, color: string, aspectRatio: '16:9' | '9:16' = '16:9') {
    const ai = await this.getClient();
    const colorPrompt = color === 'transparent' 
      ? "Replace the background with a pure, solid green chroma key background to allow for transparency."
      : `Replace the entire background with a solid, flat ${color} color.`;

    return await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: `Segment the main subject in this video and ${colorPrompt} Keep the subject's appearance, motion, and lighting exactly the same.`,
      video: { uri: videoUri } as any,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio,
      }
    });
  }

  /**
   * Uses Gemini Pro Vision to analyze a video and identify scene breaks/cuts.
   */
  static async analyzeScenes(videoBase64: string, mimeType: string) {
    const ai = await this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          parts: [
            { inlineData: { data: videoBase64, mimeType } },
            { text: "Analyze this video and identify key scene changes or optimal cut points. Return a list of timestamps and a brief description of each scene in JSON format: [{timestamp: '00:01', description: '...'}]" }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });
    
    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Failed to parse scene analysis", e);
      return [];
    }
  }

  static async pollOperation(operation: any): Promise<{ blobUrl: string, originalUri: string }> {
    const ai = await this.getClient();
    let currentOp = operation;
    
    while (!currentOp.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
    }
    
    const downloadLink = currentOp.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed - no URI");
    
    const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await res.blob();
    return {
      blobUrl: URL.createObjectURL(blob),
      originalUri: downloadLink
    };
  }

  static async checkApiKey() {
    // @ts-ignore
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      // @ts-ignore
      return await window.aistudio.hasSelectedApiKey();
    }
    return !!process.env.API_KEY;
  }

  static async openApiKeySelector() {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  }
}
