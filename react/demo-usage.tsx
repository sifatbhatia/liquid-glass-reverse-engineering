'use client';

import { useRef } from 'react';
import { LiquidGlassPill } from './LiquidGlassPill';
import './liquid-glass-pill.css';

export default function LiquidGlassDemo() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  return (
    <main ref={sceneRef} style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden', background: '#111' }}>
      <img
        ref={imageRef}
        src="/demo/background.jpg"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      <div style={{ position: 'absolute', left: '50%', top: '48%', transform: 'translate(-50%, -50%)' }}>
        <LiquidGlassPill sourceRef={imageRef} sceneRef={sceneRef} width="min(90vw, 900px)" height="calc(min(90vw, 900px) / 5)" />
      </div>
    </main>
  );
}
