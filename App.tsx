
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MediaAsset, TimelineClip, AppState, TransitionType, BackgroundSettings, VideoAsset } from './types';
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
  });

  const [past, setPast] = useState<HistoryItem[]>([]);
  const [future, setFuture] = useState<HistoryItem[]>([]);
  
  const [prompt, setPrompt] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [bgPreviewColor, setBgPreviewColor] = useState('transparent');
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    saveHistory();

    const newAssets: MediaAsset[] = [];
    for (const file of Array.from(files) as File[]) {
      const url = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image/');
      
      const asset: MediaAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url: url,
        type: isImage ? 'image' : 'video',
        ...(isImage ? { base64: await fileToBase64(file) } : {})
      } as any;
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
      const clipA = state.timeline[0];
      const clipB = state.timeline[1];
      const assetA = state.assets.find(a => a.id === clipA.assetId);
      const assetB = state.assets.find(a => a.id === clipB.assetId);

      if (!assetA || !assetB) throw new Error("Missing assets for stitching");

      const startFrame = assetA.type === 'video' ? await getVideoFrame(assetA.url, 5) : assetA.base64;
      const endFrame = assetB.type === 'video' ? await getVideoFrame(assetB.url, 0) : assetB.base64;

      const transitionPrompt = prompt || `Seamlessly transition between the scene in the first image and the scene in the second image using a ${clipA.transition || 'morph'} effect.`;
      
      const operation = await GeminiService.stitchVideos(transitionPrompt, startFrame, endFrame);
      
      const newClipId = Math.random().toString(36).substr(2, 9);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: [...prev.timeline, { id: newClipId, assetId: '', order: prev.timeline.length, status: 'generating', playbackSpeed: 1.0 }],
        activeClipId: newClipId
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const newVideoAsset: VideoAsset = { 
        id: Math.random().toString(36).substr(2, 9), 
        name: 'AI Seamless Stitch', 
        url: blobUrl, 
        originalUri,
        type: 'video' 
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
      
      const newVideoAsset: VideoAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: `BG Removed - ${asset.name}`,
        url: blobUrl,
        originalUri,
        type: 'video'
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
      const newVideoAsset: VideoAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: `AI Generated ${prompt.slice(0, 10)}...`,
        url: blobUrl,
        originalUri,
        type: 'video'
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
    // We strictly need the original URI for extending videos
    if (!asset || asset.type !== 'video' || !asset.originalUri) {
      alert("Only AI-generated videos with accessible remote links can be extended.");
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      const operation = await GeminiService.extendVideo(`Content-aware extension: ${prompt || 'smooth natural continuation'}`, asset.originalUri);
      
      const newClipId = Math.random().toString(36).substr(2, 9);
      
      saveHistory();

      setState(prev => ({
        ...prev,
        timeline: [...prev.timeline, {
          id: newClipId, assetId: '', prompt: 'AI Extension (+7s)', order: prev.timeline.length, status: 'generating', extendedFromId: activeClip.id, playbackSpeed: 1.0
        }],
        activeClipId: newClipId
      }));

      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const newVideoAsset: VideoAsset = { 
        id: Math.random().toString(36).substr(2, 9), 
        name: `Extended - ${asset.name}`, 
        url: blobUrl, 
        originalUri,
        type: 'video' 
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

             {state.activeClipId && (
               <div className="flex items-center gap-2 border-r border-slate-800 pr-4 mr-2">
                 <button 
                  onClick={handleScanScenes}
                  disabled={state.isAnalyzing}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2"
                >
                  {state.isAnalyzing ? 'Analyzing...' : 'Scan Scenes'}
                </button>
               </div>
             )}
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-1.5 rounded-lg font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2">
              Export Reel
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Workspace */}
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-8 relative">
            <div className="max-w-4xl w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center group relative">
              {activeAsset ? (
                activeAsset.type === 'video' ? (
                  <video ref={videoPreviewRef} src={activeAsset.url} className="w-full h-full object-contain" controls autoPlay />
                ) : (
                  <img src={activeAsset.url} className="w-full h-full object-contain" alt="" />
                )
              ) : (
                <div className="text-center text-slate-500">
                  <p className="text-lg font-medium">Select a clip to begin AI-Enhanced Editing</p>
                </div>
              )}
              
              {(state.isGenerating || state.isProcessingBg) && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 text-center">
                  <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <h3 className="text-xl font-bold mb-2 tracking-widest uppercase">
                    {state.isProcessingBg ? 'AI Background Removal' : 'Stitching Reality'}
                  </h3>
                  <p className="text-slate-400 max-w-xs px-4">
                    {state.isProcessingBg ? 'Analyzing temporal consistency and subject masking...' : 'Maintaining content consistency and motion flow...'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contextual Properties Panel (Right) */}
          {state.activeClipId && (
            <div className="w-64 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Properties</h3>
              
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
                    Extend this clip by 7s. Uses Gemini Veo 3.1 to maintain temporal and content consistency.
                  </p>
                  <button
                    onClick={handleExtend}
                    disabled={state.isGenerating}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold transition-all border border-indigo-500/50 shadow-lg shadow-indigo-500/20"
                  >
                    Extend +7s
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
                <h4 className="text-[10px] font-bold text-slate-500 uppercase">Clip Info</h4>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base Duration:</span>
                    <span>05.0s</span>
                  </div>
                  {currentActiveClip?.playbackSpeed && currentActiveClip.playbackSpeed !== 1.0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Final Duration:</span>
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
        </div>

        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex gap-4">
            <div className="flex-1 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your scene, seamless transition, or content-aware extension..."
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-14"
              />
              <div className="absolute right-3 bottom-3 flex gap-2">
                <button onClick={handleExtend} disabled={state.isGenerating || !state.activeClipId} className="p-1 text-slate-400 hover:text-indigo-400 transition-colors" title="AI Content-Aware Extension (+7s)">
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
                  className="bg-