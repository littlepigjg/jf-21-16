import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { processFrame } from '@/utils/frameProcessor';

function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function drawTintedFrame(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  alpha: number,
  tintColor?: { r: number; g: number; b: number }
) {
  const tempCanvas = imageDataToCanvas(imageData);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(tempCanvas, 0, 0);

  if (tintColor) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(${tintColor.r}, ${tintColor.g}, ${tintColor.b}, ${alpha * 0.3})`;
    ctx.fillRect(0, 0, imageData.width, imageData.height);
  }
  ctx.restore();
}

export default function PreviewCanvas() {
  const {
    frames,
    currentFrameIndex,
    setCurrentFrameIndex,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    captions,
    crop,
    canvasWidth,
    canvasHeight,
    selectedFrameIndex,
    setSelectedFrameIndex,
    onionSkinEnabled,
    onionSkinPrevFrames,
    onionSkinNextFrames,
    onionSkinOpacity,
  } = useEditorStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const delta = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;
      accumulatedTimeRef.current += delta * playbackSpeed;

      const currentFrame = frames[currentFrameIndex];
      if (currentFrame && accumulatedTimeRef.current >= currentFrame.delay) {
        accumulatedTimeRef.current = 0;
        const nextIndex = currentFrameIndex >= frames.length - 1 ? 0 : currentFrameIndex + 1;
        setCurrentFrameIndex(nextIndex);
        setSelectedFrameIndex(nextIndex);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTimeRef.current = 0;
    accumulatedTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, frames, currentFrameIndex, playbackSpeed, setCurrentFrameIndex, setSelectedFrameIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (frames.length === 0) return;

    const currentFrame = frames[currentFrameIndex];
    if (!currentFrame) return;

    const processedCurrent = processFrame(currentFrame, captions, currentFrameIndex, crop);
    canvas.width = processedCurrent.width;
    canvas.height = processedCurrent.height;

    if (onionSkinEnabled) {
      for (let i = onionSkinPrevFrames; i >= 1; i--) {
        const prevIndex = currentFrameIndex - i;
        if (prevIndex >= 0 && frames[prevIndex]) {
          const alpha = onionSkinOpacity * (1 - (i - 1) / Math.max(1, onionSkinPrevFrames));
          const processedPrev = processFrame(frames[prevIndex], captions, prevIndex, crop);
          drawTintedFrame(ctx, processedPrev, Math.max(0.05, alpha), { r: 0, g: 180, b: 255 });
        }
      }

      for (let i = 1; i <= onionSkinNextFrames; i++) {
        const nextIndex = currentFrameIndex + i;
        if (nextIndex < frames.length && frames[nextIndex]) {
          const alpha = onionSkinOpacity * (1 - (i - 1) / Math.max(1, onionSkinNextFrames));
          const processedNext = processFrame(frames[nextIndex], captions, nextIndex, crop);
          drawTintedFrame(ctx, processedNext, Math.max(0.05, alpha), { r: 255, g: 100, b: 100 });
        }
      }

      const tempCanvas = imageDataToCanvas(processedCurrent);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      ctx.putImageData(processedCurrent, 0, 0);
    }
  }, [
    currentFrameIndex,
    frames,
    captions,
    crop,
    onionSkinEnabled,
    onionSkinPrevFrames,
    onionSkinNextFrames,
    onionSkinOpacity,
  ]);

  const handleCanvasClick = () => {
    if (frames.length === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  const displayWidth = canvasWidth * zoom;
  const displayHeight = canvasHeight * zoom;

  const fitToContainer = () => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;
    const padding = 80;
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;
    const zoomX = availableWidth / canvasWidth;
    const zoomY = availableHeight / canvasHeight;
    setZoom(Math.min(zoomX, zoomY, 2));
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div className="text-sm text-slate-400 font-mono">
          {canvasWidth} × {canvasHeight} px
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-300 font-mono w-14 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.1))}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={fitToContainer}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors ml-1"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        <div
          className="relative cursor-pointer"
          onClick={handleCanvasClick}
          style={{ width: displayWidth, height: displayHeight }}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #2a2a3e 25%, transparent 25%), linear-gradient(-45deg, #2a2a3e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a3e 75%), linear-gradient(-45deg, transparent 75%, #2a2a3e 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            }}
          />
          <canvas
            ref={canvasRef}
            className="relative z-10 shadow-2xl"
            style={{
              width: displayWidth,
              height: displayHeight,
              imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
            }}
          />
          {frames.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/80 rounded">
              <div className="text-6xl mb-4">🎬</div>
              <p className="text-slate-400 text-lg">点击上方导入按钮开始</p>
              <p className="text-slate-500 text-sm mt-2">支持 GIF / 视频 / 图片序列</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
