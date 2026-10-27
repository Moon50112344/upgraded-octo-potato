/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AndroidVMInfo } from '../server/vmService';
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Expand,
  Hand,
  Layers,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  MousePointer,
  Move,
  Play,
  Power,
  RotateCw,
  Sliders,
  Sparkles,
  Wifi,
  WifiOff,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface DeviceScreenProps {
  vm: AndroidVMInfo | null;
  onSendInput: (input: {
    type: 'touch' | 'swipe' | 'key' | 'text' | 'longpress' | 'pinch_in' | 'pinch_out' | 'two_finger_scroll' | 'two_finger_tap' | 'three_finger_swipe_down' | 'three_finger_swipe_up' | 'three_finger_tap' | 'quick_settings' | 'notification_shade';
    x?: number;
    y?: number;
    viewWidth?: number;
    viewHeight?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    durationMs?: number;
    action?: string;
    text?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
  }) => Promise<any>;
  onStartVM: (id: string) => Promise<any>;
}

type FingerMode = '1-finger' | '2-finger' | '3-finger';

interface TouchPoint {
  id: number;
  x: number;
  y: number;
  label: string;
  color: string;
}

export const DeviceScreen: React.FC<DeviceScreenProps> = ({ vm, onSendInput, onStartVM }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [frameSrc, setFrameSrc] = useState<string>('');
  const [fps, setFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Multi-finger mode
  const [fingerMode, setFingerMode] = useState<FingerMode>('1-finger');
  const [activeTouches, setActiveTouches] = useState<TouchPoint[]>([]);
  const [gestureNotice, setGestureNotice] = useState<string | null>(null);

  // Gesture tracking state
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDistanceStartRef = useRef<number | null>(null);

  const showGestureNotice = (text: string) => {
    setGestureNotice(text);
    setTimeout(() => {
      setGestureNotice(prev => (prev === text ? null : prev));
    }, 2500);
  };

  // Active streaming loop
  useEffect(() => {
    if (!vm || vm.status === 'stopped') {
      setFrameSrc('');
      setFps(0);
      return;
    }

    let isMounted = true;
    let frameCount = 0;
    let lastFpsTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchNextFrame = () => {
      if (!isMounted) return;

      const startTime = Date.now();
      const nextImg = new Image();
      const targetUrl = `/api/vms/${vm.id}/screen?t=${Date.now()}`;

      nextImg.onload = () => {
        if (!isMounted) return;
        setFrameSrc(targetUrl);
        setStreamError(null);
        frameCount++;

        const now = Date.now();
        setLatencyMs(now - startTime);

        if (now - lastFpsTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastFpsTime = now;
        }

        // Schedule next frame rapidly
        timeoutId = setTimeout(fetchNextFrame, 120);
      };

      nextImg.onerror = () => {
        if (!isMounted) return;
        timeoutId = setTimeout(fetchNextFrame, 500);
      };

      nextImg.src = targetUrl;
    };

    fetchNextFrame();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [vm?.id, vm?.status]);

  // Display multiple visual touch points
  const spawnVisualRipples = (baseX: number, baseY: number, mode: FingerMode) => {
    const list: TouchPoint[] = [];
    if (mode === '1-finger') {
      list.push({ id: 1, x: baseX, y: baseY, label: 'Ngón 1', color: '#2f8bff' });
    } else if (mode === '2-finger') {
      list.push({ id: 1, x: Math.max(15, baseX - 40), y: baseY, label: 'Ngón 1', color: '#06b6d4' });
      list.push({ id: 2, x: baseX + 40, y: baseY, label: 'Ngón 2', color: '#38bdf8' });
    } else if (mode === '3-finger') {
      list.push({ id: 1, x: Math.max(15, baseX - 65), y: baseY, label: 'Ngón 1', color: '#10b981' });
      list.push({ id: 2, x: baseX, y: baseY, label: 'Ngón 2', color: '#34d399' });
      list.push({ id: 3, x: baseX + 65, y: baseY, label: 'Ngón 3', color: '#6ee7b7' });
    }
    setActiveTouches(list);
    setTimeout(() => {
      setActiveTouches([]);
    }, 600);
  };

  // Pointer interactions (Mouse & Pen)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    dragStartRef.current = {
      x: clickX,
      y: clickY,
      time: Date.now(),
    };

    spawnVisualRipples(clickX, clickY, fingerMode);
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageRef.current || !dragStartRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const startX = dragStartRef.current.x;
    const startY = dragStartRef.current.y;
    const duration = Math.min(1500, Date.now() - dragStartRef.current.time);
    dragStartRef.current = null;

    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (fingerMode === '1-finger') {
      // 1-FINGER: Tap, Long-Press, or Swipe
      if (duration >= 500 && absDeltaX < 20 && absDeltaY < 20) {
        showGestureNotice('👆⏱️ Nhấn giữ 1 ngón (Long Press)');
        await onSendInput({
          type: 'longpress',
          x: endX,
          y: endY,
          durationMs: 1000,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else if (absDeltaX > 25 || absDeltaY > 25) {
        showGestureNotice('👆 Vuốt 1 ngón (Swipe / Drag)');
        await onSendInput({
          type: 'swipe',
          x1: startX,
          y1: startY,
          x2: endX,
          y2: endY,
          durationMs: duration,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else {
        showGestureNotice('👆 Chạm 1 ngón (Single Tap)');
        await onSendInput({
          type: 'touch',
          x: endX,
          y: endY,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      }
    } else if (fingerMode === '2-finger') {
      // 2-FINGERS: Dual Scroll, Pinch, or 2-Finger Tap
      if (absDeltaY > 30 && absDeltaY > absDeltaX) {
        const dir = deltaY < 0 ? 'up' : 'down';
        showGestureNotice(`✌️ Cuộn 2 ngón ${dir === 'up' ? 'lên trên' : 'xuống dưới'}`);
        await onSendInput({
          type: 'two_finger_scroll',
          direction: dir,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else if (absDeltaX > 30) {
        const dir = deltaX < 0 ? 'left' : 'right';
        showGestureNotice(`✌️ Cuộn 2 ngón sang ${dir === 'left' ? 'trái' : 'phải'}`);
        await onSendInput({
          type: 'two_finger_scroll',
          direction: dir,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else {
        showGestureNotice('✌️ Chạm 2 ngón đồng thời (Dual Tap)');
        await onSendInput({
          type: 'two_finger_tap',
          x: endX,
          y: endY,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      }
    } else if (fingerMode === '3-finger') {
      // 3-FINGERS: Screenshot, App Switch, or 3-Finger Tap
      if (deltaY > 35) {
        showGestureNotice('📸 Vuốt 3 ngón xuống: Chụp ảnh màn hình Android');
        await onSendInput({
          type: 'three_finger_swipe_down',
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else if (deltaY < -35) {
        showGestureNotice('🔄 Vuốt 3 ngón lên: Mở danh sách đa nhiệm (Recents)');
        await onSendInput({
          type: 'three_finger_swipe_up',
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      } else {
        showGestureNotice('🖐️ Chạm 3 ngón (Triple Tap)');
        await onSendInput({
          type: 'three_finger_tap',
          x: endX,
          y: endY,
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      }
    }
  };

  // Mouse wheel: maps to 2-finger scroll
  const handleWheel = async (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) < 15) return;
    const dir = e.deltaY > 0 ? 'down' : 'up';
    showGestureNotice(`✌️ Cuộn trang ${dir === 'up' ? 'lên' : 'xuống'} (Mouse Wheel)`);
    await onSendInput({
      type: 'two_finger_scroll',
      direction: dir,
    });
  };

  // Real Multi-Touch events for touchscreens / tablets
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const count = e.touches.length;

    const list: TouchPoint[] = [];
    for (let i = 0; i < count; i++) {
      const t = e.touches[i];
      list.push({
        id: i + 1,
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
        label: `Ngón ${i + 1}`,
        color: i === 0 ? '#2f8bff' : i === 1 ? '#06b6d4' : '#10b981',
      });
    }
    setActiveTouches(list);

    if (count === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceStartRef.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();

    if (touchDistanceStartRef.current && e.changedTouches.length >= 1) {
      const initialDist = touchDistanceStartRef.current;
      touchDistanceStartRef.current = null;

      // Check if pinch out or pinch in
      if (initialDist > 80) {
        showGestureNotice('🔍 Cử chỉ 2 ngón: Thu phóng (Pinch Zoom)');
        await onSendInput({
          type: 'pinch_in',
          viewWidth: rect.width,
          viewHeight: rect.height,
        });
      }
    }
  };

  // Gesture Quick Trigger Handlers
  const handleQuickGesture = async (type: any, extra?: any) => {
    if (!vm || vm.status === 'stopped') return;
    let label = '';
    if (type === 'pinch_out') label = '🔎 Phóng to 2 ngón (Pinch Out / Zoom In)';
    else if (type === 'pinch_in') label = '🔍 Thu nhỏ 2 ngón (Pinch In / Zoom Out)';
    else if (type === 'two_finger_scroll') label = `✌️ Cuộn 2 ngón (${extra?.direction || 'down'})`;
    else if (type === 'two_finger_tap') label = '✌️ Chạm 2 ngón đồng thời (Dual Tap)';
    else if (type === 'three_finger_swipe_down') label = '📸 Vuốt 3 ngón: Chụp ảnh màn hình Android';
    else if (type === 'three_finger_swipe_up') label = '🔄 Vuốt 3 ngón: Mở danh sách đa nhiệm (Recents)';
    else if (type === 'quick_settings') label = '🎛️ Vuốt 2 ngón từ trên: Cài đặt nhanh';
    else if (type === 'notification_shade') label = '📜 Kéo thanh thông báo (Notifications)';
    else if (type === 'longpress') label = '👆⏱️ Nhấn giữ 1 ngón (Long Press 1000ms)';

    showGestureNotice(label);
    await onSendInput({ type, ...extra });
  };

  const handleStart = async () => {
    if (!vm) return;
    try {
      setIsStarting(true);
      await onStartVM(vm.id);
    } finally {
      setIsStarting(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (!vm) {
    return (
      <div className="flex-1 min-h-[460px] flex flex-col items-center justify-center p-8 text-center bg-[#0d1424] rounded-xl border border-[#1b263b]">
        <div className="w-16 h-16 rounded-2xl bg-[#131d33] border border-[#233152] flex items-center justify-center mb-4 text-[#2f8bff]">
          <Activity className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No Android VM Selected</h3>
        <p className="text-sm text-slate-400 max-w-sm">
          Select an active virtual machine from the fleet list or create a new Android instance to start live streaming.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-[#0d1424] rounded-xl border border-[#1b263b] overflow-hidden shadow-2xl ${
        isFullscreen ? 'p-0 w-full h-full' : ''
      }`}
    >
      {/* Top Stream Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#090e1a] border-b border-[#1b263b] text-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-200">{vm.name}</span>
          <span className="text-slate-500">•</span>
          {vm.status === 'running' ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE STREAM
            </span>
          ) : vm.status === 'booting' ? (
            <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              {vm.statusMessage || 'BOOTING OS'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              STOPPED
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          {vm.status !== 'stopped' && (
            <>
              <span className="font-mono text-[11px] bg-[#111a2e] px-2 py-0.5 rounded border border-[#1e2a47]">
                {fps} FPS
              </span>
              <span className="font-mono text-[11px] bg-[#111a2e] px-2 py-0.5 rounded border border-[#1e2a47]">
                {latencyMs}ms
              </span>
              <span className="hidden sm:inline font-mono text-[11px] text-slate-500">
                1024×768 Native
              </span>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-1 hover:text-white rounded hover:bg-[#1a2642] transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Multi-Finger Interaction Mode Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-[#0c1322] border-b border-[#1b263b] text-xs gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Hand className="w-3.5 h-3.5 text-[#2f8bff]" />
            Chế độ tương tác:
          </span>
          <button
            onClick={() => setFingerMode('1-finger')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              fingerMode === '1-finger'
                ? 'bg-[#2f8bff] text-white shadow-xs shadow-[#2f8bff]/40'
                : 'bg-[#141f36] text-slate-300 hover:bg-[#1c2c4d]'
            }`}
          >
            <span>👆 1 Ngón</span>
            <span className="text-[10px] opacity-75 hidden sm:inline">(Chạm / Kéo / Nhấn giữ)</span>
          </button>
          <button
            onClick={() => setFingerMode('2-finger')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              fingerMode === '2-finger'
                ? 'bg-[#06b6d4] text-white shadow-xs shadow-[#06b6d4]/40'
                : 'bg-[#141f36] text-slate-300 hover:bg-[#1c2c4d]'
            }`}
          >
            <span>✌️ 2 Ngón</span>
            <span className="text-[10px] opacity-75 hidden sm:inline">(Thu phóng / Cuộn)</span>
          </button>
          <button
            onClick={() => setFingerMode('3-finger')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              fingerMode === '3-finger'
                ? 'bg-[#10b981] text-white shadow-xs shadow-[#10b981]/40'
                : 'bg-[#141f36] text-slate-300 hover:bg-[#1c2c4d]'
            }`}
          >
            <span>🖐️ 3 Ngón</span>
            <span className="text-[10px] opacity-75 hidden sm:inline">(Chụp màn hình / Đa nhiệm)</span>
          </button>
        </div>

        {/* Quick Gesture Action Pills for Selected Mode */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {fingerMode === '1-finger' && (
            <>
              <button
                onClick={() => handleQuickGesture('touch', { x: 400, y: 300 })}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Chạm vào giữa màn hình"
              >
                <span>👆 Chạm giữa</span>
              </button>
              <button
                onClick={() => handleQuickGesture('longpress', { x: 400, y: 300, durationMs: 1000 })}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Nhấn giữ 1 giây (Menu ngữ cảnh)"
              >
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Nhấn giữ 1s</span>
              </button>
              <button
                onClick={() => handleQuickGesture('notification_shade')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Kéo thanh thông báo từ trên xuống"
              >
                <ChevronDown className="w-3 h-3 text-[#2f8bff]" />
                <span>Kéo Thông báo</span>
              </button>
            </>
          )}

          {fingerMode === '2-finger' && (
            <>
              <button
                onClick={() => handleQuickGesture('pinch_out')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Phóng to 2 ngón (Pinch Out)"
              >
                <ZoomIn className="w-3 h-3 text-cyan-400" />
                <span>Phóng to</span>
              </button>
              <button
                onClick={() => handleQuickGesture('pinch_in')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Thu nhỏ 2 ngón (Pinch In)"
              >
                <ZoomOut className="w-3 h-3 text-cyan-400" />
                <span>Thu nhỏ</span>
              </button>
              <button
                onClick={() => handleQuickGesture('two_finger_scroll', { direction: 'down' })}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Cuộn trang xuống"
              >
                <ChevronDown className="w-3 h-3 text-slate-400" />
                <span>Cuộn xuống</span>
              </button>
              <button
                onClick={() => handleQuickGesture('two_finger_scroll', { direction: 'up' })}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Cuộn trang lên"
              >
                <ChevronUp className="w-3 h-3 text-slate-400" />
                <span>Cuộn lên</span>
              </button>
              <button
                onClick={() => handleQuickGesture('quick_settings')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Kéo 2 ngón từ trên xuống để mở Cài đặt nhanh"
              >
                <Sliders className="w-3 h-3 text-cyan-400" />
                <span>Cài đặt nhanh</span>
              </button>
            </>
          )}

          {fingerMode === '3-finger' && (
            <>
              <button
                onClick={() => handleQuickGesture('three_finger_swipe_down')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Chụp ảnh màn hình bằng vuốt 3 ngón"
              >
                <Camera className="w-3 h-3 text-emerald-400" />
                <span>Chụp màn hình (3 ngón)</span>
              </button>
              <button
                onClick={() => handleQuickGesture('three_finger_swipe_up')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Vuốt 3 ngón lên để xem các ứng dụng đang chạy"
              >
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>Đa nhiệm (Recents)</span>
              </button>
              <button
                onClick={() => handleQuickGesture('three_finger_tap')}
                className="px-2 py-0.5 rounded bg-[#17233d] hover:bg-[#203154] text-slate-300 hover:text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Chạm 3 ngón đồng thời"
              >
                <span>🖐️ Chạm 3 ngón</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Interactive Display Viewport */}
      <div
        className="relative flex-1 min-h-[460px] bg-black flex items-center justify-center select-none overflow-hidden cursor-crosshair"
        onWheel={handleWheel}
      >
        {/* Real Live Frame Image */}
        {frameSrc && vm.status !== 'stopped' ? (
          <div
            className="relative w-full h-full flex items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              ref={imageRef}
              src={frameSrc}
              alt="Live Android Screen"
              className="max-w-full max-h-[580px] w-auto h-auto object-contain pointer-events-auto shadow-2xl"
              draggable={false}
            />

            {/* Visual Multi-Touch Feedback Ripples */}
            {activeTouches.map(touch => (
              <div
                key={touch.id}
                className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: touch.x, top: touch.y }}
              >
                <div
                  className="w-10 h-10 rounded-full border-2 animate-ping"
                  style={{ borderColor: touch.color, backgroundColor: `${touch.color}33` }}
                />
                <span
                  className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-black/75 shadow-xs"
                  style={{ color: touch.color }}
                >
                  {touch.label}
                </span>
              </div>
            ))}

            {/* Gesture Toast Notice */}
            {gestureNotice && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 pointer-events-none z-30 bg-[#0d1424]/95 border border-[#2f8bff]/50 text-white text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-md animate-fade-in">
                <Sparkles className="w-3.5 h-3.5 text-[#2f8bff]" />
                <span>{gestureNotice}</span>
              </div>
            )}
          </div>
        ) : !frameSrc && vm.status !== 'stopped' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-[#070b14]">
            <Loader2 className="w-9 h-9 text-[#2f8bff] animate-spin mb-3" />
            <h4 className="text-sm font-semibold text-slate-200">Initializing Hardware Display</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              {vm.statusMessage || 'Capturing live QEMU VESA framebuffer...'}
            </p>
          </div>
        ) : null}

        {/* Stopped State Overlay */}
        {vm.status === 'stopped' && (
          <div className="absolute inset-0 bg-[#070b14]/95 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-16 h-16 rounded-2xl bg-[#0d1424] border border-[#1b263b] flex items-center justify-center mb-4 text-slate-500 shadow-inner">
              <Power className="w-8 h-8" />
            </div>
            <h4 className="text-base font-semibold text-white mb-1">Virtual Machine Offline</h4>
            <p className="text-xs text-slate-400 max-w-xs mb-5">
              The virtual machine process is currently terminated to preserve container resources.
            </p>
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2f8bff] hover:bg-[#2575dc] text-white font-medium text-xs shadow-lg shadow-[#2f8bff]/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Powering On...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Power On Android VM</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Stream Hint Footer */}
        <div className="absolute bottom-2 left-2 pointer-events-none bg-black/60 backdrop-blur-xs text-[10px] text-slate-400 px-2 py-0.5 rounded border border-white/5 flex items-center gap-2">
          <span>
            {fingerMode === '1-finger' && '👆 1 Ngón: Chạm để tap, kéo để vuốt, giữ chuột 0.5s để nhấn giữ'}
            {fingerMode === '2-finger' && '✌️ 2 Ngón: Kéo để cuộn, lăn chuột để cuộn nhanh, chạm để chạm kép'}
            {fingerMode === '3-finger' && '🖐️ 3 Ngón: Kéo xuống để chụp màn hình, kéo lên để mở đa nhiệm'}
          </span>
        </div>
      </div>
    </div>
  );
};
