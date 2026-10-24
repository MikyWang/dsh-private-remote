/**
 * Local Gateway switch.
 *
 * The official browser keeps a WebSocket to this same Host. The plugin swaps
 * only the two data-path functions on the local typertGateway:
 *   - dispatchRpc     (unary /api)
 *   - openWireStream  (/api/remote.mux, including $events)
 *
 * While remote mode is active, browser-Peer calls are forwarded to the remote
 * bridge. Every other Peer is rejected. There is no local fallback: if the
 * bridge is offline the call fails with remote/offline.
 */

import { ERR, fail, makeRemoteError } from '../shared/protocol.js';

function releaseLocalUplink(uplink) {
  if (uplink === null || uplink === undefined) return;
  try {
    Promise.resolve()
      .then(() => {
        const iterator = typeof uplink[Symbol.asyncIterator] === 'function'
          ? uplink[Symbol.asyncIterator]()
          : null;
        return iterator?.return?.();
      })
      .catch(() => undefined);
  } catch {
    // The mux's placeholder uplink is best-effort and never part of the result.
  }
}

/**
 * @param {{
 *   gateway: any,
 *   connection: any,
 *   state: { active: boolean },
 *   getBridge: () => any,
 * }} options
 */
export function createGatewaySwitch(options) {
  const { gateway, connection, state, getBridge } = options;
  const originalDispatch = gateway.dispatchRpc;
  const originalOpen = gateway.openWireStream;
  let installed = false;

  const ensureBridge = () => {
    const bridge = getBridge();
    if (bridge === null || bridge === undefined || typeof bridge.request !== 'function') {
      throw makeRemoteError(ERR.OFFLINE, '远端已断开，提交被拒绝；请重新连接');
    }
    return bridge;
  };

  return {
    install() {
      if (installed) return;
      installed = true;
      gateway.dispatchRpc = async (endpoint, payload, signal, peer) => {
        if (!state.active) {
          return fail(ERR.OFFLINE, '远端已断开，提交被拒绝；请重新连接或显式切换回本机');
        }
        if (peer !== connection.browserPeer) {
          return fail(ERR.FORBIDDEN, '远程模式只接受本机已认证浏览器连接');
        }
        let bridge;
        try {
          bridge = ensureBridge();
        } catch (error) {
          return fail(error.code ?? ERR.OFFLINE, error.message);
        }
        try {
          return await bridge.request(endpoint, payload, signal);
        } catch (error) {
          return fail(
            typeof error?.code === 'string' ? error.code : ERR.OFFLINE,
            error instanceof Error ? error.message : String(error),
          );
        }
      };
      gateway.openWireStream = async (endpoint, payload, uplink, peer, signal, control) => {
        if (!state.active) {
          throw makeRemoteError(ERR.OFFLINE, '远端已断开，流被拒绝；请重新连接或显式切换回本机');
        }
        if (peer !== connection.browserPeer) {
          throw makeRemoteError(ERR.FORBIDDEN, '远程模式只接受本机已认证浏览器连接');
        }
        releaseLocalUplink(uplink);
        let bridge;
        try {
          bridge = ensureBridge();
        } catch (error) {
          throw makeRemoteError(error.code ?? ERR.OFFLINE, error.message);
        }
        return bridge.openStream(endpoint, payload, signal, control);
      };
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      gateway.dispatchRpc = originalDispatch;
      gateway.openWireStream = originalOpen;
    },
    get installed() {
      return installed;
    },
  };
}
