
import { GoogleGenAI, Type } from "@google/genai";
import { TimelineClip, MediaAsset, StoryboardItem } from "../types";

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

  static async generateStoryboard(timeline: TimelineClip[], assets: MediaAsset[], userPrompt: string): Promise<StoryboardItem[]> {
    const ai = await this.getClient();
    
    const timelineContext = timeline.map((clip, idx) => {
      const asset = assets.find(a => a.id === clip.assetId);
      return `Clip ${idx + 1}: ${asset ? asset.name : 'Unknown Asset'}. ${clip.prompt ? `Custom prompt: ${clip.prompt}` : ''}. Transition: ${clip.transition || 'none'}.`;
    }).join('\n');

    const prompt = `Act as a world-class film director and storyboard artist. 
Analyze the current video timeline and the user's creative vision to generate a cinematic scene-by-scene storyboard/outline.

User Creative Vision: "${userPrompt}"

Current Timeline State:
${timelineContext}

Generate a detailed storyboard with the following schema for each scene:
1. sceneNumber
2. title
3. description
4. shotComposition (e.g., Wide shot, Close-up, Tracking shot)
5. visualCues (cinematography details, lighting, mood)
6. estimatedDuration

Provide a coherent flow that bridges the existing clips into a professional reel.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sceneNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              shotComposition: { type: Type.STRING },
              visualCues: { type: Type.STRING },
              estimatedDuration: { type: Type.STRING },
            },
            required: ["sceneNumber", "title", "description", "shotComposition", "visualCues", "estimatedDuration"]
          }
        }
      }
    });

    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Failed to parse storyboard", e);
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
