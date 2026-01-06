
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MediaAsset, TimelineClip, AppState, TransitionType, BackgroundSettings, VideoAsset, StoryboardItem, TextOverlay } from './types';
import AssetPanel from './components/AssetPanel';
import Timeline from './components/Timeline';
import { GeminiService } from './services/gemini';

// Subset of state to track for history
type HistoryItem = {
  assets: MediaAsset[];
  timeline: TimelineClip[];
  activeClipId: string | null;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    assets: [],
    timeline: [],
    isGenerating: false,
    activeClipId: null,
    isAnalyzing: false,
    isProcessingBg: false,
    isAnalyzingStoryboard: false,
    storyboard: null,
  });

  const [past, setPast] = useState<HistoryItem[]>([]);
  const [future, setFuture] = useState<HistoryItem[]>([]);
  
  const [prompt, setPrompt] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [bgPreviewColor, setBgPreviewColor] = useState('transparent');
  const [isPromptHovered, setIsPromptHovered] = useState(false);
  const [extensionDuration, setExtensionDuration] = useState(5);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Helper to save current state to history before a change
  const saveHistory = useCallback(() => {
    const current: HistoryItem = {
      assets: state.assets,
      timeline: state.timeline,
      activeClipId: state.activeClipId,
    };
    setPast((prev) => [...prev, current]);
    setFuture([]); // Clear redo stack on new action
  }, [state.assets, state.timeline, state.activeClipId]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    const current: HistoryItem = {
      assets: state.assets,
      timeline: state.timeline,
      activeClipId: state.activeClipId,
    };

    setFuture((prev) => [current, ...prev]);
    setPast(newPast);
    setState((prev) => ({
      ...prev,
      assets: previous.assets,
      timeline: previous.timeline,
      activeClipId: previous.activeClipId,
    }));
  }, [past, state]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    const current: HistoryItem = {
      assets: state.assets,
      timeline: state.timeline,
      activeClipId: state.activeClipId,
    };

    setPast((prev) => [...prev, current]);
    setFuture(newFuture);
    setState((prev) => ({
      ...prev,
      assets: next.assets,
      timeline: next.timeline,
      activeClipId: next.activeClipId,
    }));
  }, [future, state]);

  // Synchronize video playback speed
  useEffect(() => {
    if (videoPreviewRef.current) {
      const activeClip = state.timeline.find(c => c.id === state.activeClipId);
      videoPreviewRef.current.playbackRate = activeClip?.playbackSpeed || 1.0;
    }
  }, [state.activeClipId, state.timeline]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const checkKey = async () => {
      const result = await GeminiService.checkApiKey();
      setHasApiKey(result);
    };
    checkKey();
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const getVideoMetadata = (url: string): Promise<{ duration: number, width: number, height: number, codec: string }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          codec: 'H.264 / AAC' // Standard assumption for browser-compatible MP4s
        });
      };
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    saveHistory();

    const newAssets: MediaAsset[] = [];
    for (const file of Array.from(files) as File[]) {
      const url = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image/');
      
      let asset: MediaAsset;
      if (isImage) {
        asset = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: url,
          type: 'image',
          base64: await fileToBase64(file)
        };
      } else {
        const meta = await getVideoMetadata(url);
        asset = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: url,
          type: 'video',
          ...meta
        };
      }
      newAssets.push(asset);
    }

    setState(prev => ({ ...prev, assets: [...prev.assets, ...newAssets] }));
  };

  const getVideoFrame = (videoUrl: string, time: number = 0): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      video.currentTime = time;
      video.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
    });
  };

  const handleStitch = async () => {
    if (state.timeline.length < 2) {
      alert("Add at least 2 clips to the timeline to perform AI Stitching.");
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true }));

    try {
      const currentIndex = state.timeline.findIndex(c => c.id === state.activeClipId);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      const targetIndex = currentIndex !== -1 ? currentIndex : 1;
      
      const clipA = state.timeline[prevIndex];
      const clipB = state.timeline[targetIndex];
      
      const assetA = state.assets.find(a => a.id === clipA.assetId);
      const assetB = state.assets.find(a => a.id === clipB.assetId);

      if (!assetA || !assetB) throw new Error("Missing assets for stitching");

      const startFrame = assetA.type === 'video' ? await getVideoFrame(assetA.url, 5) : assetA.base64;
      const endFrame = assetB.type === 'video' ? await getVideoFrame(assetB.url, 0) : assetB.base64;

      const transitionPrompt = prompt || `Seamlessly transition between ${assetA.name} and ${assetB.name} using a ${clipA.transition || 'morph'} effect.`;
      
      const operation = await GeminiService.stitchVideos(transitionPrompt, startFrame, endFrame);
      
      const newClipId = Math.random().toString(36).substr(2, 9);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: [...prev.timeline, { id: newClipId, assetId: '', order: prev.timeline.length, status: 'generating', playbackSpeed: 1.0 }],
        activeClipId: newClipId
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const meta = await getVideoMetadata(blobUrl);
      const newVideoAsset: VideoAsset = { 
        id: Math.random().toString(36).substr(2, 9), 
        name: 'AI Seamless Stitch', 
        url: blobUrl, 
        originalUri,
        type: 'video',
        ...meta
      };

      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newVideoAsset],
        timeline: prev.timeline.map(c => c.id === newClipId ? { ...c, assetId: newVideoAsset.id, status: 'ready' } : c),
        isGenerating: false
      }));

    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleRemoveBackground = async () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return;
    const asset = state.assets.find(a => a.id === activeClip.assetId) as VideoAsset;
    if (!asset || asset.type !== 'video' || !asset.originalUri) {
      alert("Please select an AI-generated video clip to remove background.");
      return;
    }

    setState(prev => ({ ...prev, isProcessingBg: true }));
    try {
      const operation = await GeminiService.replaceBackground(asset.originalUri, bgPreviewColor);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: prev.timeline.map(c => c.id === activeClip.id ? { ...c, status: 'generating' } : c)
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const meta = await getVideoMetadata(blobUrl);
      
      const newVideoAsset: VideoAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: `BG Removed - ${asset.name}`,
        url: blobUrl,
        originalUri,
        type: 'video',
        ...meta
      };

      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newVideoAsset],
        timeline: prev.timeline.map(c => 
          c.id === activeClip.id 
            ? { ...c, assetId: newVideoAsset.id, status: 'ready', background: { isRemoved: true, color: bgPreviewColor } } 
            : c
        ),
        isProcessingBg: false
      }));
    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isProcessingBg: false }));
      alert("Error removing background: " + (err as Error).message);
    }
  };

  const handleScanScenes = async () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return;
    const asset = state.assets.find(a => a.id === activeClip.assetId);
    if (!asset || asset.type !== 'video') return;

    setState(prev => ({ ...prev, isAnalyzing: true }));
    try {
      const videoRes = await fetch(asset.url);
      const videoBlob = await videoRes.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(videoBlob);
      });

      const scenes = await GeminiService.analyzeScenes(base64, videoBlob.type);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: prev.timeline.map(c => c.id === activeClip.id ? { ...c, scenes } : c),
        isAnalyzing: false
      }));
    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleGenerateStoryboard = async () => {
    if (state.timeline.length === 0 && !prompt.trim()) {
      alert("Add some clips or describe your vision in the prompt editor first.");
      return;
    }
    setState(prev => ({ ...prev, isAnalyzingStoryboard: true }));
    try {
      const storyboard = await GeminiService.generateStoryboard(state.timeline, state.assets, prompt);
      setState(prev => ({ ...prev, storyboard, isAnalyzingStoryboard: false }));
    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isAnalyzingStoryboard: false }));
      alert("Failed to generate storyboard. Try again later.");
    }
  };

  const handleGenerate = async () => {
    if (!hasApiKey) {
      await GeminiService.openApiKeySelector();
      const check = await GeminiService.checkApiKey();
      setHasApiKey(check);
      if (!check) return;
    }

    if (!prompt.trim()) return;

    setState(prev => ({ ...prev, isGenerating: true }));

    try {
      const activeClip = state.timeline.find(c => c.id === state.activeClipId);
      const asset = activeClip ? state.assets.find(a => a.id === activeClip.assetId) : null;
      
      let refImage = undefined;
      if (asset?.type === 'image') {
        refImage = { data: asset.base64, mimeType: 'image/png' };
      } else if (asset?.type === 'video') {
        const frame = await getVideoFrame(asset.url, 0);
        refImage = { data: frame, mimeType: 'image/png' };
      }

      const operation = await GeminiService.generateVideo(prompt, '16:9', refImage);
      
      const newClipId = Math.random().toString(36).substr(2, 9);
      const tempClip: TimelineClip = {
        id: newClipId,
        assetId: '',
        prompt,
        order: state.timeline.length,
        status: 'generating',
        playbackSpeed: 1.0
      };
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: [...prev.timeline, tempClip],
        activeClipId: newClipId
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const meta = await getVideoMetadata(blobUrl);
      const newVideoAsset: VideoAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: `AI Generated ${prompt.slice(0, 10)}...`,
        url: blobUrl,
        originalUri,
        type: 'video',
        ...meta
      };

      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newVideoAsset],
        timeline: prev.timeline.map(c => 
          c.id === newClipId 
            ? { ...c, assetId: newVideoAsset.id, status: 'ready' } 
            : c
        ),
        isGenerating: false
      }));

    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isGenerating: false }));
      alert("Error generating video: " + (err as Error).message);
    }
  };

  const handleExtend = async () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip || activeClip.status !== 'ready') return;
    
    const asset = state.assets.find(a => a.id === activeClip.assetId) as VideoAsset;
    if (!asset || asset.type !== 'video' || !asset.originalUri) {
      alert("Only AI-generated videos with accessible remote links can be extended.");
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      // Incorporating requested duration into the prompt
      const extensionPrompt = `Content-aware extension: ${prompt || 'smooth natural continuation'}. Aim for approximately ${extensionDuration} seconds of seamless extra motion.`;
      const operation = await GeminiService.extendVideo(extensionPrompt, asset.originalUri);
      
      const newClipId = Math.random().toString(36).substr(2, 9);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: [...prev.timeline, {
          id: newClipId, assetId: '', prompt: `AI Extension (+${extensionDuration}s)`, order: prev.timeline.length, status: 'generating', extendedFromId: activeClip.id, playbackSpeed: 1.0
        }],
        activeClipId: newClipId
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const meta = await getVideoMetadata(blobUrl);
      const newVideoAsset: VideoAsset = { 
        id: Math.random().toString(36).substr(2, 9), 
        name: `Extended - ${asset.name}`, 
        url: blobUrl, 
        originalUri,
        type: 'video',
        ...meta
      };

      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newVideoAsset],
        timeline: prev.timeline.map(c => c.id === newClipId ? { ...c, assetId: newVideoAsset.id, status: 'ready' } : c),
        isGenerating: false
      }));
    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, isGenerating: false }));
      alert("Extension failed: " + (err as Error).message);
    }
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    if (!state.activeClipId) return;
    saveHistory();
    setState(prev => ({
      ...prev,
      timeline: prev.timeline.map(c => 
        c.id === state.activeClipId ? { ...c, playbackSpeed: speed } : c
      )
    }));
  };

  const handleTextOverlayChange = (overlay: Partial<TextOverlay>) => {
    if (!state.activeClipId) return;
    saveHistory();
    setState(prev => ({
      ...prev,
      timeline: prev.timeline.map(c => 
        c.id === state.activeClipId 
          ? { ...c, textOverlay: { ...(c.textOverlay || { text: '', color: '#ffffff', fontSize: 24, position: 'bottom' }), ...overlay } } 
          : c
      )
    }));
  };

  const handlePromptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPromptHovered(false);
    const assetId = e.dataTransfer.getData('assetId');
    if (assetId) {
      const asset = state.assets.find(a => a.id === assetId);
      if (asset) {
        setPrompt(prev => `${prev} [Use ${asset.name} as reference] `);
      }
    }
  };

  const activeAsset = state.activeClipId 
    ? state.assets.find(a => a.id === state.timeline.find(c => c.id === state.activeClipId)?.assetId)
    : null;

  const bgColors = [
    { name: 'Transparent (Green)', value: 'transparent', class: 'bg-green-500' },
    { name: 'White', value: 'white', class: 'bg-white' },
    { name: 'Black', value: 'black', class: 'bg-black' },
    { name: 'Blue', value: 'blue', class: 'bg-blue-600' },
    { name: 'Green', value: 'green', class: 'bg-green-600' },
  ];

  const currentActiveClip = state.timeline.find(c => c.id === state.activeClipId);

  const getTextPositionClass = (pos?: string) => {
    switch(pos) {
      case 'top': return 'top-8';
      case 'center': return 'top-1/2 -translate-y-1/2';
      case 'bottom': default: return 'bottom-8';
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
      <AssetPanel 
        assets={state.assets} 
        onUpload={handleUpload} 
        onDragStart={(e, id) => e.dataTransfer.setData('assetId', id)} 
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold italic text-xl shadow-lg shadow-indigo-500/30">S</div>
            <h1 className="text-lg font-bold tracking-tight">StitchAI <span className="text-indigo-400 font-normal">Editor</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 border-r border-slate-800 pr-4 mr-2">
                <button 
                  onClick={undo} 
                  disabled={past.length === 0}
                  className="p-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button 
                  onClick={redo} 
                  disabled={future.length === 0}
                  className="p-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
             </div>

             <div className="flex items-center gap-2 border-r border-slate-800 pr-4 mr-2">
                <button 
                  onClick={handleGenerateStoryboard}
                  disabled={state.isAnalyzingStoryboard}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 font-bold uppercase tracking-wider"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {state.isAnalyzingStoryboard ? 'Analyzing...' : 'Analyze Storyboard'}
                </button>
             </div>

            <button 
              onClick={() => alert("Ready to Export! In a full version, this would merge all MP4 segments into a single 30s+ reel.")}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-1.5 rounded-lg font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
            >
              Export Reel
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0 relative">
          {/* Workspace */}
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-8 relative">
            <div className="max-w-4xl w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center group relative">
              {activeAsset ? (
                <>
                  {activeAsset.type === 'video' ? (
                    <video ref={videoPreviewRef} src={activeAsset.url} className="w-full h-full object-contain" controls autoPlay />
                  ) : (
                    <img src={activeAsset.url} className="w-full h-full object-contain" alt="" />
                  )}
                  {/* Text Overlay Preview */}
                  {currentActiveClip?.textOverlay?.text && (
                    <div 
                      className={`absolute left-0 right-0 px-10 text-center pointer-events-none drop-shadow-lg font-bold z-10 transition-all ${getTextPositionClass(currentActiveClip.textOverlay.position)}`}
                      style={{ 
                        color: currentActiveClip.textOverlay.color, 
                        fontSize: `${currentActiveClip.textOverlay.fontSize}px`,
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                      }}
                    >
                      {currentActiveClip.textOverlay.text}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-500">
                  <p className="text-lg font-medium">Select a clip to begin AI-Enhanced Editing</p>
                </div>
              )}
              
              {(state.isGenerating || state.isProcessingBg || state.isAnalyzingStoryboard) && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 text-center">
                  <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <h3 className="text-xl font-bold mb-2 tracking-widest uppercase text-indigo-400">
                    {state.isProcessingBg ? 'AI Background Removal' : 
                     state.isAnalyzingStoryboard ? 'AI Cinematic Analysis' :
                     'Stitching Reality'}
                  </h3>
                  <p className="text-slate-400 max-w-xs px-4">
                    {state.isProcessingBg ? 'Analyzing temporal consistency and subject masking...' : 
                     state.isAnalyzingStoryboard ? 'Optimizing sequence flow and cinematic composition...' :
                     'Maintaining content consistency and motion flow...'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contextual Properties Panel (Right) */}
          {state.activeClipId && (
            <div className="w-64 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Properties</h3>
              
              {/* Technical Details Section */}
              {activeAsset?.type === 'video' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h4 className="text-sm font-bold">Clip Technical Details</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Resolution</span>
                      <span className="text-xs font-mono text-indigo-300">{(activeAsset as VideoAsset).width} x {(activeAsset as VideoAsset).height}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Original Duration</span>
                      <span className="text-xs font-mono text-indigo-300">{(activeAsset as VideoAsset).duration?.toFixed(2)}s</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Video Codec</span>
                      <span className="text-xs font-mono text-indigo-300">{(activeAsset as VideoAsset).codec || 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeAsset?.type === 'video' && <div className="h-[1px] bg-slate-800" />}

              {/* Text Overlay Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h4 className="text-sm font-bold">Text Overlay</h4>
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={currentActiveClip?.textOverlay?.text || ''}
                    onChange={(e) => handleTextOverlayChange({ text: e.target.value })}
                    placeholder="Enter overlay text..."
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase">Size</span>
                    <input
                      type="number"
                      value={currentActiveClip?.textOverlay?.fontSize || 24}
                      onChange={(e) => handleTextOverlayChange({ fontSize: parseInt(e.target.value) })}
                      className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-indigo-400 font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase">Color</span>
                    <input
                      type="color"
                      value={currentActiveClip?.textOverlay?.color || '#ffffff'}
                      onChange={(e) => handleTextOverlayChange({ color: e.target.value })}
                      className="w-8 h-8 bg-transparent border-0 cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['top', 'center', 'bottom'] as const).map(pos => (
                      <button
                        key={pos}
                        onClick={() => handleTextOverlayChange({ position: pos })}
                        className={`text-[10px] py-1 border rounded uppercase tracking-tighter transition-all ${currentActiveClip?.textOverlay?.position === pos ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-800 text-slate-400'}`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-[1px] bg-slate-800" />

              {/* Playback Speed */}
              {activeAsset?.type === 'video' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2" />
                    </svg>
                    <h4 className="text-sm font-bold">Playback Speed</h4>
                  </div>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2.0" 
                      step="0.1" 
                      value={currentActiveClip?.playbackSpeed || 1.0}
                      onChange={(e) => handlePlaybackSpeedChange(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>0.5x</span>
                      <span className="text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{currentActiveClip?.playbackSpeed || 1.0}x</span>
                      <span>2.0x</span>
                    </div>
                  </div>
                </div>
              )}

              {activeAsset?.type === 'video' && <div className="h-[1px] bg-slate-800" />}

              {/* AI Extension (Only for AI clips) */}
              {activeAsset?.type === 'video' && (activeAsset as VideoAsset).originalUri && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-sm font-bold">AI Extension</h4>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Extend this clip seamlessly. Uses Gemini Veo 3.1 content-aware technology.
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 uppercase">Target Duration</span>
                      <span className="text-xs font-mono text-indigo-400">{extensionDuration}s</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="7" 
                      step="1" 
                      value={extensionDuration}
                      onChange={(e) => setExtensionDuration(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleExtend}
                    disabled={state.isGenerating}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold transition-all border border-indigo-500/50 shadow-lg shadow-indigo-500/20"
                  >
                    Extend +{extensionDuration}s
                  </button>
                </div>
              )}

              {activeAsset?.type === 'video' && (activeAsset as VideoAsset).originalUri && <div className="h-[1px] bg-slate-800" />}

              {/* Background Lab */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <h4 className="text-sm font-bold">AI Background Lab</h4>
                </div>
                
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Remove backgrounds instantly. Choose a replacement color or transparent (Green screen).
                </p>

                <div className="grid grid-cols-5 gap-2">
                  {bgColors.map((bg) => (
                    <button
                      key={bg.value}
                      onClick={() => setBgPreviewColor(bg.value)}
                      title={bg.name}
                      className={`w-full aspect-square rounded-full border-2 transition-all ${bg.class} ${bgPreviewColor === bg.value ? 'ring-2 ring-indigo-500 border-white' : 'border-slate-800'}`}
                    />
                  ))}
                </div>

                <button
                  onClick={handleRemoveBackground}
                  disabled={state.isProcessingBg || state.isGenerating}
                  className="w-full bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white py-2 rounded-lg text-xs font-bold transition-all border border-slate-700 hover:border-indigo-500"
                >
                  Apply AI Removal
                </button>
              </div>

              <div className="h-[1px] bg-slate-800" />

              {/* Clip Info */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase">Clip Overview</h4>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timeline Base:</span>
                    <span>05.0s</span>
                  </div>
                  {currentActiveClip?.playbackSpeed && currentActiveClip.playbackSpeed !== 1.0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Playback Adjusted:</span>
                      <span className="text-indigo-400">{(5.0 / currentActiveClip.playbackSpeed).toFixed(2)}s</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="text-green-400 capitalize">{currentActiveClip?.status}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Storyboard Modal Overly */}
          {state.storyboard && (
            <div className="absolute inset-0 bg-slate-950/90 z-[100] p-10 flex flex-col items-center backdrop-blur-xl">
              <div className="max-w-5xl w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">AI Generated Storyboard</h2>
                    <p className="text-slate-400 text-sm">A professional cinematic plan based on your current timeline and prompt.</p>
                  </div>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, storyboard: null }))}
                    className="p-2 bg-slate-800 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
                  {state.storyboard.map((item) => (
                    <div key={item.sceneNumber} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 bg-indigo-500/10 rounded-bl-2xl text-indigo-400 font-bold text-lg">
                        #{item.sceneNumber}
                      </div>
                      <h4 className="text-lg font-bold text-indigo-400 mb-2">{item.title}</h4>
                      <p className="text-slate-300 text-sm mb-4 leading-relaxed">{item.description}</p>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase text-slate-500 w-24">Shot Type:</span>
                          <span className="text-xs text-amber-400 font-mono bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">{item.shotComposition}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-[10px] font-bold uppercase text-slate-500 w-24 mt-1">Visual Cues:</span>
                          <span className="text-xs text-slate-400 italic flex-1">{item.visualCues}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase text-slate-500 w-24">Duration:</span>
                          <span className="text-xs text-indigo-300">{item.estimatedDuration}</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          setPrompt(item.description);
                          alert("Scene description copied to Prompt Editor!");
                        }}
                        className="mt-6 w-full py-2 bg-slate-800 hover:bg-indigo-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all opacity-0 group-hover:opacity-100"
                      >
                        Apply description to Prompt
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex gap-4">
            <div className="flex-1 relative group/prompt">
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsPromptHovered(true); }}
                onDragLeave={() => setIsPromptHovered(false)}
                onDrop={handlePromptDrop}
                className={`w-full relative transition-all duration-300 ${isPromptHovered ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950' : ''}`}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your scene or drag reference assets here to bridge them..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-14"
                />
                {isPromptHovered && (
                  <div className="absolute inset-0 bg-indigo-600/20 backdrop-blur-sm rounded-xl flex items-center justify-center pointer-events-none border-2 border-dashed border-indigo-400">
                    <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Drop Asset to Reference</p>
                  </div>
                )}
              </div>
              <div className="absolute right-3 bottom-3 flex gap-2">
                <button onClick={handleExtend} disabled={state.isGenerating || !state.activeClipId} className="p-1 text-slate-400 hover:text-indigo-400 transition-colors" title="AI Content-Aware Extension">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleGenerate}
                disabled={state.isGenerating || !prompt.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white px-8 h-full rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-3"
              >
                {state.isGenerating ? 'Processing...' : 'Generate Clip'}
              </button>
              {state.timeline.length >= 2 && (
                <button 
                  onClick={handleStitch}
                  disabled={state.isGenerating}
                  className="bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/30 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  AI Bridge Stitch
                </button>
              )}
            </div>
          </div>
        </div>

        <Timeline 
          clips={state.timeline} 
          assets={state.assets}
          onDrop={(e) => {
            e.preventDefault();
            const assetId = e.dataTransfer.getData('assetId');
            if (assetId) {
              saveHistory();
              const newClip: TimelineClip = { id: Math.random().toString(36).substr(2, 9), assetId, order: state.timeline.length, status: 'ready', transition: 'none', playbackSpeed: 1.0 };
              setState(prev => ({ ...prev, timeline: [...prev.timeline, newClip], activeClipId: newClip.id }));
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onRemoveClip={(id) => {
            saveHistory();
            setState(prev => ({ ...prev, timeline: prev.timeline.filter(c => c.id !== id) }));
          }}
          onSelectClip={(id) => setState(prev => ({ ...prev, activeClipId: id }))}
          onSetTransition={(index, type) => {
            saveHistory();
            setState(prev => ({
              ...prev,
              timeline: prev.timeline.map((c, i) => i === index ? { ...c, transition: type } : c)
            }));
          }}
          activeClipId={state.activeClipId}
        />
      </div>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #6366f1;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }
        input[type='range']::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #6366f1;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
};

export default App;
