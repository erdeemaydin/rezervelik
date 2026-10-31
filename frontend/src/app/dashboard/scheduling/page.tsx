'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/useAuthStore';
import ShiftManager from '@/components/scheduling/ShiftManager';
import AvailabilitySubmitter from '@/components/scheduling/AvailabilitySubmitter';
import ShiftAssigner from '@/components/scheduling/ShiftAssigner';
import MySchedule from '@/components/scheduling/MySchedule';
import TimesheetPanel from '@/components/timesheet/TimesheetPanel';
import api from '@/lib/api';
import { useTranslation } from "@/i18n/provider";

export default function SchedulingPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [staffScheduleView, setStaffScheduleView] = useState('OWN_ONLY');
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.data?.schedulingSystem) {
        setViewMode(res.data.data.schedulingSystem);
      }
      if (res.data.data?.staffScheduleView) {
        setStaffScheduleView(res.data.data.staffScheduleView);
      }
    } catch (error) {
      console.error('Failed to load scheduling settings');
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg font-black tracking-tight">{t("scheduling.title")}</h1>
          <p className="text-muted-foreground text-xs hidden sm:block">
            {t("scheduling.description")}
          </p>
        </div>

        <Tabs defaultValue={isAdminOrManager ? 'roster' : 'my-schedule'} className="space-y-3">
          <TabsList className="h-auto flex-wrap">
            {isAdminOrManager ? (
              <>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="roster">{t("scheduling.tabs.rosterAndAssignments")}</TabsTrigger>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="shifts">{t("scheduling.tabs.manageShifts")}</TabsTrigger>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="timesheet">{t("scheduling.tabs.timesheet")}</TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="my-schedule">{t("scheduling.tabs.mySchedule")}</TabsTrigger>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="availability">{t("scheduling.tabs.myAvailability")}</TabsTrigger>
                <TabsTrigger className="text-xs md:text-sm py-1.5" value="timesheet">{t("scheduling.tabs.timesheet")}</TabsTrigger>
                {staffScheduleView === 'FULL_ROSTER' && (
                  <TabsTrigger className="text-xs md:text-sm py-1.5" value="roster">{t("scheduling.tabs.fullRoster")}</TabsTrigger>
                )}
              </>
            )}
          </TabsList>

          <TabsContent value="roster">
            <ShiftAssigner viewMode={viewMode} />
          </TabsContent>

          {isAdminOrManager ? (
            <TabsContent value="shifts">
              <ShiftManager />
            </TabsContent>
          ) : (
            <>
              <TabsContent value="my-schedule">
                <MySchedule viewMode={viewMode} staffScheduleView={staffScheduleView} />
              </TabsContent>
              <TabsContent value="availability">
                <AvailabilitySubmitter viewMode={viewMode} />
              </TabsContent>
            </>
          )}

          <TabsContent value="timesheet">
            <TimesheetPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
