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
  ROSTER_SYNC: 'roster.sync',
  ROSTER_RANK_RULE_CREATE: 'roster.rank-rule.create',
  ROSTER_RANK_RULE_UPDATE: 'roster.rank-rule.update',
  ROSTER_RANK_RULE_DELETE: 'roster.rank-rule.delete',
  BILL_SUBMIT: 'bills.submit',
  BILL_STAGE_TRANSITION: 'bills.stage.transition',
  BILL_VERSION_UPLOAD: 'bills.version.upload',
  BILL_VOTES_RECORD: 'bills.votes.record',
  BILL_TAGS_UPDATE: 'bills.tags.update',
  BILL_DIED_IN_SESSION: 'bills.died-in-session',
  TAG_CREATE: 'tags.create',
  TAG_UPDATE: 'tags.update',
  TAG_DELETE: 'tags.delete',
  RULING_SUBMIT: 'rulings.submit',
  RULING_APPEAL_SUBMIT: 'rulings.appeal.submit',
  RULING_EXPUNGE: 'rulings.expunge',
  RULING_PARDON: 'rulings.pardon',
  RULING_OUTCOME_CREATE: 'rulings.outcome.create',
  RULING_OUTCOME_UPDATE: 'rulings.outcome.update',
  RULING_OUTCOME_DELETE: 'rulings.outcome.delete',
  USER_STUB_CREATE: 'users.stub.create',
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
  CONGRESS_ROSTER: 'congress_roster',
  ROSTER_RANK_RULE: 'roster_rank_rule',
  BILL: 'bill',
  TAG: 'tag',
  RULING: 'ruling',
  RULING_OUTCOME: 'ruling_outcome',
  USER: 'user',
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
  [AUDIT_ACTIONS.ROSTER_SYNC]: 'sensitive',
  [AUDIT_ACTIONS.ROSTER_RANK_RULE_CREATE]: 'sensitive',
  [AUDIT_ACTIONS.ROSTER_RANK_RULE_UPDATE]: 'sensitive',
  [AUDIT_ACTIONS.ROSTER_RANK_RULE_DELETE]: 'sensitive',
  [AUDIT_ACTIONS.BILL_SUBMIT]: 'participant',
  [AUDIT_ACTIONS.BILL_STAGE_TRANSITION]: 'participant',
  [AUDIT_ACTIONS.BILL_VERSION_UPLOAD]: 'participant',
  [AUDIT_ACTIONS.BILL_VOTES_RECORD]: 'participant',
  [AUDIT_ACTIONS.BILL_TAGS_UPDATE]: 'participant',
  [AUDIT_ACTIONS.BILL_DIED_IN_SESSION]: 'participant',
  [AUDIT_ACTIONS.TAG_CREATE]: 'sensitive',
  [AUDIT_ACTIONS.TAG_UPDATE]: 'sensitive',
  [AUDIT_ACTIONS.TAG_DELETE]: 'sensitive',
  [AUDIT_ACTIONS.RULING_SUBMIT]: 'participant',
  [AUDIT_ACTIONS.RULING_APPEAL_SUBMIT]: 'participant',
  // Expungement/pardon hide a record from the public; the justification and
  // actor stay in the sensitive tier alongside other moderation actions.
  [AUDIT_ACTIONS.RULING_EXPUNGE]: 'sensitive',
  [AUDIT_ACTIONS.RULING_PARDON]: 'sensitive',
  [AUDIT_ACTIONS.RULING_OUTCOME_CREATE]: 'sensitive',
  [AUDIT_ACTIONS.RULING_OUTCOME_UPDATE]: 'sensitive',
  [AUDIT_ACTIONS.RULING_OUTCOME_DELETE]: 'sensitive',
  [AUDIT_ACTIONS.USER_STUB_CREATE]: 'sensitive',
} as const;
