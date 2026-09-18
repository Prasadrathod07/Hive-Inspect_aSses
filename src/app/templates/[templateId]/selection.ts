/** A section-only selection has no itemId; an item selection always carries its parent sectionId too, so the tree/breadcrumb never has to guess the parent. */
export type Selection = { sectionId: string; itemId?: string } | null;
