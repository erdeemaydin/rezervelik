'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Shift, ShiftDayRequirement, getShifts, createShift, updateShift, deleteShift } from '@/lib/api/scheduling';
import { toast } from 'sonner';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ShiftManager() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<Partial<Shift>>({
    dayRequirements: DAYS.map((_, i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
  });

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await getShifts();
      setShifts(data);
    } catch (error) {
      toast.error('Failed to load shifts');
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
        toast.error('Please fill in all required fields');
        return;
      }

      if (editingShift.id) {
        await updateShift(editingShift.id, editingShift);
        toast.success('Shift updated');
      } else {
        await createShift(editingShift);
        toast.success('Shift created');
      }
      setEditingShift({
        dayRequirements: DAYS.map((_, i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
      });
      loadShifts();
    } catch (error) {
      toast.error('Failed to save shift');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this shift?')) {
      try {
        await deleteShift(id);
        toast.success('Shift deleted');
        loadShifts();
      } catch (error) {
        toast.error('Failed to delete shift');
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="col-span-1 h-fit">
        <CardHeader>
          <CardTitle>{editingShift.id ? 'Edit Shift' : 'Add Shift'}</CardTitle>
          <CardDescription>Define working hours for your staff.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Shift Name</label>
            <Input 
              placeholder="e.g., Morning Shift" 
              value={editingShift.name || ''} 
              onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input 
                type="time" 
                value={editingShift.startTime || ''} 
                onChange={(e) => setEditingShift({ ...editingShift, startTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Time</label>
              <Input 
                type="time" 
                value={editingShift.endTime || ''} 
                onChange={(e) => setEditingShift({ ...editingShift, endTime: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium">Required Staff per Day</label>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day, idx) => {
                const req = editingShift.dayRequirements?.find((r) => r.dayOfWeek === idx) || { dayOfWeek: idx, requiredStaff: 1 };
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">{day}</span>
                    <Input 
                      type="number" 
                      min={0}
                      className="text-center px-1 h-8"
                      value={req.requiredStaff}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const newReqs = [...(editingShift.dayRequirements || DAYS.map((_, i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement)))];
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
              {editingShift.id ? 'Update' : 'Create'}
            </Button>
            {editingShift.id && (
              <Button variant="outline" onClick={() => setEditingShift({
                dayRequirements: DAYS.map((_, i) => ({ dayOfWeek: i, requiredStaff: 1 } as ShiftDayRequirement))
              })}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle>Existing Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading shifts...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Required Staff (Total/Week)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      No shifts defined yet.
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
                          // Ensure all days exist
                          const fullReqs = DAYS.map((_, i) => {
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
