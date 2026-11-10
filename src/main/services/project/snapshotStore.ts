/**
 * SnapshotStore - per-node version history. Snapshots are standalone JSON files
 * inside a project folder so they are easy to inspect and back up.
 */

import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { Project, Snapshot, SnapshotReason } from '../../../shared/types';
import { wordCount } from '../../../shared/types';
import type { ProjectStore } from './projectStore';

const MAX_SNAPSHOTS_PER_PROJECT = 200;

export class SnapshotStore {
  constructor(private readonly projects: ProjectStore) {}

  async create(
    projectId: string,
    nodeId: string,
    options: { reason?: SnapshotReason; label?: string } = {}
  ): Promise<Snapshot> {
    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`No project with id ${projectId}`);
    const node = project.book.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`No node with id ${nodeId}`);

    const snapshot: Snapshot = {
      id: randomUUID(),
      projectId,
      nodeId,
      createdAt: new Date().toISOString(),
      reason: options.reason ?? 'manual',
      label: options.label,
      title: node.title,
      content: node.content,
      wordCount: wordCount(node.content),
    };

    await this.write(projectId, snapshot);
    await this.prune(projectId);
    return snapshot;
  }

  async list(projectId: string, nodeId?: string): Promise<Snapshot[]> {
    const dir = this.directory(projectId);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }

    const snapshots = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          try {
            const raw = await fs.readFile(path.join(dir, name), 'utf8');
            return JSON.parse(raw) as Snapshot;
          } catch {
            return null;
          }
        })
    );

    return snapshots
      .filter((snapshot): snapshot is Snapshot => snapshot !== null)
      .filter((snapshot) => !nodeId || snapshot.nodeId === nodeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Restore a snapshot. The current content is snapshotted first. */
  async restore(projectId: string, snapshotId: string): Promise<Project> {
    const snapshots = await this.list(projectId);
    const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) throw new Error(`No snapshot with id ${snapshotId}`);

    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`No project with id ${projectId}`);
    const node = project.book.nodes.find((candidate) => candidate.id === snapshot.nodeId);
    if (!node) throw new Error(`No node with id ${snapshot.nodeId}`);

    await this.create(projectId, snapshot.nodeId, { reason: 'pre-restore' });

    node.title = snapshot.title;
    node.content = snapshot.content;
    node.wordCount = snapshot.wordCount;
    node.status = 'completed';
    node.modifiedAt = new Date().toISOString();

    await this.projects.save(project);
    return project;
  }

  private async write(projectId: string, snapshot: Snapshot): Promise<void> {
    const dir = this.directory(projectId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${snapshot.id}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  private async prune(projectId: string): Promise<void> {
    const snapshots = await this.list(projectId);
    if (snapshots.length <= MAX_SNAPSHOTS_PER_PROJECT) return;
    const doomed = snapshots.slice(MAX_SNAPSHOTS_PER_PROJECT);
    await Promise.all(
      doomed.map((snapshot) =>
        fs.rm(path.join(this.directory(projectId), `${snapshot.id}.json`), { force: true })
      )
    );
  }

  private directory(projectId: string): string {
    return path.join(this.projects.directory(projectId), 'snapshots');
  }
}
