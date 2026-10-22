'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { Field, Modal } from '@/components/ui';
import {
  APPROVAL_CADENCES,
  APPROVAL_CADENCE_LABELS,
  TIMESHEET_VERSIONS,
  TIMESHEET_VERSION_LABELS,
  type ApprovalCadence,
  type TimesheetVersion,
} from '@/lib/timesheet-rules';

/**
 * Admin's timesheet settings (M65). One component for both places they live:
 * a deployment sets its own version, full day and cadence; a project sets the
 * default version its deployments fall back to (D10).
 */
export function TimesheetSettings(
  props:
    | {
        kind: 'deployment';
        id: number;
        timesheetVersion: TimesheetVersion | null;
        projectVersion: TimesheetVersion;
        fullDayHours: number;
        approvalCadence: ApprovalCadence;
      }
    | { kind: 'project'; id: number; timesheetVersion: TimesheetVersion },
) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() =>
    props.kind === 'deployment'
      ? {
          timesheetVersion: props.timesheetVersion ?? '',
          fullDayHours: String(props.fullDayHours),
          approvalCadence: props.approvalCadence as string,
        }
      : { timesheetVersion: props.timesheetVersion as string, fullDayHours: '', approvalCadence: '' },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const url = props.kind === 'deployment' ? `/api/deployments/${props.id}/timesheet` : `/api/projects/${props.id}/timesheet`;
      const json =
        props.kind === 'deployment' ? form : { timesheetVersion: form.timesheetVersion };
      await api(url, { method: 'PUT', json });
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Timesheet settings">
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <Field
            label={props.kind === 'deployment' ? 'Timesheet version' : 'Default timesheet version'}
            error={errors.timesheetVersion}
            hint={
              props.kind === 'deployment'
                ? 'Overrides the project default for this deployment only'
                : 'Used by every deployment on this project that does not set its own'
            }
          >
            <select
              className="input"
              value={form.timesheetVersion}
              onChange={(e) => setForm({ ...form, timesheetVersion: e.target.value })}
            >
              {props.kind === 'deployment' && (
                <option value="">
                  Project default ({TIMESHEET_VERSION_LABELS[props.projectVersion]})
                </option>
              )}
              {TIMESHEET_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {TIMESHEET_VERSION_LABELS[v]}
                </option>
              ))}
            </select>
          </Field>
          {props.kind === 'deployment' && (
            <>
              <Field
                label="Hours in a full day"
                error={errors.fullDayHours}
                hint="Billable days = hours ÷ this, to the nearest half day"
              >
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={24}
                  step="0.5"
                  value={form.fullDayHours}
                  onChange={(e) => setForm({ ...form, fullDayHours: e.target.value })}
                />
              </Field>
              <Field label="Approval cadence" error={errors.approvalCadence} hint="How the approval queue groups these days">
                <select
                  className="input"
                  value={form.approvalCadence}
                  onChange={(e) => setForm({ ...form, approvalCadence: e.target.value })}
                >
                  {APPROVAL_CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {APPROVAL_CADENCE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
