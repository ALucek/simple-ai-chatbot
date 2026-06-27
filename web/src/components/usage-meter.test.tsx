import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageMeter } from './usage-meter';
import { useUsage } from '@/lib/usage-context';

vi.mock('@/lib/usage-context');

function mockUsage(used: number | null, budget: number | null) {
  vi.mocked(useUsage).mockReturnValue({ used, budget, refresh: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UsageMeter', () => {
  it('renders the rounded percent', () => {
    mockUsage(3851, 8192); // 47.0%
    render(<UsageMeter />);
    expect(screen.getByText('47%')).toBeInTheDocument();
  });

  it('clamps over-budget usage to 100%', () => {
    mockUsage(9000, 8192);
    render(<UsageMeter />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('applies the warn class at exactly 90%', () => {
    mockUsage(7373, 8192); // 89.996% -> 90
    const { container } = render(<UsageMeter />);
    expect(container.querySelector('.usage-donut.warn')).not.toBeNull();
  });

  it('no warn class below 90%', () => {
    mockUsage(7290, 8192); // 88.99% -> 89
    const { container } = render(<UsageMeter />);
    expect(container.querySelector('.usage-donut.warn')).toBeNull();
  });

  it('renders nothing when usage is unavailable', () => {
    mockUsage(null, null);
    const { container } = render(<UsageMeter />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the token tooltip with commas', () => {
    mockUsage(3851, 8192);
    render(<UsageMeter />);
    expect(screen.getByTitle('3,851 / 8,192 tokens')).toBeInTheDocument();
  });
});
