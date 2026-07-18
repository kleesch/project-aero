import {
  formatUserRef,
  GOVERNMENT_PARTY_LABEL,
  type RulingPartySide,
  type RulingPartyType,
  type RulingPartyView,
  type RulingStatus,
} from '@aero/shared';

/** Display metadata for the court UI, mirroring lib/bills.ts. */

export const RULING_STATUS_META: Record<RulingStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'primary' },
  expunged: { label: 'Expunged', color: 'warning' },
  pardoned: { label: 'Pardoned', color: 'purple' },
};

/** Banner wording for privileged viewers of a hidden ruling. */
export const RULING_STATUS_BANNERS: Record<Exclude<RulingStatus, 'active'>, string> = {
  expunged:
    'This ruling has been expunged: it is hidden from the public record as though it had not ' +
    'occurred. You can see it because you hold a judicial or admin claim.',
  pardoned:
    'This ruling has been pardoned: executive clemency set its consequences aside and it is ' +
    'hidden from the public record. You can see it because you hold a judicial or admin claim.',
};

export const PARTY_SIDE_LABELS: Record<RulingPartySide, string> = {
  plaintiff: 'Plaintiff',
  defendant: 'Defendant',
};

export const PARTY_TYPE_LABELS: Record<RulingPartyType, string> = {
  user: 'User',
  business: 'Business',
  government: 'Government',
};

/** The one way to render a ruling party as text. */
export function formatParty(party: RulingPartyView): string {
  if (party.partyType === 'government') return GOVERNMENT_PARTY_LABEL;
  if (party.partyType === 'business') return party.business?.name ?? 'Unknown business';
  return formatUserRef(party.user);
}

export function partiesOnSide(parties: RulingPartyView[], side: RulingPartySide) {
  return parties.filter((party) => party.side === side);
}

/** Ruling dates are calendar dates (YYYY-MM-DD), not instants — no time, no timezone shift. */
export function formatRulingDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString();
}
