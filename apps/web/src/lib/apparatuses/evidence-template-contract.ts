/** Runtime form of the shared evidence-template ledger contract. */

export const EVIDENCE_FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "number",
  "date",
] as const;

export type EvidenceFieldType = (typeof EVIDENCE_FIELD_TYPES)[number];

export type LedgerDimensionRole = "context" | "method" | "collection";

export type LedgerDimensionControl = "multi-select" | "range";

export interface LedgerDimension {
  role: LedgerDimensionRole;
  control: LedgerDimensionControl;
}

export type LedgerMissingSemantics = string | number;

export interface ApparatusEvidenceFieldDefinition {
  type: EvidenceFieldType;
  options?: string[];
  ledger_dimension?: LedgerDimension;
  missing_semantics?: LedgerMissingSemantics;
  [key: string]: unknown;
}

export type LedgerDimensionValidationError = {
  field: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep catalog-load and mirror-generation validation identical. */
export function ledgerDimensionValidationError(
  definition: Record<string, unknown>
): LedgerDimensionValidationError | undefined {
  const ledgerDimension = definition.ledger_dimension;
  if (ledgerDimension === undefined) return undefined;
  if (!isRecord(ledgerDimension)) {
    return { field: "ledger_dimension", message: "must be an object" };
  }

  const fieldType = definition.type;
  if (fieldType === "text" || fieldType === "textarea") {
    return {
      field: "ledger_dimension",
      message: "is only allowed on select, date, and number fields",
    };
  }
  if (
    ledgerDimension.role !== "context" &&
    ledgerDimension.role !== "method" &&
    ledgerDimension.role !== "collection"
  ) {
    return {
      field: "ledger_dimension.role",
      message: "must be one of context, method, collection",
    };
  }
  if (
    ledgerDimension.control !== "multi-select" &&
    ledgerDimension.control !== "range"
  ) {
    return {
      field: "ledger_dimension.control",
      message: "must be one of multi-select, range",
    };
  }
  if (fieldType === "select") {
    if (ledgerDimension.control !== "multi-select") {
      return {
        field: "ledger_dimension.control",
        message: "must be multi-select for select fields",
      };
    }
  } else if (fieldType === "date" || fieldType === "number") {
    if (ledgerDimension.control !== "range") {
      return {
        field: "ledger_dimension.control",
        message: "must be range for date and number fields",
      };
    }
    if (definition.options !== undefined) {
      return {
        field: "options",
        message: "must not be present for range controls",
      };
    }
  }

  const missingSemantics = definition.missing_semantics;
  if (
    missingSemantics !== undefined &&
    (typeof missingSemantics !== "string" || !missingSemantics) &&
    (typeof missingSemantics !== "number" || !Number.isFinite(missingSemantics))
  ) {
    return {
      field: "missing_semantics",
      message: "must be a non-empty string or finite number",
    };
  }
  if (
    fieldType === "select" &&
    missingSemantics !== undefined &&
    (typeof missingSemantics !== "string" ||
      !Array.isArray(definition.options) ||
      !definition.options.includes(missingSemantics))
  ) {
    return {
      field: "missing_semantics",
      message: "must be one of the select options",
    };
  }
  return undefined;
}
