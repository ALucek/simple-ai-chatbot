import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the app title', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: 'simple-ai-chatbot' }),
    ).toBeInTheDocument();
  });
});