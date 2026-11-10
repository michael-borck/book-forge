import { SwarmUIImageProvider } from './SwarmUIImageProvider';

function jsonResponse(body: unknown): Response {
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

describe('SwarmUIImageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('opens a session, generates, then downloads the image', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/API/GetNewSession')) return jsonResponse({ session_id: 'sess-1' });
      if (url.endsWith('/API/GenerateText2Image')) return jsonResponse({ images: ['out.png'] });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      } as unknown as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new SwarmUIImageProvider();
    await provider.initialize({ baseUrl: 'https://swarm.example.org/' });
    const buffer = await provider.generate('a harbour', { size: '1024x576' });

    expect(buffer.byteLength).toBe(3);
    const generateCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(generateCall[0]).toBe('https://swarm.example.org/API/GenerateText2Image');
    const body = JSON.parse(generateCall[1].body as string);
    expect(body).toMatchObject({ session_id: 'sess-1', width: 1024, height: 576 });
    expect(fetchMock.mock.calls[2][0]).toBe('https://swarm.example.org/out.png');
  });

  it('requires a base URL', async () => {
    const provider = new SwarmUIImageProvider();
    await expect(provider.initialize({})).rejects.toThrow('base URL');
  });
});
