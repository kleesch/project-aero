/**
 * Registry of every audit action key, mirroring the claims registry pattern:
 * the `audit_events.action_key` column stores these strings, but the keys
 * live here so backend writers, the query API, and frontend rendering can
 * never drift apart (see DESIGN.md — Auditing).
 */
export const AUDIT_ACTIONS = {
  CLAIM_MAPPING_CREATE: 'claims.mapping.create',
  CLAIM_MAPPING_UPDATE: 'claims.mapping.update',
  CLAIM_MAPPING_DELETE: 'claims.mapping.delete',
  CLAIM_GRANT_CREATE: 'claims.grant.create',
  CLAIM_GRANT_REVOKE: 'claims.grant.revoke',
  DOCUMENT_UPLOAD: 'documents.upload',
  DOCUMENT_QUARANTINE: 'documents.quarantine',
  DOCUMENT_UNQUARANTINE: 'documents.unquarantine',
  AUDIT_RESTORE: 'audit.restore',
} as const;

export type AuditActionKey = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const ALL_AUDIT_ACTION_KEYS: readonly AuditActionKey[] = Object.values(AUDIT_ACTIONS);

export function isAuditActionKey(value: string): value is AuditActionKey {
  return (ALL_AUDIT_ACTION_KEYS as readonly string[]).includes(value);
}

/**
 * Audit entity types — the `audit_events.entity_type` vocabulary. Feature
 * phases add their entities here as they opt into auditing.
 */
export const AUDIT_ENTITIES = {
  GROUP_CLAIM_MAPPING: 'group_claim_mapping',
  DIRECT_CLAIM_GRANT: 'direct_claim_grant',
  DOCUMENT: 'document',
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];

/**
 * Visibility level per action key (see DESIGN.md — Auditing):
 *
 * - `sensitive` — administrative actions; querying them requires `audit:view`
 *   (which `admin` implies).
 * - `participant` — actions a non-admin may see on user-facing surfaces when
 *   they are an involved party (actor or entity owner). The only audit query
 *   endpoint this phase is the `audit:view`-gated admin one; participant
 *   filtering is exercised when feature phases add user-facing history.
 */
export type AuditVisibility = 'sensitive' | 'participant';

export const AUDIT_ACTION_VISIBILITY: Record<AuditActionKey, AuditVisibility> = {
  [AUDIT_ACTIONS.CLAIM_MAPPING_CREATE]: 'sensitive',
  [AUDIT_ACTIONS.CLAIM_MAPPING_UPDATE]: 'sensitive',
  [AUDIT_ACTIONS.CLAIM_MAPPING_DELETE]: 'sensitive',
  [AUDIT_ACTIONS.CLAIM_GRANT_CREATE]: 'sensitive',
  [AUDIT_ACTIONS.CLAIM_GRANT_REVOKE]: 'sensitive',
  [AUDIT_ACTIONS.DOCUMENT_UPLOAD]: 'participant',
  [AUDIT_ACTIONS.DOCUMENT_QUARANTINE]: 'sensitive',
  [AUDIT_ACTIONS.DOCUMENT_UNQUARANTINE]: 'sensitive',
  [AUDIT_ACTIONS.AUDIT_RESTORE]: 'sensitive',
} as const;
