import { expect, type Page } from '@playwright/test';
import type { FixtureActor } from '../api/reference-client';

export class ReferencePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByRole('heading', { name: 'Synthetic conversation reference' })).toBeVisible();
  }

  async switchActor(actor: FixtureActor): Promise<void> {
    await this.page.getByLabel('Fictional user').selectOption(actor);
  }

  async setText(value: string): Promise<void> {
    await this.page.getByLabel('Experience or question').fill(value);
  }

  async draft(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create editable draft' }).click();
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Confirm and save' }).click();
  }

  async retrieve(): Promise<void> {
    await this.page.getByRole('button', { name: 'Find my story' }).click();
  }

  async expectStatus(text: string): Promise<void> {
    await expect(this.page.getByRole('status')).toContainText(text);
  }

  async expectSource(text: string): Promise<void> {
    await expect(this.page.locator('#source')).toContainText(text);
  }
}
