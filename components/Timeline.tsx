
import React from 'react';
import { Track, MediaAsset, TimelineClip } from '../types';

interface TimelineProps {
  tracks: Track[];
  assets: MediaAsset[];
  onDrop: (e: React.DragEvent, trackId: string) => void;
  activeClipId: string | null;
  onSelectClip: (id: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({ tracks, assets, onDrop, activeClipId, onSelectClip }) => {
  return (
    <div className="h-80 bg-slate-950 border-t border-slate-800 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Multi-Track Sequence</h3>
        <div className="flex gap-4 text-[10px] text-slate-500 font-mono">
          <span>00:00:00:00</span>
          <span>00:00:30:00</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        {tracks.map((track) => (
          <div 
            key={track.id} 
            className="flex min-h-[64px] border-b border-slate-900 hover:bg-slate-900/20 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, track.id)}
          >
            <div className="w-24 flex-shrink-0 bg-slate-900/50 border-r border-slate-800 p-2 flex flex-col justify-center gap-1">
              <span className="text-[10px] font-black uppercase text-slate-500 truncate">{track.name}</span>
              <div className="flex gap-2">
                <button className="text-[8px] text-slate-600 hover:text-indigo-400">M</button>
                <button className="text-[8px] text-slate-600 hover:text-indigo-400">S</button>
              </div>
            </div>
            
            <div className="flex-1 relative bg-slate-950/40 p-1 flex items-center gap-0.5 overflow-x-auto custom-scrollbar">
              {track.clips.map((clip) => {
                const asset = assets.find(a => a.id === clip.assetId);
                const isActive = activeClipId === clip.id;
                
                return (
                  <div 
                    key={clip.id}
                    onClick={() => onSelectClip(clip.id)}
                    className={`h-12 flex-shrink-0 rounded border cursor-pointer transition-all relative group ${
                      isActive ? 'bg-indigo-600/40 border-indigo-500' : 'bg-slate-800 border-slate-700'
                    }`}
                    style={{ width: `${clip.duration * 20}px` }}
                  >
                    <div className="absolute inset-0 p-1 flex items-center gap-2">
                      <div className="w-8 h-full bg-black/40 rounded flex-shrink-0 overflow-hidden">
                        {asset?.type === 'video' && <video src={asset.url} className="w-full h-full object-cover" />}
                        {asset?.type === 'image' && <img src={asset.url} className="w-full h-full object-cover" />}
                        {asset?.type === 'audio' && <div className="w-full h-full flex items-center justify-center text-[8px] text-indigo-400">♫</div>}
                      </div>
                      <span className="text-[8px] font-bold truncate text-slate-300 uppercase tracking-tighter">{asset?.name || 'Empty'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
