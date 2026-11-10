import { GeminiImageProvider } from './GeminiImageProvider';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

describe('GeminiImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('calls Imagen :predict and decodes the base64 prediction', async () => {
    const fetchMock = jest.fn(async () =>
      response({ predictions: [{ bytesBase64Encoded: PNG_BASE64 }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new GeminiImageProvider();
    await provider.initialize({ apiKey: 'google-key' });
    const buffer = await provider.generate('a harbour', { size: '4:3' });

    expect(buffer.subarray(1, 4).toString()).toBe('PNG');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('imagen-4.0-fast-generate-001:predict');
    expect((call[1].headers as Record<string, string>)['x-goog-api-key']).toBe('google-key');
    const body = JSON.parse(call[1].body as string);
    expect(body.parameters.aspectRatio).toBe('4:3');
  });
});
