import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Clock,
  CalendarOff,
  WalletCards,
  Settings,
  Users,
  Loader2,
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "react-toastify";
import { hrService } from "../../services/apiService";
import { useAuth } from "../../contexts/AuthContext";
import {
  effectiveStaffType,
  hasUiActionPermission,
} from "../../utils/authorization";
import { formatPeso } from "../../utils/paymentSummary";
import { formatDurationMinutes } from "../../utils/durationFormat";
import PayrollPaymentWorkflow from "../../components/hr/PayrollPaymentWorkflow";
import AttendanceCorrectionReviewPanel from "../../components/hr/AttendanceCorrectionReviewPanel";
import { pawzzleConfirm, pawzzlePrompt } from "../../utils/pawzzleDialog";

const money = formatPeso;
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
const localDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const badge = (status) =>
  status === "approved" || status === "paid" || status === "present"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : status === "rejected" || status === "absent"
      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
const payrollSetupLabel = (employee) =>
  employee?.payrollEligibility?.eligible
    ? "Payroll ready"
    : employee?.payrollEligibility?.message || "Payroll setup required";
const payrollOptionStatus = (employee) =>
  employee?.payrollEligibility?.code === "role_retired"
    ? "retired role - excluded from new payroll"
    : employee?.payrollEligibility?.eligible
      ? "payroll ready"
      : "setup required";
const compensationBasisLabel = (basis) =>
  ({
    monthly: "Monthly salary",
    daily: "Daily rate",
    hourly: "Hourly rate",
    legacy_period: "Legacy salary per payroll period",
  })[basis] || "Not configured";
const Button = ({ children, secondary, ...props }) => (
  <button
    {...props}
    className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 ${secondary ? "border border-slate-300 dark:border-slate-700" : "bg-primary text-white"}`}
  >
    {children}
  </button>
);
const NumberField = ({ label, value, min = 0, max = 31, onChange }) => (
  <label className="text-sm font-semibold">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
    />
  </label>
);
const DurationField = ({ field, value, onChange }) => {
  const label = field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        aria-label={label}
        min="0"
        step="1"
        type="number"
        placeholder="Exact minutes"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
      />
      {value !== "" && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Displays as {formatDurationMinutes(value)}; payroll keeps the exact
          minutes.
        </span>
      )}
    </label>
  );
};
const PayrollCutoffFields = ({ settings, setSettings }) => {
  if (settings.payrollFrequency === "weekly")
    return (
      <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
        <NumberField
          label="Week starts on (0 Sun–6 Sat)"
          min={0}
          max={6}
          value={settings.weekly?.weekStartsOn}
          onChange={(weekStartsOn) =>
            setSettings({
              ...settings,
              weekly: { ...settings.weekly, weekStartsOn },
            })
          }
        />
        <NumberField
          label="Pay delay after cutoff (days)"
          value={settings.weekly?.payDelayDays}
          onChange={(payDelayDays) =>
            setSettings({
              ...settings,
              weekly: { ...settings.weekly, payDelayDays },
            })
          }
        />
      </div>
    );
  if (settings.payrollFrequency === "monthly")
    return (
      <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
        <NumberField
          label="Monthly cutoff day"
          min={1}
          max={28}
          value={settings.monthly?.cutoffDay}
          onChange={(cutoffDay) =>
            setSettings({
              ...settings,
              monthly: { ...settings.monthly, cutoffDay },
            })
          }
        />
        <NumberField
          label="Monthly pay day"
          min={1}
          max={31}
          value={settings.monthly?.payDay}
          onChange={(payDay) =>
            setSettings({
              ...settings,
              monthly: { ...settings.monthly, payDay },
            })
          }
        />
      </div>
    );
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
      <NumberField
        label="First cutoff day"
        min={1}
        max={27}
        value={settings.semiMonthly?.firstCutoffDay}
        onChange={(firstCutoffDay) =>
          setSettings({
            ...settings,
            semiMonthly: { ...settings.semiMonthly, firstCutoffDay },
          })
        }
      />
      <NumberField
        label="First pay day"
        min={1}
        max={31}
        value={settings.semiMonthly?.firstPayDay}
        onChange={(firstPayDay) =>
          setSettings({
            ...settings,
            semiMonthly: { ...settings.semiMonthly, firstPayDay },
          })
        }
      />
      <NumberField
        label="Second pay day (next month)"
        min={1}
        max={31}
        value={settings.semiMonthly?.secondPayDay}
        onChange={(secondPayDay) =>
          setSettings({
            ...settings,
            semiMonthly: { ...settings.semiMonthly, secondPayDay },
          })
        }
      />
    </div>
  );
};
const LeavePolicyFields = ({ settings, setSettings }) => (
  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
    <h3 className="text-sm font-bold">Leave pay treatment and credits</h3>
    <p className="mb-3 text-xs text-slate-500">
      Paid treatment and annual credits are Store policy. A blank credit limit
      means tracked but uncapped.
    </p>
    <div className="grid gap-2 sm:grid-cols-2">
      {(settings.leaveTypes || []).map((type, index) => (
        <div
          key={type.key}
          className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
        >
          <div className="flex items-center justify-between">
            <strong>{type.name}</strong>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!type.isPaid}
                onChange={(e) => {
                  const leaveTypes = settings.leaveTypes.map(
                    (item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, isPaid: e.target.checked }
                        : item,
                  );
                  setSettings({ ...settings, leaveTypes });
                }}
              />
              Paid
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs">
              Annual credits
              <input
                aria-label={`${type.name} annual credits`}
                min="0"
                step="0.5"
                type="number"
                value={type.annualCredits ?? ""}
                placeholder="Uncapped"
                onChange={(e) => {
                  const leaveTypes = settings.leaveTypes.map(
                    (item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            annualCredits:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : item,
                  );
                  setSettings({ ...settings, leaveTypes });
                }}
                className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs">
              Carry-over limit
              <input
                aria-label={`${type.name} carry over limit`}
                min="0"
                step="0.5"
                type="number"
                value={type.carryOverLimit ?? 0}
                onChange={(e) => {
                  const leaveTypes = settings.leaveTypes.map(
                    (item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, carryOverLimit: Number(e.target.value) }
                        : item,
                  );
                  setSettings({ ...settings, leaveTypes });
                }}
                className="mt-1 w-full rounded-lg border bg-white px-2 py-1.5 dark:bg-slate-900"
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StatutoryPolicyFields = ({ settings, setSettings }) => {
  const policy = settings.statutoryContributions || {};
  const update = (section, patch) =>
    setSettings({
      ...settings,
      statutoryContributions: {
        ...policy,
        [section]: { ...(policy[section] || {}), ...patch },
      },
    });
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Philippine statutory payroll</h3>
          <p className="text-xs text-slate-500">
            Version {policy.version || "Not configured"} · employee and employer
            shares remain separate.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={policy.enabled !== false}
            onChange={(e) =>
              setSettings({
                ...settings,
                statutoryContributions: {
                  ...policy,
                  enabled: e.target.checked,
                },
              })
            }
          />
          Enabled
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <NumberField
          label="PhilHealth rate"
          min={0}
          max={1}
          value={policy.philHealth?.rate}
          onChange={(rate) => update("philHealth", { rate })}
        />
        <NumberField
          label="PhilHealth floor"
          min={0}
          max={1000000}
          value={policy.philHealth?.salaryFloor}
          onChange={(salaryFloor) => update("philHealth", { salaryFloor })}
        />
        <NumberField
          label="PhilHealth ceiling"
          min={0}
          max={1000000}
          value={policy.philHealth?.salaryCeiling}
          onChange={(salaryCeiling) => update("philHealth", { salaryCeiling })}
        />
        <NumberField
          label="Pag-IBIG salary ceiling"
          min={0}
          max={1000000}
          value={policy.pagIbig?.salaryCeiling}
          onChange={(salaryCeiling) => update("pagIbig", { salaryCeiling })}
        />
        <NumberField
          label="SSS maximum MSC"
          min={0}
          max={1000000}
          value={policy.sss?.maxMsc}
          onChange={(maxMsc) => update("sss", { maxMsc })}
        />
      </div>
      <p className="mt-3 text-xs text-amber-700">
        Every payroll stores its policy version and calculation breakdown.
        Finance must review the amounts before approval; finalized payslips are
        never rewritten.
      </p>
    </section>
  );
};

const PayrollReports = ({ report, canPrepare, canConfirm, onPrepare, onAdvance, onConfirm }) => (
  <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Gross payroll", report?.totals?.grossPay],
        ["Employee deductions", report?.totals?.employeeDeductions],
        ["Employer contributions", report?.totals?.employerContributions],
        ["Net payroll", report?.totals?.netPay],
      ].map(([label, value]) => (
        <article
          key={label}
          className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold">{money(value)}</p>
        </article>
      ))}
    </div>
    <div className="overflow-x-auto rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
          <tr>
            {[
              "Employee",
              "Period",
              "SSS",
              "PhilHealth",
              "Pag-IBIG",
              "Withholding",
              "Employer share",
              "Net salary",
              "Status",
            ].map((label) => (
              <th key={label} className="px-3 py-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(report?.payslips || []).map((slip) => (
            <tr key={slip._id} className="border-t dark:border-slate-800">
              <td className="px-3 py-2 font-semibold">
                {slip.employeeSnapshot?.name}
              </td>
              <td className="px-3 py-2">
                {date(slip.payrollPeriod?.periodStart)}–
                {date(slip.payrollPeriod?.periodEnd)}
              </td>
              <td className="px-3 py-2">
                {money(slip.statutoryDeductions?.sss)}
              </td>
              <td className="px-3 py-2">
                {money(slip.statutoryDeductions?.philHealth)}
              </td>
              <td className="px-3 py-2">
                {money(slip.statutoryDeductions?.pagIbig)}
              </td>
              <td className="px-3 py-2">
                {money(slip.statutoryDeductions?.withholdingTax)}
              </td>
              <td className="px-3 py-2">
                {money(slip.employerContributions?.total)}
              </td>
              <td className="px-3 py-2 font-bold">{money(slip.netPay)}</td>
              <td className="px-3 py-2 capitalize">
                {String(slip.paymentStatus || "unpaid").replaceAll("_", " ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Government Remittances</h2><p className="text-xs text-slate-500">Prepared from approved payslip snapshots; Paid requires independent confirmation.</p></div></div>
      <div className="mt-3 flex flex-wrap gap-2">{(report?.periods || []).filter(period => ['approved','paid'].includes(period.status) && !(report?.remittances || []).some(item => String(item.payrollPeriod?._id || item.payrollPeriod) === String(period._id))).map(period => <button key={period._id} disabled={!canPrepare} onClick={() => onPrepare(period._id)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">Prepare {date(period.periodStart)} remittances</button>)}</div>
      <div className="mt-3 space-y-2">{(report?.remittances || []).map(item => <article key={item._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><div><p className="font-semibold">{item.agency} · {item.contributionMonth}</p><p className="text-xs text-slate-500">Employee {money(item.employeeAmount)} + Employer {money(item.employerAmount)} = {money(item.totalAmount)}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold capitalize dark:bg-slate-900">{item.status.replaceAll('_',' ')}</span>{canPrepare && ['pending','failed','on_hold'].includes(item.status) && <button onClick={() => onAdvance(item)} className="rounded-lg border px-2 py-1 text-xs font-bold">Submit / Process</button>}{canConfirm && ['for_confirmation','processing'].includes(item.status) && <button onClick={() => onConfirm(item)} className="rounded-lg bg-primary px-2 py-1 text-xs font-bold text-white">Confirm Paid</button>}</div></article>)}</div>
    </div>
  </section>
);

const LocationEvidence = ({ row, punchType }) => {
  const evidence = punchType === "time_out" ? row.timeOut : row.timeIn;
  if (!evidence?.at) return null;
  const coordinates = evidence.coordinates;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      <div>
        <dt className="font-semibold">Server time</dt>
        <dd>
          {date(evidence.at)} {time(evidence.at)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Distance</dt>
        <dd>
          {Number.isFinite(evidence.distanceMeters)
            ? `${Math.round(evidence.distanceMeters)} m`
            : "Unavailable"}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">GPS accuracy</dt>
        <dd>
          {Number.isFinite(evidence.accuracyMeters)
            ? `${Math.round(evidence.accuracyMeters)} m`
            : "Unavailable"}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Coordinates</dt>
        <dd>
          {Number.isFinite(coordinates?.lat) &&
          Number.isFinite(coordinates?.lng)
            ? `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`
            : "Unavailable"}
        </dd>
      </div>
    </dl>
  );
};

const AttendanceReviewCell = ({ row, canReview, onLocationReview }) => {
  const reviews = row.locationReviews || [];
  const actionable = reviews.filter((review) =>
    ["pending", "rejected"].includes(review.status),
  );
  const latest = reviews[reviews.length - 1];
  if (!canReview)
    return (
      <div className="min-w-40 space-y-1 text-xs">
        <p className="font-semibold capitalize">
          Location{" "}
          {latest?.status || (row.locationFlagged ? "pending" : "valid")}
        </p>
      </div>
    );
  return (
    <div className="min-w-40 space-y-2 text-xs">
      <p className="font-semibold capitalize">
        {actionable.length || (row.locationFlagged && !reviews.length)
          ? `Location ${latest?.status || "pending"}`
          : latest
            ? `Location ${latest.status}`
            : "Location valid"}
      </p>
      {actionable.map((review) => (
        <div
          key={review._id || review.punchType}
          className="rounded-lg bg-amber-50 p-2 text-amber-900"
        >
          <p>
            {review.punchType.replace("_", " ")}: {review.employeeReason}
          </p>
          <LocationEvidence row={row} punchType={review.punchType} />
          {review.reviewerNote && (
            <p className="mt-1">Last decision: {review.reviewerNote}</p>
          )}
          {canReview && (
            <div className="mt-2 flex gap-1">
              <Button
                onClick={() =>
                  onLocationReview(row, review.punchType, "approved")
                }
              >
                {review.status === "rejected"
                  ? "Approve after correction"
                  : "Approve"}
              </Button>
              {review.status !== "rejected" && (
                <Button
                  secondary
                  onClick={() =>
                    onLocationReview(row, review.punchType, "rejected")
                  }
                >
                  Reject
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      {row.locationFlagged && !reviews.length && canReview && (
        <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
          <LocationEvidence
            row={row}
            punchType={row.timeOut?.at ? "time_out" : "time_in"}
          />
          <div className="mt-2 flex gap-1">
            <Button
              onClick={() =>
                onLocationReview(
                  row,
                  row.timeOut?.at ? "time_out" : "time_in",
                  "approved",
                )
              }
            >
              Approve legacy flag
            </Button>
            <Button
              secondary
              onClick={() =>
                onLocationReview(
                  row,
                  row.timeOut?.at ? "time_out" : "time_in",
                  "rejected",
                )
              }
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const parseWorkDate = (value) => {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
};
const workDateKey = (value) =>
  [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
const calendarDateLabel = (value, includeWeekday = false) =>
  value.toLocaleDateString("en-US", {
    ...(includeWeekday ? { weekday: "long" } : {}),
    year: "numeric",
    month: "long",
    day: "numeric",
  });
const attendanceDot = (status) =>
  status === "present"
    ? "bg-emerald-500"
    : status === "absent"
      ? "bg-red-500"
      : status === "approved_leave" || status === "on_leave"
        ? "bg-sky-500"
        : "bg-amber-500";

export const ManagementAttendanceCalendar = ({ records = [] }) => {
  const recordsByDate = useMemo(() => {
    const grouped = new Map();
    records.forEach((record) => {
      if (!grouped.has(record.workDate)) grouped.set(record.workDate, []);
      grouped.get(record.workDate).push(record);
    });
    return grouped;
  }, [records]);
  const latestWorkDate = useMemo(
    () => [...recordsByDate.keys()].sort((left, right) => right.localeCompare(left))[0],
    [recordsByDate],
  );
  const initialDate = latestWorkDate || workDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseWorkDate(initialDate);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const calendarDay = new Date(gridStart);
      calendarDay.setDate(gridStart.getDate() + index);
      return calendarDay;
    });
  }, [visibleMonth]);

  const selectedRecords = recordsByDate.get(selectedDate) || [];
  const selectedDateObject = parseWorkDate(selectedDate);
  const todayKey = workDateKey(new Date());
  const selectDate = (calendarDay) => {
    setSelectedDate(workDateKey(calendarDay));
    if (
      calendarDay.getMonth() !== visibleMonth.getMonth() ||
      calendarDay.getFullYear() !== visibleMonth.getFullYear()
    ) {
      setVisibleMonth(new Date(calendarDay.getFullYear(), calendarDay.getMonth(), 1));
    }
  };
  const moveMonth = (amount) => {
    const nextMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + amount,
      1,
    );
    const lastDayOfNextMonth = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth() + 1,
      0,
    ).getDate();
    const nextSelectedDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(selectedDateObject.getDate(), lastDayOfNextMonth),
    );
    setVisibleMonth(nextMonth);
    setSelectedDate(workDateKey(nextSelectedDate));
  };
  const selectToday = () => {
    const today = new Date();
    setSelectedDate(todayKey);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  return (
    <section className="mb-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary dark:bg-primary/10">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Attendance Calendar</h2>
              <p className="text-xs text-slate-500">Select a date to view that day&apos;s attendance.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={selectToday}
          className="self-start rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300 sm:self-auto"
        >
          Today
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <div className="p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-primary hover:bg-primary-50 hover:text-primary dark:border-slate-700 dark:hover:bg-primary/10"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="text-center text-base font-black text-slate-950 dark:text-white sm:text-lg">
              {visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-primary hover:bg-primary-50 hover:text-primary dark:border-slate-700 dark:hover:bg-primary/10"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((calendarDay) => {
              const dayKey = workDateKey(calendarDay);
              const dayRecords = recordsByDate.get(dayKey) || [];
              const isSelected = dayKey === selectedDate;
              const isToday = dayKey === todayKey;
              const isCurrentMonth =
                calendarDay.getMonth() === visibleMonth.getMonth() &&
                calendarDay.getFullYear() === visibleMonth.getFullYear();
              const statuses = [...new Set(dayRecords.map((record) => record.status || "incomplete"))].slice(0, 3);
              const attendanceCount = dayRecords.length;
              return (
                <button
                  type="button"
                  key={dayKey}
                  onClick={() => selectDate(calendarDay)}
                  aria-label={`Select ${calendarDateLabel(calendarDay)}, ${attendanceCount} attendance ${attendanceCount === 1 ? "record" : "records"}`}
                  aria-pressed={isSelected}
                  className={`group relative flex min-h-14 flex-col items-center justify-center rounded-2xl border text-sm font-bold transition sm:min-h-20 ${
                    isSelected
                      ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                      : isToday
                        ? "border-primary/40 bg-primary-50 text-primary hover:border-primary dark:bg-primary/10"
                        : isCurrentMonth
                          ? "border-transparent text-slate-800 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                          : "border-transparent text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span>{calendarDay.getDate()}</span>
                  <span className="mt-1.5 flex h-2 items-center justify-center gap-1" aria-hidden="true">
                    {statuses.map((status) => (
                      <span
                        key={status}
                        className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : attendanceDot(status)}`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-500 dark:border-slate-800">
            {[
              ["bg-emerald-500", "Present"],
              ["bg-amber-500", "Incomplete / late"],
              ["bg-red-500", "Absent"],
              ["bg-sky-500", "Approved leave"],
            ].map(([tone, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${tone}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <aside
          role="region"
          aria-label={`Attendance for ${calendarDateLabel(selectedDateObject, true)}`}
          className="border-t border-slate-100 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40 sm:p-6 lg:border-l lg:border-t-0"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Selected date</p>
              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                {calendarDateLabel(selectedDateObject, true)}
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
              {selectedRecords.length} {selectedRecords.length === 1 ? "record" : "records"}
            </span>
          </div>

          <div className="space-y-3">
            {selectedRecords.map((record) => {
              const firstName = record.employee?.firstName || "Staff";
              const lastName = record.employee?.lastName || "member";
              const employeeRole = (record.employee?.staffType || record.employee?.role || "Staff")
                .replaceAll("_", " ");
              const status = String(record.status || "incomplete").replaceAll("_", " ");
              return (
                <div
                  key={`${selectedDate}-${record._id || record.employee?._id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {firstName.charAt(0)}{lastName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{firstName} {lastName}</p>
                      <p className="truncate text-[10px] font-semibold capitalize text-slate-400">{employeeRole}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${badge(record.status)}`}>
                      {status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[10px] dark:border-slate-800">
                    <p className="text-slate-500">Time in <span className="block font-bold text-slate-800 dark:text-slate-200">{record.timeIn?.at ? time(record.timeIn.at) : "Not recorded"}</span></p>
                    <p className="text-slate-500">Time out <span className="block font-bold text-slate-800 dark:text-slate-200">{record.timeOut?.at ? time(record.timeOut.at) : "Not recorded"}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
          {!selectedRecords.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
              <CalendarDays className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No attendance entries</p>
              <p className="mt-1 text-xs text-slate-500">There are no attendance records for this date.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

const HRManagement = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = effectiveStaffType(user);
  const owner = [
    "admin",
    "store_owner",
    "super_admin",
    "platform_admin",
  ].includes(user?.role);
  const finance = role === "finance_staff";
  const canReviewAttendance =
    owner || hasUiActionPermission(user, "attendance", "review", false);
  const tabs = useMemo(
    () =>
      [
        { id: "attendance", label: "Attendance", icon: Clock, show: true },
        { id: "leave", label: "Leave Requests", icon: CalendarOff, show: true },
        {
          id: "payroll",
          label: "Payroll",
          icon: WalletCards,
          show: owner || finance,
        },
        {
          id: "employees",
          label: "Compensation",
          icon: Users,
          show: owner || finance,
        },
        {
          id: "reports",
          label: "Reports & Remittances",
          icon: BarChart3,
          show: owner || finance,
        },
        {
          id: "settings",
          label: "Payroll Settings",
          icon: Settings,
          show: owner,
        },
      ].filter((item) => item.show),
    [owner, finance],
  );
  const requestedTab = searchParams.get("tab") || "attendance";
  const tab = tabs.some((item) => item.id === requestedTab)
    ? requestedTab
    : tabs[0].id;
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [workplace, setWorkplace] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [attendanceCorrections, setAttendanceCorrections] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [compensation, setCompensation] = useState({
    staffId: "",
    employmentStatus: "active",
    dateHired: "",
    employmentEndDate: "",
    branchName: "",
    changeReason: "",
    compensation: {
      compensationType: "salary",
      compensationBasis: "monthly",
      baseRate: "",
      effectiveDate: "",
    },
  });
  const [payRecord, setPayRecord] = useState({
    method: "",
    referenceNumber: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [adjustment, setAdjustment] = useState({
    payslipId: "",
    kind: "addition",
    type: "",
    amount: "",
    reason: "",
  });
  const [correction, setCorrection] = useState({
    attendanceId: "",
    timeIn: "",
    timeOut: "",
    status: "",
    workedMinutes: "",
    reason: "",
  });

  const loadBase = useCallback(async () => {
    try {
      const [settingsResponse, employeesResponse] = await Promise.all([
        hrService.getSettings(),
        hrService.getEmployees(),
      ]);
      setSettings(settingsResponse.data.settings);
      setWorkplace(settingsResponse.data.workplace);
      setEmployees(employeesResponse.data.employees || []);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load HR settings.",
      );
    }
  }, []);
  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "attendance") {
        const [attendanceResponse, correctionResponse] = await Promise.all([
          hrService.getAttendance(),
          hrService.getAttendanceCorrections(),
        ]);
        setAttendance(attendanceResponse.data.records || []);
        setAttendanceCorrections(correctionResponse.data.requests || []);
      }
      if (tab === "leave")
        setLeaves((await hrService.getLeaves()).data.leaves || []);
      if (tab === "payroll")
        setPeriods((await hrService.getPayrollPeriods()).data.periods || []);
      if (tab === "reports")
        setReport((await hrService.getPayrollReports()).data);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load HR records.",
      );
    } finally {
      setLoading(false);
    }
  }, [tab]);
  useEffect(() => {
    loadBase();
  }, [loadBase]);
  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const reviewLeave = async (id, status) => {
    try {
      await hrService.reviewLeave(id, { status });
      toast.success(`Leave ${status}.`);
      loadTab();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to review leave.");
    }
  };
  const reviewLocation = async (record, punchType, status) => {
    const reviewerNote = await pawzzlePrompt(
      `Explain the basis for ${status === "approved" ? "approving" : "rejecting"} this ${punchType.replace("_", " ")} location.`,
      {
        title: "Review attendance location",
        inputLabel: "Review reason",
        required: true,
        multiline: true,
        confirmLabel: "Submit review",
        tone: status === "approved" ? "warning" : "danger",
      },
    );
    if (reviewerNote === null) return;
    try {
      const response = await hrService.reviewAttendanceLocation(record._id, {
        punchType,
        status,
        reviewerNote,
      });
      toast.success(response.data.message);
      await loadTab();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to review attendance location.",
      );
    }
  };
  const openPeriod = async (id) => {
    try {
      const response = await hrService.getPayrollPeriod(id);
      setSelectedPeriod(response.data.period);
      setPayslips(response.data.payslips || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to open payroll.");
    }
  };
  const payrollAction = async (id, action) => {
    try {
      const methods = {
        compute: hrService.computePayroll,
        review: hrService.reviewPayroll,
        approve: hrService.approvePayroll,
      };
      const response =
        action === "review"
          ? await methods[action](id, {
              acknowledgeIssues: !!selectedPeriod?.reviewIssues?.length,
            })
          : await methods[action](id);
      toast.success(response.data.message);
      await loadTab();
      await openPeriod(id);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update payroll.");
    }
  };
  const recordPaid = async (event) => {
    event.preventDefault();
    toast.error(
      "Payroll is finalized per employee now. Use the independent employee payment panel above; no period-wide Paid action is available.",
    );
  };
  const submitAdjustment = async (event) => {
    event.preventDefault();
    try {
      await hrService.addAdjustment(adjustment.payslipId, adjustment);
      toast.success("Payroll adjustment recorded.");
      setAdjustment({
        payslipId: "",
        kind: "addition",
        type: "",
        amount: "",
        reason: "",
      });
      await openPeriod(selectedPeriod._id);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to add payroll adjustment.",
      );
    }
  };
  const submitCorrection = async (event) => {
    event.preventDefault();
    try {
      const selected = attendance.find(
        (row) => row._id === correction.attendanceId,
      );
      if (selected?.isDerived) {
        await hrService.createManualAttendance({
          reason: correction.reason,
          status: correction.status || "absent",
          workedMinutes: Number(correction.workedMinutes || 0),
          employeeId: selected.employee?._id,
          workDate: selected.workDate,
        });
      } else {
        if (
          !(await pawzzleConfirm(
            "Confirm the displayed before and proposed values. This will invalidate affected draft payroll calculations.",
            {
              title: "Correct attendance record?",
              confirmLabel: "Apply correction",
              tone: "warning",
            },
          ))
        )
          return;
        const data = {
          reason: correction.reason,
          confirmed: true,
          expectedVersion: selected.__v,
        };
        if (correction.timeIn)
          data.timeIn = new Date(correction.timeIn).toISOString();
        data.timeOut = correction.timeOut
          ? new Date(correction.timeOut).toISOString()
          : null;
        data.status = correction.timeOut
          ? correction.status || undefined
          : "incomplete";
        await hrService.correctAttendance(correction.attendanceId, data);
      }
      toast.success("Attendance correction recorded.");
      setCorrection({
        attendanceId: "",
        timeIn: "",
        timeOut: "",
        status: "",
        workedMinutes: "",
        reason: "",
      });
      await loadTab();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to correct attendance.",
      );
    }
  };
  const loadCompensation = async (employeeId) => {
    setSelectedEmployee(employeeId);
    if (!employeeId) return;
    try {
      const profile =
        (await hrService.getCompensation(employeeId)).data.employee
          .employmentProfile || {};
      const basis =
        profile.compensation?.compensationBasis ||
        (profile.compensation?.compensationType === "daily"
          ? "daily"
          : profile.compensation?.compensationType === "hourly"
            ? "hourly"
            : profile.compensation
              ? "legacy_period"
              : "monthly");
      setCompensation({
        staffId: profile.staffId || "",
        employmentStatus: profile.employmentStatus || "active",
        dateHired: profile.dateHired?.slice(0, 10) || "",
        employmentEndDate: profile.employmentEndDate?.slice(0, 10) || "",
        branchName: profile.branchName || "",
        changeReason: "",
        compensation: {
          compensationType: ["daily", "hourly"].includes(basis)
            ? basis
            : "salary",
          compensationBasis: basis,
          baseRate: profile.compensation?.baseRate ?? "",
          effectiveDate:
            profile.compensation?.effectiveDate?.slice(0, 10) || "",
        },
      });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load compensation.",
      );
    }
  };
  const saveCompensation = async (event) => {
    event.preventDefault();
    try {
      const response = await hrService.updateCompensation(
        selectedEmployee,
        compensation,
      );
      toast.success(response.data.message);
      await loadBase();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to save compensation.",
      );
    }
  };
  const saveSettings = async (event) => {
    event?.preventDefault();
    try {
      const response = await hrService.updateSettings(settings);
      setSettings(response.data.settings);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to save payroll settings.",
      );
    }
  };
  const reloadReport = async () => setReport((await hrService.getPayrollReports()).data);
  const prepareRemittances = async (periodId) => {
    try { const response = await hrService.prepareGovernmentRemittances(periodId); toast.success(response.data.message); await reloadReport(); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to prepare remittances.'); }
  };
  const advanceRemittance = async (item) => {
    const note = await pawzzlePrompt(`Explain the ${item.agency} remittance submission or processing action.`, { title: 'Update remittance', inputLabel: 'Required note', required: true, multiline: true, confirmLabel: 'Continue' });
    if (note === null) return;
    const status = item.status === 'pending' ? 'for_confirmation' : 'processing';
    try { const response = await hrService.updateGovernmentRemittance(item._id, { status, note }); toast.success(response.data.message); await reloadReport(); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to update remittance.'); }
  };
  const confirmRemittance = async (item) => {
    const paymentReference = await pawzzlePrompt(`Enter the confirmed ${item.agency} payment reference.`, { title: 'Confirm government remittance', inputLabel: 'Payment reference', required: true, confirmLabel: 'Next' });
    if (paymentReference === null) return;
    const note = await pawzzlePrompt('Explain the independent confirmation basis.', { title: 'Confirm government remittance', inputLabel: 'Confirmation note', required: true, multiline: true, confirmLabel: 'Confirm Paid', tone: 'warning' });
    if (note === null) return;
    try { const response = await hrService.confirmGovernmentRemittance(item._id, { paymentReference, note }); toast.success(response.data.message); await reloadReport(); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to confirm remittance.'); }
  };
  const selectedEmployeeRecord = employees.find(
    (employee) => employee._id === selectedEmployee,
  );
  const ownId = String(user?._id || user?.id || "");
  const financeOwnEmployee =
    finance && String(selectedEmployee || "") === ownId;
  const financeOwnPayslip =
    finance &&
    payslips.some(
      (slip) => String(slip.employee?._id || slip.employee || "") === ownId,
    );
  const canPreparePayment =
    owner ||
    finance ||
    hasUiActionPermission(user, "payroll_payment", "prepare", false);
  const canConfirmPayment =
    owner || hasUiActionPermission(user, "payroll_payment", "confirm", false);

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 text-slate-900 dark:text-slate-100">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Employees & Payroll</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Store-scoped attendance, leave, compensation, and payroll records.
        </p>
      </div>
      <nav className="content-scroll-row mb-5 gap-2 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setSearchParams({ tab: item.id })}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-slate-500"}`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      {!loading &&
        tab === "payroll" &&
        selectedPeriod &&
        ["approved", "paid"].includes(selectedPeriod.status) && (
          <PayrollPaymentWorkflow
            period={selectedPeriod}
            actorId={ownId}
            canPrepare={canPreparePayment}
            canConfirm={canConfirmPayment}
            allowSelfProcessing={owner}
            onChanged={() => {
              loadTab();
              openPeriod(selectedPeriod._id);
            }}
          />
        )}
      {loading && (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}
      {!loading && tab === "reports" && <PayrollReports report={report} canPrepare={canPreparePayment} canConfirm={canConfirmPayment} onPrepare={prepareRemittances} onAdvance={advanceRemittance} onConfirm={confirmRemittance} />}

      {!loading && tab === "settings" && settings && (
        <section className="mx-auto mb-5 max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="font-bold">Attendance timing controls</h2>
            <p className="text-sm text-slate-500">
              Configure the Store's manual clock-in admission window. Clock-out
              is always an employee action or an authorized correction.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Time in before shift (minutes)"
              min={0}
              max={720}
              value={
                settings.timeInWindow?.earlyMinutes ??
                settings.gracePeriodMinutes ??
                0
              }
              onChange={(earlyMinutes) =>
                setSettings({
                  ...settings,
                  timeInWindow: {
                    ...settings.timeInWindow,
                    earlyMinutes,
                    lateMinutes:
                      settings.timeInWindow?.lateMinutes ??
                      settings.gracePeriodMinutes ??
                      0,
                  },
                })
              }
            />
            <NumberField
              label="Time in after shift start (minutes)"
              min={0}
              max={720}
              value={
                settings.timeInWindow?.lateMinutes ??
                settings.gracePeriodMinutes ??
                0
              }
              onChange={(lateMinutes) =>
                setSettings({
                  ...settings,
                  timeInWindow: {
                    ...settings.timeInWindow,
                    earlyMinutes:
                      settings.timeInWindow?.earlyMinutes ??
                      settings.gracePeriodMinutes ??
                      0,
                    lateMinutes,
                  },
                })
              }
            />
          </div>
          <p className="text-xs text-slate-500">
            Open attendance sessions remain incomplete until the employee clocks
            out or an authorized correction is approved.
          </p>
          <Button onClick={saveSettings}>Save Attendance Timing</Button>
        </section>
      )}

      {!loading && tab === "attendance" && (
        <ManagementAttendanceCalendar records={attendance} />
      )}

      {!loading && tab === "attendance" && (
        <AttendanceCorrectionReviewPanel
          requests={attendanceCorrections}
          canReview={canReviewAttendance}
          onChanged={loadTab}
        />
      )}
      {!loading &&
        tab === "attendance" &&
        attendance.some(
          (row) => row.locationFlagged || row.locationReviews?.length,
        ) && (
          <section className="mb-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <div>
              <h2 className="font-bold text-amber-950 dark:text-amber-100">
                Location exception review
              </h2>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Employee reasons and captured GPS evidence remain attached to
                the attendance record.
              </p>
            </div>
            {attendance
              .filter(
                (row) => row.locationFlagged || row.locationReviews?.length,
              )
              .map((row) => (
                <article
                  key={`review-${row._id}`}
                  className="rounded-xl bg-white p-3 dark:bg-slate-900"
                >
                  <p className="mb-2 text-xs font-bold">
                    {row.employee?.firstName} {row.employee?.lastName} ·{" "}
                    {row.workDate}
                  </p>
                  <AttendanceReviewCell
                    row={row}
                    canReview={canReviewAttendance}
                    onLocationReview={reviewLocation}
                  />
                </article>
              ))}
          </section>
        )}

      {!loading && tab === "attendance" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="font-bold">Attendance Records</h2>
              <p className="text-xs text-slate-500">
                Location validation and schedule results for this Store only.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {attendance.length} records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60">
                <tr>
                  {[
                    "Employee",
                    "Date",
                    "Shift",
                    "Time In",
                    "Time Out",
                    "Worked",
                    "Late",
                    "Location",
                    "Status",
                  ].map((value) => (
                    <th key={value} className="px-3 py-3">
                      {value}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendance.map((row) => (
                  <tr
                    key={row._id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-3 py-3 font-semibold">
                      {row.employee?.firstName} {row.employee?.lastName}
                      <span className="block text-xs font-normal text-slate-500">
                        {(
                          row.employee?.staffType ||
                          row.employee?.role ||
                          ""
                        ).replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3">{row.workDate}</td>
                    <td className="px-3 py-3">
                      {row.schedule?.start || "—"}–{row.schedule?.end || "—"}
                    </td>
                    <td className="px-3 py-3">{time(row.timeIn?.at)}</td>
                    <td className="px-3 py-3">{time(row.timeOut?.at)}</td>
                    <td className="px-3 py-3">
                      {formatDurationMinutes(row.workedMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      {formatDurationMinutes(row.lateMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      {row.locationFlagged ? "Review needed" : "Valid"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badge(row.status)}`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!attendance.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No attendance records for this period.
            </p>
          )}
        </section>
      )}

      {!loading && tab === "leave" && (
        <section className="space-y-3">
          {leaves.map((item) => (
            <article
              key={item._id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">
                    {item.employee?.firstName} {item.employee?.lastName}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {item.leaveTypeName} · {item.isPaid ? "Paid" : "Unpaid"} ·{" "}
                    {date(item.startDate)}–{date(item.endDate)}
                  </p>
                  <p className="mt-2 text-sm">{item.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badge(item.status)}`}
                  >
                    {item.status}
                  </span>
                  {item.status === "pending" &&
                    (owner || role === "manager") && (
                      <>
                        <Button
                          onClick={() => reviewLeave(item._id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          secondary
                          onClick={() => reviewLeave(item._id, "rejected")}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                </div>
              </div>
            </article>
          ))}
          {!leaves.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
              No leave requests found.
            </div>
          )}
        </section>
      )}

      {!loading && tab === "payroll" && (
        <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Payroll Periods</h2>
              <Button
                onClick={async () => {
                  try {
                    const response = await hrService.createPayrollPeriod({
                      referenceDate: new Date(),
                    });
                    toast.success(response.data.message);
                    loadTab();
                  } catch (error) {
                    toast.error(
                      error.response?.data?.message ||
                        "Unable to create period.",
                    );
                  }
                }}
              >
                New Period
              </Button>
            </div>
            {periods.map((period) => (
              <button
                key={period._id}
                onClick={() => openPeriod(period._id)}
                className={`w-full rounded-xl border p-4 text-left ${selectedPeriod?._id === period._id ? "border-primary bg-primary/5" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">
                    {date(period.periodStart)}–{date(period.periodEnd)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badge(period.status)}`}
                  >
                    {period.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {period.frequency.replace("_", "-")} · Pay date{" "}
                  {date(period.payDate)}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {money(period.totals?.netPay)} net
                </p>
              </button>
            ))}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {!selectedPeriod ? (
              <div className="flex min-h-64 items-center justify-center text-center text-sm text-slate-500">
                Select a payroll period to review its employee computations.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">Payroll Review</h2>
                    <p className="text-xs text-slate-500">
                      {date(selectedPeriod.periodStart)}–
                      {date(selectedPeriod.periodEnd)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["draft", "computed"].includes(selectedPeriod.status) && (
                      <Button
                        onClick={() =>
                          payrollAction(selectedPeriod._id, "compute")
                        }
                      >
                        {selectedPeriod.status === "draft"
                          ? "Compute"
                          : "Recompute"}
                      </Button>
                    )}
                    {selectedPeriod.status === "computed" &&
                      !financeOwnPayslip && (
                        <Button
                          onClick={() =>
                            payrollAction(selectedPeriod._id, "review")
                          }
                        >
                          Mark Reviewed
                        </Button>
                      )}
                    {selectedPeriod.status === "reviewed" && owner && (
                      <Button
                        onClick={() =>
                          payrollAction(selectedPeriod._id, "approve")
                        }
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
                {financeOwnPayslip && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                  >
                    This payroll includes your salary. Finance may compute it,
                    but a Store Owner or authorized non-beneficiary must review
                    and record the external payment.
                  </div>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        {[
                          "Employee",
                          "Attendance",
                          "Base",
                          "Additions",
                          "Deductions",
                          "Net",
                        ].map((v) => (
                          <th key={v} className="px-2 py-2">
                            {v}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payslips.map((slip) => (
                        <tr
                          key={slip._id}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-2 py-3 font-semibold">
                            {slip.employeeSnapshot?.name}
                            <span className="block text-[10px] font-normal text-slate-500">
                              {compensationBasisLabel(
                                slip.employeeSnapshot?.compensationBasis,
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs">
                            {formatDurationMinutes(
                              slip.attendanceSummary?.workedMinutes,
                            )}{" "}
                            worked
                            <br />
                            {slip.attendanceSummary?.daysPresent || 0} present ·{" "}
                            {slip.attendanceSummary?.absences || 0} absent
                          </td>
                          <td className="px-2 py-3">{money(slip.basePay)}</td>
                          <td className="px-2 py-3">
                            {money(
                              slip.additions?.reduce((s, a) => s + a.amount, 0),
                            )}
                          </td>
                          <td className="px-2 py-3">
                            {money(
                              slip.deductions?.reduce(
                                (s, a) => s + a.amount,
                                0,
                              ),
                            )}
                          </td>
                          <td className="px-2 py-3 font-bold text-primary">
                            {money(slip.netPay)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedPeriod.status === "approved" && !financeOwnPayslip && (
                  <form
                    onSubmit={recordPaid}
                    className="mt-5 grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2"
                  >
                    <div className="sm:col-span-2">
                      <h3 className="font-bold">Record salary payment</h3>
                      <p className="text-xs text-slate-500">
                        This records an external/manual payment; Pawzzle will
                        not initiate a bank transfer.
                      </p>
                    </div>
                    <input
                      required
                      placeholder="Payment method"
                      value={payRecord.method}
                      onChange={(e) =>
                        setPayRecord({ ...payRecord, method: e.target.value })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <input
                      required
                      placeholder="Reference number"
                      value={payRecord.referenceNumber}
                      onChange={(e) =>
                        setPayRecord({
                          ...payRecord,
                          referenceNumber: e.target.value,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <input
                      required
                      type="date"
                      value={payRecord.paymentDate}
                      onChange={(e) =>
                        setPayRecord({
                          ...payRecord,
                          paymentDate: e.target.value,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <Button>Record as Paid</Button>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {!loading && tab === "employees" && (
        <form
          onSubmit={saveCompensation}
          className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <h2 className="font-bold">Employee Compensation</h2>
            <p className="text-sm text-slate-500">
              Every new rate has an explicit basis and effective date. Existing
              salary records without a basis remain legacy per-payroll-period
              amounts until an authorized future revision is recorded.
            </p>
          </div>
          <label className="block text-sm font-semibold">
            Employee
            <select
              required
              value={selectedEmployee}
              onChange={(e) => loadCompensation(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
            >
              <option value="">Select employee</option>
              {employees.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.firstName} {item.lastName} ·{" "}
                  {(item.staffType || item.role).replaceAll("_", " ")} ·{" "}
                  {payrollOptionStatus(item)}
                </option>
              ))}
            </select>
          </label>
          {selectedEmployee && (
            <>
              <div
                role="status"
                className={`rounded-xl border p-3 text-sm ${selectedEmployeeRecord?.payrollEligibility?.eligible ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"}`}
              >
                <strong>
                  {selectedEmployeeRecord?.payrollEligibility?.eligible
                    ? "Ready for payroll."
                    : "Payroll setup required."}
                </strong>{" "}
                {payrollSetupLabel(selectedEmployeeRecord)}{" "}
                <span className="block text-xs">
                  Current basis:{" "}
                  {compensationBasisLabel(
                    selectedEmployeeRecord?.compensationSummary
                      ?.compensationBasis,
                  )}
                </span>
              </div>
              {financeOwnEmployee && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  Finance staff cannot change their own employment or
                  compensation.
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Employee ID
                  <input
                    value={compensation.staffId}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        staffId: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Date hired
                  <input
                    type="date"
                    value={compensation.dateHired}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        dateHired: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Employment end date
                  <input
                    type="date"
                    value={compensation.employmentEndDate}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        employmentEndDate: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Employment status
                  <select
                    aria-label="Employment status"
                    value={compensation.employmentStatus}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        employmentStatus: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  >
                    <option value="active">Active employee</option>
                    <option value="probationary">Probationary</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract employee</option>
                    <option value="inactive">Inactive</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Compensation basis
                  <select
                    aria-label="Compensation basis"
                    value={compensation.compensation.compensationBasis}
                    onChange={(e) => {
                      const basis = e.target.value;
                      setCompensation({
                        ...compensation,
                        compensation: {
                          ...compensation.compensation,
                          compensationBasis: basis,
                          compensationType: ["daily", "hourly"].includes(basis)
                            ? basis
                            : "salary",
                        },
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  >
                    <option value="monthly">Monthly salary</option>
                    <option value="daily">Daily rate</option>
                    <option value="hourly">Hourly rate</option>
                    <option value="legacy_period">
                      Legacy salary per payroll period
                    </option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Base rate
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    value={compensation.compensation.baseRate}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        compensation: {
                          ...compensation.compensation,
                          baseRate: e.target.value,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Effective date
                  <input
                    required
                    type="date"
                    value={compensation.compensation.effectiveDate}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        compensation: {
                          ...compensation.compensation,
                          effectiveDate: e.target.value,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                  />
                </label>
                <label className="text-sm font-semibold sm:col-span-2">
                  Change reason
                  <textarea
                    required
                    minLength={5}
                    value={compensation.changeReason}
                    onChange={(e) =>
                      setCompensation({
                        ...compensation,
                        changeReason: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                    placeholder="Reason for this effective-dated revision"
                  />
                </label>
              </div>
              <Button
                disabled={
                  selectedEmployeeRecord?.payrollEligibility?.code ===
                    "role_retired" || financeOwnEmployee
                }
              >
                Save Employment & Compensation
              </Button>
            </>
          )}
        </form>
      )}

      {!loading && tab === "settings" && settings && (
        <form
          onSubmit={saveSettings}
          className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <h2 className="font-bold">Payroll & Attendance Settings</h2>
            <p className="text-sm text-slate-500">
              Rules apply only to this Store. Coordinates come from Store
              Details.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <span className="font-semibold">Workplace map location:</span>{" "}
            {workplace?.coordinates?.lat != null
              ? `${workplace.coordinates.lat}, ${workplace.coordinates.lng}`
              : "Not configured — attendance cannot be recorded until coordinates are added."}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Payroll frequency
              <select
                value={settings.payrollFrequency}
                onChange={(e) =>
                  setSettings({ ...settings, payrollFrequency: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              >
                <option value="weekly">Weekly</option>
                <option value="semi_monthly">Semi-Monthly / Kinsenas</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Attendance radius (meters)
              <input
                min="20"
                max="5000"
                type="number"
                value={settings.attendanceRadiusMeters}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    attendanceRadiusMeters: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              />
            </label>
            <label className="text-sm font-semibold">
              Default shift start
              <input
                type="time"
                value={settings.defaultShift?.start || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultShift: {
                      ...settings.defaultShift,
                      start: e.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              />
            </label>
            <label className="text-sm font-semibold">
              Default shift end
              <input
                type="time"
                value={settings.defaultShift?.end || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultShift: {
                      ...settings.defaultShift,
                      end: e.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              />
            </label>
            <label className="text-sm font-semibold">
              Grace period (minutes)
              <input
                min="0"
                type="number"
                value={settings.gracePeriodMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    gracePeriodMinutes: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              />
            </label>
            <label className="text-sm font-semibold">
              Outside-area handling
              <select
                value={settings.outsideGeofencePolicy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    outsideGeofencePolicy: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
              >
                <option value="reject">Reject attendance</option>
                <option value="flag">Record and flag for review</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mr-2 inline" size={17} />
            Statutory schedules are configurable and snapshotted into each
            payroll. Finance must verify the version and computation breakdown
            before approval.
          </div>
          <Button>Save Settings</Button>
        </form>
      )}
      {!loading &&
        tab === "attendance" &&
        canReviewAttendance &&
        attendance.some((row) => !row.isDerived) && (
          <form
            onSubmit={submitCorrection}
            className="mx-auto mt-5 max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <h2 className="font-bold">Correct Attendance</h2>
              <p className="text-sm text-slate-500">
                Review the original values in the selected record, then enter
                justified timestamps. The server recalculates durations;
                finalized payroll is never rewritten.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                required
                value={correction.attendanceId}
                onChange={(e) => {
                  const row = attendance.find(
                    (item) => item._id === e.target.value,
                  );
                  setCorrection({
                    ...correction,
                    attendanceId: e.target.value,
                    timeIn: localDateTime(row?.timeIn?.at),
                    timeOut: localDateTime(row?.timeOut?.at),
                    status: row?.status || "",
                  });
                }}
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                <option value="">Select attendance record</option>
                {attendance
                  .filter((row) => !row.isDerived)
                  .map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.workDate} · {row.employee?.firstName}{" "}
                      {row.employee?.lastName} · {time(row.timeIn?.at)}–
                      {time(row.timeOut?.at)}
                    </option>
                  ))}
              </select>
              <select
                value={correction.status}
                onChange={(e) =>
                  setCorrection({ ...correction, status: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                <option value="">Recalculate status</option>
                {["present", "late", "undertime", "incomplete"].map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <label className="text-sm font-semibold">
                Corrected clock-in
                <input
                  required
                  type="datetime-local"
                  value={correction.timeIn}
                  onChange={(e) =>
                    setCorrection({ ...correction, timeIn: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                />
              </label>
              <label className="text-sm font-semibold">
                Corrected clock-out{" "}
                <span className="font-normal text-slate-500">
                  (blank keeps incomplete)
                </span>
                <input
                  type="datetime-local"
                  value={correction.timeOut}
                  onChange={(e) =>
                    setCorrection({ ...correction, timeOut: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 dark:border-slate-700"
                />
              </label>
              <textarea
                required
                minLength={5}
                placeholder="Required correction reason"
                value={correction.reason}
                onChange={(e) =>
                  setCorrection({ ...correction, reason: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 sm:col-span-2"
              />
            </div>
            <Button>Review & Save Audited Correction</Button>
          </form>
        )}
      {!loading &&
        tab === "payroll" &&
        selectedPeriod &&
        ["draft", "computed"].includes(selectedPeriod.status) &&
        payslips.length > 0 && (
          <form
            onSubmit={submitAdjustment}
            className="mx-auto mt-5 max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <h2 className="font-bold">Manual Payroll Adjustment</h2>
              <p className="text-sm text-slate-500">
                Every addition or deduction records its reason, creator, and
                timestamp. Finance cannot adjust its own payslip.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                required
                value={adjustment.payslipId}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, payslipId: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                <option value="">Select employee</option>
                {payslips
                  .filter(
                    (slip) =>
                      !finance ||
                      String(slip.employee?._id || slip.employee || "") !==
                        ownId,
                  )
                  .map((slip) => (
                    <option key={slip._id} value={slip._id}>
                      {slip.employeeSnapshot?.name}
                    </option>
                  ))}
              </select>
              <select
                value={adjustment.kind}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, kind: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                <option value="addition">Addition / Allowance</option>
                <option value="deduction">Deduction</option>
              </select>
              <input
                required
                placeholder="Adjustment type"
                value={adjustment.type}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, type: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              />
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                placeholder="Amount"
                value={adjustment.amount}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, amount: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              />
              <textarea
                required
                minLength={5}
                placeholder="Reason"
                value={adjustment.reason}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, reason: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 sm:col-span-2"
              />
            </div>
            <Button>Record Adjustment</Button>
          </form>
        )}
      {!loading && tab === "settings" && settings && (
        <section className="mx-auto mt-5 max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="font-bold">Cutoffs, Leave & Statutory Policy</h2>
            <p className="text-sm text-slate-500">
              Configure payroll cutoffs, leave credits, and the reviewed
              government contribution schedule.
            </p>
          </div>
          <PayrollCutoffFields settings={settings} setSettings={setSettings} />
          <LeavePolicyFields settings={settings} setSettings={setSettings} />
          <StatutoryPolicyFields
            settings={settings}
            setSettings={setSettings}
          />
          <Button onClick={saveSettings}>Save Payroll Policies</Button>
        </section>
      )}
      {!loading &&
        tab === "payroll" &&
        selectedPeriod?.reviewIssues?.length > 0 && (
          <section className="mx-auto mt-5 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <h2 className="font-bold">Review needed before approval</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {selectedPeriod.reviewIssues.map((issue, index) => (
                <li key={`${issue.employeeId}-${index}`}>{issue.reason}</li>
              ))}
            </ul>
          </section>
        )}
      {!loading &&
        tab === "attendance" &&
        owner &&
        attendance.some((row) => row.isDerived) && (
          <form
            onSubmit={submitCorrection}
            className="mx-auto mt-5 max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <h2 className="font-bold">Resolve Missing Attendance</h2>
              <p className="text-sm text-slate-500">
                Select a derived absence, enter the authorized exact minutes,
                and explain why it is being created.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                required
                value={correction.attendanceId}
                onChange={(e) =>
                  setCorrection({ ...correction, attendanceId: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                <option value="">Select missing record</option>
                {attendance
                  .filter((row) => row.isDerived)
                  .map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.workDate} · {row.employee?.firstName}{" "}
                      {row.employee?.lastName}
                    </option>
                  ))}
              </select>
              <select
                value={correction.status}
                onChange={(e) =>
                  setCorrection({ ...correction, status: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              >
                {[
                  "present",
                  "late",
                  "undertime",
                  "absent",
                  "rest_day",
                  "incomplete",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <DurationField
                field="workedMinutes"
                value={correction.workedMinutes}
                onChange={(value) =>
                  setCorrection({ ...correction, workedMinutes: value })
                }
              />
              <textarea
                required
                minLength={5}
                placeholder="Reason for correction"
                value={correction.reason}
                onChange={(e) =>
                  setCorrection({ ...correction, reason: e.target.value })
                }
                className="rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700"
              />
            </div>
            <Button>Create Audited Record</Button>
          </form>
        )}
    </main>
  );
};

export default HRManagement;
