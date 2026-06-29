import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewportHeight } from './use-viewport-height';

type Listeners = Record<string, Array<() => void>>;

function makeVisualViewport(height: number, offsetTop = 0) {
  const listeners: Listeners = {};
  return {
    height,
    offsetTop,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ||= []).push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== cb);
    }),
    emit(type: string) {
      (listeners[type] || []).forEach((f) => f());
    },
  };
}

function setVisualViewport(vv: unknown) {
  Object.defineProperty(window, 'visualViewport', {
    value: vv,
    configurable: true,
  });
}

let rafCb: (() => void) | null = null;

beforeEach(() => {
  rafCb = null;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  setVisualViewport(undefined);
  document.documentElement.style.removeProperty('--app-height');
  document.documentElement.style.removeProperty('--app-offset');
});

function flushFrame() {
  const cb = rafCb;
  rafCb = null;
  cb?.();
}

describe('useViewportHeight', () => {
  it('sets --app-height from the visual viewport on mount', () => {
    setVisualViewport(makeVisualViewport(500));
    renderHook(() => useViewportHeight());
    expect(
      document.documentElement.style.getPropertyValue('--app-height'),
    ).toBe('500px');
  });

  it('updates --app-height when the visual viewport resizes', () => {
    const vv = makeVisualViewport(500);
    setVisualViewport(vv);
    renderHook(() => useViewportHeight());

    vv.height = 300;
    vv.emit('resize');
    flushFrame();

    expect(
      document.documentElement.style.getPropertyValue('--app-height'),
    ).toBe('300px');
  });

  it('sets --app-height to the viewport height and --app-offset to offsetTop', () => {
    setVisualViewport(makeVisualViewport(400, 60));
    renderHook(() => useViewportHeight());
    expect(
      document.documentElement.style.getPropertyValue('--app-height'),
    ).toBe('400px');
    expect(
      document.documentElement.style.getPropertyValue('--app-offset'),
    ).toBe('60px');
  });

  it('clamps --app-height to the band below the offset (no mid-animation overshoot)', () => {
    // iOS transient: offset has jumped but height has not shrunk yet.
    vi.stubGlobal('innerHeight', 500);
    setVisualViewport(makeVisualViewport(500, 80));
    renderHook(() => useViewportHeight());
    expect(
      document.documentElement.style.getPropertyValue('--app-height'),
    ).toBe('420px');
    expect(
      document.documentElement.style.getPropertyValue('--app-offset'),
    ).toBe('80px');
  });

  it('removes its listeners on unmount', () => {
    const vv = makeVisualViewport(500);
    setVisualViewport(vv);
    const { unmount } = renderHook(() => useViewportHeight());
    unmount();
    expect(vv.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
    expect(vv.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    );
  });

  it('no-ops without throwing when visualViewport is unsupported', () => {
    setVisualViewport(undefined);
    expect(() => renderHook(() => useViewportHeight())).not.toThrow();
    expect(
      document.documentElement.style.getPropertyValue('--app-height'),
    ).toBe('');
  });
});
