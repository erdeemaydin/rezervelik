'use client';

import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function SystemSettingsPage() {
  return (
    <SystemAdminLayout>
      <div className="flex flex-col gap-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Global Settings</h1>
          <p className="text-xs text-slate-500 font-medium">Configure platform-wide behaviors and defaults.</p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">Platform Control</CardTitle>
            <CardDescription className="text-xs">These settings affect all tenants on the platform immediately.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-slate-800">Maintenance Mode</Label>
                <p className="text-xs text-slate-500 font-medium">Disable access to all tenant dashboards. API will return 503.</p>
              </div>
              <Switch />
            </div>

            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-slate-800">Public Registration</Label>
                <p className="text-xs text-slate-500 font-medium">Allow new restaurants to self-register via the main landing page.</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-slate-800">Enforce 2FA for System Admins</Label>
                <p className="text-xs text-slate-500 font-medium">Require two-factor authentication for root access.</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-8">Save Configuration</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SystemAdminLayout>
  );
}
