import api from '../api';

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
}

export interface EmployeeAvailability {
  id: string;
  userId: string;
  shiftId: string;
  date: string;
  isAvailable: boolean;
  notes?: string;
  shift?: Shift;
  user?: { id: string; firstName: string; lastName: string };
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  userId: string;
  date: string;
  isPublished: boolean;
  shift?: Shift;
  user?: { id: string; firstName: string; lastName: string };
}

export const getShifts = async (): Promise<Shift[]> => {
  const { data } = await api.get('/scheduling/shifts');
  return data.data;
};

export const createShift = async (payload: Partial<Shift>) => {
  const { data } = await api.post('/scheduling/shifts', payload);
  return data.data;
};

export const updateShift = async (id: string, payload: Partial<Shift>) => {
  const { data } = await api.put(`/scheduling/shifts/${id}`, payload);
  return data.data;
};

export const deleteShift = async (id: string) => {
  await api.delete(`/scheduling/shifts/${id}`);
};

export const getAvailabilities = async (params: { startDate?: string; endDate?: string; userId?: string }): Promise<EmployeeAvailability[]> => {
  const { data } = await api.get('/scheduling/availabilities', { params });
  return data.data;
};

export const setAvailability = async (payload: { shiftId: string; date: string; isAvailable: boolean; notes?: string }) => {
  const { data } = await api.post('/scheduling/availabilities', payload);
  return data.data;
};

export const getAssignments = async (params: { startDate?: string; endDate?: string; userId?: string; shiftId?: string }): Promise<ShiftAssignment[]> => {
  const { data } = await api.get('/scheduling/assignments', { params });
  return data.data;
};

export const assignShift = async (payload: { shiftId: string; userId: string; date: string }) => {
  const { data } = await api.post('/scheduling/assignments', payload);
  return data.data;
};

export const publishAssignments = async (payload: { startDate: string; endDate: string }) => {
  const { data } = await api.post('/scheduling/assignments/publish', payload);
  return data.data;
};

export const unpublishAssignments = async (payload: { startDate: string; endDate: string }) => {
  const { data } = await api.post('/scheduling/assignments/unpublish', payload);
  return data.data;
};

export const removeAssignment = async (id: string) => {
  await api.delete(`/scheduling/assignments/${id}`);
};
