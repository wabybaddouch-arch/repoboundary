export type BoundaryAction = "create" | "modify" | "delete" | "rename";

export type BoundaryRule = {
  id: string;
  match: string[];
  actions: BoundaryAction[];
  mode: "block";
  reason: string;
};

export type RepoBoundaryConfig = {
  version: 1;
  rules: BoundaryRule[];
};
