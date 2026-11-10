/**
 * IPC handlers for the authoring workbench: projects, nodes, snapshots,
 * planning/writing, and compile.
 */

import { app, dialog, ipcMain, shell, IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ZodError } from 'zod';

import type { ProviderManager } from '../services/providers';
import { BookGenerator, type BookProgress } from '../services/bookGenerator';
import { bookStore } from '../services/bookStore';
import { ProjectStore } from '../services/project/projectStore';
import { SnapshotStore } from '../services/project/snapshotStore';
import { compileExtension, compileProject } from '../services/project/compileService';
import { ManuscriptEditor } from '../services/project/manuscriptEditor';
import { ContinuityChecker } from '../services/project/continuity';
import { extractDocumentText } from '../services/project/researchImport';
import { diffLines } from '../services/project/diff';
import { deleteNode, insertNode, moveNode } from '../services/project/tree';
import { imageProviderRegistry } from '../services/artwork/ImageProviderRegistry';
import { ArtPlanner } from '../services/artwork/ArtPlanner';
import { ArtworkService } from '../services/artwork/ArtworkService';
import { processImage } from '../services/artwork/imageProcessing';
import {
  readArtworkAssetAsDataUrl,
  removeArtworkAssets,
  thumbnailRelativePath,
  writeArtworkAssets,
} from '../services/artwork/artworkAssets';
import { STYLE_PRESETS } from '../services/artwork/stylePresets';
import { secureConfigStore } from '../services/secureStore';
import {
  BOOK_TEMPLATES,
  wordCount,
  type ArtworkPlacement,
  type ArtworkProgress,
  type BookNode,
  type ImageProviderConfig,
  type Project,
} from '../../shared/types';
import {
  aiEditSchema,
  artworkGenerateAllSchema,
  artworkIdSchema,
  artworkPatchSchema,
  artworkPlanSchema,
  artworkUploadSchema,
  compileBatchSchema,
  compileRunSchema,
  createNodeSchema,
  imageProviderConfigSchema,
  createProjectSchema,
  nodeIdSchema,
  nodeMoveSchema,
  nodePatchSchema,
  projectIdSchema,
  projectMetaSchema,
  providerIdSchema,
  snapshotReasonSchema,
} from './schemas';

type IpcResult<T> =
  | ({ success: true } & T)
  | { success: false; error: { code: string; message: string } };

function ok<T>(data: T): { success: true } & T {
  return { success: true, ...data };
}

function fail(code: string, message: string): IpcResult<never> {
  return { success: false, error: { code, message } };
}

function guard<A extends unknown[], R>(
  fn: (...args: A) => Promise<IpcResult<R>>
): (...args: A) => Promise<IpcResult<R>> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(
          'VALIDATION_ERROR',
          error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
        );
      }
      const code = (error as { code?: string })?.code ?? 'INTERNAL_ERROR';
      return fail(code, error instanceof Error ? error.message : String(error));
    }
  };
}

function sendProgress(event: IpcMainInvokeEvent, progress: BookProgress): void {
  if (!event.sender.isDestroyed()) event.sender.send('book:progress', progress);
}

function sendArtworkProgress(
  event: IpcMainInvokeEvent,
  progress: ArtworkProgress
): void {
  if (!event.sender.isDestroyed()) event.sender.send('artwork:progress', progress);
}

export function registerProjectHandlers(manager: ProviderManager): void {
  const projects = new ProjectStore({
    rootDir: path.join(app.getPath('userData'), 'projects'),
    trash: (target) => shell.trashItem(target),
  });
  const snapshots = new SnapshotStore(projects);
  const artworkService = new ArtworkService(imageProviderRegistry, (id) =>
    projects.directory(id)
  );
  const active = new Map<string, BookGenerator>();
  const editControllers = new Map<string, AbortController>();
  const artworkControllers = new Map<string, AbortController>();
  const cancelled = new Set<string>();

  void (async () => {
    for (const id of secureConfigStore.getConfiguredImageProviderIds()) {
      const config = secureConfigStore.getImageProviderConfig(id);
      if (!config) continue;
      try {
        await imageProviderRegistry.initialize(id, config);
      } catch (error) {
        console.warn(`Could not restore image provider "${id}":`, error);
      }
    }
    const saved = secureConfigStore.getAppValue('currentImageProvider');
    if (typeof saved === 'string' && imageProviderRegistry.get(saved)) {
      imageProviderRegistry.setCurrent(saved);
    }
  })();

  // One-time import of books created before projects existed.
  void projects
    .migrateLegacy(bookStore.list())
    .then((count) => {
      if (count > 0) console.log(`Migrated ${count} legacy book(s) into projects.`);
    })
    .catch((error) => console.warn('Legacy book migration failed:', error));

  // ===== Projects =====

  ipcMain.handle(
    'project:list',
    guard(async () => ok({ projects: await projects.list() }))
  );

  ipcMain.handle(
    'project:templates',
    guard(async () => ok({ templates: BOOK_TEMPLATES }))
  );

  ipcMain.handle(
    'project:get',
    guard(async (_event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      const project = await projects.get(id);
      if (!project) return fail('NOT_FOUND', `No project with id ${id}`);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'project:create',
    guard(async (_event, inputRaw: unknown) => {
      const input = createProjectSchema.parse(inputRaw);
      const project = await projects.create(input);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'project:updateMeta',
    guard(async (_event, idRaw: unknown, patchRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      const patch = projectMetaSchema.parse(patchRaw);
      const project = await projects.get(id);
      if (!project) return fail('NOT_FOUND', `No project with id ${id}`);

      if (patch.title !== undefined) project.title = patch.title;
      if (patch.author !== undefined) project.author = patch.author;
      if (patch.language !== undefined) project.language = patch.language;
      if (patch.genre !== undefined) project.genre = patch.genre;
      if (patch.description !== undefined) project.description = patch.description;
      if (patch.topic !== undefined) project.settings.topic = patch.topic;
      if (patch.style !== undefined) project.settings.style = patch.style;
      if (patch.length !== undefined) project.settings.length = patch.length;

      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'project:delete',
    guard(async (_event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      await projects.delete(id);
      return ok({ id });
    })
  );

  ipcMain.handle(
    'project:duplicate',
    guard(async (_event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      return ok({ project: await projects.duplicate(id) });
    })
  );

  // ===== Nodes =====

  ipcMain.handle(
    'node:create',
    guard(async (_event, projectIdRaw: unknown, inputRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const input = createNodeSchema.parse(inputRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      const now = new Date().toISOString();
      const node: BookNode = {
        id: randomUUID(),
        kind: input.kind,
        title: input.title,
        synopsis: input.synopsis ?? '',
        content: input.content ?? '',
        parentId: input.parentId ?? null,
        order: 0,
        status: input.content?.trim() ? 'completed' : 'pending',
        wordCount: wordCount(input.content ?? ''),
        tokensIn: 0,
        tokensOut: 0,
        keywords: [],
        createdAt: now,
        modifiedAt: now,
      };

      project.book.nodes = insertNode(project.book.nodes, node);
      await projects.save(project);
      return ok({ project, nodeId: node.id });
    })
  );

  ipcMain.handle(
    'node:update',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown, patchRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdSchema.parse(nodeIdRaw);
      const patch = nodePatchSchema.parse(patchRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const node = project.book.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return fail('NOT_FOUND', `No node with id ${nodeId}`);

      if (patch.title !== undefined) node.title = patch.title;
      if (patch.synopsis !== undefined) node.synopsis = patch.synopsis;
      if (patch.kind !== undefined) node.kind = patch.kind;
      if (patch.keywords !== undefined) node.keywords = patch.keywords;
      if (patch.content !== undefined) {
        node.content = patch.content;
        node.wordCount = wordCount(patch.content);
        node.status = patch.content.trim() ? 'completed' : 'pending';
      }
      node.modifiedAt = new Date().toISOString();

      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'node:move',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown, moveRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdSchema.parse(nodeIdRaw);
      const move = nodeMoveSchema.parse(moveRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      project.book.nodes = moveNode(project.book.nodes, nodeId, move.parentId, move.order);
      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'node:delete',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdSchema.parse(nodeIdRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      project.book.nodes = deleteNode(project.book.nodes, nodeId);
      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'node:aiEdit',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown, payloadRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdSchema.parse(nodeIdRaw);
      const payload = aiEditSchema.parse(payloadRaw);

      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const node = project.book.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return fail('NOT_FOUND', `No node with id ${nodeId}`);

      // Reversible by design: snapshot before every AI rewrite.
      await snapshots.create(projectId, nodeId, { reason: 'pre-ai-edit' });

      const controller = new AbortController();
      editControllers.set(projectId, controller);
      try {
        const editor = new ManuscriptEditor(manager);
        const result = await editor.edit(
          project,
          nodeId,
          payload.action,
          payload.instruction,
          controller.signal
        );

        const now = new Date().toISOString();
        node.content = result.content;
        node.wordCount = wordCount(result.content);
        node.status = 'completed';
        node.tokensIn += result.tokensIn;
        node.tokensOut += result.tokensOut;
        node.modifiedAt = now;

        project.book.tokensIn += result.tokensIn;
        project.book.tokensOut += result.tokensOut;
        project.book.totalTokens = project.book.tokensIn + project.book.tokensOut;
        project.book.modifiedAt = now;
        project.modifiedAt = now;

        await projects.save(project);
        return ok({ project });
      } finally {
        editControllers.delete(projectId);
      }
    })
  );

  ipcMain.handle(
    'research:import',
    guard(async (_event, projectIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      const choice = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['txt', 'md', 'markdown', 'pdf'] },
        ],
      });
      if (choice.canceled || !choice.filePaths[0]) {
        return ok({ project, canceled: true });
      }

      const filePath = choice.filePaths[0];
      const text = await extractDocumentText(filePath);
      const now = new Date().toISOString();
      const node: BookNode = {
        id: randomUUID(),
        kind: 'research',
        title: path.basename(filePath, path.extname(filePath)),
        synopsis: 'Imported source material',
        content: text,
        parentId: null,
        order: 0,
        status: 'completed',
        wordCount: wordCount(text),
        tokensIn: 0,
        tokensOut: 0,
        keywords: [],
        createdAt: now,
        modifiedAt: now,
      };
      project.book.nodes = insertNode(project.book.nodes, node);
      await projects.save(project);
      return ok({ project, nodeId: node.id, canceled: false });
    })
  );

  // ===== Snapshots =====

  ipcMain.handle(
    'snapshot:list',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdRaw === undefined ? undefined : nodeIdSchema.parse(nodeIdRaw);
      return ok({ snapshots: await snapshots.list(projectId, nodeId) });
    })
  );

  ipcMain.handle(
    'snapshot:create',
    guard(async (_event, projectIdRaw: unknown, nodeIdRaw: unknown, reasonRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const nodeId = nodeIdSchema.parse(nodeIdRaw);
      const reason = snapshotReasonSchema.parse(reasonRaw);
      return ok({ snapshot: await snapshots.create(projectId, nodeId, { reason }) });
    })
  );

  ipcMain.handle(
    'snapshot:restore',
    guard(async (_event, projectIdRaw: unknown, snapshotIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const snapshotId = nodeIdSchema.parse(snapshotIdRaw);
      return ok({ project: await snapshots.restore(projectId, snapshotId) });
    })
  );

  ipcMain.handle(
    'snapshot:diff',
    guard(async (_event, projectIdRaw: unknown, snapshotIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const snapshotId = nodeIdSchema.parse(snapshotIdRaw);
      const snapshot = (await snapshots.list(projectId)).find(
        (candidate) => candidate.id === snapshotId
      );
      if (!snapshot) return fail('NOT_FOUND', `No snapshot with id ${snapshotId}`);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const node = project.book.nodes.find((candidate) => candidate.id === snapshot.nodeId);
      return ok({
        snapshotId,
        nodeId: snapshot.nodeId,
        lines: diffLines(snapshot.content, node?.content ?? ''),
      });
    })
  );

  // ===== Planning / writing =====

  ipcMain.handle(
    'project:plan',
    guard(async (event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      const project = await projects.get(id);
      if (!project) return fail('NOT_FOUND', `No project with id ${id}`);

      cancelled.delete(id);
      const repo = projects.bookRepository(id);
      const generator = new BookGenerator(manager, repo);
      active.set(id, generator);
      try {
        await generator.plan(
          {
            id,
            topic: project.settings.topic || project.title,
            style: project.settings.style,
            length: project.settings.length,
            providerId: project.book.provider || undefined,
            model: project.book.model || undefined,
          },
          (progress) => sendProgress(event, progress)
        );

        const updated = repo.load();
        // Art prompts are cheap compared with images; plan them now when an
        // image provider exists so the user can review before generating.
        if (imageProviderRegistry.isConfigured()) {
          try {
            const planner = new ArtPlanner(manager);
            const art = await planner.plan(updated);
            updated.book.artworks = art.artworks;
            updated.book.artPlan = art.meta;
            updated.settings.artStylePreset = art.meta.stylePreset;
            updated.book.tokensIn += art.tokensIn;
            updated.book.tokensOut += art.tokensOut;
            updated.book.totalTokens = updated.book.tokensIn + updated.book.tokensOut;
            await projects.save(updated);
          } catch (error) {
            console.warn('Art planning after outline failed:', error);
          }
        }

        return ok({ project: updated });
      } finally {
        active.delete(id);
        cancelled.delete(id);
      }
    })
  );

  ipcMain.handle(
    'project:generate',
    guard(async (event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      const project = await projects.get(id);
      if (!project) return fail('NOT_FOUND', `No project with id ${id}`);

      cancelled.delete(id);
      const repo = projects.bookRepository(id);
      const generator = new BookGenerator(manager, repo);
      active.set(id, generator);
      try {
        await generator.retryFailed(
          id,
          (progress) => sendProgress(event, progress),
          (bookId) => cancelled.has(bookId)
        );
        return ok({ project: repo.load() as Project });
      } finally {
        active.delete(id);
        cancelled.delete(id);
      }
    })
  );

  ipcMain.handle(
    'project:cancel',
    guard(async (_event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      if (active.get(id)?.cancel(id)) cancelled.add(id);
      editControllers.get(id)?.abort();
      artworkControllers.get(id)?.abort();
      return ok({ id });
    })
  );

  // ===== Image providers =====

  ipcMain.handle(
    'imageProvider:list',
    guard(async () =>
      ok({
        providers: imageProviderRegistry.listInfo(),
        configured: secureConfigStore.listRedactedImageProviderConfigs(),
        current: imageProviderRegistry.getCurrentId(),
      })
    )
  );

  ipcMain.handle(
    'imageProvider:configure',
    guard(async (_event, idRaw: unknown, configRaw: unknown) => {
      const id = providerIdSchema.parse(idRaw);
      const incoming = imageProviderConfigSchema.parse(configRaw ?? {}) as ImageProviderConfig;
      const existing = secureConfigStore.getImageProviderConfig(id) ?? {};
      const merged: ImageProviderConfig = { ...existing, ...incoming };

      await imageProviderRegistry.initialize(id, merged);
      secureConfigStore.setImageProviderConfig(id, merged);
      if (imageProviderRegistry.getCurrentId() === id) {
        secureConfigStore.setAppValue('currentImageProvider', id);
      }
      return ok({
        providers: imageProviderRegistry.listInfo(),
        configured: secureConfigStore.listRedactedImageProviderConfigs(),
        current: imageProviderRegistry.getCurrentId(),
      });
    })
  );

  ipcMain.handle(
    'imageProvider:setCurrent',
    guard(async (_event, idRaw: unknown) => {
      const id = providerIdSchema.parse(idRaw);
      imageProviderRegistry.setCurrent(id);
      secureConfigStore.setAppValue('currentImageProvider', id);
      return ok({ current: id });
    })
  );

  ipcMain.handle(
    'imageProvider:remove',
    guard(async (_event, idRaw: unknown) => {
      const id = providerIdSchema.parse(idRaw);
      await imageProviderRegistry.remove(id);
      secureConfigStore.deleteImageProviderConfig(id);
      secureConfigStore.setAppValue(
        'currentImageProvider',
        imageProviderRegistry.getCurrentId() ?? ''
      );
      return ok({
        providers: imageProviderRegistry.listInfo(),
        configured: secureConfigStore.listRedactedImageProviderConfigs(),
        current: imageProviderRegistry.getCurrentId(),
      });
    })
  );

  ipcMain.handle(
    'imageProvider:styles',
    guard(async () =>
      ok({ styles: STYLE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })) })
    )
  );

  // ===== Artwork =====

  ipcMain.handle(
    'artwork:plan',
    guard(async (event, projectIdRaw: unknown, payloadRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const payload = artworkPlanSchema.parse(payloadRaw ?? {});
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      sendArtworkProgress(event, { projectId, status: 'planning', message: 'Planning artwork…' });
      const planner = new ArtPlanner(manager);
      const result = await planner.plan(project, payload.stylePreset);

      project.book.artworks = result.artworks;
      project.book.artPlan = result.meta;
      project.settings.artStylePreset = result.meta.stylePreset;
      project.book.tokensIn += result.tokensIn;
      project.book.tokensOut += result.tokensOut;
      project.book.totalTokens = project.book.tokensIn + project.book.tokensOut;
      project.book.modifiedAt = new Date().toISOString();
      await projects.save(project);

      sendArtworkProgress(event, { projectId, status: 'done', message: 'Art plan ready' });
      return ok({ project });
    })
  );

  ipcMain.handle(
    'artwork:update',
    guard(async (_event, projectIdRaw: unknown, artworkIdRaw: unknown, patchRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const artworkId = artworkIdSchema.parse(artworkIdRaw);
      const patch = artworkPatchSchema.parse(patchRaw ?? {});
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const artwork = project.book.artworks.find((candidate) => candidate.id === artworkId);
      if (!artwork) return fail('NOT_FOUND', `No artwork with id ${artworkId}`);

      if (patch.prompt !== undefined) artwork.prompt = patch.prompt;
      if (patch.alt !== undefined) artwork.alt = patch.alt;
      if (patch.caption !== undefined) artwork.caption = patch.caption;
      if (patch.status !== undefined) artwork.status = patch.status;
      project.book.modifiedAt = new Date().toISOString();
      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'artwork:delete',
    guard(async (_event, projectIdRaw: unknown, artworkIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const artworkId = artworkIdSchema.parse(artworkIdRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      await removeArtworkAssets(projects.directory(projectId), artworkId);
      project.book.artworks = project.book.artworks.filter(
        (candidate) => candidate.id !== artworkId
      );
      project.book.modifiedAt = new Date().toISOString();
      await projects.save(project);
      return ok({ project });
    })
  );

  ipcMain.handle(
    'artwork:generate',
    guard(async (event, projectIdRaw: unknown, artworkIdRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const artworkId = artworkIdSchema.parse(artworkIdRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const artwork = project.book.artworks.find((candidate) => candidate.id === artworkId);
      if (!artwork) return fail('NOT_FOUND', `No artwork with id ${artworkId}`);
      if (artwork.status === 'disabled') {
        return fail('ARTWORK_DISABLED', 'Artwork is disabled');
      }

      const controller = new AbortController();
      artworkControllers.set(projectId, controller);
      artwork.status = 'generating';
      artwork.error = undefined;
      await projects.save(project);
      sendArtworkProgress(event, {
        projectId,
        artworkId,
        status: 'generating',
        index: 1,
        total: 1,
      });

      try {
        const updated = await artworkService.generate(project, artworkId, controller.signal);
        sendArtworkProgress(event, {
          projectId,
          artworkId,
          status: 'ready',
          index: 1,
          total: 1,
          message: updated.alt,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          artwork.status = 'planned';
        } else {
          artwork.status = 'error';
          artwork.error = error instanceof Error ? error.message : String(error);
          sendArtworkProgress(event, {
            projectId,
            artworkId,
            status: 'error',
            index: 1,
            total: 1,
            message: artwork.error,
          });
        }
      } finally {
        artworkControllers.delete(projectId);
        await projects.save(project);
      }
      return ok({ project });
    })
  );

  ipcMain.handle(
    'artwork:generateAll',
    guard(async (event, projectIdRaw: unknown, payloadRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const options = artworkGenerateAllSchema.parse(payloadRaw ?? {});
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      const maxImages = options.maxImages ?? 12;
      const maxCostUsd = options.maxCostUsd ?? 2;
      const eligible = project.book.artworks
        .filter((artwork) => artwork.status === 'planned' || artwork.status === 'error')
        .slice(0, maxImages);

      const controller = new AbortController();
      artworkControllers.set(projectId, controller);
      let spent = 0;

      try {
        for (let index = 0; index < eligible.length; index++) {
          const target = eligible[index];
          if (controller.signal.aborted || spent >= maxCostUsd) break;
          const artwork = project.book.artworks.find((candidate) => candidate.id === target.id);
          if (!artwork) continue;

          artwork.status = 'generating';
          artwork.error = undefined;
          await projects.save(project);
          sendArtworkProgress(event, {
            projectId,
            artworkId: artwork.id,
            status: 'generating',
            index: index + 1,
            total: eligible.length,
          });

          try {
            const updated = await artworkService.generate(
              project,
              artwork.id,
              controller.signal
            );
            spent += updated.costUsd ?? 0;
            sendArtworkProgress(event, {
              projectId,
              artworkId: artwork.id,
              status: 'ready',
              index: index + 1,
              total: eligible.length,
            });
          } catch (error) {
            if (controller.signal.aborted) {
              artwork.status = 'planned';
              await projects.save(project);
              break;
            }
            artwork.status = 'error';
            artwork.error = error instanceof Error ? error.message : String(error);
            sendArtworkProgress(event, {
              projectId,
              artworkId: artwork.id,
              status: 'error',
              index: index + 1,
              total: eligible.length,
              message: artwork.error,
            });
          }
          await projects.save(project);
        }
      } finally {
        artworkControllers.delete(projectId);
        await projects.save(project);
      }

      sendArtworkProgress(event, {
        projectId,
        status: 'done',
        message: `Generated ${eligible.length} artwork item(s)`,
      });
      return ok({ project });
    })
  );

  ipcMain.handle(
    'artwork:upload',
    guard(async (_event, projectIdRaw: unknown, payloadRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const payload = artworkUploadSchema.parse(payloadRaw ?? {});
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);

      const nodeId = payload.nodeId ?? null;
      const node = nodeId
        ? project.book.nodes.find((candidate) => candidate.id === nodeId)
        : null;
      if (nodeId && !node) return fail('NOT_FOUND', `No node with id ${nodeId}`);
      const placement: ArtworkPlacement =
        payload.placement ?? (nodeId ? 'chapter-opener' : 'cover');

      const choice = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
      });
      if (choice.canceled || !choice.filePaths[0]) {
        return ok({ project, canceled: true });
      }

      const input = await fs.readFile(choice.filePaths[0]);
      const processed = await processImage(input);
      const now = new Date().toISOString();
      let artwork = project.book.artworks.find(
        (candidate) => candidate.nodeId === nodeId && candidate.placement === placement
      );
      if (!artwork) {
        artwork = {
          id: randomUUID(),
          nodeId,
          placement,
          prompt: '',
          stylePreset: project.settings.artStylePreset ?? 'storybook',
          source: 'uploaded',
          status: 'ready',
          alt: '',
          order: 0,
          createdAt: now,
        };
        project.book.artworks.push(artwork);
      }

      artwork.source = 'uploaded';
      artwork.status = 'ready';
      artwork.alt =
        payload.alt?.trim() ||
        artwork.alt ||
        (node ? `Illustration for ${node.title}` : `Cover image for ${project.title}`);
      artwork.asset = await writeArtworkAssets(projects.directory(projectId), artwork.id, processed);
      artwork.generatedAt = now;
      artwork.error = undefined;
      project.book.modifiedAt = now;
      await projects.save(project);

      return ok({ project, canceled: false, artworkId: artwork.id });
    })
  );

  ipcMain.handle(
    'artwork:asset',
    guard(async (_event, projectIdRaw: unknown, artworkIdRaw: unknown, variantRaw: unknown) => {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const artworkId = artworkIdSchema.parse(artworkIdRaw);
      if (variantRaw !== 'thumb' && variantRaw !== 'full') {
        return fail('VALIDATION_ERROR', 'variant must be "thumb" or "full"');
      }
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const artwork = project.book.artworks.find((candidate) => candidate.id === artworkId);
      if (!artwork) return fail('NOT_FOUND', `No artwork with id ${artworkId}`);
      const relativePath =
        variantRaw === 'thumb' ? thumbnailRelativePath(artwork.id) : artwork.asset?.relativePath;
      if (!relativePath) return fail('NOT_FOUND', 'Artwork has no stored asset');
      const dataUrl = await readArtworkAssetAsDataUrl(
        projects.directory(projectId),
        relativePath
      );
      return ok({ dataUrl });
    })
  );

  // ===== Continuity =====

  ipcMain.handle(
    'project:continuity',
    guard(async (_event, idRaw: unknown) => {
      const id = projectIdSchema.parse(idRaw);
      const project = await projects.get(id);
      if (!project) return fail('NOT_FOUND', `No project with id ${id}`);

      const result = await new ContinuityChecker(manager).check(project);
      project.book.tokensIn += result.tokensIn;
      project.book.tokensOut += result.tokensOut;
      project.book.totalTokens = project.book.tokensIn + project.book.tokensOut;
      project.book.modifiedAt = new Date().toISOString();
      await projects.save(project);
      return ok({ project, result });
    })
  );

  // ===== Compile =====

  ipcMain.handle(
    'compile:run',
    guard(async (_event, payloadRaw: unknown) => {
      const { projectId, format, profileId, options } = compileRunSchema.parse(payloadRaw);
      const project = await projects.get(projectId);
      if (!project) return fail('NOT_FOUND', `No project with id ${projectId}`);
      const profile = profileId
        ? project.compileProfiles.find((candidate) => candidate.id === profileId)
        : undefined;
      const merged = {
        toc: options?.toc ?? profile?.toc ?? true,
        frontMatter:
          options?.frontMatter ?? profile?.includeKinds.includes('front-matter') ?? true,
        backMatter:
          options?.backMatter ?? profile?.includeKinds.includes('back-matter') ?? true,
        numbering: options?.numbering ?? true,
        includeEmpty: options?.includeEmpty ?? false,
        title: options?.title,
        author: options?.author,
        language: options?.language,
      };
      return ok(
        await compileProject(project, format, merged, projects.directory(projectId))
      );
    })
  );

  ipcMain.handle(
    'compile:batch',
    guard(async (_event, payloadRaw: unknown) => {
      const { projectIds, format, options } = compileBatchSchema.parse(payloadRaw);
      const choice = await dialog.showOpenDialog({
        title: 'Choose an export folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (choice.canceled || !choice.filePaths[0]) {
        return ok({ canceled: true, results: [] });
      }

      const directory = choice.filePaths[0];
      const used = new Set<string>();
      const results: Array<{
        projectId: string;
        title: string;
        path?: string;
        error?: string;
        warnings?: string[];
      }> = [];

      for (const projectId of projectIds) {
        const project = await projects.get(projectId);
        if (!project) {
          results.push({ projectId, title: '', error: 'Project not found' });
          continue;
        }

        let base = safeFileName(project.title) || projectId.slice(0, 8);
        if (used.has(base)) base = `${base}-${projectId.slice(0, 8)}`;
        used.add(base);

        try {
          const result = await compileProject(
            project,
            format,
            options ?? {},
            projects.directory(projectId),
            path.join(directory, `${base}.${compileExtension(format)}`)
          );
          results.push({
            projectId,
            title: project.title,
            path: result.path,
            warnings: result.warnings,
          });
        } catch (error) {
          results.push({
            projectId,
            title: project.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return ok({ canceled: false, results });
    })
  );
}

function safeFileName(name: string): string {
  return name.replace(/[^\w\d\-. ]+/g, '_').trim().slice(0, 120) || 'book';
}
