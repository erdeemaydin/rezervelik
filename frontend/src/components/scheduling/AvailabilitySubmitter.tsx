'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Shift, EmployeeAvailability, getShifts, getAvailabilities, setAvailability } from '@/lib/api/scheduling';
import { toast } from 'sonner';

export default function AvailabilitySubmitter() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shiftsData, availData] = await Promise.all([
        getShifts(),
        getAvailabilities({ startDate: selectedDate, endDate: selectedDate })
      ]);
      
      setShifts(shiftsData);
      
      const availMap: Record<string, boolean> = {};
      availData.forEach(a => {
        availMap[a.shiftId] = a.isAvailable;
      });
      setAvailabilities(availMap);
    } catch (error) {
      toast.error('Failed to load scheduling data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (shiftId: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      setAvailabilities(prev => ({ ...prev, [shiftId]: newStatus }));
      
      await setAvailability({
        shiftId,
        date: selectedDate,
        isAvailable: newStatus
      });
      toast.success('Availability updated');
    } catch (error) {
      toast.error('Failed to update availability');
      // Revert on error
      setAvailabilities(prev => ({ ...prev, [shiftId]: currentStatus }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Availability</CardTitle>
        <CardDescription>Select a date and indicate if you can work the listed shifts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-2 max-w-sm">
          <Label>Select Date</Label>
          <Input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
          />
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : shifts.length === 0 ? (
          <p className="text-muted-foreground py-4">No shifts configured for this restaurant.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shifts.map(shift => {
              const isAvailable = availabilities[shift.id] ?? false; // Default to false if unset
              
              return (
                <div key={shift.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">{shift.name}</h3>
                    <p className="text-sm text-muted-foreground">{shift.startTime} - {shift.endTime}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id={`avail-${shift.id}`} 
                      checked={isAvailable}
                      onCheckedChange={() => handleToggle(shift.id, isAvailable)}
                    />
                    <label
                      htmlFor={`avail-${shift.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {isAvailable ? 'Available' : 'Unavailable'}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
