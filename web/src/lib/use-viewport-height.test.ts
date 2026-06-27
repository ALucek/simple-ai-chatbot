import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewportHeight } from './use-viewport-height';

type Listeners = Record<string, Array<() => void>>;

function makeVisualViewport(height: number) {
  const listeners: Listeners = {};
  return {
    height,
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
