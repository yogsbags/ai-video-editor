
import React from 'react';
import { MediaAsset } from '../types';

interface AssetPanelProps {
  assets: MediaAsset[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragStart: (e: React.DragEvent, assetId: string) => void;
}

const AssetPanel: React.FC<AssetPanelProps> = ({ assets, onUpload, onDragStart }) => {
  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Media Library
        </h2>
        
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-slate-800 transition-all">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg className="w-8 h-8 mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <p className="text-xs text-slate-400 uppercase font-semibold">Upload Asset</p>
          </div>
          <input type="file" className="hidden" accept="image/*,video/*" onChange={onUpload} />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {assets.length === 0 ? (
          <p className="text-sm text-slate-500 text-center mt-10">No assets yet. Upload images or videos to start.</p>
        ) : (
          assets.map(asset => (
            <div
              key={asset.id}
              draggable
              onDragStart={(e) => onDragStart(e, asset.id)}
              className="relative group bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-indigo-500 cursor-grab active:cursor-grabbing transition-all"
            >
              {asset.type === 'image' ? (
                <img src={asset.url} alt={asset.name} className="w-full h-32 object-cover" />
              ) : (
                <div className="w-full h-32 bg-slate-950 flex items-center justify-center">
                  <video src={asset.url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <svg className="w-10 h-10 text-white opacity-80" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="p-2 truncate text-xs font-medium bg-slate-900/80 backdrop-blur-sm absolute bottom-0 left-0 right-0">
                {asset.name}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AssetPanel;
