/**
 *-2.6a — types for `CmsFilterBuilder`.
 *
 * Wire shapes mirror the backend's `EntityFieldsResource`
 * (`/api/v1/entity/{alias}/filters`, X-2.5).
 */

/** Wire types reported by the descriptor. `unknown` is a defensive
 *  fallback the backend uses when reflection can't pin a property
 *  to a concrete category — the builder treats it as 'string'. */
export type FieldType =
    | 'string'
    | 'int'
    | 'float'
    | 'bool'
    | 'date'
    | 'enum'
    | 'unknown';

/** One field as exposed by the X-2.5 endpoint. */
export interface FieldDescriptor {
    readonly field: string;
    readonly label: string;
    readonly type: FieldType;
    readonly filterable: boolean;
    readonly filterOperators: ReadonlyArray<string>;
    readonly sortable: boolean;
    readonly searchable: boolean;
    /** Backed-enum case value -> display label. Null for non-enum fields. */
    readonly enumValues: Readonly<Record<string, string>> | null;
}

/**-2.5b -- one virtual (computed) field as exposed under
 *  the response's `virtualFields` slot. Virtual fields are
 *  implicitly filterable; the wizard renders them alongside stored
 *  fields with a `[computed]` marker. */
export interface VirtualFieldDescriptor {
    readonly name: string;
    readonly label: string;
    readonly filterType: FieldType;
    readonly allowedOps: ReadonlyArray<string>;
    readonly description: string | null;
}

/** Response envelope for `GET /api/v1/entity/{alias}/filters`. */
export interface EntityFieldsResponse {
    readonly alias: string;
    readonly entityType: string;
    readonly fields: ReadonlyArray<FieldDescriptor>;
    /**-2.5b -- absent on pre-X-2.5b deployments; the builder
     *  defaults to an empty list and the UI is unchanged. */
    readonly virtualFields?: ReadonlyArray<VirtualFieldDescriptor>;
}

/** A single criterion in the builder. Identified by a stable id so
 *  Angular's @for tracking remains stable across edits. */
export interface FilterRow {
    readonly id: string;
    field: string;
    operator: string;
    value: unknown;
}

/** User-facing labels for the CoolMS\Rql operator vocabulary. The
 *  backend surfaces operators as short codes; we humanise them at
 *  the edge only. */
export const OPERATOR_LABELS: Readonly<Record<string, string>> = {
    eq:   'equals',
    ne:   'not equals',
    gt:   'greater than',
    lt:   'less than',
    ge:   'greater or equal',
    le:   'less or equal',
    cn:   'contains',
    bw:   'begins with',
    ew:   'ends with',
    in:   'is in',
    ni:   'is not in',
    null: 'is empty',
    nn:   'is not empty',
};

/** Operators whose value field is irrelevant (null/not-null). The
 *  builder hides the value input for these and omits the value
 *  side from the composed RQL. */
export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set(['null', 'nn']);
