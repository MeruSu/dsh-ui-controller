/**
 * Host half of `dsh-ui-controller` — placeholder.
 *
 * A DSH plugin bundle is activated through its Cordis patch; this file exists so
 * the package resolves and so the real host-side code has a home. It injects
 * nothing and registers no service.
 */
export const name = 'dsh-ui-controller'
export const inject = []
export function apply(ctx) {
  void ctx
}