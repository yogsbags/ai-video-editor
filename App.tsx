
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MediaAsset, TimelineClip, AppState, Track, VideoAsset, ColorGrading, AudioSettings, GraphicTemplate, StoryboardItem, Caption, Scene } from './types';
import AssetPanel from './components/AssetPanel';
import Timeline from './components/Timeline';
import { GeminiService } from './services/gemini';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    assets: [],
    tracks: [
      { id: 'v1', type: 'video', name: 'Video 1', clips: [], isLocked: false, isVisible: true },
      { id: 'v2', type: 'video', name: 'Overlay', clips: [], isLocked: false, isVisible: true },
      { id: 'a1', type: 'audio', name: 'Music', clips: [], isLocked: false, isVisible: true },
    ],
    isGenerating: false,
    activeClipId: null,
    activeTrackId: 'v1',
    isAnalyzing: false,
    isProcessingBg: false,
    isAnalyzingStoryboard: false,
    storyboard: null,
    isBoosting: false,
  });

  const [prompt, setPrompt] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAssets: MediaAsset[] = [];
    for (const file of Array.from(files) as File[]) {
      const url = URL.createObjectURL(file);
      const id = Math.random().toString(36).substr(2, 9);
      if (file.type.startsWith('audio/')) {
        newAssets.push({ id, url, type: 'audio', name: file.name, duration: 30 });
      } else if (file.type.startsWith('video/')) {
        newAssets.push({ id, url, type: 'video', name: file.name, duration: 5 });
      } else {
        newAssets.push({ id, url, type: 'image', name: file.name, base64: '' });
      }
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

  const handleGenerate = async () => {
    const hasKey = await GeminiService.checkApiKey();
    if (!hasKey) {
      await GeminiService.openApiKeySelector();
      return;
    }
    if (!prompt.trim()) return;

    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      const operation = await GeminiService.generateVideo(prompt);
      const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
      const newAsset: VideoAsset = { id: Math.random().toString(36).substr(2, 9), url: blobUrl, originalUri, type: 'video', name: 'AI Generated' };
      const newClip: TimelineClip = {
        id: Math.random().toString(36).substr(2, 9), assetId: newAsset.id, order: 0, startTime: currentTime, duration: 5, status: 'ready', playbackSpeed: 1
      };
      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newAsset],
        tracks: prev.tracks.map(t => t.id === prev.activeTrackId ? { ...t, clips: [...t.clips, newClip] } : t),
        isGenerating: false,
        activeClipId: newClip.id
      }));
    } catch (e) {
      setState(prev => ({ ...prev, isGenerating: false }));
      alert(e);
    }
  };

  const handleStitch = async () => {
    const activeTrack = state.tracks.find(t => t.id === state.activeTrackId);
    if (!activeTrack || activeTrack.clips.length < 2) return;
    
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      const clipA = activeTrack.clips[activeTrack.clips.length - 2];
      const clipB = activeTrack.clips[activeTrack.clips.length - 1];
      const assetA = state.assets.find(a => a.id === clipA.assetId);
      const assetB = state.assets.find(a => a.id === clipB.assetId);
      
      const frameA = assetA?.type === 'video' ? await getVideoFrame(assetA.url, 4.9) : (assetA as any).base64;
      const frameB = assetB?.type === 'video' ? await getVideoFrame(assetB.url, 0) : (assetB as any).base64;

      const op = await GeminiService.stitchVideos(prompt || "Cinematic transition", frameA, frameB);
      const { blobUrl, originalUri } = await GeminiService.pollOperation(op);
      const newAsset: VideoAsset = { id: Math.random().toString(36).substr(2, 9), url: blobUrl, originalUri, type: 'video', name: 'AI Stitch' };
      const newClip: TimelineClip = { id: Math.random().toString(36).substr(2, 9), assetId: newAsset.id, order: 0, startTime: clipA.startTime + 2.5, duration: 5, status: 'ready' };
      
      setState(prev => ({
        ...prev,
        assets: [...prev.assets, newAsset],
        tracks: prev.tracks.map(t => t.id === prev.activeTrackId ? { ...t, clips: [...t.clips, newClip] } : t),
        isGenerating: false
      }));
    } catch (e) {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleViralBoost = async () => {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === state.activeClipId);
    if (!clip) return;
    const asset = state.assets.find(a => a.id === clip.assetId);
    if (!asset || asset.type !== 'video') return;

    setState(prev => ({ ...prev, isBoosting: true }));
    try {
      const videoRes = await fetch(asset.url);
      const videoBlob = await videoRes.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(videoBlob);
      });

      const suggestions = await GeminiService.suggestBRoll(base64, videoBlob.type);
      for (const brollPrompt of suggestions) {
        const operation = await GeminiService.generateVideo(brollPrompt);
        const { blobUrl, originalUri } = await GeminiService.pollOperation(operation);
        const newAsset: VideoAsset = { id: Math.random().toString(36).substr(2, 9), url: blobUrl, originalUri, type: 'video', name: 'B-Roll' };
        const newClip: TimelineClip = { id: Math.random().toString(36).substr(2, 9), assetId: newAsset.id, order: 0, startTime: currentTime + 5, duration: 5, status: 'ready' };
        setState(prev => ({ ...prev, assets: [...prev.assets, newAsset], tracks: prev.tracks.map(t => t.id === 'v2' ? { ...t, clips: [...t.clips, newClip] } : t) }));
      }
      setState(prev => ({ ...prev, isBoosting: false }));
    } catch (err) {
      setState(prev => ({ ...prev, isBoosting: false }));
    }
  };

  const handleAutoCaptions = async () => {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === state.activeClipId);
    if (!clip) return;
    const asset = state.assets.find(a => a.id === clip.assetId);
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
      const autoCaptions = await GeminiService.generateViralCaptions(base64, videoBlob.type);
      setState(prev => ({ ...prev, isAnalyzing: false, tracks: prev.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clip.id ? { ...c, autoCaptions } : c) })) }));
    } catch { setState(prev => ({ ...prev, isAnalyzing: false })); }
  };

  const handleGenerateStoryboard = async () => {
    setState(prev => ({ ...prev, isAnalyzingStoryboard: true }));
    try {
      const context = state.tracks.map(t => `${t.name}: ${t.clips.length} clips`).join(', ');
      const storyboard = await GeminiService.generateStoryboard(context, prompt);
      setState(prev => ({ ...prev, storyboard, isAnalyzingStoryboard: false }));
    } catch { setState(prev => ({ ...prev, isAnalyzingStoryboard: false })); }
  };

  const handleAutoGrade = async () => {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === state.activeClipId);
    if (!clip) return;
    setState(prev => ({ ...prev, isAnalyzing: true }));
    try {
      const grading = await GeminiService.suggestColorGrading('', prompt || 'Cinematic');
      setState(prev => ({
        ...prev,
        tracks: prev.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => c.id === clip.id ? { ...c, colorGrading: grading } : c)
        })),
        isAnalyzing: false
      }));
    } catch (e) {
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleAutoMix = async () => {
    setState(prev => ({ ...prev, isAnalyzing: true }));
    try {
      const audioTracks = state.tracks.filter(t => t.type === 'audio').map(t => t.name);
      const mix = await GeminiService.suggestAudioMix(prompt || "Complex edit", audioTracks);
      setState(prev => ({
        ...prev,
        tracks: prev.tracks.map(t => {
          if (t.type === 'audio' && mix.duckingLevels[t.name]) {
            return {
              ...t,
              clips: t.clips.map(c => ({
                ...c,
                audioSettings: { ...c.audioSettings, volume: mix.duckingLevels[t.name] } as AudioSettings
              }))
            };
          }
          return t;
        }),
        isAnalyzing: false
      }));
    } catch (e) {
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleClipDrop = (e: React.DragEvent, trackId: string) => {
    const assetId = e.dataTransfer.getData('assetId');
    const asset = state.assets.find(a => a.id === assetId);
    if (!asset) return;
    const newClip: TimelineClip = {
      id: Math.random().toString(36).substr(2, 9),
      assetId: asset.id,
      order: 0,
      startTime: currentTime,
      duration: 5,
      status: 'ready',
      playbackSpeed: 1,
      audioSettings: { volume: 1, isMuted: false, fadeDuration: 0.5, autoDucked: false },
      colorGrading: { exposure: 0, contrast: 50, saturation: 100, vibrance: 50, tint: 0, highlights: 0, shadows: 0, temperature: 0 }
    };
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t),
      activeClipId: newClip.id,
      activeTrackId: trackId
    }));
  };

  const activeClip = state.tracks.flatMap(t => t.clips).find(c => c.id === state.activeClipId);
  const activeAsset = activeClip ? state.assets.find(a => a.id === activeClip.assetId) : null;
  const currentCaption = activeClip?.autoCaptions?.find(cap => currentTime >= cap.startTime && currentTime <= cap.endTime);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
      <AssetPanel assets={state.assets} onUpload={handleUpload} onDragStart={(e, id) => e.dataTransfer.setData('assetId', id)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold italic text-xl shadow-lg">S</div>
            <h1 className="text-lg font-bold">StitchAI <span className="text-indigo-400 font-normal">Ultimate</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleGenerateStoryboard} className="px-3 py-1.5 bg-amber-900/20 text-amber-400 rounded-lg text-xs font-bold border border-amber-500/20">AI Storyboard</button>
            <button onClick={handleAutoMix} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-indigo-400 border border-indigo-500/20">AI Auto-Mix</button>
            <button onClick={() => alert("Ready to Export!")} className="bg-indigo-600 hover:bg-indigo-500 px-5 py-1.5 rounded-lg font-bold text-sm shadow-lg">Export Reel</button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0 relative">
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-8 relative">
            <div className="max-w-4xl w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center relative">
              {activeAsset ? (
                <>
                  {activeAsset.type === 'video' ? (
                    <video 
                      ref={videoPreviewRef} src={activeAsset.url} className="w-full h-full object-contain" controls autoPlay 
                      style={{ filter: activeClip?.colorGrading ? `brightness(${1 + activeClip.colorGrading.exposure / 100}) contrast(${activeClip.colorGrading.contrast}%) saturate(${activeClip.colorGrading.saturation}%)` : 'none' }}
                    />
                  ) : (
                    <img src={activeAsset.url} className="w-full h-full object-contain" alt="" />
                  )}
                  {currentCaption && (
                    <div className="absolute bottom-10 left-0 right-0 text-center px-10 z-20">
                      <span className="bg-yellow-400 text-black px-4 py-1 rounded-md font-black italic text-xl uppercase shadow-xl">{currentCaption.text}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Select clip to preview</p>
              )}
              {(state.isGenerating || state.isAnalyzing || state.isBoosting) && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <h3 className="text-indigo-400 font-bold uppercase tracking-widest">AI Computing Reality...</h3>
                </div>
              )}
            </div>
          </div>

          {state.activeClipId && (
            <div className="w-72 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Inspector</h3>
              
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-pink-400">Viral Engine</h4>
                <button onClick={handleViralBoost} className="w-full py-2 bg-gradient-to-r from-pink-600 to-indigo-600 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">B-Roll Boost</button>
                <button onClick={handleAutoCaptions} className="w-full py-2 bg-slate-800 text-pink-400 rounded-xl text-xs font-bold border border-pink-500/20">Auto Viral Captions</button>
              </div>

              <div className="h-[1px] bg-slate-800" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-indigo-400">Lumetri Color</h4>
                  <button onClick={handleAutoGrade} className="text-[10px] bg-indigo-600 px-2 py-1 rounded font-bold">Auto-Grade</button>
                </div>
                {activeClip?.colorGrading && Object.entries(activeClip.colorGrading).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500"><span>{key}</span><span>{value}</span></div>
                    <input type="range" className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                  </div>
                ))}
              </div>

              <div className="h-[1px] bg-slate-800" />
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-indigo-400">Audio Mix</h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>Volume</span><span>{Math.round((activeClip?.audioSettings?.volume || 1) * 100)}%</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={activeClip?.audioSettings?.volume || 1} className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 backdrop-blur-md flex gap-4">
           <textarea
              value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Prompt AI: 'Add cinematic lighting', 'Bridge clips', 'Generate B-Roll'..."
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none h-14"
            />
            <div className="flex flex-col gap-2">
              <button onClick={handleGenerate} className="bg-indigo-600 px-6 py-1 rounded-lg font-bold text-xs uppercase tracking-tighter">Generate</button>
              <button onClick={handleStitch} className="bg-slate-800 px-6 py-1 rounded-lg font-bold text-xs border border-indigo-500/20">AI Bridge</button>
            </div>
        </div>

        <Timeline tracks={state.tracks} assets={state.assets} onDrop={handleClipDrop} activeClipId={state.activeClipId} onSelectClip={(id) => setState(prev => ({ ...prev, activeClipId: id }))} />
      </div>

      {state.storyboard && (
        <div className="absolute inset-0 bg-slate-950/95 z-[100] p-10 backdrop-blur-xl overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between mb-8">
              <h2 className="text-3xl font-black italic text-white uppercase">AI Cinema Storyboard</h2>
              <button onClick={() => setState(prev => ({ ...prev, storyboard: null }))} className="text-slate-400 hover:text-white">Close [X]</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {state.storyboard.map((item: StoryboardItem) => (
                <div key={item.sceneNumber} className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <span className="text-indigo-400 font-bold text-xs uppercase">Scene {item.sceneNumber}</span>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-slate-400 text-sm mb-4 italic">"{item.description}"</p>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>{item.shotComposition}</span>
                    <span>{item.estimatedDuration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
