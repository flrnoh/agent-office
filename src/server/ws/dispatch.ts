import type { ClientMsg } from '../../shared/protocol.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { handlers } from './handlers/index.js';
import { refusedForRole } from '../fork/roles.js';

type AnyHandler = (ctx: Ctx, c: Client, msg: ClientMsg) => void;

/**
 * Hands a message to the handler for its type. Only a string that is one of the map's own keys is
 * a type, so a message that says it's a `constructor` or a `__proto__` goes nowhere, like one of a
 * type nobody handles, and so does one whose type only turns into a key (`['ping']`).
 */
export function dispatch(ctx: Ctx, c: Client, msg: ClientMsg): void {
  if (typeof msg.t !== 'string' || !Object.hasOwn(handlers, msg.t)) return;
  if (refusedForRole(ctx, c, msg.t)) return; // flrnoh fork: guests and party guests (fork/roles.ts)
  (handlers[msg.t] as AnyHandler)(ctx, c, msg);
}
