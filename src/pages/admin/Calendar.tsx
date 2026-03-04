import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Edit2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface CalendarEvent extends Tables<'calendar_events'> {
  cohort_name?: string;
}

interface EventFormData {
  title: string;
  description: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  category: string;
  target_cohort_id: string;
}

const AdminCalendar = () => {
  const { profile } = useAuth();
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const { register, handleSubmit, reset, watch } = useForm<EventFormData>({
    defaultValues: {
      title: '',
      description: '',
      start_date: '',
      start_time: '09:00',
      end_date: '',
      end_time: '10:00',
      category: 'General',
      target_cohort_id: '',
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
      if (cohortsData) setCohorts(cohortsData as any);

      const { data: eventsData } = await supabase
        .from('calendar_events')
        .select('*')
        .order('start_date', { ascending: true });
      if (eventsData) setEvents((eventsData as any) || []);
    } catch (err) {
      console.error('Load calendar error:', err);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: EventFormData) => {
    try {
      setSubmitting(true);
      if (!profile) throw new Error('User not authenticated');

      const startDateTime = new Date(`${values.start_date}T${values.start_time}`);
      const endDateTime = new Date(`${values.end_date}T${values.end_time}`);

      const payload = {
        title: values.title,
        description: values.description,
        start_date: startDateTime.toISOString(),
        end_date: endDateTime.toISOString(),
        category: values.category,
        target_cohort_id: values.target_cohort_id || null,
        created_by: profile.id,
      };

      if (editingEvent) {
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Event updated');
      } else {
        const { error } = await supabase.from('calendar_events').insert([payload]);
        if (error) throw error;
        toast.success('Event created');
      }

      reset();
      setEditingEvent(null);
      setShowDialog(false);
      await loadData();
    } catch (err) {
      console.error('Save event error:', err);
      toast.error('Failed to save event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id);
      if (error) throw error;
      toast.success('Event deleted');
      await loadData();
    } catch (err) {
      console.error('Delete event error:', err);
      toast.error('Failed to delete event');
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);
    reset({
      title: event.title,
      description: event.description || '',
      start_date: startDate.toISOString().split('T')[0],
      start_time: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      end_date: endDate.toISOString().split('T')[0],
      end_time: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
      category: event.category,
      target_cohort_id: event.target_cohort_id || '',
    });
    setEditingEvent(event);
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingEvent(null);
    reset();
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getEventsForDate = (date: Date) => {
    return events?.filter((e) => {
      const eventDate = new Date(e.start_date);
      return eventDate.toDateString() === date.toDateString();
    }) || [];
  };

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">School Calendar</h1>
          <p className="text-sm text-gray-600 mt-1">Manage events and view schedule</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Event
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant={view === 'calendar' ? 'default' : 'outline'} onClick={() => setView('calendar')}>
          Calendar View
        </Button>
        <Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}>
          List View
        </Button>
      </div>

      {view === 'calendar' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{monthYear}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center font-semibold text-sm py-2">
                  {day}
                </div>
              ))}
              {days.map((date, idx) => (
                <div
                  key={idx}
                  className={`min-h-24 border rounded p-2 ${
                    date ? 'bg-white cursor-pointer hover:bg-gray-50' : 'bg-gray-100'
                  }`}
                >
                  {date && (
                    <>
                      <div className="font-semibold text-sm mb-1">{date.getDate()}</div>
                      <div className="space-y-1">
                        {getEventsForDate(date)?.map((event) => (
                          <div
                            key={event.id}
                            className="text-xs bg-blue-100 text-blue-800 rounded px-2 py-1 cursor-pointer hover:bg-blue-200"
                            onClick={() => handleEdit(event)}
                          >
                            {event.title}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {!events || events.length === 0 ? (
              <p className="text-sm text-gray-500">No events scheduled</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Target Audience</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events?.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.title}</TableCell>
                        <TableCell>{new Date(event.start_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell>
                          <Badge>{event.category}</Badge>
                        </TableCell>
                        <TableCell>{event.target_cohort_id ? 'Specific Cohort' : 'All Students'}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(event)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(event.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
            <DialogDescription>Add or update a calendar event for students</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input {...register('title', { required: true })} placeholder="Event title" />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea {...register('description')} placeholder="Event details" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input {...register('start_date', { required: true })} type="date" />
              </div>
              <div>
                <label className="text-sm font-medium">Start Time *</label>
                <Input {...register('start_time', { required: true })} type="time" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">End Date *</label>
                <Input {...register('end_date', { required: true })} type="date" />
              </div>
              <div>
                <label className="text-sm font-medium">End Time *</label>
                <Input {...register('end_time', { required: true })} type="time" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select {...(register('category') as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Holiday">Holiday</SelectItem>
                    <SelectItem value="Exam">Exam</SelectItem>
                    <SelectItem value="Break">Break</SelectItem>
                    <SelectItem value="Event">Event</SelectItem>
                    <SelectItem value="Announcement">Announcement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Target Audience</label>
                <Select {...(register('target_cohort_id') as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Students" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Students</SelectItem>
                    {cohorts?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
