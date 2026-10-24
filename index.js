import { PrivateRemoteController } from './host/controller.js';

/**
 * Host-side plugin entry.
 *
 * The browser half is shipped separately as client.js and registered through
 * package.json's dsh.client metadata.
 */

export const inject = ['connection'];

export function apply(ctx, config) {
  const controller = new PrivateRemoteController(ctx, config);
  controller.start();
}
