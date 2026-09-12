'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Palette, Check } from '@phosphor-icons/react';
import { ADMIN_THEMES } from '@/lib/themes';
import { useAdminThemeStore } from '@/store/useAdminThemeStore';
import { useTranslation } from '@/i18n/provider';

export default function SystemSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    maintenanceMode: false,
    publicRegistrationEnabled: true,
    enforce2FAForAdmins: true,
    measurementSystem: 'METRIC' as 'METRIC' | 'US',
    dashboardTheme: 'default'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/system/settings/global');
        if (res.data.data) {
          setSettings({ dashboardTheme: 'default', ...res.data.data });
        }
      } catch (err) {
        toast.error('Failed to load global settings');
      }
    };
    fetchSettings();
  }, []);

  // Live preview goes through the shared theme store (see the swatch onClick), which
  // reskins the persistent SystemAdminLayout via React. On leaving, restore the
  // saved theme from cache — after a save it holds the new value (sticks); on a
  // cancelled preview it holds the old value (discarded).
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      useAdminThemeStore.getState().setTheme(localStorage.getItem('systemDashboardTheme'));
    };
  }, []);

  const handleSave = async () => {
    try {
      setLoading(true);
      await api.put('/system/settings/global', settings);
      // Cache so the surface theme survives a refresh before the layout refetches.
      try { localStorage.setItem('systemDashboardTheme', settings.dashboardTheme || 'default'); } catch { /* best-effort */ }
      toast.success('Global settings updated successfully');
    } catch (err) {
      toast.error('Failed to update global settings');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div className="flex flex-col gap-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">Global Settings</h1>
          <p className="text-xs text-muted-foreground font-medium">Configure platform-wide behaviors and defaults.</p>
        </div>

        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="border-b border-border bg-muted/50 p-4">
            <CardTitle className="text-sm font-bold text-foreground">Platform Control</CardTitle>
            <CardDescription className="text-xs">These settings affect all tenants on the platform immediately.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-foreground">Maintenance Mode</Label>
                <p className="text-xs text-muted-foreground font-medium">Disable access to all tenant dashboards. API will return 503.</p>
              </div>
              <Switch checked={settings.maintenanceMode} onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })} />
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-foreground">Public Registration</Label>
                <p className="text-xs text-muted-foreground font-medium">Allow new restaurants to self-register via the main landing page.</p>
              </div>
              <Switch checked={settings.publicRegistrationEnabled} onCheckedChange={(v) => setSettings({ ...settings, publicRegistrationEnabled: v })} />
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base font-bold text-foreground">Enforce 2FA for System Admins</Label>
                <p className="text-xs text-muted-foreground font-medium">Require two-factor authentication for root access.</p>
              </div>
              <Switch checked={settings.enforce2FAForAdmins} onCheckedChange={(v) => setSettings({ ...settings, enforce2FAForAdmins: v })} />
            </div>
            
            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="space-y-0.5 pr-4">
                <Label className="text-base font-bold text-foreground">Date &amp; Time Format</Label>
                <p className="text-xs text-muted-foreground font-medium">
                  Applies to every tenant dashboard. <strong>Metric</strong> uses the European / Turkish style
                  (DD/MM/YYYY and a 24-hour clock). <strong>USA</strong> uses MM/DD/YYYY and a 12-hour AM/PM clock.
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">
                  Preview: {settings.measurementSystem === 'US' ? '07/03/2026 · 2:30 PM' : '03/07/2026 · 14:30'}
                </p>
              </div>
              <div className="flex items-center bg-muted rounded-lg p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, measurementSystem: 'METRIC' })}
                  className={`px-4 h-8 rounded-md text-xs font-bold transition-colors ${settings.measurementSystem === 'METRIC' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Metric (EU/TR)
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, measurementSystem: 'US' })}
                  className={`px-4 h-8 rounded-md text-xs font-bold transition-colors ${settings.measurementSystem === 'US' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  USA
                </button>
              </div>
            </div>

          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="border-b border-border bg-muted/50 p-4 flex flex-row items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-md text-emerald-600 dark:text-emerald-400"><Palette className="w-5 h-5" /></div>
            <div>
              <CardTitle className="text-sm font-bold text-foreground">Console Appearance</CardTitle>
              <CardDescription className="text-xs">Color theme for this system-admin console. Tenant dashboards are themed separately by each restaurant.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ADMIN_THEMES.map((th) => {
                const active = settings.dashboardTheme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => { setSettings({ ...settings, dashboardTheme: th.id }); useAdminThemeStore.getState().setTheme(th.id); }}
                    className={`relative flex flex-col items-stretch gap-2 rounded-lg border-2 p-2.5 text-left transition-all ${active ? 'border-foreground shadow-sm' : 'border-border hover:border-ring'}`}
                    aria-pressed={active}
                  >
                    <div className="flex h-12 overflow-hidden rounded-md border border-border">
                      <span className="w-1/4" style={{ backgroundColor: th.swatch.sidebar }} />
                      <span className="flex flex-1 items-center justify-center" style={{ backgroundColor: th.swatch.bg }}>
                        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: th.swatch.accent }} />
                      </span>
                    </div>
                    <span className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold tracking-tight text-foreground">{t(th.labelKey)}</span>
                      {active && <Check className="h-3.5 w-3.5 text-foreground" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-8">
            {loading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </>
  );
}
