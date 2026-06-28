import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FAKE_GSI = readFileSync(path.join(__dirname, 'fake-gsi.js'), 'utf8');

test('sign in with Google, send a message, stream a reply, persist on reload', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@gmail.com`;
  const message = 'Tell me a joke about cats please';

  // Serve the fake GSI script in place of Google's, and pick this run's email.
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_GSI }),
  );
  await page.addInitScript((e) => {
    (window as unknown as { __E2E_EMAIL__: string }).__E2E_EMAIL__ = e;
  }, email);

  // Real login flow: button → callback → loginWithGoogle → /api/google → session.
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page).toHaveURL('/');

  // Create a conversation.
  await page.getByRole('button', { name: 'New conversation' }).click();
  await expect(page).toHaveURL(/\/c\/\d+$/);

  // Send a message; the stubbed reply streams in.
  await page.getByPlaceholder('Send a message…').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Hello from the stub.')).toBeVisible();

  // The first message names the conversation (first five words) in the sidebar.
  await expect(
    page.getByRole('link', { name: 'Tell me a joke about' }),
  ).toBeVisible();

  // Reload — the persisted history (real DB) is still there.
  await page.reload();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText('Hello from the stub.')).toBeVisible();
});
