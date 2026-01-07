
export type VideoAsset = {
  id: string;
  url: string;
  originalUri?: string;
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

export type AudioAsset = {
  id: string;
  url: string;
  type: 'audio';
  name: string;
  duration?: number;
};

export type MediaAsset = VideoAsset | ImageAsset | AudioAsset;

export type TransitionType = 'none' | 'crossfade' | 'fade-to-black' | 'motion-blur' | 'morph' | 'glitch' | 'speed-ramp';
export type SpeedRampType = 'none' | 'slow-fast' | 'fast-slow' | 'slow-fast-slow' | 'fast-slow-fast';

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

export type ColorGrading = {
  exposure: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  tint: number;
  highlights: number;
  shadows: number;
  temperature: number;
};

export type AudioSettings = {
  volume: number;
  isMuted: boolean;
  fadeDuration: number;
  autoDucked: boolean;
};

export type GraphicTemplate = 'none' | 'minimal-modern' | 'bold-action' | 'cinematic-serif' | 'glitch-digital' | 'lower-third-glass';

export type Caption = {
  text: string;
  startTime: number;
  endTime: number;
};

export type TimelineClip = {
  id: string;
  assetId: string;
  prompt?: string;
  order: number;
  startTime: number;
  duration: number;
  status: 'pending' | 'generating' | 'ready' | 'error';
  extendedFromId?: string;
  transition?: TransitionType;
  speedRamp?: SpeedRampType;
  colorGrading?: ColorGrading;
  audioSettings?: AudioSettings;
  graphicTemplate?: GraphicTemplate;
  playbackSpeed?: number;
  scenes?: Scene[];
  autoCaptions?: Caption[];
  textOverlay?: {
    text: string;
    color: string;
    fontSize: number;
    position: 'top' | 'center' | 'bottom';
  };
};

export type TrackType = 'video' | 'audio';

export type Track = {
  id: string;
  type: TrackType;
  name: string;
  clips: TimelineClip[];
  isLocked: boolean;
  isVisible: boolean;
};

export interface AppState {
  assets: MediaAsset[];
  tracks: Track[];
  isGenerating: boolean;
  activeClipId: string | null;
  activeTrackId: string | null;
  isAnalyzing: boolean;
  isProcessingBg: boolean;
  isAnalyzingStoryboard: boolean;
  storyboard: StoryboardItem[] | null;
  isBoosting: boolean;
}
