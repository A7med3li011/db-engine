export interface PageHeader {
  pageId: number;

  slotCount: number;

  tupleStart: number;
}

export interface Page {
  tuples: Buffer[];
}
