import type { GhIssue } from '../shared/protocol';
import { store } from './state';

/**
 * An open issue someone is on (flrnoh fork, see FORK.md): assigned, labelled as in progress, or a
 * queued task running for it. The detailed board lists these under 🚧 In progress, and the cork
 * board on the wall leaves them off, so nobody hands the same issue out twice.
 */
export function isInProgress(i: GhIssue): boolean {
  return i.assignees.length > 0 || i.labels.some((l) => /progress|doing|wip|started/i.test(l.name)) || store.taskForIssue(i.number)?.status === 'running';
}
