'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { drawCoverSourceToCanvas, drawLiquidGlassPill } from './liquidGlassRender';
import './liquid-glass-pill.css';

type SourceElement = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

type LiquidGlassPillProps = {
  sourceRef: RefObject<SourceElement | null>;
  sceneRef: RefObject<HTMLElement | null>;
  className?: string;
  labels?: {
    left?: string;
    middle?: string;
    brand?: string;
  };
  width?: number | string;
  height?: number | string;
  maxDpr?: number;
  reduceTextOnHover?: boolean;
};

export function LiquidGlassPill({
  sourceRef,
  sceneRef,
  className = '',
  labels = { left: 'made', middle: 'by', brand: 'Tykra' },
  width = 'min(90vw, 900px)',
  height = 'calc(min(90vw, 900px) / 5)',
  maxDpr = 1.6,
  reduceTextOnHover = true,
}: LiquidGlassPillProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneBufferRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef(0);
  const hoverTargetRef = useRef(0);
  const [hover, setHover] = useState(0);

  if (!sceneBufferRef.current && typeof document !== 'undefined') {
    sceneBufferRef.current = document.createElement('canvas');
  }

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = (now: number) => {
      if (!alive) return;

      const root = rootRef.current;
      const canvas = canvasRef.current;
      const source = sourceRef.current;
      const scene = sceneRef.current;
      const sceneBuffer = sceneBufferRef.current;

      if (root && canvas && source && scene && sceneBuffer) {
        const rootRect = root.getBoundingClientRect();
        const sceneRect = scene.getBoundingClientRect();

        if (rootRect.width > 0 && rootRect.height > 0 && sceneRect.width > 0 && sceneRect.height > 0) {
          try {
            drawCoverSourceToCanvas(source, sceneBuffer, sceneRect.width, sceneRect.height);
            const target = hoverTargetRef.current;
            hoverRef.current += (target - hoverRef.current) * (reducedMotion ? 1 : 0.13);
            setHover(hoverRef.current);

            drawLiquidGlassPill({
              canvas,
              sourceCanvas: sceneBuffer,
              pillX: rootRect.left - sceneRect.left,
              pillY: rootRect.top - sceneRect.top,
              width: rootRect.width,
              height: rootRect.height,
              options: {
                time: now / 1000,
                hover: hoverRef.current,
                maxDpr,
              },
            });
          } catch (error) {
            // Most common cause: remote image/video without CORS, which taints canvas.
            // Keep the DOM content usable even if the refractive render cannot read pixels.
            console.warn('[LiquidGlassPill] render skipped:', error);
          }
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [sourceRef, sceneRef, maxDpr]);

  return (
    <div
      ref={rootRef}
      className={`liquidGlassPill ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ['--hover' as string]: hover,
      }}
      onPointerEnter={() => {
        hoverTargetRef.current = 1;
      }}
      onPointerLeave={() => {
        hoverTargetRef.current = 0;
      }}
    >
      <canvas ref={canvasRef} className="liquidGlassPill__canvas" aria-hidden="true" />
      <div className={`liquidGlassPill__content ${reduceTextOnHover ? 'liquidGlassPill__content--hoverBlur' : ''}`}>
        <span>{labels.left}</span>
        <span>{labels.middle}</span>
        <strong>{labels.brand}</strong>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
