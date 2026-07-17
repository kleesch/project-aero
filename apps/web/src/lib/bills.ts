import {
  BILL_STAGES,
  BILL_STATUSES,
  type BillStage,
  type BillStatus,
  type Chamber,
  type VotePosition,
} from '@aero/shared';

/** Display metadata for the bill pipeline — labels and colors in one place. */

export const CHAMBER_LABELS: Record<Chamber, string> = {
  house: 'House',
  senate: 'Senate',
};

export const STAGE_LABELS: Record<BillStage, string> = {
  [BILL_STAGES.COMMITTEE]: 'Committee',
  [BILL_STAGES.ORIGIN_FLOOR]: 'Origin floor',
  [BILL_STAGES.OTHER_FLOOR]: 'Other floor',
  [BILL_STAGES.PRESIDENTIAL]: 'Presidential action',
  [BILL_STAGES.VETO_OVERRIDE]: 'Veto override',
};

interface StatusMeta {
  label: string;
  /** Vuetify color token. */
  color: string;
}

export const STATUS_META: Record<BillStatus, StatusMeta> = {
  [BILL_STATUSES.IN_COMMITTEE]: { label: 'In committee', color: 'info' },
  [BILL_STATUSES.ORIGIN_FLOOR]: { label: 'On origin floor', color: 'info' },
  [BILL_STATUSES.OTHER_FLOOR]: { label: 'On other floor', color: 'info' },
  [BILL_STATUSES.PRESIDENTIAL]: { label: 'Awaiting presidential action', color: 'warning' },
  [BILL_STATUSES.VETOED]: { label: 'Vetoed', color: 'error' },
  [BILL_STATUSES.VETO_OVERRIDE]: { label: 'Override vote pending', color: 'warning' },
  [BILL_STATUSES.ENACTED]: { label: 'Enacted', color: 'success' },
  [BILL_STATUSES.ENACTED_BY_OVERRIDE]: { label: 'Enacted by override', color: 'success' },
  [BILL_STATUSES.VETO_SUSTAINED]: { label: 'Veto sustained', color: 'error' },
  [BILL_STATUSES.FAILED_COMMITTEE]: { label: 'Failed in committee', color: 'error' },
  [BILL_STATUSES.FAILED_ORIGIN_FLOOR]: { label: 'Failed on origin floor', color: 'error' },
  [BILL_STATUSES.FAILED_OTHER_FLOOR]: { label: 'Failed on other floor', color: 'error' },
  [BILL_STATUSES.DIED_IN_SESSION]: { label: 'Died in session', color: 'grey' },
};

/** Label for a status when offered as a transition target (an action, not a state). */
export const OUTCOME_LABELS: Record<BillStatus, string> = {
  [BILL_STATUSES.IN_COMMITTEE]: 'Return to committee',
  [BILL_STATUSES.ORIGIN_FLOOR]: 'Pass to origin floor',
  [BILL_STATUSES.OTHER_FLOOR]: 'Pass to other floor',
  [BILL_STATUSES.PRESIDENTIAL]: 'Pass to the President',
  [BILL_STATUSES.VETOED]: 'Veto',
  [BILL_STATUSES.VETO_OVERRIDE]: 'Begin veto override',
  [BILL_STATUSES.ENACTED]: 'Sign into law',
  [BILL_STATUSES.ENACTED_BY_OVERRIDE]: 'Override succeeds — enact',
  [BILL_STATUSES.VETO_SUSTAINED]: 'Override fails — sustain veto',
  [BILL_STATUSES.FAILED_COMMITTEE]: 'Fail in committee',
  [BILL_STATUSES.FAILED_ORIGIN_FLOOR]: 'Fail on origin floor',
  [BILL_STATUSES.FAILED_OTHER_FLOOR]: 'Fail on other floor',
  [BILL_STATUSES.DIED_IN_SESSION]: 'Died in session',
};

export const POSITION_LABELS: Record<VotePosition, string> = {
  yea: 'Yea',
  nay: 'Nay',
  abstain: 'Abstain',
  absent: 'Absent',
};

export const POSITION_COLORS: Record<VotePosition, string> = {
  yea: 'success',
  nay: 'error',
  abstain: 'warning',
  absent: 'grey',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
