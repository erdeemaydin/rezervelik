'use client';

import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState({
    maintenanceMode: false,
    publicRegistrationEnabled: true,
    enforce2FAForAdmins: true,
    measurementSystem: 'METRIC' as 'METRIC' | 'US'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/system/settings/global');
        if (res.data.data) {
          setSettings(res.data.data);
        }
      } catch (err) {
        toast.error('Failed to load global settings');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setLoading(true);
      await api.put('/system/settings/global', settings);
      toast.success('Global settings updated successfully');
    } catch (err) {
      toast.error('Failed to update global settings');
    } finally {
      setLoading(false);
    }
  };
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
              <Switch checked={settings.maintenanceMode} onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })} />
            </div>

            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-slate-800">Public Registration</Label>
                <p className="text-xs text-slate-500 font-medium">Allow new restaurants to self-register via the main landing page.</p>
              </div>
              <Switch checked={settings.publicRegistrationEnabled} onCheckedChange={(v) => setSettings({ ...settings, publicRegistrationEnabled: v })} />
            </div>

            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-slate-800">Enforce 2FA for System Admins</Label>
                <p className="text-xs text-slate-500 font-medium">Require two-factor authentication for root access.</p>
              </div>
              <Switch checked={settings.enforce2FAForAdmins} onCheckedChange={(v) => setSettings({ ...settings, enforce2FAForAdmins: v })} />
            </div>
            
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
              <div className="space-y-0.5 pr-4">
                <Label className="text-base font-bold text-slate-800">Date &amp; Time Format</Label>
                <p className="text-xs text-slate-500 font-medium">
                  Applies to every tenant dashboard. <strong>Metric</strong> uses the European / Turkish style
                  (DD/MM/YYYY and a 24-hour clock). <strong>USA</strong> uses MM/DD/YYYY and a 12-hour AM/PM clock.
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Preview: {settings.measurementSystem === 'US' ? '07/03/2026 · 2:30 PM' : '03/07/2026 · 14:30'}
                </p>
              </div>
              <div className="flex items-center bg-slate-100 rounded-lg p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, measurementSystem: 'METRIC' })}
                  className={`px-4 h-8 rounded-md text-xs font-bold transition-colors ${settings.measurementSystem === 'METRIC' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Metric (EU/TR)
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, measurementSystem: 'US' })}
                  className={`px-4 h-8 rounded-md text-xs font-bold transition-colors ${settings.measurementSystem === 'US' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  USA
                </button>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-8">
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SystemAdminLayout>
  );
}
