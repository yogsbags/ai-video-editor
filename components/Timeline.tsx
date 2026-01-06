
import React from 'react';
import { TimelineClip, MediaAsset, TransitionType } from '../types';

interface TimelineProps {
  clips: TimelineClip[];
  assets: MediaAsset[];
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemoveClip: (clipId: string) => void;
  onSelectClip: (clipId: string) => void;
  onSetTransition: (index: number, type: TransitionType) => void;
  activeClipId: string | null;
}

const Timeline: React.FC<TimelineProps> = ({ 
  clips, 
  assets, 
  onDrop, 
  onDragOver, 
  onRemoveClip, 
  onSelectClip,
  onSetTransition,
  activeClipId 
}) => {
  const transitions: { label: string, value: TransitionType, icon: string }[] = [
    { label: 'None', value: 'none', icon: '∅' },
    { label: 'Crossfade', value: 'crossfade', icon: '∞' },
    { label: 'Fade to Black', value: 'fade-to-black', icon: '⬛' },
    { label: 'Motion Blur', value: 'motion-blur', icon: '≋' },
    { label: 'AI Morph', value: 'morph', icon: '🧬' },
  ];

  return (
    <div className="h-64 bg-slate-950 border-t border-slate-800 flex flex-col relative">
      <div className="px-4 py-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          Timeline Editor 
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">AI Enhanced</span>
        </h3>
        <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full uppercase font-bold">
          {clips.length} Clips • {clips.length * 5}s Estimated
        </span>
      </div>

      <div 
        className="flex-1 overflow-x-auto custom-scrollbar flex items-center p-6 gap-2"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {clips.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl mx-12 h-32">
            <p className="text-sm">Drag assets here to build your reel</p>
          </div>
        ) : (
          clips.sort((a,b) => a.order - b.order).map((clip, index) => {
            const asset = assets.find(a => a.id === clip.assetId);
            const isActive = activeClipId === clip.id;
            
            return (
              <React.Fragment key={clip.id}>
                <div 
                  onClick={() => onSelectClip(clip.id)}
                  className={`relative flex-shrink-0 w-48 h-32 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    isActive ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10' : 'border-slate-800 hover:border-slate-600'
                  } ${clip.status === 'generating' ? 'animate-pulse' : ''}`}
                >
                  {asset ? (
                    asset.type === 'image' ? (
                      <img src={asset.url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <video src={asset.url} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest">Processing</span>
                      </div>
                    </div>
                  )}

                  <div className="absolute top-1 right-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRemoveClip(clip.id); }}
                      className="p-1 bg-black/60 rounded-md hover:bg-red-500/80 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {clip.scenes && clip.scenes.length > 0 && (
                    <div className="absolute top-1 left-1 flex gap-0.5">
                      {clip.scenes.map((_, i) => (
                        <div key={i} className="w-1 h-3 bg-amber-400 rounded-full" title="Detected Scene Cut" />
                      ))}
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-300 truncate max-w-[80%] uppercase tracking-tighter">
                      {clip.status === 'generating' ? 'AI Stitching...' : clip.prompt || 'Reference Clip'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">05.0s</span>
                  </div>
                </div>
                
                {index < clips.length - 1 && (
                  <div className="flex-shrink-0 flex flex-col items-center group relative z-10">
                    <div className="w-[1px] h-32 bg-slate-800 group-hover:bg-indigo-500/50 absolute -z-10 transition-all"></div>
                    <div className="my-auto">
                      <button 
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${
                          clips[index].transition && clips[index].transition !== 'none' 
                            ? 'bg-indigo-600 border-indigo-400 text-white' 
                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-indigo-500'
                        }`}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          // Simplified: cycles through transitions
                          const currentIndex = transitions.findIndex(t => t.value === (clips[index].transition || 'none'));
                          const nextType = transitions[(currentIndex + 1) % transitions.length].value;
                          onSetTransition(index, nextType);
                        }}
                      >
                        <span className="text-xs font-bold">
                          {transitions.find(t => t.value === (clips[index].transition || 'none'))?.icon}
                        </span>
                      </button>
                      <div className="absolute top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-slate-900 px-2 py-1 rounded text-[9px] font-bold uppercase text-indigo-400 border border-slate-800">
                        {clips[index].transition || 'Seamless'}
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Timeline;
