/**
 * Schema contracts.
 *
 * These live in `shared/` rather than in the schema feature because the
 * shared dynamic-record components speak them, and a shared component
 * reaching into a feature is the wrong direction -- the kit is what
 * features build on. The SERVICE stays in the feature; only the shapes
 * are shared.
 */

export interface DynamicEntityTypeDto {
    id:           string | null;
    slug:         string;
    label:        string;
    name?:        string;   // PascalCase PHP class name for Scaffolding; auto-derived from slug
    parentId:     string | null;
    parentAlias:  string | null;
    categoryTree: string | null;
    recordCount:  number;
    depth:        number;
    sortOrder:    number;
    fields:       FieldSchemaItem[];
    /**
     * 'managed' when the slug is registered in DynamicEntityAliasRegistry (PHP-backed entity).
     * 'runtime' for user-created types stored only in the DB.
     * Managed types are hidden from the DYNAMIC TYPES sidebar (they appear under ENTITIES instead)
     * but their schema is still accessible via the types list endpoint.
     */
    origin:       'managed' | 'runtime';
    /**
     * True when the type has at least one direct child.
     * Used by the tree component to show the expand chevron without loading children first.
     */
    hasChildren:  boolean;
}

export interface FieldTypeOptions {
    // text/textarea
    maxLength?:            number;
    placeholder?:          string;
    // number
    min?:                  number;
    max?:                  number;
    step?:                 number;
    precision?:            number;
    // select
    selectOptions?:        Array<{ value: string; label: string }>;
    multiple?:             boolean;
    // relation
    relationTarget?:       string;
    relationCardinality?:  'one' | 'many';
    relationWidget?:       'select' | 'autocomplete' | 'tree';
    relationFilter?:       string;
    relationDisplayField?: string;
    // date
    dateFormat?:           string;
    dateMin?:              string;
    dateMax?:              string;
}

export interface FieldSecurity {
    read:  string[];
    write: string[];
}

export interface ConstraintParameter {
    name:     string;
    type:     'integer' | 'string' | 'boolean' | 'float';
    required: boolean;
    default:  unknown;
}

export interface ConstraintMetadata {
    name:       string;
    label:      string;
    parameters: ConstraintParameter[];
}

export type FieldOverrideKind = null | 'db' | 'file' | 'module' | 'runtime';

export interface FieldSchemaItem {
    id:              string | null;
    name:            string;
    type:            string;
    label:           string;
    locked:          boolean;
    hasOverride?:    FieldOverrideKind;
    /**
     * Backend-computed UI action for this field row.
     * 'edit'     — runtime field (user owns it; full edit form)
     * 'create'   — no existing override; the "Override Field" dialog creates one
     * 'override' — existing DB or file override; the dialog edits it
     * null       — locked field with no override path (read-only in Domain Explorer)
     */
    overrideAction?: 'edit' | 'override' | 'create' | null;
    source:          'entity' | 'module' | 'runtime';
    /**
     * Slug of the DynamicEntityType that owns this FieldDefinition.
     * Only populated for source='runtime' fields.
     * Use this (not source alone) to detect inheritance:
     *   isInherited = source !== 'runtime' || entityAlias !== activeType.slug
     */
    entityAlias:     string;
    isRequired:      boolean;
    sortOrder:       number;
    typeOptions:     FieldTypeOptions;
    security:        FieldSecurity;
    validationRules: Record<string, unknown>;
    options:         Record<string, unknown>;
    formConfig:      Record<string, unknown>;
    apiConfig:       Record<string, unknown>;
    serializerConfig: Record<string, unknown>;
}

export interface EntityTypeSchema {
    alias:  string;
    label:  string;
    fields: FieldSchemaItem[];
}

export interface EntityFieldMetadata {
    name:            string;
    type:            string;
    nullable:        boolean;
    isIdentifier:    boolean;
    isEmbedded:      boolean;
    label:           string | null;
    source:          string;
    hasOverride?:    FieldOverrideKind;
    /** Backend-computed UI action — mirrors FieldSchemaItem.overrideAction. */
    overrideAction?: 'edit' | 'override' | 'create' | null;
    sortOrder?:      number | null;
    // Legacy fields kept for compatibility with older API responses
    formType?:       string | null;
    showInForm?:     boolean;
}

export interface DomainEntityItem {
    className:    string;
    shortName:    string;
    isAggregate:  boolean;
    isEmbeddable: boolean;
    isDynamic:    boolean;
    dynamicAlias: string | null;
    /**
     * 'runtime' for user-created (DB-stored) dynamic types.
     * 'managed' for PHP-registered aliases (DynamicEntityAliasRegistry).
     * Null / absent for non-dynamic entities.
     *
     * Only 'runtime' types should show the DynamicRecordListComponent;
     * 'managed' types appear in the Entities section with their own recordsUrl.
     */
    dynamicOrigin?: 'runtime' | 'managed' | null;
    label?:       string;
    /**
     * API list URL for this entity's records, when a GET collection endpoint
     * exists (e.g. /api/v1/content/pages).  Null or absent when not available.
     */
    recordsUrl?:  string | null;
    fields:       EntityFieldMetadata[];
    entityAlias?: string;
}

export interface DomainModuleGroup {
    module:   string;
    entities: DomainEntityItem[];
}
