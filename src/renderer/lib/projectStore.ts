/**
 * Workbench state: project list, the open project, autosave, planning/writing,
 * snapshots, and compile.
 */

import { create } from 'zustand';
import {
  api,
  ApiError,
  type ArtworkPlacement,
  type ArtworkProgress,
  type BookProgress,
  type CompileFormat,
  type CompileOptions,
  type ContinuityResult,
  type CreateProjectInput,
  type EditAction,
  type NodeKind,
  type Project,
  type ProjectSummary,
  type Snapshot,
  type SnapshotDiff,
} from './api';

interface ProjectState {
  projects: ProjectSummary[];
  project: Project | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  progress: BookProgress | null;
  selectedNodeId: string | null;
  snapshots: Snapshot[];
  editingNodeId: string | null;
  /** Bumped whenever content is replaced wholesale (AI edit, restore, plan). */
  revision: number;
  snapshotDiff: SnapshotDiff | null;
  artworkBusy: boolean;
  artworkBusyId: string | null;
  artworkProgress: ArtworkProgress | null;
  continuity: ContinuityResult | null;
  continuityBusy: boolean;

  refreshProjects: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  createProject: (input: CreateProjectInput) => Promise<Project | null>;
  updateProjectMeta: (patch: Partial<CreateProjectInput>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;

  selectNode: (id: string | null) => void;
  saveNode: (
    nodeId: string,
    patch: { title?: string; synopsis?: string; content?: string }
  ) => Promise<void>;
  addNode: (kind: NodeKind, title: string, parentId?: string | null) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  moveNode: (nodeId: string, parentId: string | null, order?: number) => Promise<void>;

  refreshSnapshots: (nodeId?: string) => Promise<void>;
  createSnapshot: (nodeId: string, reason?: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  diffSnapshot: (snapshotId: string) => Promise<void>;
  clearSnapshotDiff: () => void;

  editNode: (
    nodeId: string,
    action: EditAction,
    instruction?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  cancelEdit: () => Promise<void>;

  planArtwork: (stylePreset?: string) => Promise<{ ok: boolean; message?: string }>;
  updateArtwork: (
    artworkId: string,
    patch: { prompt?: string; alt?: string; caption?: string; status?: 'planned' | 'disabled' }
  ) => Promise<void>;
  deleteArtwork: (artworkId: string) => Promise<void>;
  generateArtwork: (artworkId: string) => Promise<{ ok: boolean; message?: string }>;
  generateAllArtwork: (options?: {
    maxImages?: number;
    maxCostUsd?: number;
  }) => Promise<{ ok: boolean; message?: string }>;
  uploadArtwork: (payload: {
    nodeId?: string | null;
    placement?: ArtworkPlacement;
    alt?: string;
  }) => Promise<{ ok: boolean; canceled?: boolean; message?: string }>;

  importResearch: () => Promise<{ ok: boolean; canceled?: boolean; message?: string }>;

  runContinuity: () => Promise<{ ok: boolean; message?: string }>;

  plan: () => Promise<{ ok: boolean; message?: string }>;
  generate: () => Promise<{ ok: boolean; message?: string }>;
  cancel: () => Promise<void>;
  compile: (
    format: CompileFormat,
    options?: CompileOptions
  ) => Promise<{ ok: boolean; path?: string; message?: string; warnings?: string[] }>;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  project: null,
  loading: false,
  busy: false,
  error: null,
  progress: null,
  selectedNodeId: null,
  snapshots: [],
  editingNodeId: null,
  revision: 0,
  snapshotDiff: null,
  artworkBusy: false,
  artworkBusyId: null,
  artworkProgress: null,
  continuity: null,
  continuityBusy: false,

  async refreshProjects() {
    if (!api.isDesktop()) {
      set({ loading: false, error: 'The workbench is only available in the desktop app.' });
      return;
    }
    set({ loading: true, error: null });
    try {
      set({ projects: await api.listProjects(), loading: false });
    } catch (error) {
      set({ loading: false, error: messageOf(error, 'Failed to load projects') });
    }
  },

  async openProject(id) {
    set({ loading: true, error: null });
    try {
      const project = await api.getProject(id);
      const first = project.book.nodes.find(
        (node) => node.kind === 'chapter' || node.kind === 'scene'
      );
      const selectedNodeId = first?.id ?? project.book.nodes[0]?.id ?? null;
      set((state) => ({
        project,
        loading: false,
        selectedNodeId,
        snapshots: [],
        snapshotDiff: null,
        continuity: null,
        revision: state.revision + 1,
      }));
      if (selectedNodeId) void get().refreshSnapshots(selectedNodeId);
    } catch (error) {
      set({ loading: false, error: messageOf(error, 'Failed to open project') });
    }
  },

  closeProject() {
    set({ project: null, selectedNodeId: null, snapshots: [], progress: null });
  },

  async createProject(input) {
    try {
      const project = await api.createProject(input);
      set((state) => ({
        project,
        selectedNodeId: null,
        snapshots: [],
        snapshotDiff: null,
        progress: null,
        error: null,
        continuity: null,
        revision: state.revision + 1,
      }));
      await get().refreshProjects();
      return project;
    } catch (error) {
      set({ error: messageOf(error, 'Failed to create project') });
      return null;
    }
  },

  async updateProjectMeta(patch) {
    const project = get().project;
    if (!project) return;
    try {
      set({ project: await api.updateProjectMeta(project.id, patch) });
      await get().refreshProjects();
    } catch (error) {
      set({ error: messageOf(error, 'Failed to save project details') });
    }
  },

  async deleteProject(id) {
    try {
      await api.deleteProject(id);
      if (get().project?.id === id) set({ project: null, selectedNodeId: null });
      await get().refreshProjects();
    } catch (error) {
      set({ error: messageOf(error, 'Failed to delete project') });
    }
  },

  async duplicateProject(id) {
    try {
      await api.duplicateProject(id);
      await get().refreshProjects();
    } catch (error) {
      set({ error: messageOf(error, 'Failed to duplicate project') });
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id, snapshots: [], snapshotDiff: null });
    if (id) void get().refreshSnapshots(id);
  },

  async saveNode(nodeId, patch) {
    const project = get().project;
    if (!project) return;
    try {
      const updated = await api.updateNode(project.id, nodeId, patch);
      set({ project: updated });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to save chapter') });
    }
  },

  async addNode(kind, title, parentId = null) {
    const project = get().project;
    if (!project) return;
    try {
      const result = await api.createNode(project.id, { kind, title, parentId });
      set({ project: result.project, selectedNodeId: result.nodeId });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to create chapter') });
    }
  },

  async deleteNode(nodeId) {
    const project = get().project;
    if (!project) return;
    try {
      const updated = await api.deleteNode(project.id, nodeId);
      set({
        project: updated,
        selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to delete chapter') });
    }
  },

  async moveNode(nodeId, parentId, order) {
    const project = get().project;
    if (!project) return;
    try {
      set({ project: await api.moveNode(project.id, nodeId, { parentId, order }) });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to move chapter') });
    }
  },

  async refreshSnapshots(nodeId) {
    const project = get().project;
    if (!project) return;
    try {
      set({ snapshots: await api.listSnapshots(project.id, nodeId) });
    } catch {
      set({ snapshots: [] });
    }
  },

  async createSnapshot(nodeId, reason = 'manual') {
    const project = get().project;
    if (!project) return;
    try {
      await api.createSnapshot(project.id, nodeId, reason);
      await get().refreshSnapshots(nodeId);
    } catch (error) {
      set({ error: messageOf(error, 'Failed to create snapshot') });
    }
  },

  async restoreSnapshot(snapshotId) {
    const project = get().project;
    if (!project) return;
    try {
      const updated = await api.restoreSnapshot(project.id, snapshotId);
      set((state) => ({
        project: updated,
        snapshotDiff: null,
        revision: state.revision + 1,
      }));
      await get().refreshSnapshots(get().selectedNodeId ?? undefined);
    } catch (error) {
      set({ error: messageOf(error, 'Failed to restore snapshot') });
    }
  },

  async diffSnapshot(snapshotId) {
    const project = get().project;
    if (!project) return;
    try {
      set({ snapshotDiff: await api.diffSnapshot(project.id, snapshotId) });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to diff snapshot') });
    }
  },

  clearSnapshotDiff() {
    set({ snapshotDiff: null });
  },

  async editNode(nodeId, action, instruction) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    set({ editingNodeId: nodeId, error: null });
    try {
      const updated = await api.editNode(project.id, nodeId, action, instruction);
      set((state) => ({
        project: updated,
        revision: state.revision + 1,
      }));
      await get().refreshSnapshots(nodeId);
      return { ok: true };
    } catch (error) {
      const message = messageOf(error, 'AI edit failed');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ editingNodeId: null });
    }
  },

  async cancelEdit() {
    const project = get().project;
    if (project) await api.cancelProject(project.id);
  },

  async planArtwork(stylePreset) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    return runArtworkBusy(
      set,
      null,
      async () => {
        const updated = await api.planArtwork(project.id, stylePreset);
        set({ project: updated });
        await get().refreshProjects();
        return { ok: true };
      },
      'Failed to plan artwork'
    );
  },

  async updateArtwork(artworkId, patch) {
    const project = get().project;
    if (!project) return;
    try {
      set({ project: await api.updateArtwork(project.id, artworkId, patch) });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to update artwork') });
    }
  },

  async deleteArtwork(artworkId) {
    const project = get().project;
    if (!project) return;
    try {
      set({ project: await api.deleteArtwork(project.id, artworkId) });
    } catch (error) {
      set({ error: messageOf(error, 'Failed to delete artwork') });
    }
  },

  async generateArtwork(artworkId) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    return runArtworkBusy(
      set,
      artworkId,
      async () => {
        const updated = await api.generateArtwork(project.id, artworkId);
        set({ project: updated });
        return { ok: true };
      },
      'Image generation failed'
    );
  },

  async generateAllArtwork(options = {}) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    return runArtworkBusy(
      set,
      null,
      async () => {
        const updated = await api.generateAllArtwork(project.id, options);
        set({ project: updated });
        return { ok: true };
      },
      'Image generation failed'
    );
  },

  async uploadArtwork(payload) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    try {
      const result = await api.uploadArtwork(project.id, payload);
      set({ project: result.project });
      return { ok: !result.canceled, canceled: result.canceled };
    } catch (error) {
      const message = messageOf(error, 'Failed to upload artwork');
      set({ error: message });
      return { ok: false, message };
    }
  },

  async importResearch() {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    try {
      const result = await api.importResearch(project.id);
      set({
        project: result.project,
        selectedNodeId: result.nodeId ?? get().selectedNodeId,
      });
      return { ok: !result.canceled, canceled: result.canceled };
    } catch (error) {
      const message = messageOf(error, 'Failed to import document');
      set({ error: message });
      return { ok: false, message };
    }
  },

  async runContinuity() {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    set({ continuityBusy: true, continuity: null, error: null });
    try {
      const { project: updated, result } = await api.runContinuity(project.id);
      set({ project: updated, continuity: result });
      return { ok: true };
    } catch (error) {
      const message = messageOf(error, 'Continuity check failed');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ continuityBusy: false });
    }
  },

  async plan() {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    return runBusy(set, async () => {
      const updated = await api.planProject(project.id);
      const first = updated.book.nodes.find((node) => node.kind === 'chapter');
      set((state) => ({
        project: updated,
        selectedNodeId: first?.id ?? null,
        snapshotDiff: null,
        revision: state.revision + 1,
      }));
      await get().refreshProjects();
      return { ok: true };
    }, 'Failed to generate outline');
  },

  async generate() {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    return runBusy(set, async () => {
      const updated = await api.generateProject(project.id);
      const selectedExists = updated.book.nodes.some(
        (node) => node.id === get().selectedNodeId
      );
      const first = updated.book.nodes.find((node) => node.kind === 'chapter');
      set((state) => ({
        project: updated,
        selectedNodeId: selectedExists ? state.selectedNodeId : (first?.id ?? null),
        revision: state.revision + 1,
      }));
      await get().refreshProjects();
      await get().refreshSnapshots(get().selectedNodeId ?? undefined);
      return { ok: true };
    }, 'Failed to generate chapters');
  },

  async cancel() {
    const project = get().project;
    if (project) await api.cancelProject(project.id);
  },

  async compile(format, options = {}) {
    const project = get().project;
    if (!project) return { ok: false, message: 'No project open' };
    try {
      const result = await api.compileProject(project.id, format, options);
      if (result.canceled) return { ok: false };
      return { ok: true, path: result.path, warnings: result.warnings };
    } catch (error) {
      return { ok: false, message: messageOf(error, 'Compile failed') };
    }
  },
}));

/** Run an artwork operation while subscribing to `artwork:progress` events. */
async function runArtworkBusy(
  set: (partial: Partial<ProjectState>) => void,
  busyId: string | null,
  task: () => Promise<{ ok: boolean; message?: string }>,
  fallback: string
): Promise<{ ok: boolean; message?: string }> {
  set({
    artworkBusy: true,
    artworkBusyId: busyId,
    artworkProgress: null,
    error: null,
  });
  const unsubscribe = api.onArtworkProgress((progress) => set({ artworkProgress: progress }));
  try {
    return await task();
  } catch (error) {
    const message = messageOf(error, fallback);
    set({ error: message });
    return { ok: false, message };
  } finally {
    unsubscribe();
    set({ artworkBusy: false, artworkBusyId: null });
  }
}

/** Run a plan/generate call while subscribing to progress events. */
async function runBusy(
  set: (partial: Partial<ProjectState>) => void,
  task: () => Promise<{ ok: boolean; message?: string }>,
  fallback: string
): Promise<{ ok: boolean; message?: string }> {
  set({ busy: true, progress: null, error: null });
  const unsubscribe = api.onBookProgress((progress) => set({ progress }));
  try {
    return await task();
  } catch (error) {
    const message = messageOf(error, fallback);
    set({ error: message });
    return { ok: false, message };
  } finally {
    unsubscribe();
    set({ busy: false, progress: null });
  }
}
