/**
 * Browser half of `dsh-ui-controller` — placeholder.
 *
 * Loaded by the harness module loader. It registers no slot entry and injects no
 * stylesheet, so installing this version is a no-op. Keep the module id equal to
 * the package name: the loader rejects a mismatch.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ui-controller',
  factory() {
    return {
      apply(ctx) {
        void ctx
      },
    }
  },
})