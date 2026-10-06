import { test as base, expect } from '@playwright/test';
import { ReferenceClient } from '../api/reference-client';
import { ReferencePage } from '../ui/reference-page';

type Fixtures = { reference: ReferenceClient; referencePage: ReferencePage };

export const test = base.extend<Fixtures>({
  reference: async ({ request }, use) => {
    const reference = new ReferenceClient(request);
    await reference.reset();
    await use(reference);
  },
  referencePage: async ({ page }, use) => {
    await use(new ReferencePage(page));
  },
});

export { expect };
