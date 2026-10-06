import { expect, type Page } from '@playwright/test';

/** UI-only adapter. The private fixture owns identity and persistence setup. */
export class ProductPage {
  constructor(private readonly page: Page) {}

  async openChat(): Promise<void> {
    const direct = this.page.getByRole('button', { name: 'Chat with Luna', exact: true });
    if (await direct.isVisible()) await direct.click();
    else await this.page.getByRole('button', { name: 'Start a conversation' }).click();
    await expect(this.page.getByRole('heading', { name: 'Talk with Luna.' })).toBeVisible();
  }

  async sendFictionalMessage(message: string): Promise<void> {
    await this.page.getByRole('checkbox', { name: 'I allow this new chat to be processed by OpenAI.' }).check();
    await this.page.getByRole('textbox', { name: 'Message Luna' }).fill(message);
    await this.page.getByRole('button', { name: 'Send to Luna ↗' }).click();
  }

  async prepareFictionalDraft(words: string): Promise<void> {
    await this.sendFictionalMessage(words);
    const prepare = this.page.getByRole('button', { name: 'Prepare editable draft from my words' });
    await expect(prepare).toBeEnabled();
    await prepare.click();
    await expect(this.page.getByRole('textbox', { name: 'Story title' })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Story text' })).toBeVisible();
  }

  async discardDraft(): Promise<void> {
    await this.page.getByRole('button', { name: 'Discard draft' }).click();
    await expect(this.page.getByRole('textbox', { name: 'Story title' })).toBeHidden();
  }
}
