'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import { Shift, ShiftDayRequirement, getShifts, createShift, updateShift, deleteShift } from '@/lib/api/scheduling';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';
import { useConfirm } from '@/components/ui/confirm-dialog';

const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

export default function ShiftManager() {
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<Partial<Shift>>({
    dayRequirements: DAY_INDEXES.map((i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
  });

  // Localized short weekday names, indexed 0=Sunday..6=Saturday to match dayOfWeek.
  const dayLabels = useMemo(() => {
    const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
    return DAY_INDEXES.map((i) => new Date(2024, 0, 7 + i).toLocaleDateString(dateLocale, { weekday: 'short' }));
  }, [locale]);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await getShifts();
      setShifts(data);
    } catch (error) {
      toast.error(t('scheduling.shiftManager.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleSave = async () => {
    try {
      if (!editingShift.name || !editingShift.startTime || !editingShift.endTime) {
        toast.error(t('scheduling.shiftManager.fillRequired'));
        return;
      }

      if (editingShift.id) {
        await updateShift(editingShift.id, editingShift);
        toast.success(t('scheduling.shiftManager.updated'));
      } else {
        await createShift(editingShift);
        toast.success(t('scheduling.shiftManager.created'));
      }
      setEditingShift({
        dayRequirements: DAY_INDEXES.map((i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
      });
      loadShifts();
    } catch (error) {
      toast.error(t('scheduling.shiftManager.saveFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t('scheduling.shiftManager.confirmDelete'),
      confirmText: t('scheduling.shiftManager.delete'),
      cancelText: t('scheduling.shiftManager.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteShift(id);
      toast.success(t('scheduling.shiftManager.deleted'));
      loadShifts();
    } catch (error) {
      toast.error(t('scheduling.shiftManager.deleteFailed'));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="col-span-1 h-fit">
        <CardHeader>
          <CardTitle>{editingShift.id ? t('scheduling.shiftManager.editShift') : t('scheduling.shiftManager.addShift')}</CardTitle>
          <CardDescription>{t('scheduling.shiftManager.defineHours')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('scheduling.shiftManager.shiftName')}</label>
            <Input
              placeholder={t('scheduling.shiftManager.shiftNamePlaceholder')}
              value={editingShift.name || ''}
              onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('scheduling.shiftManager.startTime')}</label>
              <TimeSelect
                className="w-full"
                value={editingShift.startTime || ''}
                onChange={(v) => setEditingShift({ ...editingShift, startTime: v })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('scheduling.shiftManager.endTime')}</label>
              <TimeSelect
                className="w-full"
                value={editingShift.endTime || ''}
                onChange={(v) => setEditingShift({ ...editingShift, endTime: v })}
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('scheduling.shiftManager.requiredStaffPerDay')}</label>
            <div className="grid grid-cols-7 gap-2">
              {DAY_INDEXES.map((idx) => {
                const req = editingShift.dayRequirements?.find((r) => r.dayOfWeek === idx) || { dayOfWeek: idx, requiredStaff: 1 };
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">{dayLabels[idx]}</span>
                    <Input
                      type="number"
                      min={0}
                      className="text-center px-1 h-8"
                      value={req.requiredStaff}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const newReqs = [...(editingShift.dayRequirements || DAY_INDEXES.map((i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement)))];
                        const existingIdx = newReqs.findIndex(r => r.dayOfWeek === idx);
                        if (existingIdx >= 0) {
                          newReqs[existingIdx] = { ...newReqs[existingIdx], requiredStaff: val };
                        } else {
                          newReqs.push({ dayOfWeek: idx, requiredStaff: val } as ShiftDayRequirement);
                        }
                        setEditingShift({ ...editingShift, dayRequirements: newReqs });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {editingShift.id ? t('scheduling.shiftManager.update') : t('scheduling.shiftManager.create')}
            </Button>
            {editingShift.id && (
              <Button variant="outline" onClick={() => setEditingShift({
                dayRequirements: DAY_INDEXES.map((i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
              })}>{t('scheduling.shiftManager.cancel')}</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle>{t('scheduling.shiftManager.existingShifts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>{t('scheduling.shiftManager.loading')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scheduling.shiftManager.colName')}</TableHead>
                  <TableHead>{t('scheduling.shiftManager.colHours')}</TableHead>
                  <TableHead>{t('scheduling.shiftManager.colRequiredStaff')}</TableHead>
                  <TableHead className="text-right">{t('scheduling.shiftManager.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      {t('scheduling.shiftManager.noShifts')}
                    </TableCell>
                  </TableRow>
                ) : (
                  shifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell className="font-medium">{shift.name}</TableCell>
                      <TableCell>{shift.startTime} - {shift.endTime}</TableCell>
                      <TableCell>
                        {shift.dayRequirements?.reduce((acc, curr) => acc + curr.requiredStaff, 0) || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => {
                          const fullReqs = DAY_INDEXES.map((i) => {
                            return shift.dayRequirements?.find(r => r.dayOfWeek === i) || { dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement;
                          });
                          setEditingShift({ ...shift, dayRequirements: fullReqs });
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(shift.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
