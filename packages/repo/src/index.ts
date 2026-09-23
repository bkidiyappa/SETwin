export {
  gitDiff,
  gitDiffNameOnly,
  gitRevParse,
  gitUnifiedDiff,
  listSourceFiles,
  parseFile,
  unifiedDiffForFile,
  type ParsedEdge,
  type ParsedSymbol,
} from "./parse.ts";
export {
  applyProposedChanges,
  indexRepository,
  listRepositories,
  listSymbols,
  registerRepository,
  snapshotRepositoryFiles,
  type AppliedChangeResult,
  type ProposedFileChange,
  type RepoFileSnapshot,
} from "./service.ts";
export {
  detectTechStackFromRepo,
  formatTechStackForPrompt,
  resolveTechStack,
  type TechStackInfo,
} from "./tech-stack.ts";
export {
  formatTestLayoutForPrompt,
  intApiTestPath,
  intUiTestPath,
  isTestPath,
  resolveTestLayout,
  unitTestPath,
  type TestLayout,
} from "./test-layout.ts";
