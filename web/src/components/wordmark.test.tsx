import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wordmark } from './wordmark';

describe('Wordmark', () => {
  it('renders the labelled ascii art with a fluid font size', () => {
    render(<Wordmark />);
    const pre = screen.getByLabelText('Adam Łucek');
    expect(pre.tagName).toBe('PRE');
    expect(pre.className).toContain('text-[clamp(7px,2.5vw,17px)]');
  });
});
