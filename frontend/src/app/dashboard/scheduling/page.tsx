'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/useAuthStore';
import ShiftManager from '@/components/scheduling/ShiftManager';
import AvailabilitySubmitter from '@/components/scheduling/AvailabilitySubmitter';
import ShiftAssigner from '@/components/scheduling/ShiftAssigner';
import MySchedule from '@/components/scheduling/MySchedule';
import api from '@/lib/api';

export default function SchedulingPage() {
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.data?.schedulingSystem) {
        setViewMode(res.data.data.schedulingSystem);
      }
    } catch (error) {
      console.error('Failed to load scheduling settings');
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scheduling System</h1>
          <p className="text-muted-foreground mt-2">
            Manage shifts, submit availabilities, and assign staff.
          </p>
        </div>

        <Tabs defaultValue={isAdminOrManager ? 'roster' : 'my-schedule'} className="space-y-4">
          <TabsList>
            {isAdminOrManager ? (
              <>
                <TabsTrigger value="roster">Roster & Assignments</TabsTrigger>
                <TabsTrigger value="shifts">Manage Shifts</TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="my-schedule">My Schedule</TabsTrigger>
                <TabsTrigger value="availability">My Availability</TabsTrigger>
              </>
            )}
          </TabsList>

          {isAdminOrManager ? (
            <>
              <TabsContent value="roster">
                <ShiftAssigner viewMode={viewMode} />
              </TabsContent>
              <TabsContent value="shifts">
                <ShiftManager />
              </TabsContent>
            </>
          ) : (
            <>
              <TabsContent value="my-schedule">
                <MySchedule viewMode={viewMode} />
              </TabsContent>
              <TabsContent value="availability">
                <AvailabilitySubmitter viewMode={viewMode} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
