'use client';

import TimesheetPanel from '@/components/timesheet/TimesheetPanel';

// The timesheet is also embedded as a tab inside the Scheduling dashboard; this
// standalone route renders the same panel so both entry points stay in sync.
export default function TimesheetPage() {
  return (
    <>
      <TimesheetPanel />
    </>
  );
}
