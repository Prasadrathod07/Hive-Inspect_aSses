export { runSpectoraImport } from "./import-service";
export type {
  ImportResult,
  ImportSuccessResult,
  ImportFailureResult,
  IssueResolutionStatus,
} from "./types";
export {
  toImportPayload,
  parseImportRpcResult,
  type ImportRpcPayload,
  type ImportPayloadMeta,
  type ImportRunCounts,
} from "./import-payload";
export {
  readPersistedTemplate,
  type PersistedTemplate,
  type PersistedSection,
  type PersistedItem,
  type PersistedComment,
} from "./read-persisted-template";
export { listTemplateSummaries } from "./list-templates";
export {
  getTemplateReport,
  type TemplateReport,
  type TemplateReportIssue,
} from "./get-template-report";
export {
  getImportRunIssues,
  type ImportRunIssuesPage,
  type ImportRunIssueDetail,
  type IssueHierarchyContext,
} from "./get-import-run-issues";
export { setIssueResolutionStatus } from "./issue-actions";
export {
  getEditableTemplate,
  type EditableTemplate,
  type EditableSection,
  type EditableItem,
  type EditableComment,
  type EditableSourceRef,
} from "./get-editable-template";
export {
  updateSectionName,
  updateItemName,
  updateCommentContent,
  type EditActionResult,
} from "./template-edit-actions";
export {
  UpdateNameSchema,
  UpdateCommentSchema,
  prepareCommentUpdate,
  type PreparedCommentUpdate,
} from "./template-edit-validation";
export { duplicateTemplate, type DuplicateTemplateResult } from "./duplicate-template";
export {
  deriveCopyName,
  DuplicateTemplateSchema,
  DuplicateRpcResultSchema,
  MAX_TEMPLATE_NAME_LENGTH,
  COPY_NAME_SUFFIX,
  type DuplicateTemplateInput,
  type DuplicateRpcResult,
} from "./duplicate-template-validation";
export {
  verifyDuplicateIndependence,
  type IndependenceResult,
  type IndependenceViolation,
  type IndependenceViolationKind,
} from "./verify-duplicate-independence";
