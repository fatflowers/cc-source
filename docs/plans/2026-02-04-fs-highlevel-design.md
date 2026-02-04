# Filesystem High-Level Operations Design

**Goal:** Restore high-level filesystem operations as reusable helpers and local tools, matching cli.js behavior.

**Scope:** Implement `src/core/fs` helpers plus corresponding `src/core/tools` wrappers for directory listing, stat, tree walk, copy/move/remove, mkdir, and related operations if present in cli.js.

**Architecture:**
- Add a core helper module (e.g., `src/core/fs/ops.ts`) with pure filesystem operations.
- Expose these helpers via tool wrappers under `src/core/tools/` with exact input/output schemas from cli.js.
- Update `src/core/fs/index.ts` and `src/core/tools/index.ts` exports and registrations.

**Data Flow:**
1. Tool input JSON is parsed and validated.
2. Tools call fs helpers with explicit options (depth, followSymlinks, overwrite, includeHidden).
3. Helpers return structured results with stable fields (`path`, `type`, `size`, `mtimeMs`, etc.).
4. Tool wrappers format outputs to match cli.js.

**Behavioral Notes:**
- No permission/sandbox enforcement per user request.
- Recursive operations guard against symlink cycles when followSymlinks is enabled.
- Copy/move preserve metadata where possible.
- Errors surface in the same shape/messages as cli.js.

**Non-Goals:**
- Tests or compilation enforcement (per user instruction).
- Integration with sandbox/permission system (deferred).

**Files (planned):**
- Create: `src/core/fs/ops.ts` (or similar helper module)
- Modify: `src/core/fs/index.ts`
- Create: `src/core/tools/{ls,stat,tree,copy,move,rm,mkdir}.ts` (as applicable to cli.js)
- Modify: `src/core/tools/index.ts`
