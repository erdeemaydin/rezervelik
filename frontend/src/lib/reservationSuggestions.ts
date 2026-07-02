export interface DateSuggestion {
  label: string;
  value: string;
  full: string;
}

export function getDaySuggestions(): { week: DateSuggestion[]; weekend: DateSuggestion[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const week: DateSuggestion[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    week.push({
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short' }),
      value: d.toISOString().split('T')[0],
      full: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    });
  }

  const getWeekendSet = (offsetDays = 0): DateSuggestion[] => {
    const set: DateSuggestion[] = [];
    for (const targetDay of [5, 6, 0]) {
      const d = new Date(today);
      let diff = targetDay - d.getDay();
      if (diff < 0) diff += 7;
      d.setDate(d.getDate() + diff + offsetDays);
      set.push({
        label: d.toLocaleDateString([], { weekday: 'short' }),
        value: d.toISOString().split('T')[0],
        full: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      });
    }
    return set;
  };

  let weekend = getWeekendSet(0);
  const weekValues = week.map((w) => w.value);
  const hasOverlap = weekend.some((we) => weekValues.includes(we.value));

  if (hasOverlap) {
    weekend = getWeekendSet(7);
  }

  return { week, weekend };
}

export function getTimeSuggestions() {
  return {
    lunch: ['12:30', '13:30', '14:00'],
    dinner: ['19:00', '20:00', '21:00', '22:00'],
  };
}
