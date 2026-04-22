'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { 
  Shift, 
  EmployeeAvailability, 
  ShiftAssignment, 
  getShifts, 
  getAvailabilities, 
  getAssignments, 
  assignShift, 
  removeAssignment 
} from '@/lib/api/scheduling';
import { toast } from 'sonner';

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function ShiftAssigner() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  // Assignment selection state
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shiftsData, availData, assignData, staffRes] = await Promise.all([
        getShifts(),
        getAvailabilities({ startDate: selectedDate, endDate: selectedDate }),
        getAssignments({ startDate: selectedDate, endDate: selectedDate }),
        api.get('/staff')
      ]);

      setShifts(shiftsData);
      setAvailabilities(availData);
      setAssignments(assignData);
      setStaff(staffRes.data.data || []);
      
      if (shiftsData.length > 0 && !selectedShift) {
        setSelectedShift(shiftsData[0].id);
      }
    } catch (error) {
      toast.error('Failed to load roster data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedShift || !selectedStaff) {
      toast.error('Please select both a shift and a staff member');
      return;
    }

    // Check if already assigned
    if (assignments.some(a => a.shiftId === selectedShift && a.userId === selectedStaff)) {
      toast.warning('Staff is already assigned to this shift');
      return;
    }

    try {
      await assignShift({
        shiftId: selectedShift,
        userId: selectedStaff,
        date: selectedDate
      });
      toast.success('Assigned successfully');
      setSelectedStaff('');
      loadData(); // Refresh to get the new assignment ID
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to assign staff');
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      await removeAssignment(id);
      toast.success('Assignment removed');
      loadData();
    } catch (error) {
      toast.error('Failed to remove assignment');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle>Assign Staff</CardTitle>
          <CardDescription>Select a date to view and manage assignments.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Date</label>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Shift</label>
            <Select value={selectedShift} onValueChange={(val) => setSelectedShift(val || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select Shift" />
              </SelectTrigger>
              <SelectContent>
                {shifts.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Staff Member</label>
            <Select value={selectedStaff} onValueChange={(val) => setSelectedStaff(val || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select Staff" />
              </SelectTrigger>
              <SelectContent>
                {staff.map(s => {
                  const isAvail = availabilities.find(a => a.shiftId === selectedShift && a.userId === s.id)?.isAvailable;
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} {isAvail ? '(Available)' : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              * Staff indicating availability will be marked.
            </p>
          </div>

          <Button className="w-full" onClick={handleAssign}>Assign to Shift</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Daily Roster: {selectedDate}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading roster...</p>
          ) : shifts.length === 0 ? (
            <p className="text-muted-foreground py-4">No shifts configured.</p>
          ) : (
            <div className="space-y-6">
              {shifts.map(shift => {
                const shiftAssignments = assignments.filter(a => a.shiftId === shift.id);
                return (
                  <div key={shift.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-3 border-b flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold">{shift.name}</h4>
                        <p className="text-xs text-muted-foreground">{shift.startTime} - {shift.endTime}</p>
                      </div>
                      <Badge variant={shiftAssignments.length >= shift.requiredStaff ? 'default' : 'secondary'}>
                        {shiftAssignments.length} / {shift.requiredStaff} Assigned
                      </Badge>
                    </div>
                    <div className="p-3">
                      {shiftAssignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {shiftAssignments.map(assignment => (
                            <li key={assignment.id} className="flex items-center justify-between text-sm">
                              <span>{assignment.user?.firstName} {assignment.user?.lastName}</span>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-red-500 hover:text-red-600 px-2"
                                onClick={() => handleRemoveAssignment(assignment.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
