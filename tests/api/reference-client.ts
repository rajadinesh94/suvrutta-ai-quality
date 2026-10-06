import { expect, type APIRequestContext } from '@playwright/test';

export type FixtureActor = 'mira' | 'noor';
export type ReferenceTool = 'capture' | 'save' | 'retrieve' | 'consent' | 'delete';
export type Fault = 'none' | 'before' | 'after' | 'timeout';
export type ActionResult = {
  status: number;
  code?: string;
  draft?: string;
  clarification?: string | null;
  storyId?: string;
  saved?: boolean;
  duplicate?: boolean;
  deleted?: boolean;
  consent?: boolean;
  answer?: string;
  sources?: Array<{ id: string; text: string }>;
};

/** Actor is only a synthetic fixture label; this client makes no authentication claim. */
export class ReferenceClient {
  constructor(private readonly request: APIRequestContext) {}

  async reset(): Promise<void> {
    const response = await this.request.post('/api/reset');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ reset: true });
  }

  async action(actor: FixtureActor, tool: ReferenceTool, args: Record<string, unknown>, fault: Fault = 'none'): Promise<ActionResult> {
    const response = await this.request.post('/api/action', { data: { actor, tool, args, fault } });
    const body: unknown = await response.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');
    const result = body as ActionResult;
    expect(result.status).toBe(response.status());
    return result;
  }
}
