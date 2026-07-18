import {
  BILL_STAGES,
  BILL_STATUSES,
  otherChamber,
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

/**
 * A bill's origin chamber is fixed by its identifier (HB → House, SB →
 * Senate), so wherever a bill is in scope we name chambers outright
 * ("House floor") instead of the relative "origin floor" / "other floor".
 */
export function stageLabel(stage: BillStage, originChamber: Chamber): string {
  switch (stage) {
    case BILL_STAGES.COMMITTEE:
      return `${CHAMBER_LABELS[originChamber]} committee`;
    case BILL_STAGES.ORIGIN_FLOOR:
      return `${CHAMBER_LABELS[originChamber]} floor`;
    case BILL_STAGES.OTHER_FLOOR:
      return `${CHAMBER_LABELS[otherChamber(originChamber)]} floor`;
    case BILL_STAGES.PRESIDENTIAL:
      return 'Presidential action';
    case BILL_STAGES.VETO_OVERRIDE:
      return `Veto override (${CHAMBER_LABELS[originChamber]})`;
  }
}

interface StatusMeta {
  label: string;
  /** Vuetify color token. */
  color: string;
}

/** Chamber-free labels, used where no single bill is in scope (status filter). */
const GENERIC_STATUS_META: Record<BillStatus, StatusMeta> = {
  [BILL_STATUSES.IN_COMMITTEE]: { label: 'In committee', color: 'info' },
  [BILL_STATUSES.ORIGIN_FLOOR]: { label: 'First floor vote', color: 'info' },
  [BILL_STATUSES.OTHER_FLOOR]: { label: 'Second floor vote', color: 'info' },
  [BILL_STATUSES.PRESIDENTIAL]: { label: 'Awaiting presidential action', color: 'warning' },
  [BILL_STATUSES.VETOED]: { label: 'Vetoed', color: 'error' },
  [BILL_STATUSES.VETO_OVERRIDE]: { label: 'Override vote pending', color: 'warning' },
  [BILL_STATUSES.ENACTED]: { label: 'Enacted', color: 'success' },
  [BILL_STATUSES.ENACTED_BY_OVERRIDE]: { label: 'Enacted by override', color: 'success' },
  [BILL_STATUSES.VETO_SUSTAINED]: { label: 'Veto sustained', color: 'error' },
  [BILL_STATUSES.FAILED_COMMITTEE]: { label: 'Failed in committee', color: 'error' },
  [BILL_STATUSES.FAILED_ORIGIN_FLOOR]: { label: 'Failed first floor vote', color: 'error' },
  [BILL_STATUSES.FAILED_OTHER_FLOOR]: { label: 'Failed second floor vote', color: 'error' },
  [BILL_STATUSES.DIED_IN_SESSION]: { label: 'Died in session', color: 'grey' },
};

export function statusMeta(status: BillStatus, originChamber?: Chamber): StatusMeta {
  if (!originChamber) return GENERIC_STATUS_META[status];
  switch (status) {
    case BILL_STATUSES.ORIGIN_FLOOR:
      return { label: `On the ${CHAMBER_LABELS[originChamber]} floor`, color: 'info' };
    case BILL_STATUSES.OTHER_FLOOR:
      return {
        label: `On the ${CHAMBER_LABELS[otherChamber(originChamber)]} floor`,
        color: 'info',
      };
    case BILL_STATUSES.FAILED_ORIGIN_FLOOR:
      return { label: `Failed on the ${CHAMBER_LABELS[originChamber]} floor`, color: 'error' };
    case BILL_STATUSES.FAILED_OTHER_FLOOR:
      return {
        label: `Failed on the ${CHAMBER_LABELS[otherChamber(originChamber)]} floor`,
        color: 'error',
      };
    default:
      return GENERIC_STATUS_META[status];
  }
}

/** Label for a status when offered as a transition target (an action, not a state). */
export function outcomeLabel(status: BillStatus, originChamber: Chamber): string {
  switch (status) {
    case BILL_STATUSES.IN_COMMITTEE:
      return 'Return to committee';
    case BILL_STATUSES.ORIGIN_FLOOR:
      return `Pass to the ${CHAMBER_LABELS[originChamber]} floor`;
    case BILL_STATUSES.OTHER_FLOOR:
      return `Pass to the ${CHAMBER_LABELS[otherChamber(originChamber)]} floor`;
    case BILL_STATUSES.PRESIDENTIAL:
      return 'Pass to the President';
    case BILL_STATUSES.VETOED:
      return 'Veto';
    case BILL_STATUSES.VETO_OVERRIDE:
      return 'Begin veto override';
    case BILL_STATUSES.ENACTED:
      return 'Sign into law';
    case BILL_STATUSES.ENACTED_BY_OVERRIDE:
      return 'Override succeeds — enact';
    case BILL_STATUSES.VETO_SUSTAINED:
      return 'Override fails — sustain veto';
    case BILL_STATUSES.FAILED_COMMITTEE:
      return 'Fail in committee';
    case BILL_STATUSES.FAILED_ORIGIN_FLOOR:
      return `Fail on the ${CHAMBER_LABELS[originChamber]} floor`;
    case BILL_STATUSES.FAILED_OTHER_FLOOR:
      return `Fail on the ${CHAMBER_LABELS[otherChamber(originChamber)]} floor`;
    case BILL_STATUSES.DIED_IN_SESSION:
      return 'Died in session';
  }
}

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
