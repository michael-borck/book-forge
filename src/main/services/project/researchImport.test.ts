import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { extractDocumentText } from './researchImport';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'bookforge-research-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('extractDocumentText', () => {
  it('reads Markdown and text files', async () => {
    const file = path.join(root, 'notes.md');
    await fs.writeFile(file, '# Notes\n\nHarbour history.\n');
    await expect(extractDocumentText(file)).resolves.toContain('Harbour history.');
  });

  it('rejects unsupported extensions', async () => {
    const file = path.join(root, 'image.png');
    await fs.writeFile(file, 'not a document');
    await expect(extractDocumentText(file)).rejects.toThrow('Unsupported document type');
  });

  it('rejects empty documents', async () => {
    const file = path.join(root, 'empty.txt');
    await fs.writeFile(file, '   \n');
    await expect(extractDocumentText(file)).rejects.toThrow('no extractable text');
  });
});
