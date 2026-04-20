import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

const ChatMediaViewer = ({ mediaList, currentIndex, onClose, onNavigate }) => {
  const activeMedia = mediaList[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, mediaList]);

  const handlePrev = () => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < mediaList.length - 1) onNavigate(currentIndex + 1);
  };

  if (!activeMedia) return null;

  const isVideo = activeMedia.type === 'video';

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-end items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <a href={activeMedia.url} target="_blank" rel="noreferrer" download className="p-2 text-white/70 hover:text-white transition rounded-full hover:bg-white/10 mr-2">
          <Download size={24} />
        </a>
        <button onClick={onClose} className="p-2 text-white/70 hover:text-white transition rounded-full hover:bg-white/10">
          <X size={28} />
        </button>
      </div>

      {/* Navigation Buttons */}
      {currentIndex > 0 && (
        <button onClick={handlePrev} className="absolute left-4 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition z-10">
          <ChevronLeft size={36} />
        </button>
      )}
      
      {currentIndex < mediaList.length - 1 && (
        <button onClick={handleNext} className="absolute right-4 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition z-10">
          <ChevronRight size={36} />
        </button>
      )}

      {/* Main Content */}
      <div className="w-full max-w-6xl h-[75vh] flex items-center justify-center p-4">
        {isVideo ? (
          <video 
            src={activeMedia.url} 
            controls 
            autoPlay
            className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-sm"
          />
        ) : (
          <img 
            src={activeMedia.url} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-sm select-none"
          />
        )}
      </div>

      {/* Thumbnails strip */}
      <div className="absolute bottom-4 left-0 right-0 px-4 h-20 flex justify-center items-center">
        <div className="flex gap-2 overflow-x-auto p-2 max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {mediaList.map((media, idx) => {
            const isVid = media.type === 'video';
            const isActive = idx === currentIndex;
            // For active media thumbnail scroll into view
            return (
              <div 
                key={idx} 
                onClick={() => onNavigate(idx)}
                ref={el => {
                  if (isActive && el) {
                    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }
                }}
                className={`relative shrink-0 w-14 h-14 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ${isActive ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'}`}
              >
                {isVid ? (
                  <video src={media.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={media.url} alt="thumbnail" className="w-full h-full object-cover" />
                )}
                {isVid && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-white border-b-[5px] border-b-transparent ml-0.5"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChatMediaViewer;
