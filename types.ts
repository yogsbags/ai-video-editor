
export type VideoAsset = {
  id: string;
  url: string; // This is the blob URL for local preview
  originalUri?: string; // This is the remote URI returned by Gemini API, required for extension
  type: 'video';
  name: string;
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  operationId?: string;
  thumbnail?: string;
};

export type ImageAsset = {
  id: string;
  url: string;
  type: 'image';
  name: string;
  base64: string;
};

export type MediaAsset = VideoAsset | ImageAsset;

export type TransitionType = 'none' | 'crossfade' | 'fade-to-black' | 'motion-blur' | 'morph' | 'glitch';

export type Scene = {
  timestamp: string;
  description: string;
};

export type StoryboardItem = {
  sceneNumber: number;
  title: string;
  description: string;
  shotComposition: string;
  visualCues: string;
  estimatedDuration: string;
};

export type BackgroundSettings = {
  isRemoved: boolean;
  color: string; // e.g., 'green', 'blue', 'white', 'black', 'transparent'
};

export type TextOverlay = {
  text: string;
  color: string;
  fontSize: number;
  position: 'top' | 'center' | 'bottom';
};

export type TimelineClip = {
  id: string;
  assetId: string;
  prompt?: string;
  order: number;
  status: 'pending' | 'generating' | 'ready' | 'error';
  extendedFromId?: string;
  transition?: TransitionType;
  scenes?: Scene[];
  background?: BackgroundSettings;
  playbackSpeed?: number;
  textOverlay?: TextOverlay;
};

export interface AppState {
  assets: MediaAsset[];
  timeline: TimelineClip[];
  isGenerating: boolean;
  activeClipId: string | null;
  isAnalyzing: boolean;
  isProcessingBg: boolean;
  isAnalyzingStoryboard: boolean;
  storyboard: StoryboardItem[] | null;
}
