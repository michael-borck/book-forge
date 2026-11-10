import { OpenAIImageProvider } from './OpenAIImageProvider';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

describe('OpenAIImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('posts an image request and decodes b64_json', async () => {
    const fetchMock = jest.fn(async () =>
      response({ data: [{ b64_json: PNG_BASE64 }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OpenAIImageProvider();
    await provider.initialize({ apiKey: 'secret' });
    const buffer = await provider.generate('a lighthouse', { size: '1024x1024' });

    expect(buffer.subarray(1, 4).toString()).toBe('PNG');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'a lighthouse',
      size: '1024x1024',
    });
    expect(body.response_format).toBeUndefined();
  });

  it('requests b64_json for dall-e models', async () => {
    const fetchMock = jest.fn(async () =>
      response({ data: [{ b64_json: PNG_BASE64 }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OpenAIImageProvider();
    await provider.initialize({ apiKey: 'secret' });
    await provider.generate('prompt', { model: 'dall-e-3' });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.response_format).toBe('b64_json');
  });

  it('rejects a configuration without an API key', async () => {
    const provider = new OpenAIImageProvider();
    await expect(provider.initialize({})).rejects.toThrow('API key');
  });
});
